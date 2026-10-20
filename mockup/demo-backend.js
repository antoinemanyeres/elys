// Demo backend for the mockup: an in-memory stand-in for Supabase, saved in this browser.
// The mockup runs the real app code (../app/js) on top of it, so it always shows the latest features.
(() => {
  const STORE_KEY = 'elys-demo-v2';
  const USER_KEY = 'elys-demo-user';
  const DAY = 864e5;
  const iso = (ms) => new Date(ms).toISOString();
  const day = (ms) => iso(ms).slice(0, 10);
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Math.random().toString(36).slice(2));

  // Demo photos are phone screenshots: the wall spans rows 333..1355 of a 768x1689 frame.
  const SRC = { 'demo/welle-1.jpg': '../photos/elys_exemple_section.jpg', 'demo/welle-2.jpg': '../photos/elys_exemple_section_2.jpg' };
  const CROP = { top: 333 / 1689, bottom: 1355 / 1689 };

  function seed() {
    const now = Date.now();
    let s = 42;
    const rand = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const profile = (id, name, role, extra = {}) => ({
      id, name, role, email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`, lang: 'en', hide_from_ranking: false,
      onboarded: true, last_seen_new_at: iso(now - 5 * DAY), created_at: iso(now - 200 * DAY), ...extra,
    });
    const profiles = [
      profile('u_you', 'You', 'climber', { onboarded: false }),
      profile('u_owner', 'Gym owner', 'owner'),
      profile('u_admin', 'Gym admin', 'admin'),
      profile('u_lena', 'Lena', 'setter'),
      profile('u_max', 'Max', 'setter'),
      ...['Alex', 'Sam', 'Jonas', 'Mia', 'Paul', 'Clara', 'Noah', 'Emma', 'Lukas', 'Sofia'].map((n) => profile('u_' + n.toLowerCase(), n, 'climber')),
    ];

    const wall_photos = [
      { id: 'p1', sector_id: 'welle', part: 1, path: 'demo/welle-1.jpg', w: 1080, h: 1438, retired: false, created_by: 'u_lena', created_at: iso(now - 120 * DAY) },
      { id: 'p2', sector_id: 'welle', part: 2, path: 'demo/welle-2.jpg', w: 1080, h: 1438, retired: false, created_by: 'u_max', created_at: iso(now - 3 * DAY) },
    ];

    // Hand-traced hold outlines approximated by ellipses (source pixels of the 768x1689 screenshots).
    const ell = (type, cx, cy, rx, ry, rot = 0) => {
      const a = (rot * Math.PI) / 180;
      const pts = [];
      for (let k = 0; k < 16; k++) {
        const t = (k / 16) * 2 * Math.PI;
        const ex = (rx + 4) * Math.cos(t), ey = (ry + 4) * Math.sin(t);
        pts.push([+((cx + ex * Math.cos(a) - ey * Math.sin(a)) / 768).toFixed(4), +((cy + ex * Math.sin(a) + ey * Math.cos(a) - 333) / 1022).toFixed(4)]);
      }
      return { type, pts };
    };
    const b = (id, photo, color, sub, tags, setter, openedAgo, holds, closedAgo = null) => ({
      id, photo_id: photo, sector_id: 'welle', color, sub_grade: sub, tags, holds, setter_id: setter,
      opened_at: day(now - openedAgo * DAY), closes_at: closedAgo === null ? day(now + 60 * DAY) : day(now - closedAgo * DAY),
      created_at: iso(now - openedAgo * DAY),
    });
    const H = {
      blue: [ell('start', 225, 1230, 85, 48, -5), ell('hold', 95, 1050, 58, 45, -15), ell('hold', 165, 978, 10, 10), ell('hold', 180, 742, 35, 55, -10), ell('top', 125, 690, 38, 55, -5)],
      orange: [ell('start', 328, 1133, 24, 24), ell('hold', 233, 805, 30, 38), ell('hold', 600, 812, 26, 20), ell('hold', 458, 572, 33, 30), ell('top', 680, 445, 55, 28, 8)],
      red: [ell('start', 520, 1243, 32, 15), ell('start', 430, 1147, 15, 10), ell('hold', 480, 968, 30, 28), ell('hold', 345, 795, 12, 16), ell('hold', 175, 833, 15, 12), ell('top', 205, 527, 26, 18)],
      black: [ell('start', 318, 950, 30, 125, 8), ell('hold', 562, 888, 26, 18), ell('hold', 482, 770, 10, 10), ell('top', 335, 668, 25, 100, 10)],
      teal: [ell('start', 715, 1060, 45, 55), ell('hold', 675, 720, 26, 90, 12), ell('top', 588, 468, 25, 78, 25)],
    };
    const boulders = [
      b('b1', 'p1', 'blue', 2, ['Volumes', 'Coordination'], 'u_lena', 17, H.blue),
      b('b2', 'p1', 'yellow', 3, ['Slopers', 'Volumes'], 'u_max', 17, H.orange),
      b('b3', 'p1', 'red', 3, ['Crimps', 'Balance'], 'u_lena', 17, H.red),
      b('b4', 'p1', 'black', 2, ['Volumes', 'Compression'], 'u_max', 17, H.black),
      b('b5', 'p1', 'green', 4, ['Slopers'], 'u_lena', 17, H.teal),
      b('b6', 'p2', 'green', 2, ['Volumes'], 'u_max', 3, [ell('start', 190, 1205, 45, 65, -15), ell('hold', 250, 845, 48, 75, 15), ell('hold', 210, 655, 45, 60, 10), ell('top', 150, 527, 38, 28, -15)]),
      b('b7', 'p2', 'white', 2, ['Balance', 'Heel hook'], 'u_lena', 3, [ell('start', 340, 1252, 22, 10), ell('start', 285, 1073, 16, 15), ell('hold', 380, 1075, 16, 22), ell('hold', 545, 982, 12, 11), ell('top', 395, 945, 15, 12)]),
      b('b8', 'p2', 'pink', 1, ['Crimps', 'Dyno'], 'u_max', 3, [ell('start', 612, 860, 7, 7), ell('start', 540, 857, 7, 7), ell('hold', 458, 840, 7, 7), ell('hold', 607, 640, 12, 20), ell('top', 452, 545, 55, 38)]),
      b('b9', 'p2', 'red', 4, ['Compression'], 'u_lena', 3, [ell('start', 405, 905, 75, 30, 28), ell('hold', 470, 630, 18, 15), ell('hold', 430, 710, 18, 15), ell('top', 715, 575, 24, 45)]),
      b('b10', 'p2', 'blue', 3, ['Pinches'], 'u_max', 3, [ell('start', 130, 1010, 65, 32, -20), ell('hold', 45, 925, 14, 16), ell('hold', 140, 742, 20, 15), ell('top', 25, 520, 22, 14)]),
      // Older boulders, already taken down: they feed the history, progression and season ranking.
      b('a1', 'p1', 'green', 3, ['Slab'], 'u_lena', 150, H.teal, 95),
      b('a2', 'p1', 'blue', 4, ['Crimps'], 'u_max', 150, H.blue, 95),
      b('a3', 'p1', 'yellow', 2, ['Pinches'], 'u_lena', 120, H.orange, 60),
      b('a4', 'p1', 'yellow', 5, ['Dyno'], 'u_max', 120, H.red, 60),
      b('a5', 'p1', 'red', 1, ['Volumes'], 'u_lena', 90, H.black, 30),
      b('a6', 'p1', 'red', 2, ['Overhang'], 'u_max', 60, H.blue, 18),
    ];

    const sends = [], votes = [], likes = [];
    profiles.filter((p) => p.role === 'climber').forEach((p) => {
      boulders.forEach((bl) => {
        const ci = COLORS.findIndex((c) => c.id === bl.color);
        if (rand() > 0.95 - ci * 0.13) return;
        const opened = new Date(bl.opened_at).getTime();
        const end = bl.closes_at < day(now) ? new Date(bl.closes_at).getTime() : now;
        sends.push({ user_id: p.id, boulder_id: bl.id, flash: rand() < 0.25, created_at: iso(opened + rand() * (end - opened)) });
        if (rand() < 0.7) {
          const bias = bl.id === 'b9' ? 2 : 0;
          votes.push({ user_id: p.id, boulder_id: bl.id, sub_grade: Math.max(1, Math.min(5, bl.sub_grade + bias + Math.round(rand() * 2 - 1))) });
        }
        if (rand() < 0.3) likes.push({ user_id: p.id, boulder_id: bl.id });
      });
    });

    return {
      profiles, wall_photos, boulders, sends, votes, likes,
      projects: [{ user_id: 'u_you', boulder_id: 'b8', created_at: iso(now - DAY) }],
      comments: [
        { id: 'c1', user_id: 'u_sam', boulder_id: 'b3', body: 'Heel hook on the left volume makes the crux much easier.', hidden: false, created_at: iso(now - 5 * DAY) },
        { id: 'c2', user_id: 'u_mia', boulder_id: 'b8', body: 'Dyno or static with a high left foot, both work.', hidden: false, created_at: iso(now - 2 * DAY) },
        { id: 'c3', user_id: 'u_alex', boulder_id: 'b8', body: 'Static is way harder than it looks!', hidden: false, created_at: iso(now - DAY) },
      ],
      videos: [{ id: 'v1', user_id: 'u_lena', boulder_id: 'b9', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', hidden: false, created_at: iso(now - 2 * DAY) }],
      reports: [{ id: 'r1', target_type: 'comment', target_id: 'c3', reporter_id: 'u_paul', reason: 'Spoiler', resolved: false, created_at: iso(now - DAY) }],
      feedback: [
        { id: 'f1', user_id: 'u_mia', type: 'idea', body: 'It would be great to filter the boulders I liked.', created_at: iso(now - 2 * DAY) },
        { id: 'f2', user_id: 'u_paul', type: 'bug', body: 'The map is a bit small on my phone.', created_at: iso(now - DAY) },
      ],
      seasons: [
        { id: 's2', name: 'Autumn 2026', starts_on: day(now - 50 * DAY), ends_on: day(now + 40 * DAY) },
        { id: 's1', name: 'Summer 2026', starts_on: day(now - 140 * DAY), ends_on: day(now - 51 * DAY) },
      ],
      wall_plans: [
        { id: 'w1', sector_id: 'welle', part: 1, planned_on: day(now + 5 * DAY), setter_id: 'u_lena', notes: 'More blue boulders', done: false, created_at: iso(now) },
        { id: 'w2', sector_id: 'nordwand', part: null, planned_on: day(now + 12 * DAY), setter_id: 'u_max', notes: '', done: false, created_at: iso(now) },
        { id: 'w3', sector_id: 'hafen', part: null, planned_on: day(now - 20 * DAY), setter_id: 'u_lena', notes: '', done: true, created_at: iso(now - 30 * DAY) },
      ],
      uploads: {},
    };
  }

  let T = JSON.parse(localStorage.getItem(STORE_KEY) || 'null') || seed();
  const persist = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(T)); } catch (e) { alert('Demo storage is full: use "Reset demo".'); }
  };
  persist();

  // Crop the demo screenshots once so their black bands are not part of the wall photo.
  const cropped = {};
  const ready = Promise.all(Object.entries(SRC).map(([path, src]) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const sy = CROP.top * img.naturalHeight, sh = (CROP.bottom - CROP.top) * img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = Math.round(sh);
      c.getContext('2d').drawImage(img, 0, sy, img.naturalWidth, sh, 0, 0, c.width, c.height);
      cropped[path] = c.toDataURL('image/jpeg', 0.9);
      resolve();
    };
    img.onerror = resolve;
    img.src = src;
  })));

  const PK = { sends: ['user_id', 'boulder_id'], votes: ['user_id', 'boulder_id'], likes: ['user_id', 'boulder_id'], projects: ['user_id', 'boulder_id'] };
  const DEFAULTS = { comments: { hidden: false }, videos: { hidden: false }, reports: { resolved: false }, wall_photos: { retired: false }, wall_plans: { done: false } };
  const byId = (table, id) => T[table].find((r) => r.id === id);
  const pick = (o, keys) => (o ? Object.fromEntries(keys.map((k) => [k, o[k]])) : null);

  function enrich(table, r) {
    const x = { ...r };
    if (table === 'boulders' || table === 'wall_plans') x.setter = pick(byId('profiles', r.setter_id), ['name']);
    if (table === 'sends') {
      x.who = pick(byId('profiles', r.user_id), ['name', 'hide_from_ranking']);
      x.boulder = pick(byId('boulders', r.boulder_id), ['id', 'color', 'sub_grade', 'sector_id', 'photo_id', 'opened_at', 'closes_at']);
    }
    if (['comments', 'videos', 'feedback'].includes(table)) x.author = pick(byId('profiles', r.user_id), ['name', 'role']);
    return x;
  }

  const stats = () => T.boulders.map((b) => ({
    boulder_id: b.id,
    sends: T.sends.filter((s) => s.boulder_id === b.id).length,
    flashes: T.sends.filter((s) => s.boulder_id === b.id && s.flash).length,
    likes: T.likes.filter((s) => s.boulder_id === b.id).length,
    comments: T.comments.filter((s) => s.boulder_id === b.id && !s.hidden).length,
    vote_counts: [1, 2, 3, 4, 5].map((n) => T.votes.filter((v) => v.boulder_id === b.id && v.sub_grade === n).length),
  }));

  function cascadeDeleteBoulders(ids) {
    ['sends', 'votes', 'likes', 'projects', 'comments', 'videos'].forEach((t) => { T[t] = T[t].filter((r) => !ids.includes(r.boulder_id)); });
  }

  class Query {
    constructor(table) { Object.assign(this, { table, filters: [], op: 'select', sorts: [], max: null, wantRows: false }); }
    select(cols, opts) { if (this.op === 'select') this.opts = opts || {}; else this.wantRows = true; return this; }
    eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
    neq(c, v) { this.filters.push((r) => r[c] !== v); return this; }
    in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this; }
    lt(c, v) { this.filters.push((r) => r[c] !== null && r[c] < v); return this; }
    lte(c, v) { this.filters.push((r) => r[c] <= v); return this; }
    // Only the pattern used by the app: "col.is.null,col.gte.value".
    or(expr) {
      const parts = expr.split(',').map((p) => p.split('.'));
      this.filters.push((r) => parts.some(([c, op, ...v]) => (op === 'is' ? r[c] === null : op === 'gte' ? r[c] >= v.join('.') : false)));
      return this;
    }
    order(c, opts = {}) { this.sorts.push([c, opts.ascending !== false]); return this; }
    range() { return this; }
    limit(n) { this.max = n; return this; }
    single() { this.one = true; return this; }
    maybeSingle() { this.maybe = true; return this; }
    insert(row) { this.op = 'insert'; this.payload = row; return this; }
    update(p) { this.op = 'update'; this.payload = p; return this; }
    upsert(row) { this.op = 'upsert'; this.payload = row; return this; }
    delete() { this.op = 'delete'; return this; }

    exec() {
      const match = (r) => this.filters.every((f) => f(r));
      const out = (rows) => {
        const data = rows.map((r) => enrich(this.table, r));
        if (this.one) return data.length ? { data: data[0], error: null } : { data: null, error: { message: 'Row not found' } };
        if (this.maybe) return { data: data[0] || null, error: null };
        return { data, error: null };
      };
      if (this.op === 'insert' || this.op === 'upsert') {
        const p = this.payload;
        const keys = PK[this.table];
        const existing = keys && T[this.table].find((r) => keys.every((k) => r[k] === p[k]));
        let row;
        if (existing) row = Object.assign(existing, p);
        else {
          row = { ...(keys ? {} : { id: uuid() }), created_at: iso(Date.now()), ...(DEFAULTS[this.table] || {}), ...p };
          T[this.table].push(row);
        }
        persist();
        return this.wantRows || this.one ? out([row]) : { data: null, error: null };
      }
      if (this.op === 'update') {
        const hit = T[this.table].filter(match);
        hit.forEach((r) => Object.assign(r, this.payload));
        persist();
        return this.wantRows || this.one ? out(hit) : { data: null, error: null };
      }
      if (this.op === 'delete') {
        const gone = T[this.table].filter(match);
        T[this.table] = T[this.table].filter((r) => !match(r));
        if (this.table === 'boulders') cascadeDeleteBoulders(gone.map((r) => r.id));
        persist();
        return { data: null, error: null };
      }
      let rows = (this.table === 'boulder_stats' ? stats() : T[this.table]).filter(match);
      if (this.opts && this.opts.head) return { data: null, count: rows.length, error: null };
      this.sorts.forEach(([c, asc]) => { rows = [...rows].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)); });
      if (this.max) rows = rows.slice(0, this.max);
      return out(rows);
    }
    then(res, rej) { return Promise.resolve().then(() => this.exec()).then(res, rej); }
  }

  function ranking(seasonId) {
    const today = day(Date.now());
    const season = T.seasons.find((s) => s.id === seasonId);
    const users = {};
    T.sends.forEach((s) => {
      const p = byId('profiles', s.user_id);
      const b = byId('boulders', s.boulder_id);
      if (!p || !b || p.role !== 'climber' || p.hide_from_ranking) return;
      const counts = season
        ? s.created_at.slice(0, 10) >= season.starts_on && s.created_at.slice(0, 10) <= season.ends_on
        : b.opened_at <= today && (!b.closes_at || b.closes_at >= today);
      if (!counts) return;
      const u = users[p.id] = users[p.id] || { user_id: p.id, name: p.name, points: 0, sends: 0, flashes: 0, per_color: [0, 0, 0, 0, 0, 0, 0] };
      u.points += sendPointsFor(b.color, b.sub_grade, s.flash);
      u.sends++;
      if (s.flash) u.flashes++;
      u.per_color[COLORS.findIndex((c) => c.id === b.color)]++;
    });
    return Object.values(users).sort((a, b) => b.points - a.points);
  }

  // ---------- Auth ----------
  const listeners = [];
  const emit = (event, session) => listeners.forEach((cb) => cb(event, session));
  const sessionFor = (id) => (id && byId('profiles', id) ? { user: { id } } : null);
  if (localStorage.getItem(USER_KEY) === null) localStorage.setItem(USER_KEY, 'u_you');
  const currentUser = () => localStorage.getItem(USER_KEY) || null;

  function createProfile(email, name) {
    const p = {
      id: uuid(), name: (name || email.split('@')[0]).slice(0, 30), email, role: 'climber', lang: currentLang || 'en',
      hide_from_ranking: false, onboarded: false, last_seen_new_at: iso(Date.now()), created_at: iso(Date.now()),
    };
    T.profiles.push(p);
    persist();
    return p;
  }

  function signInAs(id) {
    localStorage.setItem(USER_KEY, id);
    emit('SIGNED_IN', sessionFor(id));
  }

  window.ELYS_CONFIG = { supabaseUrl: 'https://demo.local', supabaseAnonKey: 'demo', googleLogin: false };

  window.supabase = {
    createClient: () => ({
      from: (table) => new Query(table),
      rpc: async (name, args = {}) => {
        const me = currentUser();
        if (name === 'ranking') return { data: ranking(args.p_season), error: null };
        if (name === 'admin_list_users') return { data: T.profiles.map((p) => pick(p, ['id', 'name', 'email', 'role', 'created_at'])), error: null };
        // Same rules as the protect_role trigger in supabase/schema.sql.
        if (name === 'set_role') {
          const actor = byId('profiles', me).role;
          const target = byId('profiles', args.p_user);
          const touched = [target.role, args.p_role];
          const error = touched.includes('owner') ? 'The owner role cannot be changed from the app'
            : touched.includes('admin') && actor !== 'owner' ? 'Only the owner can grant or remove the admin role'
              : !['admin', 'owner'].includes(actor) ? 'Only administrators can change roles' : null;
          if (error) return { data: null, error: { message: error } };
          target.role = args.p_role;
          persist();
          return { data: null, error: null };
        }
        if (name === 'delete_my_account') {
          if (byId('profiles', me).role === 'owner') return { data: null, error: { message: 'The owner account cannot be deleted' } };
          ['sends', 'votes', 'likes', 'projects', 'comments', 'videos'].forEach((t) => { T[t] = T[t].filter((r) => r.user_id !== me); });
          T.feedback.forEach((f) => { if (f.user_id === me) f.user_id = null; });
          T.profiles = T.profiles.filter((p) => p.id !== me);
          persist();
          return { data: null, error: null };
        }
        return { data: null, error: null };
      },
      storage: {
        from: () => ({
          getPublicUrl: (path) => ({ data: { publicUrl: cropped[path] || T.uploads[path] || SRC[path] || '' } }),
          upload: (path, blob) => new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => { T.uploads[path] = reader.result; persist(); resolve({ data: { path }, error: null }); };
            reader.readAsDataURL(blob);
          }),
        }),
      },
      auth: {
        getSession: async () => { await ready; return { data: { session: sessionFor(currentUser()) }, error: null }; },
        onAuthStateChange: (cb) => { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
        signInWithPassword: async ({ email }) => {
          const p = T.profiles.find((x) => x.email === email.toLowerCase()) || createProfile(email.toLowerCase());
          signInAs(p.id);
          return { data: { session: sessionFor(p.id) }, error: null };
        },
        signUp: async ({ email, options }) => {
          if (T.profiles.some((x) => x.email === email.toLowerCase())) return { data: null, error: { message: 'User already registered' } };
          const p = createProfile(email.toLowerCase(), options && options.data && options.data.name);
          signInAs(p.id);
          return { data: { session: sessionFor(p.id) }, error: null };
        },
        signInWithOAuth: async () => { signInAs('u_you'); return { data: {}, error: null }; },
        resetPasswordForEmail: async () => ({ data: {}, error: null }),
        updateUser: async () => ({ data: {}, error: null }),
        signOut: async () => { localStorage.setItem(USER_KEY, ''); emit('SIGNED_OUT', null); return { error: null }; },
      },
    }),
  };

  // Used by the demo bar of the mockup page.
  window.ElysDemo = {
    profiles: () => T.profiles.map((p) => pick(p, ['id', 'name', 'role'])),
    currentUser,
    switchUser: (id) => { localStorage.setItem(USER_KEY, id || ''); location.reload(); },
    reset: () => { localStorage.removeItem(STORE_KEY); localStorage.removeItem(USER_KEY); location.reload(); },
  };
})();
