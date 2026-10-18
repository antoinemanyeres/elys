// Hold outlining. For each tap the detector "zooms in": it analyses a small window of the full-resolution
// photo around the tap, separates the hold from the wall, and grows the window if the hold doesn't fit.
const HoldDetector = (() => {
  const PATCH_PX = 320;
  const WINDOWS = [0.1, 0.2, 0.38, 0.6];
  const MAX_SOURCE = 3000;
  const cache = new Map();

  function loadSource(photo) {
    if (!cache.has(photo.id)) {
      cache.set(photo.id, new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, MAX_SOURCE / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.naturalWidth * k);
          canvas.height = Math.round(img.naturalHeight * k);
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          try {
            ctx.getImageData(0, 0, 1, 1);
            resolve(canvas);
          } catch (e) {
            cache.delete(photo.id);
            reject(e);
          }
        };
        img.onerror = () => { cache.delete(photo.id); reject(new Error('Image load failed')); };
        img.src = photo.src;
      }));
    }
    return cache.get(photo.id);
  }

  // ---------- Pixel helpers ----------
  function toYCbCr(rgba, n) {
    const Y = new Float32Array(n), Cb = new Float32Array(n), Cr = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
      Y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      Cb[i] = -0.1687 * r - 0.3313 * g + 0.5 * b;
      Cr[i] = 0.5 * r - 0.4187 * g - 0.0813 * b;
    }
    return [Y, Cb, Cr];
  }

  function boxBlur(ch, w, h) {
    const out = new Float32Array(ch.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            s += ch[yy * w + xx]; c++;
          }
        }
        out[y * w + x] = s / c;
      }
    }
    return out;
  }

  const median = (arr) => {
    const s = Float32Array.from(arr).sort();
    return s.length ? s[s.length >> 1] : 0;
  };

  // Luminance is down-weighted so shadows and shading count less than an actual color change.
  const dist = (Y, Cb, Cr, i, c) => Math.hypot((Y[i] - c[0]) * 0.4, Cb[i] - c[1], Cr[i] - c[2]);

  function morph(mask, w, h, r, dilate) {
    const tmp = new Uint8Array(mask.length), out = new Uint8Array(mask.length);
    const pass = (src, dst, horizontal) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let v = dilate ? 0 : 1;
          for (let k = -r; k <= r; k++) {
            const xx = horizontal ? x + k : x, yy = horizontal ? y : y + k;
            // Out-of-window pixels are ignored so erosion doesn't eat holds that cross the window edge.
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const m = src[yy * w + xx];
            if (dilate ? m : !m) { v = dilate ? 1 : 0; break; }
          }
          dst[y * w + x] = v;
        }
      }
    };
    pass(mask, tmp, true);
    pass(tmp, out, false);
    return out;
  }

  function component(mask, w, h, sx, sy) {
    const out = new Uint8Array(mask.length);
    const stack = [sy * w + sx];
    out[stack[0]] = 1;
    let size = 0, touches = false;
    while (stack.length) {
      const i = stack.pop();
      const x = i % w, y = (i / w) | 0;
      size++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
      if (x > 0 && mask[i - 1] && !out[i - 1]) { out[i - 1] = 1; stack.push(i - 1); }
      if (x < w - 1 && mask[i + 1] && !out[i + 1]) { out[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && mask[i - w] && !out[i - w]) { out[i - w] = 1; stack.push(i - w); }
      if (y < h - 1 && mask[i + w] && !out[i + w]) { out[i + w] = 1; stack.push(i + w); }
    }
    return { mask: out, size, touches };
  }

  // Fill holes such as chalk marks or bolt holes inside the hold.
  function fillHoles(mask, w, h) {
    const outside = new Uint8Array(mask.length);
    const stack = [];
    for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
    for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
    while (stack.length) {
      const i = stack.pop();
      if (outside[i] || mask[i]) continue;
      outside[i] = 1;
      const x = i % w, y = (i / w) | 0;
      if (x > 0) stack.push(i - 1);
      if (x < w - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - w);
      if (y < h - 1) stack.push(i + w);
    }
    const out = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) out[i] = outside[i] ? 0 : 1;
    return out;
  }

  // Moore-neighbour tracing of the outer boundary, clockwise on screen.
  function traceBoundary(mask, w, h) {
    const D = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
    let start = -1;
    for (let i = 0; i < mask.length && start < 0; i++) if (mask[i]) start = i;
    if (start < 0) return [];
    const sx = start % w, sy = (start / w) | 0;
    let x = sx, y = sy, back = 4;
    const pts = [[x, y]];
    for (let iter = 0; iter < mask.length * 2; iter++) {
      let moved = false;
      for (let k = 1; k <= 8; k++) {
        const d = (back + k) % 8;
        const nx = x + D[d][0], ny = y + D[d][1];
        if (at(nx, ny)) {
          const pd = (back + k - 1) % 8;
          const bx = x + D[pd][0] - nx, by = y + D[pd][1] - ny;
          x = nx; y = ny;
          back = D.findIndex(([dx, dy]) => dx === bx && dy === by);
          moved = true;
          break;
        }
      }
      if (!moved || (x === sx && y === sy)) break;
      pts.push([x, y]);
    }
    return pts;
  }

  function simplify(pts, eps) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const [ax, ay] = pts[a], [bx, by] = pts[b];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      let maxD = 0, idx = -1;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > eps && idx > 0) {
        keep[idx] = 1;
        stack.push([a, idx], [idx, b]);
      }
    }
    return pts.filter((_, i) => keep[i]);
  }

  // ---------- Segmentation of one window ----------
  function analyse(source, area, cx, cy, half, tolerance) {
    const x0 = Math.max(area.x0, Math.round(cx - half)), x1 = Math.min(area.x1, Math.round(cx + half));
    const y0 = Math.max(area.y0, Math.round(cy - half)), y1 = Math.min(area.y1, Math.round(cy + half));
    const pw = x1 - x0, ph = y1 - y0;
    if (pw < 8 || ph < 8) return null;
    const scale = Math.min(4, PATCH_PX / Math.max(pw, ph));
    const w = Math.max(8, Math.round(pw * scale)), h = Math.max(8, Math.round(ph * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, x0, y0, pw, ph, 0, 0, w, h);
    const n = w * h;
    let [Y, Cb, Cr] = toYCbCr(ctx.getImageData(0, 0, w, h).data, n);
    Y = boxBlur(Y, w, h); Cb = boxBlur(Cb, w, h); Cr = boxBlur(Cr, w, h);

    // Wall color: median of the window border, assumed to be mostly wall.
    const ring = [];
    for (let x = 0; x < w; x++) ring.push(x, w + x, (h - 1) * w + x, (h - 2) * w + x);
    for (let y = 0; y < h; y++) ring.push(y * w, y * w + 1, y * w + w - 1, y * w + w - 2);
    const bg = [median(ring.map((i) => Y[i])), median(ring.map((i) => Cb[i])), median(ring.map((i) => Cr[i]))];
    const ringD = ring.map((i) => dist(Y, Cb, Cr, i, bg)).sort((a, b) => a - b);
    const thr = Math.max(10, ringD[Math.floor(ringD.length * 0.6)] * 2.2);

    // Hold color: median of nearby pixels that clearly aren't wall (ignores chalk spots under the finger).
    const tx = Math.min(w - 1, Math.max(0, Math.round((cx - x0) * scale)));
    const ty = Math.min(h - 1, Math.max(0, Math.round((cy - y0) * scale)));
    const r = Math.max(3, Math.round(w * 0.025));
    const near = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const xx = tx + dx, yy = ty + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const i = yy * w + xx;
        if (dist(Y, Cb, Cr, i, bg) > thr) near.push(i);
      }
    }
    if (near.length < 4) return null;
    const seed = [median(near.map((i) => Y[i])), median(near.map((i) => Cb[i])), median(near.map((i) => Cr[i]))];
    const seedTol = tolerance * 1.6;

    let mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      mask[i] = dist(Y, Cb, Cr, i, bg) > thr && dist(Y, Cb, Cr, i, seed) < seedTol ? 1 : 0;
    }
    const k = Math.max(1, Math.round(w / 160));
    mask = morph(morph(mask, w, h, k, false), w, h, k, true);
    mask = morph(morph(mask, w, h, k, true), w, h, k, false);

    // Start from the mask pixel nearest to the tap.
    let start = -1, best = Infinity;
    for (let dy = -r * 2; dy <= r * 2; dy++) {
      for (let dx = -r * 2; dx <= r * 2; dx++) {
        const xx = tx + dx, yy = ty + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || !mask[yy * w + xx]) continue;
        const d = dx * dx + dy * dy;
        if (d < best) { best = d; start = yy * w + xx; }
      }
    }
    if (start < 0) return null;
    const comp = component(mask, w, h, start % w, (start / w) | 0);
    if (comp.size < 20) return null;

    // Touching the window edge means the hold is bigger than the window, unless that edge is the photo edge.
    let touchesWindow = false;
    if (comp.touches) {
      for (let i = 0; i < n && !touchesWindow; i++) {
        if (!comp.mask[i]) continue;
        const x = i % w, y = (i / w) | 0;
        if ((x === 0 && x0 > area.x0) || (y === 0 && y0 > area.y0)
          || (x === w - 1 && x1 < area.x1) || (y === h - 1 && y1 < area.y1)) touchesWindow = true;
      }
    }
    const filled = morph(fillHoles(comp.mask, w, h), w, h, Math.max(1, Math.round(w / 110)), true);
    const outline = simplify(traceBoundary(filled, w, h), Math.max(1, w / 220));
    return {
      touchesWindow,
      share: comp.size / n,
      pts: outline.map(([px, py]) => [x0 + (px + 0.5) / scale, y0 + (py + 0.5) / scale]),
    };
  }

  // Returns normalized polygon points, or null when no clean hold is found.
  async function detect(photo, x, y, tolerance) {
    const source = await loadSource(photo);
    const W = source.width, H = source.height;
    const area = { x0: 0, x1: W, y0: Math.round(photo.crop.top * H), y1: Math.round(photo.crop.bottom * H) };
    const span = photo.crop.bottom - photo.crop.top;
    const cx = x * W, cy = (photo.crop.top + y * span) * H;

    let result = null;
    // Second pass with a looser color tolerance helps on chalky or speckled holds.
    for (const tol of [tolerance, tolerance * 1.7]) {
      for (const frac of WINDOWS) {
        // A null result can mean the window sits entirely on a big hold, so keep zooming out.
        const res = analyse(source, area, cx, cy, (frac * W) / 2, tol);
        if (res && !res.touchesWindow && res.share <= 0.6) { result = res; break; }
      }
      if (result) break;
    }
    if (!result || result.pts.length < 3) return null;
    return result.pts.map(([px, py]) => [+(px / W).toFixed(4), +((py / H - photo.crop.top) / span).toFixed(4)]);
  }

  return { detect };
})();
