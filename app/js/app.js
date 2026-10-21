(function () {
  const DAY = 864e5;
  const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
  const today = () => isoDate(Date.now());
  const fmtDate = (v) => new Date(v).toLocaleDateString(localeOf(), { day: 'numeric', month: 'short' });
  const daysUntil = (iso) => Math.round((new Date(iso) - new Date(today())) / DAY);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ---------- State ----------
  const store = {
    uid: null, profile: null, photos: [], boulders: [], stats: new Map(),
    sends: new Map(), votes: new Map(), likes: new Set(), projects: new Set(), commentCount: 0,
    seasons: [], plans: [], staff: [],
  };

  const newEditor = (sectorId = SET_SECTORS[0].id) => ({
    sectorId, part: currentPart(sectorId), editingId: null, color: 'green', subGrade: 1, tags: [], holds: [],
    holdType: 'start', mode: 'auto', tolerance: 30, circleR: 0.035, zoom: 1,
    openedAt: today(), closesAt: (nextReset(sectorId, currentPart(sectorId)) || {}).planned_on || isoDate(Date.now() + 60 * DAY),
    busy: false, notice: '', error: '',
  });

  const ui = {
    view: 'loading', tab: 'boulders', sectorId: null, part: 1, colors: new Set(), status: 'all', tag: '',
    boulderId: null, quickId: null, votePromptId: null, profileColor: null, lastModalId: null, lastQuickId: null,
    editor: null, cropper: null, feedback: null, news: false, toast: null, onboardStep: 0,
    auth: { mode: 'login', error: '', info: '' },
    detail: null, setTab: 'set', rankScope: 'current', ranking: null, rankingKey: null,
    admin: null, inbox: null, planForm: null, saving: false,
  };

  // ---------- Preferences stored on the device ----------
  const lightQuery = window.matchMedia('(prefers-color-scheme: light)');
  const themePref = () => localStorage.getItem('elys-theme') || 'system';
  const resolvedTheme = () => (themePref() === 'system' ? (lightQuery.matches ? 'light' : 'dark') : themePref());
  function applyTheme() {
    const theme = resolvedTheme();
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#f5f6fb' : '#11132c';
  }
  applyTheme();
  lightQuery.addEventListener('change', () => { applyTheme(); render(); });

  const deviceLang = () => {
    const saved = localStorage.getItem('elys-lang');
    if (saved) return saved;
    const nav = (navigator.language || 'en').slice(0, 2);
    return ['en', 'fr', 'de'].includes(nav) ? nav : 'en';
  };
  setLang(deviceLang());

  // ---------- Helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const colorIdx = (id) => COLORS.findIndex((c) => c.id === id);
  const colorOf = (id) => COLORS[colorIdx(id)];
  const colorLabel = (id) => t('color.' + id);
  const tagLabel = (tag) => t('tag.' + tag);
  const me = () => store.profile;
  const isSetter = () => !!me() && ['setter', 'admin', 'owner'].includes(me().role);
  const isAdmin = () => !!me() && ['admin', 'owner'].includes(me().role);
  const isOwner = () => !!me() && me().role === 'owner';
  const sectorOf = (id) => SECTORS.find((s) => s.id === id) || { id, name: id };
  const photoById = (id) => store.photos.find((p) => p.id === id);
  const photoOf = (b) => photoById(b.photoId);
  const boulderById = (id) => store.boulders.find((b) => b.id === id);
  const isActive = (b) => b.openedAt <= today() && (!b.closesAt || b.closesAt >= today());
  const activeBoulders = () => store.boulders.filter(isActive);
  const isNew = (b) => daysUntil(b.openedAt) > -7;
  const points = (b) => pointsFor(b.color, b.subGrade);
  const statsOf = (b) => store.stats.get(b.id) || { sends: 0, flashes: 0, likes: 0, comments: 0, vote_counts: [0, 0, 0, 0, 0] };
  const mySend = (b) => store.sends.get(b.id);
  const flashPct = Math.round(FLASH_BONUS * 100);
  const errMsg = (err) => (err && (err.message || err.error_description)) || String(err);
  const currentSeason = () => store.seasons.find((s) => s.starts_on <= today() && s.ends_on >= today());

  function toast(message, isError = false) {
    ui.toast = { message, isError };
    render();
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { ui.toast = null; render(); }, 3500);
  }

  const normPhoto = (p) => ({
    id: p.id, sectorId: p.sector_id, part: p.part, path: p.path, src: Api.publicUrl(p.path),
    w: p.w, h: p.h, retired: p.retired, createdAt: new Date(p.created_at).getTime(), crop: { top: 0, bottom: 1 },
  });

  const normBoulder = (b) => ({
    id: b.id, photoId: b.photo_id, sectorId: b.sector_id, color: b.color, subGrade: b.sub_grade, tags: b.tags || [],
    holds: b.holds || [], openedAt: b.opened_at, closesAt: b.closes_at, setterId: b.setter_id,
    setterName: b.setter ? b.setter.name : '', createdAt: new Date(b.created_at).getTime(),
  });

  // Current photo of each part of a sector, ordered by part.
  function sectorParts(sectorId) {
    const latest = {};
    store.photos.filter((p) => p.sectorId === sectorId).forEach((p) => {
      if (!latest[p.part] || p.createdAt > latest[p.part].createdAt) latest[p.part] = p;
    });
    return Object.values(latest).filter((p) => !p.retired).sort((a, b) => a.part - b.part);
  }
  function currentPart(sectorId) { const first = sectorParts(sectorId)[0]; return first ? first.part : 'new'; }
  function partLabel(photo) {
    if (!photo) return '';
    const parts = sectorParts(photo.sectorId);
    const i = parts.findIndex((p) => p.id === photo.id);
    return parts.length > 1 && i >= 0 ? `${i + 1}/${parts.length}` : '';
  }
  const sectorLabel = (b) => `${sectorOf(b.sectorId).name} ${partLabel(photoOf(b))}`.trim();
  function editorPhoto() {
    const ed = ui.editor;
    return ed.part === 'new' ? null : sectorParts(ed.sectorId).find((p) => p.part === ed.part) || null;
  }

  function consensus(b) {
    const counts = statsOf(b).vote_counts || [0, 0, 0, 0, 0];
    const count = counts.reduce((a, c) => a + c, 0);
    if (!count) return null;
    const avg = counts.reduce((a, c, i) => a + c * (i + 1), 0) / count;
    return { color: b.color, subGrade: Math.round(avg), avg, count };
  }

  // ---------- Data loading ----------
  async function loadAll() {
    const uid = store.uid;
    const [photos, boulders, sends, votes, likes, projects, commentCount, seasons, plans, staff] = await Promise.all([
      Api.photos(), Api.activeBoulders(), Api.mySends(uid), Api.myVotes(uid), Api.myLikes(uid), Api.myProjects(uid),
      Api.myCommentCount(uid), Api.seasons(), Api.plans(), Api.staff(),
    ]);
    store.photos = photos.map(normPhoto);
    store.boulders = boulders.map(normBoulder);
    store.sends = new Map(sends.map((s) => [s.boulder_id, {
      flash: s.flash, createdAt: new Date(s.created_at).getTime(),
      boulder: s.boulder && { color: s.boulder.color, subGrade: s.boulder.sub_grade, sectorId: s.boulder.sector_id,
        photoId: s.boulder.photo_id, openedAt: s.boulder.opened_at, closesAt: s.boulder.closes_at },
    }]));
    store.votes = new Map(votes.map((v) => [v.boulder_id, v.sub_grade]));
    store.likes = new Set(likes.map((l) => l.boulder_id));
    store.projects = new Set(projects.map((p) => p.boulder_id));
    store.commentCount = commentCount || 0;
    store.seasons = seasons;
    store.plans = plans;
    store.staff = staff;
    await refreshStats(store.boulders.map((b) => b.id));
    if (!ui.sectorId) ui.sectorId = (store.photos.find((p) => !p.retired) || {}).sectorId || null;
  }

  async function refreshStats(ids) {
    if (!ids.length) return;
    (await Api.stats(ids)).forEach((s) => store.stats.set(s.boulder_id, s));
  }

  async function ensureRanking() {
    const key = ui.rankScope;
    if (ui.rankingKey === key) return;
    ui.rankingKey = key;
    ui.ranking = null;
    const rows = await Api.ranking(key === 'current' ? null : key);
    if (ui.rankingKey === key) { ui.ranking = rows; render(); }
  }

  async function loadDetail(id) {
    ui.detail = { id, loading: true, repeats: [], comments: [], videos: [] };
    let b = boulderById(id);
    if (!b) {
      const row = await Api.boulder(id);
      if (!row) { ui.boulderId = null; toast(t('m.notFound'), true); return; }
      b = normBoulder(row);
      store.boulders.push(b);
      await refreshStats([id]);
    }
    const [repeats, comments, videos] = await Promise.all([Api.repeats(id), Api.comments(id), Api.videos(id)]);
    if (ui.boulderId === id) { ui.detail = { id, loading: false, repeats, comments, videos }; render(); }
  }

  // ---------- Icons ----------
  const ICONS = {
    boulders: '<path d="M2 20 9 7l4 6 3-4 6 11Z"/>',
    ranking: '<path d="M8 21v-9h8v9M2 21v-5h6M16 21v-7h6M1 21h22"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    set: '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
    back: '<path d="M15 5 8 12l7 7"/>',
    heart: '<path d="M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.6-9 9-9 9Z"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    flash: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.6 6.6A17 17 0 0 0 2 12s4 6 10 6a9.7 9.7 0 0 0 5.4-1.6"/>',
    play: '<path d="M6 4l14 8-14 8z"/>',
  };
  const icon = (name) => `<svg class="ico ico-${name}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  // ---------- Small components ----------
  const gradePill = (color, sub) => `<span class="grade" style="--c:${colorOf(color).hex}"><i class="sw"></i>${colorLabel(color)}<span class="subdots">${[1, 2, 3, 4, 5]
    .map((i) => `<b class="${i <= sub ? 'on' : ''}"></b>`).join('')}</span></span>`;

  const colorDots = (action, selected) => `<div class="dots">${COLORS.map((c) =>
    `<button class="dot ${selected === c.id ? 'on' : ''}" style="background:${c.hex}" title="${colorLabel(c.id)}" aria-label="${colorLabel(c.id)}"
      data-action="${action}" data-id="${c.id}"></button>`).join('')}</div>`;

  const subButtons = (action, selected) => `<div class="nums">${[1, 2, 3, 4, 5].map((n) =>
    `<button class="num ${selected === n ? 'on' : ''}" data-action="${action}" data-id="${n}">${n}</button>`).join('')}</div>`;

  const tagList = (tags) => tags.map((tag) => `<span class="tag">${esc(tagLabel(tag))}</span>`).join('');

  const langSelect = (cls = '') => `<select class="${cls}" data-change="lang" aria-label="${t('p.language')}">${LANGUAGES.map((l) =>
    `<option value="${l.id}" ${l.id === currentLang ? 'selected' : ''}>${cls ? l.short : l.label}</option>`).join('')}</select>`;

  const displayName = (name, hidden) => (hidden ? t('p.anonymous') : esc(name));

  // ---------- Wall photo with hold outlines ----------
  function wallGeom(photo) {
    const span = photo.crop.bottom - photo.crop.top;
    const ar = (photo.h * span) / photo.w;
    return { span, ar, H: 1000 * ar };
  }

  function holdBox(h, ar) {
    if (h.c) {
      const [x, y, r] = h.c;
      return { x0: x - r, x1: x + r, y0: y - r / ar, y1: y + r / ar };
    }
    const xs = h.pts.map((p) => p[0]), ys = h.pts.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }

  // offset grows the shape outward (in SVG units), used for the start-hold double ring.
  function shapeSvg(h, H, cls, offset = 0) {
    if (h.c) {
      return `<circle class="${cls}" cx="${(h.c[0] * 1000).toFixed(1)}" cy="${(h.c[1] * H).toFixed(1)}" r="${(h.c[2] * 1000 + offset).toFixed(1)}"/>`;
    }
    const pts = h.pts.map(([x, y]) => [x * 1000, y * H]);
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const avgR = pts.reduce((s, p) => s + Math.hypot(p[0] - mx, p[1] - my), 0) / pts.length || 1;
    const k = 1 + offset / avgR;
    const str = pts.map(([x, y]) => `${(mx + (x - mx) * k).toFixed(1)},${(my + (y - my) * k).toFixed(1)}`).join(' ');
    return `<polygon class="${cls}" points="${str}"/>`;
  }

  function badge(h, geo) {
    if (h.type === 'hold') return '';
    const box = holdBox(h, geo.ar);
    const x = ((box.x0 + box.x1) / 2) * 1000;
    let y = box.y0 * geo.H - 34;
    if (y < 30) y = box.y1 * geo.H + 34;
    const shape = h.type === 'top'
      ? `<rect x="${x - 22}" y="${y - 22}" width="44" height="44" rx="8" transform="rotate(45 ${x} ${y})"/>`
      : `<circle cx="${x}" cy="${y}" r="24"/>`;
    return `<g class="badge">${shape}<text x="${x}" y="${y}">${t(h.type === 'top' ? 'hold.topSymbol' : 'hold.startSymbol')}</text></g>`;
  }

  function boulderSvg(holds, color, geo, { id = '', clickable = false, draft = false, action = 'open-boulder' } = {}) {
    const c = colorOf(color);
    const halo = color === 'black' ? '#fff' : '#000';
    const shapes = holds.map((h, i) => {
      const act = draft ? `data-action="remove-hold" data-id="${i}"` : '';
      const ring = h.type === 'start' ? shapeSvg(h, geo.H, 'halo', 14) + shapeSvg(h, geo.H, 'line thin', 14) : '';
      return `<g class="hold" ${act}>${shapeSvg(h, geo.H, 'halo')}${shapeSvg(h, geo.H, 'line')}${ring}</g>`;
    }).join('');
    const attrs = clickable ? `data-action="${action}" data-id="${id}"` : '';
    return `<g class="boulder ${draft ? 'draft' : ''} ${clickable ? 'clickable' : ''}" ${attrs}
      style="--c:${c.hex};--halo:${halo};--ink:${c.ink}">${shapes}${holds.map((h) => badge(h, geo)).join('')}</g>`;
  }

  function wall(photo, boulders, { highlight = null, editor = false, draft = null, clickable = true, action } = {}) {
    const geo = wallGeom(photo);
    const shown = highlight ? boulders.filter((b) => b.id === highlight) : boulders;
    const layers = shown.map((b) => boulderSvg(b.holds, b.color, geo, { id: b.id, clickable: clickable && !editor, action })).join('');
    const draftLayer = draft ? boulderSvg(draft.holds, draft.color, geo, { draft: true }) : '';
    return `<div class="wall ${editor ? 'editing' : ''}" ${editor ? 'data-action="place-hold"' : ''}
      style="aspect-ratio:${photo.w}/${(photo.h * geo.span).toFixed(1)}">
      <img src="${esc(photo.src)}" alt="" draggable="false" style="top:${(-photo.crop.top / geo.span * 100).toFixed(3)}%">
      <svg class="overlay" viewBox="0 0 1000 ${geo.H.toFixed(1)}">${layers}${draftLayer}</svg>
    </div>`;
  }

  // Square thumbnail zoomed on the start holds.
  function thumb(b, size = 64) {
    const photo = photoOf(b);
    if (!photo || !b.holds.length) return `<span class="thumb" style="width:${size}px;height:${size}px"></span>`;
    const geo = wallGeom(photo);
    const starts = b.holds.filter((h) => h.type === 'start');
    const boxes = (starts.length ? starts : b.holds).map((h) => holdBox(h, geo.ar));
    const x0 = Math.min(...boxes.map((x) => x.x0)), x1 = Math.max(...boxes.map((x) => x.x1));
    const y0 = Math.min(...boxes.map((x) => x.y0)), y1 = Math.max(...boxes.map((x) => x.y1));
    const win = Math.min(0.6, Math.max(0.18, Math.max(x1 - x0, (y1 - y0) * geo.ar) * 2.2));
    const innerW = size / win;
    const clamp = (v, half) => Math.min(Math.max(v, half), 1 - half);
    const cx = clamp((x0 + x1) / 2, win / 2);
    const cy = clamp((y0 + y1) / 2, win / 2 / geo.ar);
    return `<span class="thumb" style="width:${size}px;height:${size}px">
      <span class="thumb-inner" style="width:${innerW}px;left:${size / 2 - cx * innerW}px;top:${size / 2 - cy * innerW * geo.ar}px">
        ${wall(photo, [b], { clickable: false })}</span></span>`;
  }

  // ---------- Map ----------
  const polyPoints = (poly) => poly.map(([x, y]) => `${x},${y}`).join(' ');
  const SECTOR_FONT = 20;
  const centroid = (poly) => [poly.reduce((a, p) => a + p[0], 0) / poly.length, poly.reduce((a, p) => a + p[1], 0) / poly.length];

  // Stairs are quads [a, b, c, d]: one step line from edge a→d to edge b→c every ~7 px.
  function stairSteps([a, b, c, d]) {
    const n = Math.max(2, Math.round(Math.hypot(d[0] - a[0], d[1] - a[1]) / 7));
    const lerp = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
    let out = '';
    for (let i = 1; i < n; i++) {
      const [x1, y1] = lerp(a, d, i / n), [x2, y2] = lerp(b, c, i / n);
      out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }
    return out;
  }

  function mapLabel(shape, text, fixedSize) {
    const [x, y, rot = 0, size = 22] = shape.label || [...centroid(shape.poly), 0, 22];
    return `<text x="${x}" y="${y}" style="font-size:${fixedSize || size}px" transform="rotate(${rot} ${x} ${y})">${text}</text>`;
  }

  function gymMap(selectedId) {
    const counts = {};
    activeBoulders().forEach((b) => { counts[b.sectorId] = (counts[b.sectorId] || 0) + 1; });
    const [vx, vy, vw, vh] = GYM_MAP.viewBox;
    const layers = GYM_MAP.shapes.map((s, i) => {
      if (s.kind === 'outline') return `<polygon class="map-outline" points="${polyPoints(s.poly)}"/>`;
      if (s.kind === 'floor') return `<polygon class="map-floor" style="--area:${AREA_COLORS[s.area] || AREA_COLORS.none}" points="${polyPoints(s.poly)}"/>`;
      if (s.kind === 'mat') return `<polygon class="map-mat" style="--area:${AREA_COLORS[s.area] || AREA_COLORS.none}" points="${polyPoints(s.poly)}"/>`;
      if (s.kind === 'upper') return `<polygon class="map-upper" points="${polyPoints(s.poly)}"/>`;
      // Ramp quad [a, b, c, d]: shading goes from the low edge a→b to the high edge c→d.
      if (s.kind === 'ramp' && s.poly.length === 4) {
        const [a, b, c, d] = s.poly;
        return `<linearGradient id="ramp-${i}" gradientUnits="userSpaceOnUse" x1="${(a[0] + b[0]) / 2}" y1="${(a[1] + b[1]) / 2}" x2="${(c[0] + d[0]) / 2}" y2="${(c[1] + d[1]) / 2}">
          <stop offset="0" class="ramp-low"/><stop offset="1" class="ramp-high"/></linearGradient>
          <polygon class="map-ramp" fill="url(#ramp-${i})" points="${polyPoints(s.poly)}"/>`;
      }
      if (s.kind === 'stairs') return `<g class="map-stairs"><polygon points="${polyPoints(s.poly)}"/>${s.poly.length === 4 ? stairSteps(s.poly) : ''}</g>`;
      if (s.kind === 'room') {
        return `<g class="map-room" style="--area:${AREA_COLORS[s.area] || AREA_COLORS.none}"><polygon points="${polyPoints(s.poly)}"/>${mapLabel(s, esc(t(s.name)))}</g>`;
      }
      if (s.kind !== 'sector') return '';
      if (s.noSet) return `<g class="map-static">${mapLabel(s, esc(s.name), SECTOR_FONT)}</g>`;
      const n = counts[s.id] || 0;
      // Badge sits right after the (rotated) name, kept upright; width is estimated from the font size.
      const [lx, ly, rot = 0] = s.label || [...centroid(s.poly), 0];
      const size = SECTOR_FONT;
      const r = Math.max(10, size * 0.6);
      const off = s.name.length * size * 0.33 + r + 3;
      const cx = lx + off * Math.cos(rot * Math.PI / 180), cy = ly + off * Math.sin(rot * Math.PI / 180);
      return `<g class="zone ${s.id === selectedId ? 'selected' : ''}" data-action="select-sector" data-id="${s.id}" style="--area:${AREA_COLORS[s.area]}">
        <polygon class="hit" points="${polyPoints(s.poly)}"/><polygon points="${polyPoints(s.poly)}"/>
        ${mapLabel(s, esc(s.name), SECTOR_FONT)}
        ${n ? `<circle cx="${cx}" cy="${cy}" r="${r}"></circle><text class="count" x="${cx}" y="${cy}" style="font-size:${r * 1.05}px">${n}</text>` : ''}
      </g>`;
    }).join('');
    return `<div class="map-wrap ${ui.mapZoom ? 'zoomed' : ''}">
      <button class="icon-chip map-zoom" data-action="map-zoom" aria-label="${t('map.zoom')}">${ui.mapZoom ? '\u2212' : '+'}</button>
      <div class="map-scroll"><svg class="map" viewBox="${vx} ${vy} ${vw} ${vh}" role="img" aria-label="${t('map.title')}">
        <text class="gym-name" x="${vx + vw * 0.62}" y="${vy + vh * 0.42}">ELYS</text>${layers}</svg></div>
    </div>`;
  }

  // ---------- Layout ----------
  const brand = () => `<div class="brand"><span class="logo" role="img" aria-label="ELYS Boulderloft"></span>
    <span class="wordmark">ELYS<small>Boulderloft</small></span></div>`;

  const themeToggle = () => `<button class="icon-chip" data-action="toggle-theme" aria-label="${t('p.toggleTheme')}">
    ${icon(resolvedTheme() === 'light' ? 'moon' : 'sun')}</button>`;

  const newBoulders = () => activeBoulders()
    .filter((b) => b.createdAt > new Date(me().last_seen_new_at).getTime() && b.setterId !== store.uid);

  function header() {
    const n = newBoulders().length;
    return `<header class="top">${brand()}
      <div class="head-right">
        <button class="icon-chip bell" data-action="open-news" aria-label="${t('n.title')}">${icon('bell')}${n ? `<span class="dot-count">${n > 99 ? '99+' : n}</span>` : ''}</button>
        ${themeToggle()}
        <button class="avatar sm" data-action="tab" data-id="profile" aria-label="${t('tab.profile')}">${esc(me().name[0])}</button></div>
    </header>`;
  }

  function tabs() {
    const list = ['boulders', 'ranking', 'profile'];
    if (isSetter()) list.push('set');
    return `<nav class="tabs">${list.map((id) =>
      `<button data-action="tab" data-id="${id}" class="${ui.tab === id ? 'active' : ''}">${icon(id)}<span>${t('tab.' + id)}</span></button>`).join('')}</nav>`;
  }

  // ---------- Auth ----------
  function authView() {
    const a = ui.auth;
    const google = window.ELYS_CONFIG.googleLogin && (a.mode === 'login' || a.mode === 'signup')
      ? `<button class="btn google block" data-action="auth-google">${t('l.google')}</button><div class="or"><span>${t('l.or')}</span></div>` : '';
    const field = (id, label, type, extra = '') => `<label class="field"><span>${label}</span>
      <input id="${id}" type="${type}" ${extra}></label>`;
    let form;
    if (a.mode === 'reset') {
      form = `${field('auth-password', t('l.newPassword'), 'password', 'minlength="8" autocomplete="new-password"')}
        <button class="btn primary block" type="submit">${t('l.savePassword')}</button>`;
    } else if (a.mode === 'forgot') {
      form = `<p class="muted small">${t('l.forgotText')}</p>
        ${field('auth-email', t('l.email'), 'email', `autocomplete="email" value="${esc(a.email || '')}"`)}
        <button class="btn primary block" type="submit">${t('l.sendLink')}</button>`;
    } else {
      const signup = a.mode === 'signup';
      form = `${signup ? field('auth-name', t('l.name'), 'text', `maxlength="30" autocomplete="nickname" value="${esc(a.name || '')}"`) : ''}
        ${field('auth-email', t('l.email'), 'email', `autocomplete="email" value="${esc(a.email || '')}"`)}
        ${field('auth-password', t('l.password'), 'password', `minlength="8" autocomplete="${signup ? 'new-password' : 'current-password'}"`)}
        ${signup ? `<label class="consent"><input type="checkbox" id="auth-terms">
          <span>${t('l.consent', { link: `<a href="privacy.html" target="_blank" rel="noopener">${t('l.privacy')}</a>` })}</span></label>` : ''}
        <button class="btn primary block" type="submit">${t(signup ? 'l.signup' : 'l.login')}</button>`;
    }
    const links = a.mode === 'login'
      ? `<button class="link block-link" data-action="auth-mode" data-id="signup">${t('l.toSignup')}</button>
         <button class="link block-link" data-action="auth-mode" data-id="forgot">${t('l.forgot')}</button>`
      : a.mode === 'reset' ? '' : `<button class="link block-link" data-action="auth-mode" data-id="login">${t('l.toLogin')}</button>`;
    return `<div class="login">
      <div class="login-top">${themeToggle()}${langSelect('lang-chip')}</div>
      <div class="login-hero">${brand()}<p>${t('l.tagline')}</p></div>
      <div class="card">
        ${google}
        <form data-submit="auth" novalidate>${form}
          ${a.error ? `<p class="notice">${esc(a.error)}</p>` : ''}
          ${a.info ? `<p class="info">${esc(a.info)}</p>` : ''}
        </form>
        ${links}
      </div>
      <p class="muted small center"><a href="privacy.html" target="_blank" rel="noopener">${t('l.privacy')}</a></p>
    </div>`;
  }

  async function submitAuth() {
    const a = ui.auth;
    const val = (id) => (document.getElementById(id) || {}).value || '';
    a.error = ''; a.info = '';
    if (a.mode === 'reset') {
      const password = val('auth-password');
      if (password.length < 8) { a.error = t('l.errPassword'); return; }
      await Api.updatePassword(password);
      a.mode = 'login';
      toast(t('l.passwordSaved'));
      const session = await Api.session();
      if (session) await start(session);
      return;
    }
    const email = val('auth-email').trim().toLowerCase();
    a.email = email;
    if (!EMAIL_RE.test(email)) { a.error = t('l.errEmail'); return; }
    if (a.mode === 'forgot') {
      await Api.resetPassword(email);
      a.info = t('l.linkSent');
      return;
    }
    const password = val('auth-password');
    if (password.length < 8) { a.error = t('l.errPassword'); return; }
    if (a.mode === 'signup') {
      const name = val('auth-name').trim();
      a.name = name;
      if (!name) { a.error = t('l.errName'); return; }
      if (!document.getElementById('auth-terms').checked) { a.error = t('l.errConsent'); return; }
      const res = await Api.signUp(email, password, name, currentLang);
      if (!res.session) a.info = t('l.checkEmail');
      return;
    }
    await Api.signIn(email, password);
  }

  // ---------- Onboarding ----------
  const ONBOARD = [
    { icon: 'boulders', key: 'o.map' },
    { icon: 'check', key: 'o.send' },
    { icon: 'ranking', key: 'o.points' },
    { icon: 'bookmark', key: 'o.projects' },
  ];

  function onboardingView() {
    const i = ui.onboardStep;
    const s = ONBOARD[i];
    const last = i === ONBOARD.length - 1;
    return `<div class="onboard">
      <button class="link skip" data-action="onboard-done">${t('o.skip')}</button>
      <div class="onboard-body">
        ${i === 0 ? `<div class="onboard-logo">${brand()}</div>` : ''}
        <div class="onboard-icon">${icon(s.icon)}</div>
        <h2>${t(s.key + '.t')}</h2>
        <p>${t(s.key + '.d', { pct: flashPct })}</p>
      </div>
      <div class="onboard-dots">${ONBOARD.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <button class="btn primary block" data-action="${last ? 'onboard-done' : 'onboard-next'}">${t(last ? 'o.start' : 'o.next')}</button>
    </div>`;
  }

  // ---------- Boulders ----------
  const passesFilters = (b) =>
    (ui.colors.size === 0 || ui.colors.has(b.color)) &&
    (ui.status === 'all' || (ui.status === 'new' ? isNew(b)
      : ui.status === 'projects' ? store.projects.has(b.id)
        : (ui.status === 'sent') === !!mySend(b))) &&
    (!ui.tag || b.tags.includes(ui.tag));

  function sendMark(b) {
    const s = mySend(b);
    if (!s) return store.projects.has(b.id) ? `<span class="proj-mark">${icon('bookmark')}</span>` : '';
    return s.flash ? `<span class="flash-mark">${icon('flash')}</span>` : `<span class="ok">${icon('check')}</span>`;
  }

  function boulderRow(b, action = 'quick-boulder', note = '') {
    const st = statsOf(b);
    return `<div class="row ${ui.quickId === b.id ? 'selected' : ''}" data-action="${action}" data-id="${b.id}">
      ${thumb(b)}
      <div class="mid">
        <div class="line1">${gradePill(b.color, b.subGrade)}${isNew(b) && !note ? `<span class="new">${t('new')}</span>` : ''}</div>
        <div class="muted small">${esc(sectorLabel(b))}${note ? ` \u00b7 ${note}` : ''}</div>
      </div>
      <div class="side">
        <div class="pts">${points(b)}<small>${t('pts')}</small></div>
        <div class="meta">${sendMark(b)}${st.likes || store.likes.has(b.id) ? `<span class="likes ${store.likes.has(b.id) ? 'on' : ''}">${icon('heart')}${st.likes}</span>` : ''}<span>${t('b.sends', { n: st.sends })}</span></div>
      </div>
    </div>`;
  }

  const nextPlan = (sectorId) => store.plans.find((p) => p.sector_id === sectorId && !p.done && p.planned_on >= today());

  // Next planned reset of a wall part (plans without a part cover the whole wall).
  function nextReset(sectorId, part) {
    return store.plans
      .filter((p) => p.sector_id === sectorId && !p.done && p.planned_on > today() && (!p.part || part === 'new' || p.part === part))
      .sort((a, b) => a.planned_on.localeCompare(b.planned_on))[0] || null;
  }

  function archiveView() {
    const a = ui.archive;
    if (!a.list) {
      a.list = [];
      a.loading = true;
      Api.archivedBoulders().then(async (rows) => {
        const list = rows.map(normBoulder);
        list.forEach((b) => { if (!boulderById(b.id)) store.boulders.push(b); });
        await refreshStats(list.map((b) => b.id));
        Object.assign(ui.archive || {}, { list, loading: false });
        render();
      }).catch((e) => toast(errMsg(e), true));
    }
    const sectors = SET_SECTORS.filter((s) => a.list.some((b) => b.sectorId === s.id));
    const list = a.list.filter((b) => !a.sector || b.sectorId === a.sector);
    return `<div class="archive-head"><button class="link" data-action="close-archive">${icon('back')} ${t('ar.back')}</button><h2>${t('ar.title')}</h2></div>
      <div class="rank-head"><select class="select-full" data-change="archive-sector"><option value="">${t('b.wholeGym')}</option>${sectors.map((s) =>
        `<option value="${s.id}" ${s.id === a.sector ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div class="list">${list.map((b) => boulderRow(b, 'open-boulder', t('ar.removedOn', { date: fmtDate(b.closesAt) }))).join('')
        || `<p class="empty">${a.loading ? '\u2026' : t('ar.none')}</p>`}</div>`;
  }

  function bouldersView() {
    if (ui.archive) return archiveView();
    const sector = ui.sectorId ? sectorOf(ui.sectorId) : null;
    let list = activeBoulders();
    if (sector) list = list.filter((b) => b.sectorId === sector.id);
    const visible = list.filter(passesFilters).sort((a, b) => points(a) - points(b));
    const parts = sector ? sectorParts(sector.id) : [];
    const partIdx = Math.max(0, Math.min(ui.part, parts.length) - 1);
    const photo = parts[partIdx] || null;
    const partTabs = parts.length > 1 ? `<div class="parts-bar"><div class="seg parts">${parts.map((p, i) =>
      `<button class="${i === partIdx ? 'on' : ''}" data-action="select-part" data-id="${i + 1}">${esc(sector.name)} ${i + 1}/${parts.length}</button>`).join('')}</div></div>` : '';
    const opt = (v, key) => `<option value="${v}" ${ui.status === v ? 'selected' : ''}>${t(key)}</option>`;
    const plan = sector && nextPlan(sector.id);

    return `
      <section class="card">
        ${gymMap(ui.sectorId)}
        <div class="sector-title">${sector
          ? `<h2>${esc(sector.name)}</h2><button class="link" data-action="select-sector" data-id="${sector.id}">${t('b.wholeGym')}</button>`
          : `<h2>${t('b.wholeGym')}</h2>`}</div>
        ${plan ? `<p class="plan-note">${t('pl.nextReset', { date: fmtDate(plan.planned_on) })}</p>` : ''}
        ${sector && isSetter() ? `<button class="btn primary block set-here" data-action="set-sector" data-id="${sector.id}">${icon('set')} ${t('b.setHere', { name: esc(sector.name) })}</button>` : ''}
        <div class="colorbar">${COLORS.map((c) =>
          `<button data-action="toggle-color" data-id="${c.id}" title="${colorLabel(c.id)}" aria-label="${colorLabel(c.id)}"
            class="${ui.colors.size === 0 || ui.colors.has(c.id) ? 'on' : ''}" style="background:${c.hex}"></button>`).join('')}</div>
        <div class="filters">
          <select data-change="status">${opt('all', 'f.all')}${opt('todo', 'f.todo')}${opt('sent', 'f.sent')}${opt('projects', 'f.projects')}${opt('new', 'f.new')}</select>
          <select data-change="tag"><option value="">${t('f.allStyles')}</option>${STYLE_TAGS.map((tag) =>
            `<option value="${esc(tag)}" ${ui.tag === tag ? 'selected' : ''}>${esc(tagLabel(tag))}</option>`).join('')}</select>
        </div>
      </section>
      ${photo ? `<section class="card flush">${partTabs}${wall(photo, visible.filter((b) => b.photoId === photo.id), { highlight: ui.quickId, action: 'quick-boulder' })}
          <div class="legend"><span><i class="lg-start">${t('hold.startSymbol')}</i>${t('hold.start')}</span><span><i class="lg-top">${t('hold.topSymbol')}</i>${t('hold.top')}</span></div></section>`
        : sector ? `<section class="card empty">${t('b.noPhoto')}</section>` : ''}
      <div class="list-head">${visible.length === 1 ? t('b.count1') : t('b.countN', { n: visible.length })}</div>
      <div class="list">${visible.map((b) => boulderRow(b)).join('') || `<p class="empty">${t('b.noMatch')}</p>`}</div>
      <button class="feedback-link" data-action="open-archive">${t('ar.link')}</button>
      ${feedbackLink()}`;
  }

  const voteBlock = (b) => `<div class="vote" data-boulder="${b.id}">
      <div class="muted small">${t('q.rateHint', { color: colorLabel(b.color) })}</div>
      ${subButtons('vote-sub', store.votes.get(b.id))}</div>`;

  function votePrompt(b) {
    return `<div class="vote-prompt">
      <b>${t('q.howHard')}</b>
      <div class="muted small">${t('m.setterGrade')}: ${gradePill(b.color, b.subGrade)}</div>
      ${voteBlock(b)}
      <div class="prompt-actions"><button class="btn ghost" data-action="vote-done">${t('q.skip')}</button>
        <button class="btn primary" data-action="vote-done" ${store.votes.has(b.id) ? '' : 'disabled'}>${t('q.done')}</button></div>
    </div>`;
  }

  const projectBtn = (b) => `<button class="btn icon-btn ${store.projects.has(b.id) ? 'saved' : ''}" data-action="toggle-project" data-id="${b.id}"
    aria-label="${t('pr.toggle')}" title="${t(store.projects.has(b.id) ? 'pr.remove' : 'pr.add')}">${icon('bookmark')}</button>`;

  function quickSheet() {
    const b = boulderById(ui.quickId);
    if (!b) return '';
    const send = mySend(b);
    const body = ui.votePromptId === b.id ? votePrompt(b) : `<div class="quick-actions">
        <button class="btn ${send ? 'sent' : 'primary'}" data-action="toggle-send" data-id="${b.id}">${send ? `${icon('check')} ${t('m.sent')}` : t('m.markSent')}</button>
        <button class="btn flash-btn ${send && send.flash ? 'on' : ''}" data-action="toggle-flash" data-id="${b.id}">${icon('flash')} ${t(send && send.flash ? 'm.flashed' : 'm.flash')}</button>
        ${projectBtn(b)}
        <button class="btn ghost" data-action="open-boulder" data-id="${b.id}">${t('q.details')} \u2192</button>
      </div>`;
    return `<div class="quick-backdrop" data-action="close-quick"></div>
      <div class="quick ${ui.lastQuickId === b.id ? '' : 'enter'}" role="dialog">
        <div class="quick-head">${thumb(b, 52)}
          <div class="mid">${gradePill(b.color, b.subGrade)}
            <div class="muted small">${esc(sectorLabel(b))} \u00b7 ${t('b.sends', { n: statsOf(b).sends })}</div></div>
          <div class="pts">${points(b)}<small>${t('pts')}</small>
            <div class="flash-mark small">${icon('flash')} ${sendPointsFor(b.color, b.subGrade, true)}</div></div>
        </div>
        ${body}
      </div>`;
  }

  const subRow = (color, n, value, max, label, cls = '') => `<div class="sub-row ${cls}">
      <span class="sub-n">${n}</span>
      <div class="track"><i style="width:${max ? (value / max) * 100 : 0}%;background:${colorOf(color).hex}"></i></div>
      <span class="sub-val">${label}</span></div>`;

  function voteDistribution(b) {
    const counts = statsOf(b).vote_counts || [0, 0, 0, 0, 0];
    if (!counts.some((c) => c)) return '';
    const max = Math.max(...counts);
    const mine = store.votes.get(b.id);
    return `<div class="dist"><div class="dist-title">${t('m.voteDist')}</div>
      ${counts.map((count, i) => {
        const n = i + 1;
        const tags = (b.subGrade === n ? `<span class="mini-tag">${t('m.setterMark')}</span>` : '')
          + (mine === n ? `<span class="mini-tag you">${t('m.you')}</span>` : '');
        return subRow(b.color, n, count, max, `${count}${tags}`, b.subGrade === n ? 'setter' : '');
      }).join('')}</div>`;
  }

  function videoCard(v) {
    const own = v.user_id === store.uid;
    const platform = /instagram/i.test(v.url) ? 'Instagram' : 'YouTube';
    return `<div class="video-link ${v.hidden ? 'is-hidden' : ''}">
      <a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">${icon('play')}<span>${platform}</span></a>
      <span class="muted small">${esc(v.author ? v.author.name : '?')}</span>
      ${contentActions('video', v, own)}</div>`;
  }

  const isSetterVideo = (v) => v.author && v.author.role !== 'climber';

  function contentActions(type, item, own) {
    const out = [];
    if (!own) out.push(`<button class="mini-btn" data-action="report" data-type="${type}" data-id="${item.id}" title="${t('mod.report')}" aria-label="${t('mod.report')}">${icon('flag')}</button>`);
    if (isSetter() && !own && !item.hidden) out.push(`<button class="mini-btn" data-action="hide-content" data-type="${type}" data-id="${item.id}" title="${t('mod.hide')}" aria-label="${t('mod.hide')}">${icon('eyeOff')}</button>`);
    if (own || isSetter()) out.push(`<button class="mini-btn" data-action="delete-content" data-type="${type}" data-id="${item.id}" title="${t('mod.delete')}" aria-label="${t('mod.delete')}">${icon('trash')}</button>`);
    return `<span class="content-actions">${out.join('')}</span>`;
  }

  function boulderModal() {
    const b = boulderById(ui.boulderId);
    if (!b) return '';
    const photo = photoOf(b);
    const cons = consensus(b);
    const send = mySend(b);
    const st = statsOf(b);
    const d = ui.detail && ui.detail.id === b.id ? ui.detail : { loading: true, repeats: [], comments: [], videos: [] };
    const closesIn = b.closesAt ? daysUntil(b.closesAt) : null;
    const removed = !isActive(b) && b.closesAt && b.closesAt < today();
    const mainActions = isSetter()
      ? `<button class="btn primary" data-action="edit-boulder" data-id="${b.id}">${t('m.edit')}</button>`
      : removed ? ''
      : `<button class="btn ${send ? 'sent' : 'primary'}" data-action="toggle-send" data-id="${b.id}">${send ? `${icon('check')} ${t('m.sent')}` : t('m.markSent')}</button>
         <button class="btn flash-btn ${send && send.flash ? 'on' : ''}" data-action="toggle-flash" data-id="${b.id}">${icon('flash')} ${t(send && send.flash ? 'm.flashed' : 'm.flash')}</button>`;

    return `<div class="modal" data-action="close-modal"><div class="sheet">
      <div class="hero">
        <button class="back" data-action="close-modal" aria-label="${t('m.close')}">${icon('back')}</button>
        ${photo ? wall(photo, [b], { clickable: false }) : ''}
      </div>
      <div class="sheet-body">
        <div class="title-row">
          <div>${gradePill(b.color, b.subGrade)}${isNew(b) ? `<span class="new">${t('new')}</span>` : ''}
            <div class="muted small">${esc(sectorLabel(b))} · ${t('m.setBy', { name: esc(b.setterName || '?') })}</div></div>
          <div class="pts big">${points(b)}<small>${t('pts')}</small></div>
        </div>
        ${removed ? `<p class="notice">${t('ar.removedOn', { date: fmtDate(b.closesAt) })}</p>` : ''}
        <div class="stats">
          <div><b>${st.sends}</b><span>${t('m.repeats')}</span></div>
          <div><b>${st.likes}</b><span>${t('m.likes')}</span></div>
          <div><b>${st.comments}</b><span>${t('m.comments')}</span></div>
        </div>
        <div class="actions">${mainActions}
          <button class="btn icon-btn ${store.likes.has(b.id) ? 'liked' : ''}" data-action="toggle-like" data-id="${b.id}" aria-label="${t('m.like')}">${icon('heart')}</button>
          ${isSetter() || removed ? '' : projectBtn(b)}
          <button class="btn icon-btn" data-action="share" data-id="${b.id}" aria-label="${t('sh.share')}">${icon('share')}</button>
        </div>
        ${ui.votePromptId === b.id ? `<section class="card">${votePrompt(b)}</section>` : ''}

        <section class="card">
          <h3>${t('m.grade')}</h3>
          <div class="kv"><span>${t('m.setterGrade')}</span>${gradePill(b.color, b.subGrade)}</div>
          <div class="kv"><span>${t('m.consensus')}</span>${cons
            ? `<span>${gradePill(cons.color, cons.subGrade)} <small class="muted">${t('m.votes', { n: cons.count })}</small></span>`
            : `<span class="muted">${t('m.noVotes')}</span>`}</div>
          ${voteDistribution(b)}
          ${isSetter() || removed ? '' : send ? `<div class="vote-label">${t('m.yourVote')}</div>${voteBlock(b)}` : `<p class="muted small">${t('m.voteHint')}</p>`}
        </section>

        <section class="card">
          <h3>${t('m.info')}</h3>
          <div>${tagList(b.tags) || `<span class="muted">${t('m.noTags')}</span>`}</div>
          <div class="kv"><span>${t('m.opened')}</span><b>${fmtDate(b.openedAt)}</b></div>
          <div class="kv"><span>${t('m.closes')}</span><b>${b.closesAt ? fmtDate(b.closesAt) : '\u2014'}${closesIn !== null && closesIn >= 0 && closesIn <= 7 ? ` <span class="warn">${t('m.inDays', { n: closesIn })}</span>` : ''}</b></div>
          <p class="muted small">${d.loading ? '\u2026' : d.repeats.length
            ? t('m.sentBy', { names: d.repeats.slice(0, 8).map((s) => displayName(s.who && s.who.name, s.who && s.who.hide_from_ranking)).join(', ') + (st.sends > 8 ? '\u2026' : '') })
            : t('m.firstRepeat')}</p>
        </section>

        <section class="card">
          <h3>${t('m.setterBeta')}</h3>
          ${d.videos.filter(isSetterVideo).map(videoCard).join('') || `<p class="muted small">${d.loading ? '\u2026' : t('m.noVideos')}</p>`}
          <h3 class="sub-h">${t('m.community')}</h3>
          ${d.videos.filter((v) => !isSetterVideo(v)).map(videoCard).join('') || `<p class="muted small">${d.loading ? '\u2026' : t('m.noVideos')}</p>`}
          <form class="inline-form" data-submit="video" data-id="${b.id}">
            <input id="video-input" type="url" inputmode="url" placeholder="${t('v.placeholder')}">
            <button class="btn ghost" type="submit">${t('v.add')}</button>
          </form>
        </section>

        <section class="card">
          <h3>${t('m.beta')}</h3>
          ${d.comments.map((c) => `<div class="comment ${c.hidden ? 'is-hidden' : ''}"><span class="avatar sm">${esc((c.author ? c.author.name : '?')[0])}</span>
            <div class="grow"><b>${esc(c.author ? c.author.name : '?')}</b> <span class="muted small">${fmtDate(c.created_at)}</span>
              ${c.hidden ? `<span class="mini-tag">${t('mod.hidden')}</span>` : ''}<p>${esc(c.body)}</p></div>
            ${contentActions('comment', c, c.user_id === store.uid)}</div>`).join('')}
          <textarea id="comment-input" maxlength="500" placeholder="${t('m.placeholder')}"></textarea>
          <button class="btn primary block" data-action="post-comment" data-id="${b.id}">${t('m.post')}</button>
        </section>
      </div>
    </div></div>`;
  }

  // ---------- News (new boulders) ----------
  function newsModal() {
    const list = newBoulders().sort((a, b) => b.createdAt - a.createdAt);
    return `<div class="modal center-modal" data-action="close-news"><div class="dialog">
      <div class="dialog-head"><h3>${t('n.title')}</h3>
        <button class="link" data-action="close-news" aria-label="${t('m.close')}">\u2715</button></div>
      ${list.length ? `<div class="news-list">${list.map((b) => `<div class="row" data-action="open-news-boulder" data-id="${b.id}">${thumb(b, 48)}
          <div class="mid">${gradePill(b.color, b.subGrade)}<div class="muted small">${esc(sectorLabel(b))} · ${fmtDate(b.openedAt)}</div></div></div>`).join('')}</div>
        <button class="btn ghost block" data-action="news-seen">${t('n.markSeen')}</button>`
        : `<p class="muted small">${t('n.none')}</p>`}
    </div></div>`;
  }

  // ---------- Ranking ----------
  function rankingView() {
    ensureRanking().catch((e) => toast(errMsg(e), true));
    const rows = ui.ranking;
    const scopeOpts = [`<option value="current" ${ui.rankScope === 'current' ? 'selected' : ''}>${t('r.current')}</option>`]
      .concat(store.seasons.map((s) => `<option value="${s.id}" ${ui.rankScope === s.id ? 'selected' : ''}>${esc(s.name)}</option>`)).join('');
    const season = store.seasons.find((s) => s.id === ui.rankScope);
    return `<div class="rank-head">
        <select class="select-full" data-change="rank-scope" aria-label="${t('r.scope')}">${scopeOpts}</select>
        ${season ? `<p class="muted small">${t('r.seasonNote', { from: fmtDate(season.starts_on), to: fmtDate(season.ends_on) })}</p>` : ''}
      </div>
      ${!rows ? '<p class="empty">\u2026</p>' : !rows.length ? `<p class="empty">${t('r.empty')}</p>` : `
      <div class="list">${rows.map((d, i) => `<div class="row rank ${d.user_id === store.uid ? 'me' : ''}">
        <span class="pos">${i + 1}</span><span class="avatar">${esc(d.name[0])}</span>
        <div class="mid"><b>${esc(d.name)}</b><div class="small muted">${t('b.sends', { n: d.sends })}${d.flashes ? ` · <span class="flash-mark">${icon('flash')}</span>${d.flashes}` : ''}</div></div>
        <div class="pts">${d.points}<small>${t('pts')}</small></div>
      </div>`).join('')}</div>`}
      ${me().hide_from_ranking ? `<p class="hint">${t('r.youHidden')}</p>` : ''}
      ${isSetter() ? seasonsCard() : ''}`;
  }

  function seasonsCard() {
    return `<section class="card">
      <h3>${t('se.title')}</h3>
      ${store.seasons.map((s) => `<div class="kv"><span><b>${esc(s.name)}</b> <span class="muted small">${fmtDate(s.starts_on)} \u2013 ${fmtDate(s.ends_on)}</span></span>
        <button class="mini-btn" data-action="delete-season" data-id="${s.id}" aria-label="${t('mod.delete')}">${icon('trash')}</button></div>`).join('')
        || `<p class="muted small">${t('se.none')}</p>`}
      <form data-submit="season" class="season-form">
        <label class="field"><span>${t('se.name')}</span><input id="season-name" maxlength="40" placeholder="${t('se.namePh')}"></label>
        <div class="two">
          <label class="field"><span>${t('se.start')}</span><input id="season-start" type="date"></label>
          <label class="field"><span>${t('se.end')}</span><input id="season-end" type="date"></label>
        </div>
        <button class="btn ghost block" type="submit">${t('se.add')}</button>
      </form>
    </section>`;
  }

  // ---------- Profile ----------
  // Personal summary built from the user's whole history (boulders still on the walls or not).
  function mySummary() {
    const sends = [...store.sends.entries()].filter(([, s]) => s.boulder);
    const colors = Object.fromEntries(COLORS.map((c) => [c.id, 0]));
    const flashColors = { ...colors };
    sends.forEach(([, s]) => { colors[s.boulder.color]++; if (s.flash) flashColors[s.boulder.color]++; });
    const byPhoto = {};
    activeBoulders().forEach((b) => { (byPhoto[b.photoId] = byPhoto[b.photoId] || []).push(b); });
    const wallCleared = Object.values(byPhoto).some((list) => list.length >= 3 && list.every((b) => store.sends.has(b.id)));
    const active = sends.filter(([id]) => { const b = boulderById(id); return b && isActive(b); });
    const season = currentSeason();
    const inSeason = season ? sends.filter(([, s]) => isoDate(s.createdAt) >= season.starts_on && isoDate(s.createdAt) <= season.ends_on) : [];
    const sum = (list) => list.reduce((a, [, s]) => a + sendPointsFor(s.boulder.color, s.boulder.subGrade, s.flash), 0);
    return {
      total: sends.length, flashes: sends.filter(([, s]) => s.flash).length, colors, flashColors, wallCleared,
      comments: store.commentCount, votes: store.votes.size, sends,
      currentPoints: sum(active), currentCount: active.length, season, seasonPoints: sum(inSeason),
      perColorActive: COLORS.map((c) => active.filter(([, s]) => s.boulder.color === c.id).length),
    };
  }

  function progressionChart(sum) {
    const months = [];
    const d = new Date();
    for (let i = 5; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      months.push({ key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`, label: m.toLocaleDateString(localeOf(), { month: 'short' }), counts: COLORS.map(() => 0) });
    }
    sum.sends.forEach(([, s]) => {
      const m = months.find((x) => x.key === isoDate(s.createdAt).slice(0, 7));
      if (m) m.counts[colorIdx(s.boulder.color)]++;
    });
    const max = Math.max(1, ...months.map((m) => m.counts.reduce((a, c) => a + c, 0)));
    const bw = 300 / months.length;
    const bars = months.map((m, i) => {
      let y = 110;
      const rects = m.counts.map((c, ci) => {
        if (!c) return '';
        const h = (c / max) * 95;
        y -= h;
        return `<rect x="${i * bw + 10}" y="${y.toFixed(1)}" width="${bw - 20}" height="${h.toFixed(1)}" rx="3" fill="${COLORS[ci].hex}" class="bar"/>`;
      }).join('');
      const total = m.counts.reduce((a, c) => a + c, 0);
      return `${rects}${total ? `<text x="${i * bw + bw / 2}" y="${y - 4}" class="bar-n">${total}</text>` : ''}
        <text x="${i * bw + bw / 2}" y="126" class="bar-l">${esc(m.label)}</text>`;
    }).join('');
    const hardest = sum.sends.map(([, s]) => s.boulder)
      .sort((a, b) => colorIdx(b.color) * 5 + b.subGrade - (colorIdx(a.color) * 5 + a.subGrade))[0];
    return `<section class="card">
      <h3>${t('pg.title')}</h3>
      <svg class="chart" viewBox="0 0 300 132" role="img" aria-label="${t('pg.title')}">
        <line x1="0" y1="110.5" x2="300" y2="110.5" class="axis"/>${bars}</svg>
      <div class="kv"><span>${t('pg.hardest')}</span>${hardest ? gradePill(hardest.color, hardest.subGrade) : '\u2014'}</div>
      <div class="kv"><span>${t('pg.total')}</span><b>${sum.total} \u00b7 ${t('p.flashes')} ${sum.flashes}</b></div>
    </section>`;
  }

  const badgeText = (b, part) => b.key
    ? t(`bd.${b.key}.${part}`, { color: colorLabel(b.colorId), colorLc: colorLabel(b.colorId).toLowerCase() })
    : t(`bd.${b.id}.${part}`);

  function badgesCard(sum) {
    const earned = BADGES.filter((b) => b.test(sum)).length;
    const medal = (b) => `<span class="medal" ${b.color ? `style="--medal:${b.color};color:${b.ink || '#fff'}"` : ''}>${b.mark}</span>`;
    const open = BADGES.find((b) => b.id === ui.badgeId);
    return `<section class="card">
      <h3>${t('bd.title')} <span class="muted small">${earned}/${BADGES.length}</span></h3>
      ${open ? `<div class="badge-detail ${open.test(sum) ? 'on' : ''}">${medal(open)}<div><b>${badgeText(open, 't')}</b>
        <div class="muted small">${badgeText(open, 'd')}</div><div class="small">${t(open.test(sum) ? 'bd.earned' : 'bd.locked')}</div></div></div>` : ''}
      <div class="badges">${BADGES.map((b) => `<button class="badge-item ${b.test(sum) ? 'on' : ''} ${b.id === ui.badgeId ? 'sel' : ''}"
          data-action="badge-info" data-id="${b.id}">${medal(b)}<b>${badgeText(b, 't')}</b></button>`).join('')}</div>
    </section>`;
  }

  // Profile color bars: tap one to see sends per sub-grade among boulders on the walls.
  function colorStats(perColor) {
    const max = Math.max(1, ...perColor);
    const sel = ui.profileColor;
    const bars = COLORS.map((c, i) => `<button class="cbar ${sel === c.id ? 'on' : ''} ${sel && sel !== c.id ? 'faded' : ''}"
        data-action="profile-color" data-id="${c.id}" aria-label="${colorLabel(c.id)}: ${perColor[i]}">
        <span>${perColor[i]}</span><i style="height:${4 + (perColor[i] / max) * 56}px;background:${c.hex}"></i></button>`).join('');
    if (!sel) return `<div class="cbars">${bars}</div>`;
    const onWalls = activeBoulders().filter((b) => b.color === sel);
    const rows = [1, 2, 3, 4, 5].map((n) => {
      const all = onWalls.filter((b) => b.subGrade === n);
      const done = all.filter((b) => mySend(b)).length;
      return subRow(sel, n, done, all.length, `${done}/${all.length}`);
    }).join('');
    return `<div class="cbars">${bars}</div>
      <div class="breakdown"><div class="bd-head"><span class="grade" style="--c:${colorOf(sel).hex}"><i class="sw"></i>${colorLabel(sel)}</span>
        <span class="muted small">${t('p.doneOnWalls')}</span></div>${rows}</div>`;
  }

  function settingsCard() {
    const themeOpt = (v, key) => `<option value="${v}" ${themePref() === v ? 'selected' : ''}>${t(key)}</option>`;
    return `<section class="card">
      <h3>${t('p.settings')}</h3>
      <label class="field"><span>${t('p.language')}</span>${langSelect()}</label>
      <label class="field"><span>${t('p.theme')}</span><select data-change="theme">
        ${themeOpt('system', 'p.themeSystem')}${themeOpt('dark', 'p.themeDark')}${themeOpt('light', 'p.themeLight')}</select></label>
      <button class="btn ghost block" data-action="logout">${t('p.logout')}</button>
    </section>
    <section class="card">
      <h3>${t('pv.title')}</h3>
      <label class="switch-row"><span><b>${t('pv.hide')}</b><small class="muted">${t('pv.hideText')}</small></span>
        <input type="checkbox" data-change="hide-ranking" ${me().hide_from_ranking ? 'checked' : ''}></label>
      <button class="btn ghost block" data-action="export-data">${t('pv.export')}</button>
      <button class="btn ghost block danger" data-action="delete-account">${t('pv.delete')}</button>
      <p class="muted small"><a href="privacy.html" target="_blank" rel="noopener">${t('l.privacy')}</a></p>
    </section>${feedbackLink()}`;
  }

  function profileView() {
    const u = me();
    const head = `<span class="avatar xl">${esc(u.name[0])}</span><h2>${esc(u.name)}</h2>`;
    if (isSetter()) {
      const mine = store.boulders.filter((b) => b.setterId === u.id && isActive(b));
      return `<section class="profile-hero">${head}<span class="badge-setter">${t(isOwner() ? 'p.owner' : isAdmin() ? 'p.admin' : 'p.setter')}</span>
          <div class="stats"><div><b>${mine.length}</b><span>${t('p.onWalls')}</span></div>
          <div><b>${mine.reduce((s, b) => s + statsOf(b).sends, 0)}</b><span>${t('p.totalSends')}</span></div></div></section>
        ${isAdmin() ? membersCard() : ''}
        <div class="list-head">${t('p.myBoulders')}</div>
        <div class="list">${mine.map((b) => boulderRow(b)).join('')}</div>${settingsCard()}`;
    }
    ensureRanking().catch(() => {});
    const sum = mySummary();
    const rankRows = ui.rankingKey === 'current' && ui.ranking;
    const rankIdx = rankRows ? rankRows.findIndex((r) => r.user_id === u.id) : -1;
    const projects = activeBoulders().filter((b) => store.projects.has(b.id));
    const current = activeBoulders().filter((b) => mySend(b)).sort((a, b) => mySend(b).createdAt - mySend(a).createdAt);
    return `<section class="profile-hero">${head}
        <div class="stats">
          <div><b>${rankIdx >= 0 ? '#' + (rankIdx + 1) : '\u2014'}</b><span>${t('p.rank')}</span></div>
          <div><b>${sum.currentPoints}</b><span>${t('p.points')}</span></div>
          ${sum.season ? `<div><b>${sum.seasonPoints}</b><span>${esc(sum.season.name)}</span></div>` : ''}
          <div><b>${sum.currentCount}</b><span>${t('p.sends')}</span></div></div>
        <div class="color-stats">${colorStats(sum.perColorActive)}</div></section>
      ${progressionChart(sum)}
      ${badgesCard(sum)}
      <div class="list-head">${t('pr.title')} (${projects.length})</div>
      <div class="list">${projects.map((b) => boulderRow(b)).join('') || `<p class="empty">${t('pr.empty')}</p>`}</div>
      <div class="list-head">${t('p.mySends')}</div>
      <div class="list">${current.map((b) => boulderRow(b)).join('') || `<p class="empty">${t('p.noSends')}</p>`}</div>
      ${settingsCard()}`;
  }

  // ---------- Administration ----------
  function membersCard() {
    if (!ui.admin) {
      ui.admin = { users: null, q: '' };
      Api.adminUsers().then((users) => { ui.admin.users = users; render(); }).catch((e) => toast(errMsg(e), true));
    }
    const q = ui.admin.q.toLowerCase();
    const users = (ui.admin.users || []).filter((u) => !q || u.name.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
    // Admins manage setters only; the owner also grants admin. The owner role itself is never editable here.
    const choices = isOwner() ? ['climber', 'setter', 'admin'] : ['climber', 'setter'];
    const editable = (u) => u.id !== store.uid && choices.includes(u.role);
    const roleOpts = (u) => (editable(u) ? choices : [u.role]).map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${t('role.' + r)}</option>`).join('');
    return `<section class="card">
      <h3>${t('ad.title')}</h3>
      <p class="muted small">${t('ad.text')}</p>
      <a class="btn ghost block" href="map-editor.html" target="_blank" rel="noopener">${t('ad.mapEditor')}</a>
      <input class="search" type="search" data-input="admin-q" value="${esc(ui.admin.q)}" placeholder="${t('ad.search')}">
      ${!ui.admin.users ? '<p class="muted small">\u2026</p>' : users.slice(0, 50).map((u) => `<div class="member">
        <span class="avatar sm">${esc(u.name[0])}</span>
        <div class="grow"><b>${esc(u.name)}</b><div class="muted small">${esc(u.email)}</div></div>
        <select data-change="set-role" data-id="${u.id}" ${editable(u) ? '' : 'disabled'}>${roleOpts(u)}</select>
      </div>`).join('') || `<p class="muted small">${t('ad.none')}</p>`}
    </section>`;
  }

  // ---------- Feedback ----------
  const feedbackLink = () => `<button class="feedback-link" data-action="open-feedback">${icon('chat')} ${t('g.link')}</button>`;

  function feedbackModal() {
    const f = ui.feedback;
    const type = (id) => `<button class="chip ${f.type === id ? 'on' : ''}" data-action="fb-type" data-id="${id}">${t('g.' + id)}</button>`;
    const body = f.sent
      ? `<p class="thanks">${icon('check')} ${t('g.thanks')}</p>
         <button class="btn primary block" data-action="close-feedback">${t('m.close')}</button>`
      : `<p class="muted small">${t('g.text')}</p>
         <div>${type('idea')}${type('bug')}${type('other')}</div>
         <textarea id="feedback-input" maxlength="1000" placeholder="${t('g.placeholder')}"></textarea>
         ${f.error ? `<p class="notice">${t(f.error)}</p>` : ''}
         <button class="btn primary block" data-action="send-feedback">${t('g.send')}</button>`;
    return `<div class="modal center-modal" data-action="close-feedback"><div class="dialog">
      <div class="dialog-head"><h3>${t('g.title')}</h3>
        <button class="link" data-action="close-feedback" aria-label="${t('m.close')}">\u2715</button></div>
      ${body}</div></div>`;
  }

  // ---------- Setter area: set, planning, stats, inbox ----------
  function setterArea() {
    const seg = (id) => `<button class="${ui.setTab === id ? 'on' : ''}" data-action="set-tab" data-id="${id}">${t('st.' + id)}</button>`;
    const views = { set: setterView, plan: planningView, stats: statsView, inbox: inboxView };
    return `<div class="seg wide">${seg('set')}${seg('plan')}${seg('stats')}${seg('inbox')}</div>${views[ui.setTab]()}`;
  }

  function feedbackCard() {
    const list = activeBoulders().map((b) => ({ b, cons: consensus(b) }))
      .filter(({ b, cons }) => cons && cons.count >= 3 && Math.abs(cons.avg - b.subGrade) >= 0.75);
    return `<section class="card">
      <h3>${t('fb.title')}</h3>
      <p class="muted small">${t('fb.text')}</p>
      ${list.map(({ b, cons }) => `<div class="row plain">${thumb(b, 48)}
        <div class="mid"><div class="small">${gradePill(b.color, b.subGrade)} <span class="muted">\u2192</span> ${gradePill(cons.color, cons.subGrade)}</div>
          <div class="muted small">${esc(sectorLabel(b))} · ${t('m.votes', { n: cons.count })}</div></div>
        <button class="btn small" data-action="apply-consensus" data-id="${b.id}">${t('fb.apply')}</button></div>`).join('')
        || `<p class="muted small">${t('fb.none')}</p>`}
    </section>`;
  }

  function setterView() {
    if (!ui.editor) ui.editor = newEditor(ui.sectorId && !sectorOf(ui.sectorId).noSet ? ui.sectorId : SET_SECTORS[0].id);
    const ed = ui.editor;
    const photo = editorPhoto();
    const parts = sectorParts(ed.sectorId);
    const onWall = photo ? store.boulders.filter((b) => b.photoId === photo.id && isActive(b)) : [];
    const editing = ed.editingId && boulderById(ed.editingId);
    const seg = (action, value, current, label) =>
      `<button class="${value === current ? 'on' : ''}" data-action="${action}" data-id="${value}">${label}</button>`;
    const starts = ed.holds.filter((h) => h.type === 'start').length;
    const tops = ed.holds.filter((h) => h.type === 'top').length;
    const reset = nextReset(ed.sectorId, ed.part);
    const uploadButtons = `<div class="two upload-row">
          <label class="btn ghost">${t('s.camera')}
            <input type="file" accept="image/*" capture="environment" data-change="ed-photo" hidden></label>
          <label class="btn ghost">${t('s.gallery')}
            <input type="file" accept="image/*" data-change="ed-photo" hidden></label></div>`;
    const partTabs = `<div class="seg parts">${parts.map((p, i) =>
      `<button class="${ed.part === p.part ? 'on' : ''}" data-action="ed-part" data-id="${p.part}" ${editing ? 'disabled' : ''}>${i + 1}/${parts.length}</button>`).join('')}
      ${editing ? '' : `<button class="${ed.part === 'new' ? 'on' : ''}" data-action="ed-part" data-id="new">${t('s.addPart')}</button>`}</div>`;
    const uploadSection = editing ? '' : ed.part === 'new'
      ? `<p class="muted small">${t('s.newPartHint', { i: parts.length + 1 })}</p>${uploadButtons}`
      : `${uploadButtons}<p class="muted small">${t('s.uploadNote')}</p>
        <button class="btn ghost block danger small" data-action="remove-part">${t('s.removePart')}</button>`;
    const onSector = activeBoulders().filter((b) => b.sectorId === ed.sectorId).length;
    const resetButton = !editing && onSector
      ? `<button class="btn ghost block danger small" data-action="reset-wall">${t('s.resetWall', { n: onSector })}</button>` : '';

    return `
      <section class="card">
        ${editing ? `<div class="editing-banner">${t('s.editing')} ${gradePill(editing.color, editing.subGrade)}<button class="link" data-action="cancel-edit">${t('s.cancel')}</button></div>` : `<h3>${t('s.new')}</h3>`}
        <label class="field"><span>${t('s.wall')}</span><select data-change="ed-sector" ${editing ? 'disabled' : ''}>${SET_SECTORS.map((s) =>
          `<option value="${s.id}" ${s.id === ed.sectorId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <div class="field"><span>${t('s.parts')}</span>${partTabs}</div>
        ${uploadSection}
        ${resetButton}
      </section>

      ${photo ? `
      <section class="card tools">
        <div class="tool-row"><span class="label">${t('s.holdType')}</span><div class="seg">
          ${seg('ed-holdtype', 'start', ed.holdType, `<i class="lg-start">${t('hold.startSymbol')}</i>${t('hold.start')}`)}${seg('ed-holdtype', 'hold', ed.holdType, t('hold.hold'))}${seg('ed-holdtype', 'top', ed.holdType, `<i class="lg-top">${t('hold.topSymbol')}</i>${t('hold.top')}`)}</div></div>
        <div class="tool-row"><span class="label">${t('s.outline')}</span><div class="seg">
          ${seg('ed-mode', 'auto', ed.mode, t('s.auto'))}${seg('ed-mode', 'circle', ed.mode, t('s.circle'))}</div></div>
        ${ed.mode === 'circle'
          ? `<label class="tool-row"><span class="label">${t('s.circleSize')}</span><input type="range" min="0.015" max="0.1" step="0.005" value="${ed.circleR}" data-change="ed-circle"></label>`
          : ui.edAdvanced
            ? `<label class="tool-row"><span class="label">${t('s.sensitivity')}</span><input type="range" min="10" max="60" step="2" value="${ed.tolerance}" data-change="ed-tol"></label>`
            : ''}
        ${ed.mode === 'auto' ? `<button class="link small adv-toggle" data-action="ed-advanced">${t(ui.edAdvanced ? 's.hideAdvanced' : 's.advanced')}</button>` : ''}
      </section>
      <div class="zoom-bar"><span class="muted small grow">${t('s.pinchHint')}</span>
        <button data-action="ed-undo" ${ed.holds.length ? '' : 'disabled'}>${t('s.undo')}</button>
        <button data-action="ed-clear" ${ed.holds.length ? '' : 'disabled'}>${t('s.clear')}</button></div>
      <div class="zoombox ${ed.busy ? 'busy' : ''}"><div style="width:${ed.zoom * 100}%">
        ${wall(photo, onWall.filter((b) => b.id !== ed.editingId), { editor: true, draft: { holds: ed.holds, color: ed.color } })}</div></div>
      <p class="hint">${ed.busy ? t('s.detecting') : t('s.tapHint')}</p>
      ${ed.notice ? `<p class="notice">${t(ed.notice)}</p>` : ''}`
      : `<section class="card empty">${t('s.noPhoto')}</section>`}

      <section class="card">
        <h3>${t('s.details')}</h3>
        <div class="field"><span>${t('s.color')}</span>${colorDots('ed-color', ed.color)}</div>
        <div class="field"><span>${t('s.sub')}</span>${subButtons('ed-sub', ed.subGrade)}</div>
        <div class="field"><span>${t('s.style')}</span><div>${STYLE_TAGS.map((tag) =>
          `<button class="chip ${ed.tags.includes(tag) ? 'on' : ''}" data-action="ed-tag" data-id="${esc(tag)}">${esc(tagLabel(tag))}</button>`).join('')}</div></div>
        <div class="two">
          <label class="field"><span>${t('s.opening')}</span><input type="date" value="${ed.openedAt}" data-change="ed-opened"></label>
          <label class="field"><span>${t('s.end')}</span><input type="date" value="${ed.closesAt}" data-change="ed-closes"></label>
        </div>
        ${reset ? `<button class="chip ${ed.closesAt === reset.planned_on ? 'on' : ''}" data-action="ed-until-reset" data-id="${reset.planned_on}">${t('s.untilReset', { date: fmtDate(reset.planned_on) })}</button>` : ''}
        <div class="kv"><span>${t('s.holds')}</span><b>${t('s.holdsSummary', { n: ed.holds.length, s: starts, t: tops })}</b></div>
        <div class="kv"><span>${t('s.pointsPerSend')}</span><b>${pointsFor(ed.color, ed.subGrade)}</b></div>
        ${ed.error ? `<p class="notice">${t(ed.error)}</p>` : ''}
        <button class="btn primary block" data-action="save-boulder" ${photo && !ui.saving ? '' : 'disabled'}>${t(editing ? 's.save' : 's.publish')}</button>
        ${editing ? `<button class="btn ghost block danger" data-action="delete-boulder" data-id="${editing.id}">${t('s.deleteBoulder')}</button>` : ''}
      </section>

      ${feedbackCard()}

      <section class="card">
        <h3>${t('s.onWall', { n: onWall.length })}</h3>
        ${onWall.map((b) => `<div class="row plain">${thumb(b, 48)}<div class="mid">${gradePill(b.color, b.subGrade)}<div>${tagList(b.tags)}</div>
          <div class="row-actions">
            <button class="btn small" data-action="edit-boulder" data-id="${b.id}">${t('s.edit')}</button>
            <button class="btn small ghost" data-action="archive-boulder" data-id="${b.id}">${t('s.archive')}</button>
            <button class="btn small ghost danger" data-action="delete-boulder" data-id="${b.id}">${t('s.delete')}</button></div></div></div>`).join('') || `<p class="muted small">${t('s.noBoulders')}</p>`}
      </section>`;
  }

  function planningView() {
    if (!ui.planForm) ui.planForm = { id: null, sectorId: SET_SECTORS[0].id, part: '', date: isoDate(Date.now() + 7 * DAY), setterId: store.uid, notes: '' };
    const f = ui.planForm;
    const upcoming = store.plans.filter((p) => !p.done).sort((a, b) => a.planned_on.localeCompare(b.planned_on));
    const done = store.plans.filter((p) => p.done).sort((a, b) => b.planned_on.localeCompare(a.planned_on)).slice(0, 10);
    const item = (p) => {
      const late = !p.done && p.planned_on < today();
      return `<div class="plan-item ${p.done ? 'done' : ''}">
        <div class="plan-date ${late ? 'late' : ''}"><b>${new Date(p.planned_on).getDate()}</b><span>${new Date(p.planned_on).toLocaleDateString(localeOf(), { month: 'short' })}</span></div>
        <div class="grow"><b>${esc(sectorOf(p.sector_id).name)}${p.part ? ` \u00b7 ${t('pl.part', { n: p.part })}` : ''}</b>
          <div class="muted small">${p.setter ? esc(p.setter.name) : t('pl.noSetter')}${late ? ` \u00b7 <span class="warn">${t('pl.late')}</span>` : ''}</div>
          ${p.notes ? `<div class="small">${esc(p.notes)}</div>` : ''}</div>
        <div class="plan-actions">
          <button class="mini-btn" data-action="plan-done" data-id="${p.id}" title="${t(p.done ? 'pl.undone' : 'pl.done')}" aria-label="${t(p.done ? 'pl.undone' : 'pl.done')}">${icon('check')}</button>
          <button class="mini-btn" data-action="plan-edit" data-id="${p.id}" title="${t('s.edit')}" aria-label="${t('s.edit')}">${icon('set')}</button>
          <button class="mini-btn" data-action="plan-delete" data-id="${p.id}" title="${t('mod.delete')}" aria-label="${t('mod.delete')}">${icon('trash')}</button>
        </div></div>`;
    };
    return `<section class="card">
        <h3>${t(f.id ? 'pl.editTitle' : 'pl.addTitle')}</h3>
        <form data-submit="plan">
          <div class="two">
            <label class="field"><span>${t('s.wall')}</span><select id="plan-sector">${SET_SECTORS.map((s) =>
              `<option value="${s.id}" ${s.id === f.sectorId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
            <label class="field"><span>${t('pl.partLabel')}</span><input id="plan-part" type="number" min="1" max="20" value="${esc(f.part)}" placeholder="${t('pl.allParts')}"></label>
          </div>
          <div class="two">
            <label class="field"><span>${t('pl.date')}</span><input id="plan-date" type="date" value="${f.date}"></label>
            <label class="field"><span>${t('pl.setter')}</span><select id="plan-setter"><option value="">${t('pl.noSetter')}</option>${store.staff.map((s) =>
              `<option value="${s.id}" ${s.id === f.setterId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
          </div>
          <label class="field"><span>${t('pl.notes')}</span><input id="plan-notes" maxlength="300" value="${esc(f.notes)}" placeholder="${t('pl.notesPh')}"></label>
          <button class="btn primary block" type="submit">${t(f.id ? 's.save' : 'pl.add')}</button>
          ${f.id ? `<button class="btn ghost block" type="button" data-action="plan-cancel">${t('s.cancel')}</button>` : ''}
        </form>
      </section>
      <div class="list-head">${t('pl.upcoming')}</div>
      <div class="card plan-list">${upcoming.map(item).join('') || `<p class="muted small">${t('pl.none')}</p>`}</div>
      ${done.length ? `<div class="list-head">${t('pl.history')}</div><div class="card plan-list">${done.map(item).join('')}</div>` : ''}`;
  }

  function statsView() {
    const list = activeBoulders();
    const sectorFilter = ui.statsSector || '';
    const scoped = sectorFilter ? list.filter((b) => b.sectorId === sectorFilter) : list;
    const grid = COLORS.map((c) => [1, 2, 3, 4, 5].map((n) => scoped.filter((b) => b.color === c.id && b.subGrade === n).length));
    const maxCell = Math.max(1, ...grid.flat());
    const top = (fn) => [...list].sort((a, b) => fn(b) - fn(a)).filter((b) => fn(b) > 0).slice(0, 5);
    const neverSent = list.filter((b) => statsOf(b).sends === 0 && daysUntil(b.openedAt) <= -7);
    const bySetter = {};
    list.forEach((b) => {
      const k = b.setterName || '?';
      bySetter[k] = bySetter[k] || { n: 0, sends: 0, likes: 0 };
      bySetter[k].n++; bySetter[k].sends += statsOf(b).sends; bySetter[k].likes += statsOf(b).likes;
    });
    const mini = (b, value) => `<div class="row plain" data-action="open-boulder" data-id="${b.id}">${thumb(b, 40)}
      <div class="mid">${gradePill(b.color, b.subGrade)}<div class="muted small">${esc(sectorLabel(b))}</div></div><b>${value}</b></div>`;
    const totalSends = list.reduce((a, b) => a + statsOf(b).sends, 0);
    return `<section class="card">
        <div class="stats">
          <div><b>${list.length}</b><span>${t('sx.active')}</span></div>
          <div><b>${totalSends}</b><span>${t('sx.sends')}</span></div>
          <div><b>${list.filter(isNew).length}</b><span>${t('sx.new')}</span></div>
        </div>
      </section>
      <section class="card">
        <h3>${t('sx.distribution')}</h3>
        <select class="select-full" data-change="stats-sector"><option value="">${t('b.wholeGym')}</option>${SET_SECTORS.map((s) =>
          `<option value="${s.id}" ${s.id === sectorFilter ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        <table class="points-table heat"><tr><th></th>${[1, 2, 3, 4, 5].map((n) => `<th>${n}</th>`).join('')}<th>\u03a3</th></tr>
          ${COLORS.map((c, ci) => `<tr><td><i class="sw" style="background:${c.hex}"></i>${colorLabel(c.id)}</td>
            ${grid[ci].map((v) => `<td><span class="cell" style="--a:${v / maxCell};--c:${c.hex}">${v || ''}</span></td>`).join('')}
            <td><b>${grid[ci].reduce((a, v) => a + v, 0)}</b></td></tr>`).join('')}
        </table>
        <p class="muted small">${t('sx.distHint')}</p>
      </section>
      <section class="card"><h3>${t('sx.mostSent')}</h3>${top((b) => statsOf(b).sends).map((b) => mini(b, statsOf(b).sends)).join('') || `<p class="muted small">\u2014</p>`}</section>
      <section class="card"><h3>${t('sx.mostLiked')}</h3>${top((b) => statsOf(b).likes).map((b) => mini(b, statsOf(b).likes + ' \u2665')).join('') || `<p class="muted small">\u2014</p>`}</section>
      <section class="card"><h3>${t('sx.neverSent')}</h3><p class="muted small">${t('sx.neverSentHint')}</p>${neverSent.map((b) => mini(b, fmtDate(b.openedAt))).join('') || `<p class="muted small">\u2014</p>`}</section>
      <section class="card"><h3>${t('sx.bySetter')}</h3>
        ${Object.entries(bySetter).sort((a, b) => b[1].n - a[1].n).map(([name, v]) => `<div class="kv"><span>${esc(name)}</span>
          <b>${t('sx.setterLine', { n: v.n, sends: v.sends, likes: v.likes })}</b></div>`).join('') || `<p class="muted small">\u2014</p>`}
      </section>`;
  }

  function inboxView() {
    if (!ui.inbox) {
      ui.inbox = { reports: null, feedback: null };
      Promise.all([Api.openReports(), Api.feedback()])
        .then(([reports, feedback]) => { ui.inbox = { reports, feedback }; render(); })
        .catch((e) => toast(errMsg(e), true));
    }
    const { reports, feedback } = ui.inbox;
    return `<section class="card">
        <h3>${t('mod.reports')} ${reports ? `(${reports.length})` : ''}</h3>
        ${!reports ? '<p class="muted small">\u2026</p>' : reports.map((r) => `<div class="report">
          <div class="muted small">${t('mod.type.' + r.target_type)} · ${fmtDate(r.created_at)}${r.reason ? ` · \u201c${esc(r.reason)}\u201d` : ''}</div>
          ${r.target ? `<p><b>${esc(r.target.author ? r.target.author.name : '?')}</b>: ${esc(r.target.body || r.target.url)}</p>` : `<p class="muted">${t('mod.gone')}</p>`}
          <div class="row-actions">
            ${r.target && !r.target.hidden ? `<button class="btn small" data-action="report-hide" data-id="${r.id}">${t('mod.hide')}</button>` : ''}
            ${r.target ? `<button class="btn small ghost danger" data-action="report-delete" data-id="${r.id}">${t('mod.delete')}</button>` : ''}
            <button class="btn small ghost" data-action="report-dismiss" data-id="${r.id}">${t('mod.dismiss')}</button>
          </div></div>`).join('') || `<p class="muted small">${t('mod.none')}</p>`}
      </section>
      <section class="card">
        <h3>${t('g.inbox')} ${feedback ? `(${feedback.length})` : ''}</h3>
        ${!feedback ? '<p class="muted small">\u2026</p>' : feedback.map((f) => `<div class="comment"><span class="avatar sm">${esc((f.author ? f.author.name : '?')[0])}</span>
          <div><b>${esc(f.author ? f.author.name : '?')}</b> <span class="mini-tag">${t('g.' + f.type)}</span>
            <span class="muted small">${fmtDate(f.created_at)}</span><p>${esc(f.body)}</p></div></div>`).join('') || `<p class="muted small">${t('g.empty')}</p>`}
      </section>`;
  }

  // ---------- Photo cropper ----------
  function cropperView() {
    const c = ui.cropper;
    const r = c.rect;
    return `<div class="cropper">
      <div class="crop-head"><b>${t('s.cropTitle')}</b><span class="muted small">${t('s.cropHint')}</span></div>
      <div class="crop-stage"><div class="crop-frame" style="aspect-ratio:${c.w}/${c.h};width:min(100%, calc(66vh * ${(c.w / c.h).toFixed(4)}))">
        <img src="${esc(c.src)}" alt="" draggable="false">
        <div class="crop-rect" data-crop="move" style="left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%">
          ${['nw', 'ne', 'sw', 'se'].map((hd) => `<i class="crop-handle ${hd}" data-crop="${hd}"></i>`).join('')}
        </div></div></div>
      <div class="crop-bar">
        <button class="btn ghost" data-action="crop-cancel">${t('s.cancel')}</button>
        <button class="btn ghost" data-action="crop-reset">${t('s.cropReset')}</button>
        <button class="btn primary" data-action="crop-apply" ${ui.saving ? 'disabled' : ''}>${ui.saving ? '\u2026' : t('s.cropApply')}</button>
      </div>
    </div>`;
  }

  // ---------- Render ----------
  function setupView() {
    return `<div class="login"><div class="login-hero">${brand()}</div>
      <div class="card"><h3>${t('setup.title')}</h3><p class="muted small">${t('setup.text')}</p></div></div>`;
  }

  function render() {
    const root = document.getElementById('app');
    const toastHtml = ui.toast ? `<div class="toast ${ui.toast.isError ? 'error' : ''}" role="status">${esc(ui.toast.message)}</div>` : '';
    if (ui.view !== 'app') {
      const views = { loading: () => '<div class="loading"><span class="logo"></span></div>', auth: authView, setup: setupView };
      root.innerHTML = views[ui.view]() + toastHtml;
      document.body.classList.remove('modal-open');
      return;
    }
    if (!me().onboarded) {
      root.innerHTML = onboardingView() + toastHtml;
      return;
    }
    const views = { boulders: bouldersView, ranking: rankingView, profile: profileView, set: setterArea };
    const oldSheet = document.querySelector('.sheet');
    const sheetScroll = oldSheet && ui.lastModalId === ui.boulderId ? oldSheet.scrollTop : 0;
    const oldZoom = document.querySelector('.zoombox');
    const zoomScroll = oldZoom ? [oldZoom.scrollLeft, oldZoom.scrollTop] : null;
    const focused = document.activeElement && document.activeElement.dataset.input ? document.activeElement.dataset.input : null;
    root.innerHTML = header() + `<main>${(views[ui.tab] || bouldersView)()}</main>` + tabs()
      + (ui.boulderId ? boulderModal() : ui.quickId ? quickSheet() : '')
      + (ui.news ? newsModal() : '')
      + (ui.feedback ? feedbackModal() : '')
      + (ui.cropper ? cropperView() : '')
      + toastHtml;
    const sheet = document.querySelector('.sheet');
    if (sheet) sheet.scrollTop = sheetScroll;
    const zoom = document.querySelector('.zoombox');
    if (zoom && zoomScroll) [zoom.scrollLeft, zoom.scrollTop] = zoomScroll;
    if (focused) {
      const el = document.querySelector(`[data-input="${focused}"]`);
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }
    document.body.classList.toggle('modal-open', !!ui.boulderId || !!ui.cropper || !!ui.feedback || !!ui.news);
    ui.lastModalId = ui.boulderId;
    ui.lastQuickId = ui.quickId;
  }

  // ---------- Actions ----------
  function placeHold(e, el) {
    const ed = ui.editor;
    const photo = editorPhoto();
    if (!photo || ed.busy || Date.now() - pinchEndedAt < 400) return false;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const type = ed.holdType;
    const circle = { type, c: [+x.toFixed(4), +y.toFixed(4), ed.circleR] };
    ed.error = '';
    if (ed.mode === 'circle') {
      ed.holds.push(circle);
      ed.notice = '';
      return;
    }
    ed.busy = true;
    HoldDetector.detect(photo, x, y, ed.tolerance)
      .then((pts) => {
        if (pts && pts.length >= 3) { ed.holds.push({ type, pts }); ed.notice = ''; }
        else { ed.holds.push(circle); ed.notice = 's.notDetected'; }
      })
      .catch(() => { ed.holds.push(circle); ed.notice = 's.noDetector'; })
      .finally(() => { ed.busy = false; render(); });
  }

  async function toggleSend(id, flash) {
    const send = store.sends.get(id);
    const b = boulderById(id);
    if (send && (flash === undefined || send.flash === flash)) {
      await Api.removeSend(store.uid, id);
      store.sends.delete(id);
      store.votes.delete(id);
      if (ui.votePromptId === id) ui.votePromptId = null;
    } else {
      const f = flash === undefined ? false : flash;
      await Api.setSend(store.uid, id, f);
      store.sends.set(id, {
        flash: f, createdAt: send ? send.createdAt : Date.now(),
        boulder: { color: b.color, subGrade: b.subGrade, sectorId: b.sectorId, photoId: b.photoId, openedAt: b.openedAt, closesAt: b.closesAt },
      });
      if (!send) ui.votePromptId = id;
      store.projects.delete(id);
      Api.setProject(store.uid, id, false).catch(() => {});
    }
    ui.rankingKey = null;
    await refreshStats([id]);
  }

  async function shareBoulder(id) {
    const b = boulderById(id);
    const url = `${location.origin}${location.pathname}?b=${id}`;
    const text = `${colorLabel(b.color)} ${b.subGrade} \u00b7 ${sectorLabel(b)} \u00b7 ELYS Boulderloft`;
    if (navigator.share) {
      try { await navigator.share({ title: 'ELYS Boulderloft', text, url }); } catch (e) { /* share sheet dismissed */ }
      return false;
    }
    await navigator.clipboard.writeText(url);
    toast(t('sh.copied'));
    return false;
  }

  const findContent = (type, id) => {
    const d = ui.detail;
    return d && (type === 'video' ? d.videos : d.comments).find((x) => x.id === id);
  };

  const actions = {
    'tab': (id) => {
      ui.tab = id; ui.boulderId = null; ui.quickId = null; ui.votePromptId = null; ui.archive = null;
      if (id === 'ranking') ui.rankingKey = null;
      window.scrollTo(0, 0);
    },
    'select-sector': (id) => { ui.sectorId = ui.sectorId === id ? null : id; ui.quickId = null; ui.part = 1; },
    'select-part': (id) => { ui.part = Number(id); ui.quickId = null; },
    'map-zoom': () => { ui.mapZoom = !ui.mapZoom; },
    'set-sector': (id) => {
      const parts = sectorParts(id);
      const shown = parts[Math.max(0, Math.min(ui.part, parts.length) - 1)];
      const prev = ui.editor || newEditor(id);
      ui.editor = { ...newEditor(id), mode: prev.mode, zoom: prev.zoom, ...(shown ? { part: shown.part } : {}) };
      ui.tab = 'set'; ui.setTab = 'set';
      window.scrollTo(0, 0);
    },
    'toggle-color': (id) => { ui.colors.has(id) ? ui.colors.delete(id) : ui.colors.add(id); },
    'open-boulder': (id) => {
      if (ui.quickId) ui.navReplace = true;
      ui.boulderId = id; ui.quickId = null;
      loadDetail(id).catch((e) => toast(errMsg(e), true));
    },
    'quick-boulder': (id) => {
      if (isSetter()) { actions['open-boulder'](id); return; }
      if (ui.quickId && ui.quickId !== id) ui.navReplace = true;
      ui.quickId = ui.quickId === id ? null : id;
      ui.votePromptId = null;
      const b = boulderById(id);
      const i = sectorParts(b.sectorId).findIndex((p) => p.id === b.photoId);
      if (b.sectorId === ui.sectorId && i >= 0) ui.part = i + 1;
    },
    'close-quick': () => { ui.quickId = null; ui.votePromptId = null; },
    'close-modal': (id, e, el) => {
      if (el.classList.contains('modal') && e.target !== el) return false;
      ui.boulderId = null; ui.votePromptId = null;
    },
    'toggle-send': (id) => toggleSend(id),
    'toggle-flash': (id) => toggleSend(id, !(store.sends.get(id) || {}).flash),
    'vote-sub': async (id, e, el) => {
      const boulderId = el.closest('[data-boulder]').dataset.boulder;
      await Api.setVote(store.uid, boulderId, Number(id));
      store.votes.set(boulderId, Number(id));
      await refreshStats([boulderId]);
    },
    'vote-done': () => {
      if (ui.quickId === ui.votePromptId) ui.quickId = null;
      ui.votePromptId = null;
    },
    'toggle-like': async (id) => {
      const on = !store.likes.has(id);
      await Api.setLike(store.uid, id, on);
      on ? store.likes.add(id) : store.likes.delete(id);
      await refreshStats([id]);
    },
    'toggle-project': async (id) => {
      const on = !store.projects.has(id);
      await Api.setProject(store.uid, id, on);
      on ? store.projects.add(id) : store.projects.delete(id);
      toast(t(on ? 'pr.added' : 'pr.removed'));
    },
    'share': (id) => shareBoulder(id),
    'post-comment': async (id) => {
      const text = document.getElementById('comment-input').value.trim();
      if (!text) return false;
      await Api.addComment(store.uid, id, text);
      store.commentCount++;
      ui.detail.comments = await Api.comments(id);
      await refreshStats([id]);
    },
    'report': async (id, e, el) => {
      const reason = prompt(t('mod.reason'));
      if (reason === null) return false;
      await Api.report(store.uid, el.dataset.type, id, reason.slice(0, 300));
      toast(t('mod.reported'));
    },
    'hide-content': async (id, e, el) => {
      await Api.hideContent(el.dataset.type, id);
      const item = findContent(el.dataset.type, id);
      if (item) item.hidden = true;
    },
    'delete-content': async (id, e, el) => {
      if (!confirm(t('mod.deleteConfirm'))) return false;
      await Api.deleteContent(el.dataset.type, id);
      const d = ui.detail;
      if (d) { d.comments = d.comments.filter((x) => x.id !== id); d.videos = d.videos.filter((x) => x.id !== id); }
      if (ui.boulderId) await refreshStats([ui.boulderId]);
    },
    'open-news': () => { ui.news = true; },
    'close-news': (id, e, el) => {
      if (el.classList.contains('modal') && e.target !== el) return false;
      ui.news = false;
    },
    'open-news-boulder': (id) => { ui.news = false; ui.navReplace = true; actions['open-boulder'](id); },
    'news-seen': async () => {
      const now = new Date().toISOString();
      await Api.updateProfile(store.uid, { last_seen_new_at: now });
      me().last_seen_new_at = now;
    },
    'toggle-theme': () => { localStorage.setItem('elys-theme', resolvedTheme() === 'light' ? 'dark' : 'light'); applyTheme(); },
    'open-feedback': () => { ui.feedback = { type: 'idea', sent: false, error: '' }; },
    'close-feedback': (id, e, el) => {
      if (el.classList.contains('modal') && e.target !== el) return false;
      ui.feedback = null;
    },
    'fb-type': (id) => { ui.feedback.type = id; },
    'send-feedback': async () => {
      const text = document.getElementById('feedback-input').value.trim();
      if (!text) { ui.feedback.error = 'g.errEmpty'; return; }
      await Api.sendFeedback(store.uid, ui.feedback.type, text);
      ui.feedback = { ...ui.feedback, sent: true, error: '' };
    },
    'profile-color': (id) => { ui.profileColor = ui.profileColor === id ? null : id; },
    'badge-info': (id) => { ui.badgeId = ui.badgeId === id ? null : id; },
    'onboard-next': () => { ui.onboardStep++; },
    'onboard-done': async () => {
      await Api.updateProfile(store.uid, { onboarded: true });
      me().onboarded = true;
      ui.onboardStep = 0;
    },
    'auth-mode': (id) => { ui.auth = { mode: id, error: '', info: '', email: ui.auth.email }; },
    'auth-google': () => Api.signInGoogle(),
    'logout': async () => { await Api.signOut(); },
    'export-data': async () => {
      const data = await Api.exportMyData(store.uid);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `elys-my-data-${today()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return false;
    },
    'delete-account': async () => {
      if (!confirm(t('pv.deleteConfirm'))) return false;
      if ((prompt(t('pv.deleteType')) || '').trim().toUpperCase() !== 'DELETE') return false;
      await Api.deleteMyAccount();
      await Api.signOut().catch(() => {});
      toast(t('pv.deleted'));
    },
    'set-tab': (id) => { ui.setTab = id; if (id === 'inbox') ui.inbox = null; },
    'delete-season': async (id) => {
      if (!confirm(t('se.deleteConfirm'))) return false;
      await Api.deleteSeason(id);
      store.seasons = await Api.seasons();
      if (ui.rankScope === id) ui.rankScope = 'current';
      ui.rankingKey = null;
    },
    'apply-consensus': async (id) => {
      const b = boulderById(id);
      const row = await Api.saveBoulder(id, { sub_grade: consensus(b).subGrade });
      Object.assign(b, normBoulder(row));
    },
    'edit-boulder': (id) => {
      const b = boulderById(id);
      ui.editor = {
        ...newEditor(b.sectorId), editingId: b.id, part: photoOf(b).part, color: b.color, subGrade: b.subGrade, tags: [...b.tags],
        holds: JSON.parse(JSON.stringify(b.holds)), openedAt: b.openedAt, closesAt: b.closesAt || '', holdType: 'hold',
      };
      ui.tab = 'set'; ui.setTab = 'set'; ui.boulderId = null;
      window.scrollTo(0, 0);
    },
    'cancel-edit': () => { ui.editor = newEditor(ui.editor.sectorId); },
    'ed-part': (id) => {
      const ed = ui.editor;
      ui.editor = { ...newEditor(ed.sectorId), part: id === 'new' ? 'new' : Number(id), mode: ed.mode, zoom: ed.zoom,
        tolerance: ed.tolerance, circleR: ed.circleR, color: ed.color, subGrade: ed.subGrade, tags: ed.tags };
    },
    'remove-part': async () => {
      const photo = editorPhoto();
      if (!photo || !confirm(t('s.removeConfirm'))) return false;
      const ids = store.boulders.filter((b) => b.photoId === photo.id && isActive(b)).map((b) => b.id);
      const yesterday = isoDate(Date.now() - DAY);
      if (ids.length) await Api.archiveBoulders(ids, yesterday);
      await Api.retirePhoto(photo.id);
      store.boulders.forEach((b) => { if (ids.includes(b.id)) b.closesAt = yesterday; });
      photo.retired = true;
      ui.editor = newEditor(ui.editor.sectorId);
    },
    // Whole wall reset by hand: archive every boulder of all its parts, photos are kept until re-shot.
    'reset-wall': async () => {
      const sectorId = ui.editor.sectorId;
      const ids = activeBoulders().filter((b) => b.sectorId === sectorId).map((b) => b.id);
      if (!ids.length || !confirm(t('s.resetConfirm', { n: ids.length, name: sectorOf(sectorId).name }))) return false;
      const yesterday = isoDate(Date.now() - DAY);
      await Api.archiveBoulders(ids, yesterday);
      store.boulders.forEach((b) => { if (ids.includes(b.id)) b.closesAt = yesterday; });
      ui.editor = { ...newEditor(sectorId), part: ui.editor.part, mode: ui.editor.mode };
      ui.rankingKey = null;
      toast(t('s.resetDone', { n: ids.length }));
    },
    'crop-cancel': () => { ui.cropper = null; },
    'crop-reset': () => { ui.cropper.rect = { x: 0, y: 0, w: 1, h: 1 }; },
    'crop-apply': () => applyCrop(),
    'ed-color': (id) => { ui.editor.color = id; },
    'ed-sub': (id) => { ui.editor.subGrade = Number(id); },
    'ed-tag': (id) => {
      const tags = ui.editor.tags;
      ui.editor.tags = tags.includes(id) ? tags.filter((x) => x !== id) : [...tags, id];
    },
    'ed-holdtype': (id) => { ui.editor.holdType = id; },
    'ed-mode': (id) => { ui.editor.mode = id; ui.editor.notice = ''; },
    'ed-advanced': () => { ui.edAdvanced = !ui.edAdvanced; },
    'ed-until-reset': (id) => { ui.editor.closesAt = id; },
    'open-archive': () => { ui.archive = { list: null, sector: '' }; ui.quickId = null; window.scrollTo(0, 0); },
    'close-archive': () => { ui.archive = null; },
    'ed-undo': () => { ui.editor.holds.pop(); ui.editor.notice = ''; },
    'ed-clear': () => { ui.editor.holds = []; ui.editor.notice = ''; },
    'remove-hold': (id) => { ui.editor.holds.splice(Number(id), 1); },
    'place-hold': (id, e, el) => placeHold(e, el),
    'save-boulder': async () => {
      const ed = ui.editor;
      const photo = editorPhoto();
      if (!photo || ui.saving) return false;
      if (!ed.holds.some((h) => h.type === 'start') || !ed.holds.some((h) => h.type === 'top')) { ed.error = 's.errStartTop'; return; }
      if (ed.closesAt && ed.closesAt < ed.openedAt) { ed.error = 's.errDates'; return; }
      const fields = {
        color: ed.color, sub_grade: ed.subGrade, tags: ed.tags, holds: ed.holds, opened_at: ed.openedAt, closes_at: ed.closesAt || null,
      };
      ui.saving = true;
      render();
      try {
        const row = await Api.saveBoulder(ed.editingId, ed.editingId ? fields
          : { ...fields, photo_id: photo.id, sector_id: ed.sectorId, setter_id: store.uid });
        const b = normBoulder(row);
        const i = store.boulders.findIndex((x) => x.id === b.id);
        if (i >= 0) store.boulders[i] = b; else store.boulders.push(b);
        await refreshStats([b.id]);
        toast(t(ed.editingId ? 's.saved' : 's.published'));
        ui.editor = { ...newEditor(ed.sectorId), part: ed.part, zoom: ed.zoom, mode: ed.mode, tolerance: ed.tolerance, circleR: ed.circleR };
      } finally {
        ui.saving = false;
      }
    },
    'archive-boulder': async (id) => {
      const date = isoDate(Date.now() - DAY);
      await Api.archiveBoulders([id], date);
      boulderById(id).closesAt = date;
      if (ui.editor && ui.editor.editingId === id) ui.editor = newEditor(ui.editor.sectorId);
    },
    'delete-boulder': async (id) => {
      if (!confirm(t('s.deleteConfirm'))) return false;
      await Api.deleteBoulder(id);
      store.boulders = store.boulders.filter((b) => b.id !== id);
      if (ui.editor && ui.editor.editingId === id) ui.editor = newEditor(ui.editor.sectorId);
    },
    'plan-done': async (id) => {
      const p = store.plans.find((x) => x.id === id);
      await Api.savePlan(id, { done: !p.done });
      store.plans = await Api.plans();
    },
    'plan-edit': (id) => {
      const p = store.plans.find((x) => x.id === id);
      ui.planForm = { id, sectorId: p.sector_id, part: p.part || '', date: p.planned_on, setterId: p.setter_id || '', notes: p.notes || '' };
      window.scrollTo(0, 0);
    },
    'plan-cancel': () => { ui.planForm = null; },
    'plan-delete': async (id) => {
      if (!confirm(t('pl.deleteConfirm'))) return false;
      await Api.deletePlan(id);
      store.plans = await Api.plans();
    },
    'report-hide': async (id) => {
      const r = ui.inbox.reports.find((x) => x.id === id);
      await Api.hideContent(r.target_type, r.target_id);
      await Api.resolveReport(id);
      ui.inbox = null;
    },
    'report-delete': async (id) => {
      if (!confirm(t('mod.deleteConfirm'))) return false;
      const r = ui.inbox.reports.find((x) => x.id === id);
      await Api.deleteContent(r.target_type, r.target_id);
      await Api.resolveReport(id);
      ui.inbox = null;
    },
    'report-dismiss': async (id) => {
      await Api.resolveReport(id);
      ui.inbox = null;
    },
  };

  const changes = {
    'lang': async (v) => {
      setLang(v);
      localStorage.setItem('elys-lang', v);
      if (store.uid) { await Api.updateProfile(store.uid, { lang: v }); me().lang = v; }
    },
    'theme': (v) => { localStorage.setItem('elys-theme', v); applyTheme(); },
    'status': (v) => { ui.status = v; },
    'tag': (v) => { ui.tag = v; },
    'rank-scope': (v) => { ui.rankScope = v; },
    'stats-sector': (v) => { ui.statsSector = v; },
    'archive-sector': (v) => { ui.archive.sector = v; },
    'hide-ranking': async (v, el) => {
      await Api.updateProfile(store.uid, { hide_from_ranking: el.checked });
      me().hide_from_ranking = el.checked;
      ui.rankingKey = null;
    },
    'set-role': async (v, el) => {
      await Api.setRole(el.dataset.id, v);
      const u = ui.admin.users.find((x) => x.id === el.dataset.id);
      if (u) u.role = v;
      store.staff = await Api.staff();
      toast(t('ad.saved'));
    },
    'ed-sector': (v) => { ui.editor = { ...newEditor(v), mode: ui.editor.mode, zoom: ui.editor.zoom }; },
    'ed-tol': (v) => { ui.editor.tolerance = Number(v); },
    'ed-circle': (v) => { ui.editor.circleR = Number(v); },
    'ed-opened': (v) => { ui.editor.openedAt = v; },
    'ed-closes': (v) => { ui.editor.closesAt = v; },
    'ed-photo': (v, el) => {
      const file = el.files[0];
      el.value = '';
      addWallPhoto(file);
      return false;
    },
  };

  const submits = {
    auth: () => submitAuth(),
    video: async (form) => {
      const input = document.getElementById('video-input');
      const url = input.value.trim();
      if (!VIDEO_URL_RE.test(url)) { toast(t('v.invalid'), true); return false; }
      await Api.addVideo(store.uid, form.dataset.id, url);
      ui.detail.videos = await Api.videos(form.dataset.id);
    },
    season: async () => {
      const name = document.getElementById('season-name').value.trim();
      const start = document.getElementById('season-start').value;
      const end = document.getElementById('season-end').value;
      if (!name || !start || !end || end < start) { toast(t('se.invalid'), true); return false; }
      await Api.addSeason({ name, starts_on: start, ends_on: end });
      store.seasons = await Api.seasons();
    },
    plan: async () => {
      const val = (id) => document.getElementById(id).value;
      const part = parseInt(val('plan-part'), 10);
      const fields = {
        sector_id: val('plan-sector'), part: Number.isFinite(part) ? part : null, planned_on: val('plan-date'),
        setter_id: val('plan-setter') || null, notes: val('plan-notes').trim() || null,
      };
      if (!fields.planned_on) { toast(t('pl.invalid'), true); return false; }
      await Api.savePlan(ui.planForm.id, fields);
      store.plans = await Api.plans();
      ui.planForm = null;
      toast(t('pl.saved'));
    },
  };

  // ---------- Photo upload with crop step ----------
  function addWallPhoto(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 2400 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * k);
        canvas.height = Math.round(img.height * k);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        ui.cropper = { src: canvas.toDataURL('image/jpeg', 0.92), w: canvas.width, h: canvas.height, rect: { x: 0, y: 0, w: 1, h: 1 } };
        render();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  async function applyCrop() {
    const c = ui.cropper;
    if (ui.saving) return false;
    const img = new Image();
    img.src = c.src;
    await img.decode();
    const r = c.rect;
    const sw = r.w * img.width, sh = r.h * img.height;
    const k = Math.min(1, 2000 / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * k);
    canvas.height = Math.round(sh * k);
    canvas.getContext('2d').drawImage(img, r.x * img.width, r.y * img.height, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    ui.saving = true;
    render();
    try {
      const ed = ui.editor;
      const sectorId = ed.sectorId;
      let part;
      if (ed.part === 'new') {
        part = Math.max(0, ...sectorParts(sectorId).map((p) => p.part)) + 1;
      } else {
        part = ed.part;
        const old = editorPhoto();
        if (old) {
          const ids = store.boulders.filter((b) => b.photoId === old.id && isActive(b)).map((b) => b.id);
          const yesterday = isoDate(Date.now() - DAY);
          if (ids.length) await Api.archiveBoulders(ids, yesterday);
          store.boulders.forEach((b) => { if (ids.includes(b.id)) b.closesAt = yesterday; });
        }
      }
      const row = await Api.addPhoto(sectorId, part, blob, canvas.width, canvas.height, store.uid);
      store.photos.push(normPhoto(row));
      ui.cropper = null;
      ui.editor = { ...newEditor(sectorId), part, mode: ed.mode };
    } finally {
      ui.saving = false;
    }
  }

  let cropDrag = null;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  document.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('[data-crop]');
    if (!handle || !ui.cropper) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const frame = handle.closest('.crop-frame').getBoundingClientRect();
    cropDrag = { mode: handle.dataset.crop, sx: e.clientX, sy: e.clientY, fw: frame.width, fh: frame.height, start: { ...ui.cropper.rect } };
  });

  document.addEventListener('pointermove', (e) => {
    if (!cropDrag || !ui.cropper) return;
    const MIN = 0.08;
    const dx = (e.clientX - cropDrag.sx) / cropDrag.fw, dy = (e.clientY - cropDrag.sy) / cropDrag.fh;
    const s = cropDrag.start;
    let { x, y, w, h } = s;
    if (cropDrag.mode === 'move') {
      x = clamp(s.x + dx, 0, 1 - s.w);
      y = clamp(s.y + dy, 0, 1 - s.h);
    } else {
      if (cropDrag.mode.includes('w')) { x = clamp(s.x + dx, 0, s.x + s.w - MIN); w = s.x + s.w - x; }
      if (cropDrag.mode.includes('e')) w = clamp(s.w + dx, MIN, 1 - s.x);
      if (cropDrag.mode.includes('n')) { y = clamp(s.y + dy, 0, s.y + s.h - MIN); h = s.y + s.h - y; }
      if (cropDrag.mode.includes('s')) h = clamp(s.h + dy, MIN, 1 - s.y);
    }
    ui.cropper.rect = { x, y, w, h };
    Object.assign(document.querySelector('.crop-rect').style, {
      left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`,
    });
  });

  document.addEventListener('pointerup', () => { cropDrag = null; });
  document.addEventListener('pointercancel', () => { cropDrag = null; });

  // ---------- Pinch / ctrl+wheel zoom on the setter's wall photo ----------
  const MAX_ZOOM = 5;
  let pinch = null;
  let pinchEndedAt = 0;

  // Zoom around a point (cx, cy) of the box, keeping the photo point under it in place.
  function zoomEditorAt(box, z, cx, cy) {
    const inner = box.firstElementChild;
    const fx = (box.scrollLeft + cx) / box.scrollWidth, fy = (box.scrollTop + cy) / box.scrollHeight;
    ui.editor.zoom = clamp(z, 1, MAX_ZOOM);
    inner.style.width = `${ui.editor.zoom * 100}%`;
    box.scrollLeft = fx * box.scrollWidth - cx;
    box.scrollTop = fy * box.scrollHeight - cy;
  }

  document.addEventListener('touchstart', (e) => {
    const box = e.target.closest && e.target.closest('.zoombox');
    if (!box || !ui.editor || e.touches.length !== 2) return;
    const [a, b] = e.touches;
    pinch = { box, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom: ui.editor.zoom };
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    const [a, b] = e.touches;
    const r = pinch.box.getBoundingClientRect();
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    zoomEditorAt(pinch.box, pinch.zoom * d / pinch.d, (a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top);
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
    if (pinch && e.touches.length < 2) { pinch = null; pinchEndedAt = Date.now(); }
  });

  document.addEventListener('wheel', (e) => {
    const box = e.ctrlKey && e.target.closest && e.target.closest('.zoombox');
    if (!box || !ui.editor) return;
    e.preventDefault();
    const r = box.getBoundingClientRect();
    zoomEditorAt(box, ui.editor.zoom * Math.exp(-e.deltaY * 0.005), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // ---------- History (phone back button) ----------
  const navState = () => ({ tab: ui.tab, archive: !!ui.archive, boulderId: ui.boulderId, quickId: ui.quickId, feedback: !!ui.feedback, news: ui.news });

  function syncHistory(before) {
    const after = navState();
    const replace = ui.navReplace;
    ui.navReplace = false;
    if (JSON.stringify(after) === JSON.stringify(before)) return;
    // Closing = same tab and everything still open after was already open before (e.g. modal closed over the archive).
    const closing = after.tab === before.tab && Object.keys(after).every((k) => k === 'tab' || !after[k] || after[k] === before[k]);
    if (closing) history.back();
    else if (replace) history.replaceState(after, '');
    else history.pushState(after, '');
  }

  window.addEventListener('popstate', (e) => {
    if (ui.view !== 'app') return;
    const s = e.state || { tab: 'boulders', boulderId: null, quickId: null };
    ui.tab = s.tab === 'set' && !isSetter() ? 'boulders' : s.tab;
    ui.boulderId = s.boulderId;
    ui.quickId = s.quickId;
    if (!s.feedback) ui.feedback = null;
    if (!s.archive) ui.archive = null;
    ui.news = !!s.news;
    ui.votePromptId = null;
    if (ui.boulderId && (!ui.detail || ui.detail.id !== ui.boulderId)) loadDetail(ui.boulderId).catch(() => {});
    render();
  });

  // ---------- Event wiring ----------
  async function run(fn) {
    try {
      const r = await fn();
      if (r !== false) render();
    } catch (err) {
      ui.saving = false;
      if (ui.auth) ui.auth.error = ui.view === 'auth' ? errMsg(err) : ui.auth.error;
      toast(errMsg(err), true);
    }
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const handler = actions[el.dataset.action];
    if (!handler) return;
    const before = navState();
    run(async () => {
      const r = await handler(el.dataset.id, e, el);
      if (r !== false) syncHistory(before);
      return r;
    });
  });

  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const handler = changes[el.dataset.change];
    if (handler) run(() => handler(el.value, el));
  });

  document.addEventListener('input', (e) => {
    if (e.target.dataset.input === 'admin-q') { ui.admin.q = e.target.value; render(); }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target;
    const handler = submits[form.dataset.submit];
    if (!handler) return;
    e.preventDefault();
    run(() => handler(form));
  });

  // ---------- Startup ----------
  let starting = null;

  async function start(session) {
    if (starting) return starting;
    starting = (async () => {
      store.uid = session.user.id;
      store.profile = await Api.profile(store.uid);
      setLang(store.profile.lang || deviceLang());
      await loadAll();
      ui.view = 'app';
      ui.editor = null;
      history.replaceState(navState(), '');
      const deepLink = new URLSearchParams(location.search).get('b');
      if (deepLink) {
        history.replaceState(navState(), '', location.pathname);
        actions['open-boulder'](deepLink);
        history.pushState(navState(), '');
      }
      render();
    })();
    try { await starting; } catch (err) {
      ui.view = 'auth';
      ui.auth.error = errMsg(err);
      render();
    } finally { starting = null; }
  }

  function resetStore() {
    Object.assign(store, { uid: null, profile: null, photos: [], boulders: [], stats: new Map(), sends: new Map(),
      votes: new Map(), likes: new Set(), projects: new Set(), commentCount: 0, seasons: [], plans: [], staff: [] });
    Object.assign(ui, { tab: 'boulders', boulderId: null, quickId: null, editor: null, admin: null, inbox: null, rankingKey: null, ranking: null });
  }

  async function boot() {
    if (!Api.configured) { ui.view = 'setup'; render(); return; }
    // Supabase advises not to await its own calls inside this callback, hence setTimeout.
    Api.onAuth((event, session) => setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY') {
        ui.view = 'auth'; ui.auth = { mode: 'reset', error: '', info: '' }; render();
      } else if (event === 'SIGNED_IN' && session && !store.uid && ui.auth.mode !== 'reset') {
        run(() => start(session));
      } else if (event === 'SIGNED_OUT') {
        resetStore();
        ui.view = 'auth'; ui.auth = { mode: 'login', error: '', info: '' };
        render();
      }
    }, 0));
    const session = await Api.session();
    if (session) await start(session);
    else if (ui.view === 'loading') { ui.view = 'auth'; render(); }
  }

  render();
  boot().catch((err) => { ui.view = 'auth'; ui.auth.error = errMsg(err); render(); });
})();
