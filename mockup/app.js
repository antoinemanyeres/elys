(function () {
  const STORAGE_KEY = 'elys-mockup-v4';
  const DAY = 864e5;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
  const today = () => isoDate(Date.now());
  const fmtDate = (v) => new Date(v).toLocaleDateString(localeOf(), { day: 'numeric', month: 'short' });
  const daysUntil = (iso) => Math.round((new Date(iso) - new Date(today())) / DAY);

  let state = load();
  setLang(state.lang);

  const newEditor = (sectorId = 'welle') => ({
    sectorId, editingId: null, color: 'green', subGrade: 1, tags: [], holds: [],
    holdType: 'start', mode: 'auto', tolerance: 30, circleR: 0.035, zoom: 1,
    openedAt: today(), closesAt: isoDate(Date.now() + 60 * DAY), busy: false, notice: '', error: '',
  });
  const ui = {
    tab: 'boulders', sectorId: 'welle', colors: new Set(), status: 'all', tag: '',
    boulderId: null, lastModalId: null, editor: newEditor(),
    quickId: null, votePromptId: null,
    auth: { mode: 'signup', error: '' },
    videos: {}, // boulderId -> [{ userId, url, setter }] (in-memory only in the mockup)
  };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* corrupted storage: fall back to seed */ }
    return seedState();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      alert(t('storageFull'));
    }
  }

  // ---------- Helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const colorIdx = (id) => COLORS.findIndex((c) => c.id === id);
  const colorOf = (id) => COLORS[colorIdx(id)];
  const colorLabel = (id) => t('color.' + id);
  const tagLabel = (tag) => t('tag.' + tag);
  const me = () => state.users.find((u) => u.id === state.currentUserId);
  const isSetter = () => me().role === 'setter';
  const userName = (id) => (state.users.find((u) => u.id === id) || { name: '?' }).name;
  const sectorOf = (id) => SECTORS.find((s) => s.id === id);
  const photoOf = (b) => state.wallPhotos.find((p) => p.id === b.photoId);
  const currentPhoto = (sectorId) =>
    state.wallPhotos.filter((p) => p.sectorId === sectorId).sort((a, b) => b.createdAt - a.createdAt)[0];
  const isActive = (b) => b.openedAt <= today() && (!b.closesAt || b.closesAt >= today());
  const isNew = (b) => daysUntil(b.openedAt) > -7;
  const points = (b) => pointsFor(b.color, b.subGrade);
  const sendsOf = (b) => state.sends.filter((s) => s.boulderId === b.id);
  const likesOf = (b) => state.likes.filter((l) => l.boulderId === b.id);
  const mySend = (b) => state.sends.find((s) => s.boulderId === b.id && s.userId === state.currentUserId);
  const hasLiked = (b) => state.likes.some((l) => l.boulderId === b.id && l.userId === state.currentUserId);
  const myVote = (b) => state.votes.find((v) => v.boulderId === b.id && v.userId === state.currentUserId);
  const flashPct = Math.round(FLASH_BONUS * 100);

  // Climbers only vote the sub-grade: the color always stays the setter's.
  function consensus(b) {
    const votes = state.votes.filter((v) => v.boulderId === b.id);
    if (!votes.length) return null;
    const avg = votes.reduce((sum, v) => sum + v.subGrade, 0) / votes.length;
    return { color: b.color, subGrade: Math.round(avg), avg, count: votes.length };
  }

  const gradeFeedback = () => state.boulders.filter(isActive)
    .map((b) => ({ b, cons: consensus(b) }))
    .filter(({ b, cons }) => cons && cons.count >= 3 && Math.abs(cons.avg - b.subGrade) >= 0.75);

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
  };
  const icon = (name) => `<svg class="ico ico-${name}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  const GOOGLE_LOGO = `<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

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

  // ---------- Wall photo with hold outlines ----------
  function wallGeom(photo) {
    const span = photo.crop.bottom - photo.crop.top;
    const ar = (photo.h * span) / photo.w;
    return { span, ar, H: 1000 * ar };
  }

  // Normalized bounding box: x in wall widths, y in wall heights.
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

  function boulderSvg(holds, color, geo, { id = '', dim = false, clickable = false, draft = false, action = 'open-boulder' } = {}) {
    const c = colorOf(color);
    const halo = color === 'black' ? '#fff' : '#000';
    const shapes = holds.map((h, i) => {
      const act = draft ? `data-action="remove-hold" data-id="${i}"` : '';
      const ring = h.type === 'start' ? shapeSvg(h, geo.H, 'halo', 14) + shapeSvg(h, geo.H, 'line thin', 14) : '';
      return `<g class="hold" ${act}>${shapeSvg(h, geo.H, 'halo')}${shapeSvg(h, geo.H, 'line')}${ring}</g>`;
    }).join('');
    const attrs = clickable ? `data-action="${action}" data-id="${id}"` : '';
    return `<g class="boulder ${dim ? 'dim' : ''} ${draft ? 'draft' : ''} ${clickable ? 'clickable' : ''}" ${attrs}
      style="--c:${c.hex};--halo:${halo};--ink:${c.ink}">${shapes}${holds.map((h) => badge(h, geo)).join('')}</g>`;
  }

  function wall(photo, boulders, { highlight = null, editor = false, draft = null, clickable = true, action } = {}) {
    const geo = wallGeom(photo);
    const ordered = [...boulders].sort((a, b) => (a.id === highlight) - (b.id === highlight));
    const layers = ordered.map((b) => boulderSvg(b.holds, b.color, geo, {
      id: b.id, dim: !!highlight && highlight !== b.id, clickable: clickable && !editor, action,
    })).join('');
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
  function gymMap(selectedId) {
    const counts = {};
    state.boulders.filter(isActive).forEach((b) => { counts[b.sectorId] = (counts[b.sectorId] || 0) + 1; });
    const zones = SECTORS.map((s) => {
      const [x, y, w, h] = s.rect;
      const n = counts[s.id] || 0;
      return `<g class="zone ${s.id === selectedId ? 'selected' : ''}" data-action="select-sector" data-id="${s.id}" style="--area:${AREA_COLORS[s.area]}">
        <rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" rx="10"></rect>
        <text x="${x + w / 2}" y="${y + h / 2}">${esc(s.name)}</text>
        ${n ? `<circle cx="${x + w - 16}" cy="${y + 16}" r="10"></circle><text class="count" x="${x + w - 16}" y="${y + 16}">${n}</text>` : ''}
      </g>`;
    }).join('');
    return `<svg class="map" viewBox="0 0 700 770" role="img" aria-label="Gym map">
      <rect class="static" x="22" y="522" width="96" height="76" rx="10"></rect>
      <text class="static-label" x="70" y="560">${t('map.fitness')}</text>
      <rect class="static" x="122" y="522" width="196" height="76" rx="10"></rect>
      <text class="static-label" x="220" y="560">${t('map.entrance')}</text>
      <text class="gym-name" x="510" y="320">elys</text>
      ${zones}
    </svg>`;
  }

  // ---------- Layout ----------
  const brand = () => `<div class="brand">elys<span>.</span><small>${t('brand.sub')}</small></div>`;

  function header() {
    return `<header class="top">${brand()}
      <div class="head-right">${langSelect('lang-chip')}
        <button class="avatar sm" data-action="tab" data-id="profile" aria-label="${t('tab.profile')}">${esc(me().name[0])}</button></div>
    </header>`;
  }

  function tabs() {
    const list = ['boulders', 'ranking', 'profile'];
    if (isSetter()) list.push('set');
    return `<nav class="tabs">${list.map((id) =>
      `<button data-action="tab" data-id="${id}" class="${ui.tab === id ? 'active' : ''}">${icon(id)}<span>${t('tab.' + id)}</span></button>`).join('')}</nav>`;
  }

  // ---------- Auth (mockup only: real auth would be handled by a provider such as Supabase Auth) ----------
  function loginView() {
    const signup = ui.auth.mode === 'signup';
    return `<div class="login">
      <div class="login-top">${langSelect('lang-chip')}</div>
      <div class="login-hero">${brand()}<p>${t('l.tagline')}</p></div>
      <div class="card">
        <button class="btn google block" data-action="auth-google">${GOOGLE_LOGO}${t('l.google')}</button>
        <div class="or"><span>${t('l.or')}</span></div>
        <form data-submit="auth" novalidate>
          ${signup ? `<label class="field"><span>${t('l.name')}</span><input id="auth-name" maxlength="30" autocomplete="nickname" value="${esc(ui.auth.name || '')}"></label>` : ''}
          <label class="field"><span>${t('l.email')}</span><input id="auth-email" type="email" autocomplete="email" value="${esc(ui.auth.email || '')}"></label>
          <label class="field"><span>${t('l.password')}</span><input id="auth-password" type="password" minlength="8" autocomplete="${signup ? 'new-password' : 'current-password'}"></label>
          ${ui.auth.error ? `<p class="notice">${esc(ui.auth.error)}</p>` : ''}
          <button class="btn primary block" type="submit">${t(signup ? 'l.signup' : 'l.login')}</button>
        </form>
        <button class="link block-link" data-action="auth-mode">${t(signup ? 'l.toLogin' : 'l.toSignup')}</button>
      </div>
      <button class="link block-link" data-action="auth-demo-setter">${t('l.demoSetter')}</button>
      <p class="muted small center">${t('l.demoNote')}</p>
    </div>`;
  }

  function submitAuth() {
    const signup = ui.auth.mode === 'signup';
    const email = document.getElementById('auth-email').value.trim().toLowerCase();
    const password = document.getElementById('auth-password').value;
    const name = signup ? document.getElementById('auth-name').value.trim() : '';
    const existing = state.users.find((u) => u.email === email);
    let error = '';
    if (signup && !name) error = t('l.errName');
    else if (!EMAIL_RE.test(email)) error = t('l.errEmail');
    else if (password.length < 8) error = t('l.errPassword');
    else if (signup && existing) error = t('l.errExists');
    else if (!signup && !existing) error = t('l.errUnknown');
    ui.auth.error = error;
    ui.auth.email = email;
    ui.auth.name = name;
    if (error) return;
    if (signup) {
      const user = { id: 'u_' + Date.now(), name, role: 'climber', email };
      state.users.push(user);
      logIn(user.id);
    } else {
      logIn(existing.id);
    }
  }

  function logIn(userId) {
    state.currentUserId = userId;
    ui.tab = 'boulders';
    ui.auth = { mode: 'signup', error: '' };
    save();
  }

  // ---------- Boulders ----------
  const passesFilters = (b) =>
    (ui.colors.size === 0 || ui.colors.has(b.color)) &&
    (ui.status === 'all' || (ui.status === 'new' ? isNew(b) : (ui.status === 'sent') === !!mySend(b))) &&
    (!ui.tag || b.tags.includes(ui.tag));

  function sendMark(b) {
    const s = mySend(b);
    if (!s) return '';
    return s.flash ? `<span class="flash-mark">${icon('flash')}</span>` : `<span class="ok">${icon('check')}</span>`;
  }

  function boulderRow(b) {
    return `<div class="row ${ui.quickId === b.id ? 'selected' : ''}" data-action="quick-boulder" data-id="${b.id}">
      ${thumb(b)}
      <div class="mid">
        <div class="line1">${gradePill(b.color, b.subGrade)}${isNew(b) ? `<span class="new">${t('new')}</span>` : ''}</div>
        <div class="muted small">${esc(sectorOf(b.sectorId).name)} · ${t('b.holds', { n: b.holds.length })}</div>
        <div>${tagList(b.tags.slice(0, 2))}</div>
      </div>
      <div class="side">
        <div class="pts">${points(b)}<small>${t('pts')}</small></div>
        <div class="meta">${sendMark(b)}${hasLiked(b) ? `<span class="heart">${icon('heart')}</span>` : ''}<span>${t('b.sends', { n: sendsOf(b).length })}</span></div>
      </div>
    </div>`;
  }

  function bouldersView() {
    const sector = sectorOf(ui.sectorId);
    let list = state.boulders.filter(isActive);
    if (sector) list = list.filter((b) => b.sectorId === sector.id);
    const visible = list.filter(passesFilters).sort((a, b) => points(a) - points(b));
    const photo = sector && currentPhoto(sector.id);
    const opt = (v, key) => `<option value="${v}" ${ui.status === v ? 'selected' : ''}>${t(key)}</option>`;

    return `
      <section class="card">
        ${gymMap(ui.sectorId)}
        <div class="sector-title">${sector
          ? `<h2>${esc(sector.name)}</h2><button class="link" data-action="select-sector" data-id="${sector.id}">${t('b.wholeGym')}</button>`
          : `<h2>${t('b.wholeGym')}</h2><span class="muted small">${t('b.tapMap')}</span>`}</div>
        <div class="colorbar">${COLORS.map((c) =>
          `<button data-action="toggle-color" data-id="${c.id}" title="${colorLabel(c.id)}" aria-label="${colorLabel(c.id)}"
            class="${ui.colors.size === 0 || ui.colors.has(c.id) ? 'on' : ''}" style="background:${c.hex}"></button>`).join('')}</div>
        <div class="filters">
          <select data-change="status">${opt('all', 'f.all')}${opt('todo', 'f.todo')}${opt('sent', 'f.sent')}${opt('new', 'f.new')}</select>
          <select data-change="tag"><option value="">${t('f.allStyles')}</option>${STYLE_TAGS.map((tag) =>
            `<option value="${esc(tag)}" ${ui.tag === tag ? 'selected' : ''}>${esc(tagLabel(tag))}</option>`).join('')}</select>
        </div>
      </section>
      ${photo ? `<section class="card flush">${wall(photo, visible.filter((b) => b.photoId === photo.id), { highlight: ui.quickId, action: 'quick-boulder' })}
          <div class="legend"><span><i class="lg-start">${t('hold.startSymbol')}</i>${t('hold.start')}</span><span><i class="lg-top">${t('hold.topSymbol')}</i>${t('hold.top')}</span><span class="muted">${t('b.tapBoulder')}</span></div></section>`
        : sector ? `<section class="card empty">${t('b.noPhoto')}</section>` : ''}
      <div class="list-head">${visible.length === 1 ? t('b.count1') : t('b.countN', { n: visible.length })}</div>
      <div class="list">${visible.map(boulderRow).join('') || `<p class="empty">${t('b.noMatch')}</p>`}</div>`;
  }

  const voteBlock = (b) => {
    const vote = myVote(b);
    return `<div class="vote" data-boulder="${b.id}">
      <div class="muted small">${t('q.rateHint', { color: colorLabel(b.color) })}</div>
      ${subButtons('vote-sub', vote && vote.subGrade)}</div>`;
  };

  function votePrompt(b) {
    return `<div class="vote-prompt">
      <b>${t('q.howHard')}</b>
      <div class="muted small">${t('m.setterGrade')}: ${gradePill(b.color, b.subGrade)}</div>
      ${voteBlock(b)}
      <div class="prompt-actions"><button class="btn ghost" data-action="vote-done">${t('q.skip')}</button>
        <button class="btn primary" data-action="vote-done" ${myVote(b) ? '' : 'disabled'}>${t('q.done')}</button></div>
    </div>`;
  }

  // Quick actions from the boulders view, without leaving the page.
  function quickSheet() {
    const b = state.boulders.find((x) => x.id === ui.quickId);
    if (!b) return '';
    const send = mySend(b);
    const body = ui.votePromptId === b.id ? votePrompt(b) : `<div class="quick-actions">
        <button class="btn ${send ? 'sent' : 'primary'}" data-action="toggle-send" data-id="${b.id}">${send ? `${icon('check')} ${t('m.sent')}` : t('m.markSent')}</button>
        <button class="btn flash-btn ${send && send.flash ? 'on' : ''}" data-action="toggle-flash" data-id="${b.id}">${icon('flash')} ${t(send && send.flash ? 'm.flashed' : 'm.flash')}</button>
        <button class="btn ghost" data-action="open-boulder" data-id="${b.id}">${t('q.details')} →</button>
      </div>`;
    return `<div class="quick-backdrop" data-action="close-quick"></div>
      <div class="quick ${ui.lastQuickId === b.id ? '' : 'enter'}" role="dialog">
        <div class="quick-head">${thumb(b, 52)}
          <div class="mid">${gradePill(b.color, b.subGrade)}
            <div class="muted small">${esc(sectorOf(b.sectorId).name)} · ${t('b.sends', { n: sendsOf(b).length })}</div></div>
          <div class="pts">${points(b)}<small>${t('pts')}</small>
            <div class="flash-mark small">${icon('flash')} ${sendPointsFor(b.color, b.subGrade, true)}</div></div>
        </div>
        ${body}
      </div>`;
  }

  function boulderModal() {
    const b = state.boulders.find((x) => x.id === ui.boulderId);
    if (!b) return '';
    const photo = photoOf(b);
    const cons = consensus(b);
    const send = mySend(b);
    const others = state.boulders.filter((x) => x.photoId === b.photoId && (isActive(x) || x.id === b.id));
    const comments = state.comments.filter((c) => c.boulderId === b.id).sort((a, c) => a.date - c.date);
    const repeats = sendsOf(b).sort((a, c) => c.date - a.date);
    const videos = (ui.videos[b.id] || []).slice().sort((a, c) => c.setter - a.setter);
    const closesIn = b.closesAt ? daysUntil(b.closesAt) : null;

    const mainActions = isSetter()
      ? `<button class="btn primary" data-action="edit-boulder" data-id="${b.id}">${t('m.edit')}</button>`
      : `<button class="btn ${send ? 'sent' : 'primary'}" data-action="toggle-send" data-id="${b.id}">${send ? `${icon('check')} ${t('m.sent')}` : t('m.markSent')}</button>
         <button class="btn flash-btn ${send && send.flash ? 'on' : ''}" data-action="toggle-flash" data-id="${b.id}">${icon('flash')} ${t(send && send.flash ? 'm.flashed' : 'm.flash')}</button>`;

    return `<div class="modal" data-action="close-modal"><div class="sheet">
      <div class="hero">
        <button class="back" data-action="close-modal" aria-label="${t('m.close')}">${icon('back')}</button>
        ${wall(photo, others, { highlight: b.id })}
      </div>
      <div class="sheet-body">
        <div class="title-row">
          <div>${gradePill(b.color, b.subGrade)}${isNew(b) ? `<span class="new">${t('new')}</span>` : ''}
            <div class="muted small">${esc(sectorOf(b.sectorId).name)} · ${t('m.setBy', { name: esc(userName(b.setterId)) })}</div></div>
          <div class="pts big">${points(b)}<small>${t('pts')}</small></div>
        </div>
        <div class="stats">
          <div><b>${repeats.length}</b><span>${t('m.repeats')}</span></div>
          <div><b>${likesOf(b).length}</b><span>${t('m.likes')}</span></div>
          <div><b>${comments.length}</b><span>${t('m.comments')}</span></div>
        </div>
        <div class="actions">${mainActions}
          <button class="btn icon-btn ${hasLiked(b) ? 'liked' : ''}" data-action="toggle-like" data-id="${b.id}" aria-label="${t('m.like')}">${icon('heart')}</button>
        </div>
        ${isSetter() ? '' : `<p class="hint">${t('m.flashHint', { pct: flashPct })}</p>`}
        ${ui.votePromptId === b.id ? `<section class="card">${votePrompt(b)}</section>` : ''}

        <section class="card">
          <h3>${t('m.grade')}</h3>
          <div class="kv"><span>${t('m.setterGrade')}</span>${gradePill(b.color, b.subGrade)}</div>
          <div class="kv"><span>${t('m.consensus')}</span>${cons
            ? `<span>${gradePill(cons.color, cons.subGrade)} <small class="muted">${t('m.votes', { n: cons.count })}</small></span>`
            : `<span class="muted">${t('m.noVotes')}</span>`}</div>
          ${isSetter() ? '' : send
            ? `<div class="vote-label">${t('m.yourVote')}</div>${voteBlock(b)}`
            : `<p class="muted small">${t('m.voteHint')}</p>`}
        </section>

        <section class="card">
          <h3>${t('m.info')}</h3>
          <div>${tagList(b.tags) || `<span class="muted">${t('m.noTags')}</span>`}</div>
          <div class="kv"><span>${t('m.opened')}</span><b>${fmtDate(b.openedAt)}</b></div>
          <div class="kv"><span>${t('m.closes')}</span><b>${b.closesAt ? fmtDate(b.closesAt) : '—'}${closesIn !== null && closesIn <= 7 ? ` <span class="warn">${t('m.inDays', { n: closesIn })}</span>` : ''}</b></div>
          <p class="muted small">${repeats.length
            ? t('m.sentBy', { names: repeats.slice(0, 6).map((s) => esc(userName(s.userId))).join(', ') + (repeats.length > 6 ? '…' : '') })
            : t('m.firstRepeat')}</p>
        </section>

        <section class="card">
          <h3>${t('m.videos')}</h3>
          ${videos.map((v) => `<figure class="video"><video src="${esc(v.url)}" controls playsinline preload="metadata"></video>
            <figcaption>${v.setter ? `<span class="badge-setter">${t('m.setterBeta')}</span>` : ''}${esc(userName(v.userId))}</figcaption></figure>`).join('')
            || `<p class="muted small">${t('m.noVideos')}</p>`}
          <label class="btn ghost block">${t('m.uploadVideo')}<input type="file" accept="video/*" data-change="video-upload" hidden></label>
          <p class="muted small">${t('m.videoNote')}</p>
        </section>

        <section class="card">
          <h3>${t('m.beta')}</h3>
          ${comments.map((c) => `<div class="comment"><span class="avatar sm">${esc(userName(c.userId)[0])}</span>
            <div><b>${esc(userName(c.userId))}</b> <span class="muted small">${fmtDate(c.date)}</span><p>${esc(c.text)}</p></div></div>`).join('')}
          <textarea id="comment-input" maxlength="500" placeholder="${t('m.placeholder')}"></textarea>
          <button class="btn primary block" data-action="post-comment" data-id="${b.id}">${t('m.post')}</button>
        </section>
      </div>
    </div></div>`;
  }

  // ---------- Ranking & profile ----------
  // Only boulders currently on the walls count: resetting a wall removes its points.
  function rankingData() {
    return state.users.filter((u) => u.role === 'climber').map((u) => {
      const done = state.sends.filter((s) => s.userId === u.id)
        .map((s) => ({ s, b: state.boulders.find((b) => b.id === s.boulderId) }))
        .filter(({ b }) => b && isActive(b));
      const perColor = COLORS.map((c) => done.filter(({ b }) => b.color === c.id).length);
      return {
        u, perColor, n: done.length,
        flashes: done.filter(({ s }) => s.flash).length,
        pts: done.reduce((sum, { s, b }) => sum + sendPointsFor(b.color, b.subGrade, s.flash), 0),
      };
    }).sort((a, b) => b.pts - a.pts);
  }

  function histogram(perColor) {
    const max = Math.max(1, ...perColor);
    return `<span class="histo">${perColor.map((n, i) =>
      `<i style="height:${3 + (n / max) * 23}px;background:${COLORS[i].hex}" title="${colorLabel(COLORS[i].id)}: ${n}"></i>`).join('')}</span>`;
  }

  function rankingView() {
    const data = rankingData();
    const podium = data.slice(0, 3);
    return `<p class="hint top-note">${t('r.note')}</p>
      <div class="podium">${[1, 0, 2].map((i) => podium[i] ? `<div class="p${i + 1}">
        <span class="avatar lg">${esc(podium[i].u.name[0])}</span><b>${esc(podium[i].u.name)}</b><span>${podium[i].pts} ${t('pts')}</span><div class="step">${i + 1}</div></div>` : '').join('')}</div>
      <div class="list">${data.map((d, i) => `<div class="row rank ${d.u.id === state.currentUserId ? 'me' : ''}">
        <span class="pos">${i + 1}</span><span class="avatar">${esc(d.u.name[0])}</span>
        <div class="mid"><b>${esc(d.u.name)}</b><div class="small muted">${t('b.sends', { n: d.n })}${d.flashes ? ` · <span class="flash-mark">${icon('flash')}</span>${d.flashes}` : ''}</div></div>
        ${histogram(d.perColor)}<div class="pts">${d.pts}<small>${t('pts')}</small></div>
      </div>`).join('')}</div>
      <section class="card">
        <h3>${t('r.how')}</h3>
        <p class="muted small">${t('r.howText', { pct: flashPct })}</p>
        <table class="points-table"><tr><th></th>${[1, 2, 3, 4, 5].map((n) => `<th>${n}</th>`).join('')}</tr>
          ${COLORS.map((c) => `<tr><td><i class="sw" style="background:${c.hex}"></i>${colorLabel(c.id)}</td>${[1, 2, 3, 4, 5].map((n) => `<td>${pointsFor(c.id, n)}</td>`).join('')}</tr>`).join('')}
        </table>
      </section>`;
  }

  function feedbackCard() {
    const list = gradeFeedback();
    return `<section class="card">
      <h3>${t('fb.title')}</h3>
      <p class="muted small">${t('fb.text')}</p>
      ${list.map(({ b, cons }) => `<div class="row plain">${thumb(b, 48)}
        <div class="mid"><div class="small">${gradePill(b.color, b.subGrade)} <span class="muted">→</span> ${gradePill(cons.color, cons.subGrade)}</div>
          <div class="muted small">${esc(sectorOf(b.sectorId).name)} · ${t('m.votes', { n: cons.count })}</div></div>
        <button class="btn small" data-action="apply-consensus" data-id="${b.id}">${t('fb.apply')}</button></div>`).join('')
        || `<p class="muted small">${t('fb.none')}</p>`}
    </section>`;
  }

  function settingsCard() {
    const users = state.users.map((u) =>
      `<option value="${u.id}" ${u.id === state.currentUserId ? 'selected' : ''}>${esc(u.name)}${u.role === 'setter' ? ' · ' + t('p.setter') : ''}</option>`).join('');
    return `<section class="card">
      <h3>${t('p.settings')}</h3>
      <label class="field"><span>${t('p.language')}</span>${langSelect()}</label>
      <label class="field"><span>${t('p.demoUser')}</span><select data-change="switch-user">${users}</select></label>
      <button class="btn ghost block" data-action="logout">${t('p.logout')}</button>
      <button class="btn ghost block danger" data-action="reset-demo">${t('p.reset')}</button>
    </section>`;
  }

  function profileView() {
    const u = me();
    const head = `<span class="avatar xl">${esc(u.name[0])}</span><h2>${esc(u.name)}</h2><span class="muted small">${esc(u.email)}</span>`;
    if (u.role === 'setter') {
      const mine = state.boulders.filter((b) => b.setterId === u.id);
      return `<section class="profile-hero">${head}<span class="badge-setter">${t('p.setter')}</span>
          <div class="stats"><div><b>${mine.length}</b><span>${t('p.set')}</span></div><div><b>${mine.filter(isActive).length}</b><span>${t('p.onWalls')}</span></div>
          <div><b>${mine.reduce((s, b) => s + sendsOf(b).length, 0)}</b><span>${t('p.totalSends')}</span></div></div></section>
        ${feedbackCard()}
        <div class="list-head">${t('p.myBoulders')}</div>
        <div class="list">${mine.filter(isActive).map(boulderRow).join('')}</div>${settingsCard()}`;
    }
    const data = rankingData();
    const rank = data.findIndex((d) => d.u.id === u.id);
    const mine = data[rank];
    const mySends = state.sends.filter((s) => s.userId === u.id).sort((a, b) => b.date - a.date)
      .map((s) => state.boulders.find((b) => b.id === s.boulderId)).filter((b) => b && isActive(b));
    return `<section class="profile-hero">${head}
        <div class="stats"><div><b>#${rank + 1}</b><span>${t('p.rank')}</span></div><div><b>${mine.pts}</b><span>${t('p.points')}</span></div>
          <div><b>${mine.n}</b><span>${t('p.sends')}</span></div><div><b>${mine.flashes}</b><span>${t('p.flashes')}</span></div></div>
        <div class="hist-big">${histogram(mine.perColor)}</div></section>
      <div class="list-head">${t('p.mySends')}</div>
      <div class="list">${mySends.map(boulderRow).join('') || `<p class="empty">${t('p.noSends')}</p>`}</div>${settingsCard()}`;
  }

  // ---------- Setter editor ----------
  function setterView() {
    const ed = ui.editor;
    const photo = currentPhoto(ed.sectorId);
    const onWall = photo ? state.boulders.filter((b) => b.photoId === photo.id && isActive(b)) : [];
    const editing = ed.editingId && state.boulders.find((b) => b.id === ed.editingId);
    const seg = (action, value, current, label) =>
      `<button class="${value === current ? 'on' : ''}" data-action="${action}" data-id="${value}">${label}</button>`;
    const starts = ed.holds.filter((h) => h.type === 'start').length;
    const tops = ed.holds.filter((h) => h.type === 'top').length;

    return `
      <section class="card">
        ${editing ? `<div class="editing-banner">${t('s.editing')} ${gradePill(editing.color, editing.subGrade)}<button class="link" data-action="cancel-edit">${t('s.cancel')}</button></div>` : `<h3>${t('s.new')}</h3>`}
        <label class="field"><span>${t('s.wall')}</span><select data-change="ed-sector" ${editing ? 'disabled' : ''}>${SECTORS.map((s) =>
          `<option value="${s.id}" ${s.id === ed.sectorId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        ${editing ? '' : `<label class="btn ghost block">${t('s.upload')}
          <input type="file" accept="image/*" capture="environment" data-change="ed-photo" hidden></label>
          <p class="muted small">${t('s.uploadNote')}</p>`}
      </section>

      ${photo ? `
      <section class="card tools">
        <div class="tool-row"><span class="label">${t('s.holdType')}</span><div class="seg">
          ${seg('ed-holdtype', 'start', ed.holdType, `<i class="lg-start">${t('hold.startSymbol')}</i>${t('hold.start')}`)}${seg('ed-holdtype', 'hold', ed.holdType, t('hold.hold'))}${seg('ed-holdtype', 'top', ed.holdType, `<i class="lg-top">${t('hold.topSymbol')}</i>${t('hold.top')}`)}</div></div>
        <div class="tool-row"><span class="label">${t('s.outline')}</span><div class="seg">
          ${seg('ed-mode', 'auto', ed.mode, t('s.auto'))}${seg('ed-mode', 'circle', ed.mode, t('s.circle'))}</div></div>
        ${ed.mode === 'auto'
          ? `<label class="tool-row"><span class="label">${t('s.sensitivity')}</span><input type="range" min="10" max="60" step="2" value="${ed.tolerance}" data-change="ed-tol"></label>`
          : ''}
        <label class="tool-row"><span class="label">${t('s.circleSize')}</span><input type="range" min="0.015" max="0.1" step="0.005" value="${ed.circleR}" data-change="ed-circle"></label>
      </section>
      <div class="zoom-bar">${[1, 2, 3].map((z) => `<button class="${ed.zoom === z ? 'on' : ''}" data-action="ed-zoom" data-id="${z}">${z}×</button>`).join('')}
        <span class="grow"></span>
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
        <div class="kv"><span>${t('s.holds')}</span><b>${t('s.holdsSummary', { n: ed.holds.length, s: starts, t: tops })}</b></div>
        <div class="kv"><span>${t('s.pointsPerSend')}</span><b>${pointsFor(ed.color, ed.subGrade)}</b></div>
        ${ed.error ? `<p class="notice">${t(ed.error)}</p>` : ''}
        <button class="btn primary block" data-action="save-boulder" ${photo ? '' : 'disabled'}>${t(editing ? 's.save' : 's.publish')}</button>
      </section>

      ${feedbackCard()}

      <section class="card">
        <h3>${t('s.onWall', { n: onWall.length })}</h3>
        ${onWall.map((b) => `<div class="row plain">${thumb(b, 48)}<div class="mid">${gradePill(b.color, b.subGrade)}<div>${tagList(b.tags)}</div></div>
          <button class="btn small" data-action="edit-boulder" data-id="${b.id}">${t('s.edit')}</button>
          <button class="btn small ghost" data-action="archive-boulder" data-id="${b.id}">${t('s.archive')}</button></div>`).join('') || `<p class="muted small">${t('s.noBoulders')}</p>`}
      </section>`;
  }

  function render() {
    const root = document.getElementById('app');
    if (!state.currentUserId || !me()) {
      root.innerHTML = loginView();
      document.body.classList.remove('modal-open');
      return;
    }
    const views = { boulders: bouldersView, ranking: rankingView, profile: profileView, set: setterView };
    const oldSheet = document.querySelector('.sheet');
    const sheetScroll = oldSheet && ui.lastModalId === ui.boulderId ? oldSheet.scrollTop : 0;
    const oldZoom = document.querySelector('.zoombox');
    const zoomScroll = oldZoom ? [oldZoom.scrollLeft, oldZoom.scrollTop] : null;
    root.innerHTML = header() + `<main>${views[ui.tab]()}</main>` + tabs()
      + (ui.boulderId ? boulderModal() : ui.quickId ? quickSheet() : '');
    const sheet = document.querySelector('.sheet');
    if (sheet) sheet.scrollTop = sheetScroll;
    const zoom = document.querySelector('.zoombox');
    if (zoom && zoomScroll) [zoom.scrollLeft, zoom.scrollTop] = zoomScroll;
    document.body.classList.toggle('modal-open', !!ui.boulderId);
    ui.lastModalId = ui.boulderId;
    ui.lastQuickId = ui.quickId;
  }

  // ---------- Actions ----------
  function upsertVote(boulderId, patch) {
    const b = state.boulders.find((x) => x.id === boulderId);
    let v = myVote(b);
    if (!v) {
      v = { userId: state.currentUserId, boulderId, subGrade: b.subGrade };
      state.votes.push(v);
    }
    Object.assign(v, patch);
  }

  function placeHold(e, el) {
    const ed = ui.editor;
    const photo = currentPhoto(ed.sectorId);
    if (!photo || ed.busy) return false;
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
        if (pts && pts.length >= 3) {
          ed.holds.push({ type, pts });
          ed.notice = '';
        } else {
          ed.holds.push(circle);
          ed.notice = 's.notDetected';
        }
      })
      .catch(() => {
        ed.holds.push(circle);
        ed.notice = 's.noDetector';
      })
      .finally(() => { ed.busy = false; render(); });
  }

  const actions = {
    'tab': (id) => { ui.tab = id; ui.boulderId = null; ui.quickId = null; ui.votePromptId = null; window.scrollTo(0, 0); },
    'select-sector': (id) => { ui.sectorId = ui.sectorId === id ? null : id; ui.quickId = null; },
    'toggle-color': (id) => { ui.colors.has(id) ? ui.colors.delete(id) : ui.colors.add(id); },
    'open-boulder': (id) => { ui.boulderId = id; ui.quickId = null; },
    'quick-boulder': (id) => {
      if (isSetter()) { ui.boulderId = id; return; }
      ui.quickId = ui.quickId === id ? null : id;
      ui.votePromptId = null;
    },
    'close-quick': () => { ui.quickId = null; ui.votePromptId = null; },
    'vote-done': () => {
      if (ui.quickId === ui.votePromptId) ui.quickId = null;
      ui.votePromptId = null;
    },
    'close-modal': (id, e, el) => {
      if (el.classList.contains('modal') && e.target !== el) return false;
      ui.boulderId = null;
      ui.votePromptId = null;
    },
    'toggle-send': (id) => {
      const uid = state.currentUserId;
      if (state.sends.some((s) => s.boulderId === id && s.userId === uid)) {
        state.sends = state.sends.filter((s) => !(s.boulderId === id && s.userId === uid));
        state.votes = state.votes.filter((v) => !(v.boulderId === id && v.userId === uid));
        if (ui.votePromptId === id) ui.votePromptId = null;
      } else {
        state.sends.push({ userId: uid, boulderId: id, date: Date.now(), flash: false });
        ui.votePromptId = id;
      }
      save();
    },
    'toggle-flash': (id) => {
      const send = state.sends.find((s) => s.boulderId === id && s.userId === state.currentUserId);
      if (send) {
        send.flash = !send.flash;
      } else {
        state.sends.push({ userId: state.currentUserId, boulderId: id, date: Date.now(), flash: true });
        ui.votePromptId = id;
      }
      save();
    },
    'toggle-like': (id) => {
      const uid = state.currentUserId;
      const liked = state.likes.some((l) => l.boulderId === id && l.userId === uid);
      state.likes = liked ? state.likes.filter((l) => !(l.boulderId === id && l.userId === uid))
        : [...state.likes, { userId: uid, boulderId: id }];
      save();
    },
    'vote-sub': (id, e, el) => { upsertVote(el.closest('[data-boulder]').dataset.boulder, { subGrade: Number(id) }); save(); },
    'post-comment': (id) => {
      const text = document.getElementById('comment-input').value.trim();
      if (!text) return false;
      state.comments.push({ id: 'c' + Date.now(), userId: state.currentUserId, boulderId: id, text, date: Date.now() });
      save();
    },
    'auth-mode': () => { ui.auth = { mode: ui.auth.mode === 'signup' ? 'login' : 'signup', error: '' }; },
    'auth-google': () => logIn('u_you'),
    'auth-demo-setter': () => logIn('u_lena'),
    'logout': () => {
      state.currentUserId = null;
      ui.boulderId = null;
      ui.editor = newEditor();
      save();
    },
    'reset-demo': () => {
      if (!confirm(t('p.resetConfirm'))) return false;
      localStorage.removeItem(STORAGE_KEY);
      const lang = state.lang;
      state = seedState();
      state.lang = lang;
      ui.tab = 'boulders';
      ui.editor = newEditor();
    },
    'apply-consensus': (id) => {
      const b = state.boulders.find((x) => x.id === id);
      b.subGrade = consensus(b).subGrade;
      save();
    },
    'edit-boulder': (id) => {
      const b = state.boulders.find((x) => x.id === id);
      ui.editor = {
        ...newEditor(b.sectorId), editingId: b.id, color: b.color, subGrade: b.subGrade, tags: [...b.tags],
        holds: JSON.parse(JSON.stringify(b.holds)), openedAt: b.openedAt, closesAt: b.closesAt || '', holdType: 'hold',
      };
      ui.tab = 'set';
      ui.boulderId = null;
      window.scrollTo(0, 0);
    },
    'cancel-edit': () => { ui.editor = newEditor(ui.editor.sectorId); },
    'ed-color': (id) => { ui.editor.color = id; },
    'ed-sub': (id) => { ui.editor.subGrade = Number(id); },
    'ed-tag': (id) => {
      const tags = ui.editor.tags;
      ui.editor.tags = tags.includes(id) ? tags.filter((x) => x !== id) : [...tags, id];
    },
    'ed-holdtype': (id) => { ui.editor.holdType = id; },
    'ed-mode': (id) => { ui.editor.mode = id; ui.editor.notice = ''; },
    'ed-zoom': (id) => { ui.editor.zoom = Number(id); },
    'ed-undo': () => { ui.editor.holds.pop(); ui.editor.notice = ''; },
    'ed-clear': () => { ui.editor.holds = []; ui.editor.notice = ''; },
    'remove-hold': (id) => { ui.editor.holds.splice(Number(id), 1); },
    'place-hold': (id, e, el) => placeHold(e, el),
    'save-boulder': () => {
      const ed = ui.editor;
      const photo = currentPhoto(ed.sectorId);
      if (!photo) return false;
      if (!ed.holds.some((h) => h.type === 'start') || !ed.holds.some((h) => h.type === 'top')) {
        ed.error = 's.errStartTop';
        return;
      }
      if (ed.closesAt && ed.closesAt < ed.openedAt) {
        ed.error = 's.errDates';
        return;
      }
      const fields = {
        color: ed.color, subGrade: ed.subGrade, tags: [...ed.tags], holds: ed.holds,
        openedAt: ed.openedAt, closesAt: ed.closesAt,
      };
      if (ed.editingId) {
        Object.assign(state.boulders.find((b) => b.id === ed.editingId), fields);
      } else {
        state.boulders.push({ id: 'b' + Date.now(), photoId: photo.id, sectorId: ed.sectorId, setterId: state.currentUserId, ...fields });
      }
      ui.editor = { ...newEditor(ed.sectorId), zoom: ed.zoom, mode: ed.mode, tolerance: ed.tolerance, circleR: ed.circleR };
      save();
    },
    'archive-boulder': (id) => {
      state.boulders.find((x) => x.id === id).closesAt = isoDate(Date.now() - DAY);
      if (ui.editor.editingId === id) ui.editor = newEditor(ui.editor.sectorId);
      save();
    },
  };

  const changes = {
    'lang': (v) => { state.lang = v; setLang(v); save(); },
    'switch-user': (v) => {
      state.currentUserId = v;
      if (ui.tab === 'set' && !isSetter()) ui.tab = 'boulders';
      save();
    },
    'status': (v) => { ui.status = v; },
    'tag': (v) => { ui.tag = v; },
    'ed-sector': (v) => { ui.editor = { ...newEditor(v), mode: ui.editor.mode, zoom: ui.editor.zoom }; },
    'ed-tol': (v) => { ui.editor.tolerance = Number(v); },
    'ed-circle': (v) => { ui.editor.circleR = Number(v); },
    'ed-opened': (v) => { ui.editor.openedAt = v; },
    'ed-closes': (v) => { ui.editor.closesAt = v; },
    'ed-photo': (v, el) => { addWallPhoto(el.files[0]); return false; },
    'video-upload': (v, el) => {
      const file = el.files[0];
      if (!file || !file.type.startsWith('video/')) return false;
      (ui.videos[ui.boulderId] = ui.videos[ui.boulderId] || [])
        .push({ userId: state.currentUserId, url: URL.createObjectURL(file), setter: isSetter() });
    },
  };

  // Downscale the photo so it fits in browser storage.
  function addWallPhoto(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1400 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * k);
        canvas.height = Math.round(img.height * k);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const sectorId = ui.editor.sectorId;
        const old = currentPhoto(sectorId);
        if (old) {
          const yesterday = isoDate(Date.now() - DAY);
          state.boulders.filter((b) => b.photoId === old.id && isActive(b)).forEach((b) => { b.closesAt = yesterday; });
        }
        state.wallPhotos.push({
          id: 'p' + Date.now(), sectorId, src: canvas.toDataURL('image/jpeg', 0.85),
          w: canvas.width, h: canvas.height, crop: { top: 0, bottom: 1 }, createdAt: Date.now(),
        });
        ui.editor = { ...newEditor(sectorId), mode: ui.editor.mode };
        save();
        render();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const handler = actions[el.dataset.action];
    if (handler && handler(el.dataset.id, e, el) !== false) render();
  });

  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const handler = changes[el.dataset.change];
    if (handler && handler(el.value, el) !== false) render();
  });

  document.addEventListener('submit', (e) => {
    if (e.target.dataset.submit !== 'auth') return;
    e.preventDefault();
    submitAuth();
    render();
  });

  render();
})();
