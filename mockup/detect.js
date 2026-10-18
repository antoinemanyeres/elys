// Automatic hold outlining: region growing from the tapped pixel, then a convex hull around the region.
const HoldDetector = (() => {
  const MAX_SIDE = 900;
  const cache = new Map();

  function loadPixels(photo) {
    if (!cache.has(photo.id)) {
      cache.set(photo.id, new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          try {
            const k = img.naturalWidth / photo.w;
            const srcY = photo.crop.top * photo.h * k;
            const srcH = (photo.crop.bottom - photo.crop.top) * photo.h * k;
            const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, srcH));
            const w = Math.round(img.naturalWidth * scale);
            const h = Math.round(srcH * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, srcY, img.naturalWidth, srcH, 0, 0, w, h);
            const rgba = ctx.getImageData(0, 0, w, h).data;
            const n = w * h;
            const Y = new Float32Array(n), Cb = new Float32Array(n), Cr = new Float32Array(n);
            for (let i = 0; i < n; i++) {
              const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
              Y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
              Cb[i] = -0.1687 * r - 0.3313 * g + 0.5 * b;
              Cr[i] = 0.5 * r - 0.4187 * g - 0.0813 * b;
            }
            resolve({ w, h, Y, Cb, Cr });
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

  // Luminance is down-weighted so shaded parts of a hold still match.
  const dist = (p, i, y, cb, cr) => Math.hypot((p.Y[i] - y) * 0.45, p.Cb[i] - cb, p.Cr[i] - cr);

  function convexHull(points) {
    points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of points) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }

  // Returns normalized polygon points, or null when no clean hold region is found.
  async function detect(photo, x, y, tolerance) {
    const p = await loadPixels(photo);
    const { w, h } = p;
    const sx = Math.min(w - 1, Math.max(0, Math.round(x * w)));
    const sy = Math.min(h - 1, Math.max(0, Math.round(y * h)));

    let sY = 0, sCb = 0, sCr = 0, c = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const px = sx + dx, py = sy + dy;
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const i = py * w + px;
        sY += p.Y[i]; sCb += p.Cb[i]; sCr += p.Cr[i]; c++;
      }
    }
    sY /= c; sCb /= c; sCr /= c;

    const maxR = Math.round(w * 0.14);
    const inRegion = new Uint8Array(w * h);
    const rowMin = new Int32Array(h).fill(w), rowMax = new Int32Array(h).fill(-1);
    const stack = [sy * w + sx];
    inRegion[stack[0]] = 1;
    let count = 0;

    while (stack.length) {
      const i = stack.pop();
      const px = i % w, py = (i / w) | 0;
      if (Math.abs(px - sx) >= maxR || Math.abs(py - sy) >= maxR) return null;
      count++;
      if (px < rowMin[py]) rowMin[py] = px;
      if (px > rowMax[py]) rowMax[py] = px;
      const neighbors = [px > 0 ? i - 1 : -1, px < w - 1 ? i + 1 : -1, py > 0 ? i - w : -1, py < h - 1 ? i + w : -1];
      for (const j of neighbors) {
        if (j < 0 || inRegion[j]) continue;
        const dSeed = dist(p, j, sY, sCb, sCr);
        const dNeighbor = dist(p, j, p.Y[i], p.Cb[i], p.Cr[i]);
        if (dSeed < tolerance || (dNeighbor < tolerance * 0.3 && dSeed < tolerance * 1.6)) {
          inRegion[j] = 1;
          stack.push(j);
        }
      }
    }
    if (count < 20) return null;

    const edge = [];
    let cx = 0, cy = 0;
    for (let r = 0; r < h; r++) {
      if (rowMax[r] < 0) continue;
      edge.push([rowMin[r], r], [rowMax[r], r]);
      cx += rowMin[r] + rowMax[r];
      cy += 2 * r;
    }
    cx /= edge.length;
    cy /= edge.length;
    const pad = Math.max(2, w * 0.005);
    return convexHull(edge).map(([hx, hy]) => {
      const dx = hx - cx, dy = hy - cy, d = Math.hypot(dx, dy) || 1;
      return [+((hx + 0.5 + (dx / d) * pad) / w).toFixed(4), +((hy + 0.5 + (dy / d) * pad) / h).toFixed(4)];
    });
  }

  return { detect };
})();
