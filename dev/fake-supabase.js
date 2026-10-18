// DEV ONLY: in-memory stand-in for supabase-js, used to smoke-test the UI without a real project.
(() => {
  const now = Date.now();
  const DAY = 864e5;
  const iso = (ms) => new Date(ms).toISOString();
  const day = (ms) => iso(ms).slice(0, 10);
  const uid = 'u1';
  const ell = (type, cx, cy, rx, ry) => ({ type, pts: Array.from({ length: 12 }, (_, k) => {
    const a = (k / 12) * 2 * Math.PI;
    return [+(cx + rx * Math.cos(a)).toFixed(4), +(cy + ry * Math.sin(a)).toFixed(4)];
  }) });
  const T = {
    profiles: [
      { id: 'u1', name: 'Antoine', role: 'admin', lang: 'en', hide_from_ranking: false, onboarded: false, last_seen_new_at: iso(now - 5 * DAY), created_at: iso(now - 40 * DAY), email: 'antoine@example.com' },
      { id: 'u2', name: 'Mia', role: 'climber', lang: 'de', hide_from_ranking: false, onboarded: true, last_seen_new_at: iso(now), created_at: iso(now - 20 * DAY), email: 'mia@example.com' },
      { id: 'u3', name: 'Lena', role: 'setter', lang: 'de', hide_from_ranking: false, onboarded: true, last_seen_new_at: iso(now), created_at: iso(now - 90 * DAY), email: 'lena@example.com' },
    ],
    wall_photos: [
      { id: 'p1', sector_id: 'welle', part: 1, path: 'p1', w: 1080, h: 2376, retired: false, created_at: iso(now - 10 * DAY) },
      { id: 'p2', sector_id: 'welle', part: 2, path: 'p2', w: 1080, h: 2376, retired: false, created_at: iso(now - 3 * DAY) },
    ],
    boulders: [
      { id: 'b1', photo_id: 'p1', sector_id: 'welle', color: 'blue', sub_grade: 2, tags: ['Volumes'], holds: [ell('start', 0.29, 0.73, 0.1, 0.03), ell('top', 0.16, 0.41, 0.05, 0.03)], opened_at: day(now - 10 * DAY), closes_at: day(now + 50 * DAY), setter_id: 'u3', created_at: iso(now - 10 * DAY) },
      { id: 'b2', photo_id: 'p1', sector_id: 'welle', color: 'red', sub_grade: 3, tags: ['Crimps'], holds: [ell('start', 0.68, 0.74, 0.04, 0.01), ell('top', 0.27, 0.31, 0.03, 0.01)], opened_at: day(now - 10 * DAY), closes_at: day(now + 3 * DAY), setter_id: 'u3', created_at: iso(now - 10 * DAY) },
      { id: 'b3', photo_id: 'p2', sector_id: 'welle', color: 'pink', sub_grade: 1, tags: ['Dyno'], holds: [ell('start', 0.8, 0.51, 0.02, 0.01), ell('top', 0.59, 0.32, 0.07, 0.02)], opened_at: day(now - 2 * DAY), closes_at: null, setter_id: 'u3', created_at: iso(now - 2 * DAY) },
    ],
    sends: [
      { user_id: 'u2', boulder_id: 'b1', flash: true, created_at: iso(now - 8 * DAY) },
      { user_id: 'u2', boulder_id: 'b2', flash: false, created_at: iso(now - 6 * DAY) },
      { user_id: 'u1', boulder_id: 'b1', flash: false, created_at: iso(now - 40 * DAY) },
    ],
    votes: [{ user_id: 'u2', boulder_id: 'b1', sub_grade: 3 }],
    likes: [{ user_id: 'u2', boulder_id: 'b2' }],
    projects: [], comments: [{ id: 'c1', boulder_id: 'b2', user_id: 'u2', body: 'Heel hook on the left!', hidden: false, created_at: iso(now - DAY) }],
    videos: [], reports: [{ id: 'r1', target_type: 'comment', target_id: 'c1', reporter_id: 'u3', reason: 'test', resolved: false, created_at: iso(now) }],
    feedback: [{ id: 'f1', user_id: 'u2', type: 'idea', body: 'Dark mode is great', created_at: iso(now - DAY) }],
    seasons: [{ id: 's1', name: 'Autumn 2026', starts_on: day(now - 30 * DAY), ends_on: day(now + 60 * DAY) }],
    wall_plans: [{ id: 'w1', sector_id: 'welle', part: 2, planned_on: day(now + 5 * DAY), setter_id: 'u3', notes: 'More blues', done: false, created_at: iso(now) }],
  };
  const byId = (table, id) => T[table].find((r) => r.id === id);
  const role = new URLSearchParams(location.search).get('role');
  if (role) Object.assign(T.profiles[0], { role, onboarded: true });
  const enrich = (table, r) => {
    const x = { ...r };
    if (table === 'boulders' || table === 'wall_plans') x.setter = r.setter_id ? { name: byId('profiles', r.setter_id).name } : null;
    if (table === 'sends') { x.boulder = byId('boulders', r.boulder_id); const p = byId('profiles', r.user_id); x.who = { name: p.name, hide_from_ranking: p.hide_from_ranking, role: p.role }; }
    if (['comments', 'videos', 'feedback'].includes(table)) { const p = byId('profiles', r.user_id); x.author = p ? { name: p.name, role: p.role } : null; }
    return x;
  };
  const stats = () => T.boulders.map((b) => ({
    boulder_id: b.id,
    sends: T.sends.filter((s) => s.boulder_id === b.id).length,
    flashes: T.sends.filter((s) => s.boulder_id === b.id && s.flash).length,
    likes: T.likes.filter((s) => s.boulder_id === b.id).length,
    comments: T.comments.filter((s) => s.boulder_id === b.id && !s.hidden).length,
    vote_counts: [1, 2, 3, 4, 5].map((n) => T.votes.filter((v) => v.boulder_id === b.id && v.sub_grade === n).length),
  }));

  class Q {
    constructor(table) { this.table = table; this.filters = []; this.op = 'select'; }
    select(cols, opts) { if (this.op === 'select') this.opts = opts || {}; this.returning = true; return this; }
    eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
    in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this; }
    lte(c, v) { this.filters.push((r) => r[c] <= v); return this; }
    or() { return this; }
    order() { return this; }
    range() { return this; }
    limit() { return this; }
    single() { this.one = true; return this; }
    maybeSingle() { this.maybe = true; return this; }
    insert(row) { this.op = 'insert'; this.payload = row; return this; }
    update(p) { this.op = 'update'; this.payload = p; return this; }
    upsert(row) { this.op = 'upsert'; this.payload = row; return this; }
    delete() { this.op = 'delete'; return this; }
    exec() {
      const rows = this.table === 'boulder_stats' ? stats() : T[this.table];
      const match = (r) => this.filters.every((f) => f(r));
      if (this.op === 'insert' || this.op === 'upsert') {
        const row = { id: 'x' + Math.random().toString(36).slice(2), created_at: iso(Date.now()), hidden: false, resolved: false, retired: false, ...this.payload };
        if (this.op === 'upsert') {
          const keys = Object.keys(this.payload).filter((k) => k.endsWith('_id'));
          const i = rows.findIndex((r) => keys.every((k) => r[k] === this.payload[k]));
          if (i >= 0) { Object.assign(rows[i], this.payload); return { data: rows[i], error: null }; }
        }
        rows.push(row);
        return { data: this.one ? enrich(this.table, row) : [enrich(this.table, row)], error: null };
      }
      if (this.op === 'update') { const hit = rows.filter(match); hit.forEach((r) => Object.assign(r, this.payload)); return { data: this.one ? enrich(this.table, hit[0]) : hit, error: null }; }
      if (this.op === 'delete') { T[this.table] = rows.filter((r) => !match(r)); return { data: null, error: null }; }
      const out = rows.filter(match).map((r) => enrich(this.table, r));
      if (this.opts && this.opts.head) return { data: null, count: out.length, error: null };
      if (this.one) return out.length ? { data: out[0], error: null } : { data: null, error: { message: 'Row not found' } };
      if (this.maybe) return { data: out[0] || null, error: null };
      return { data: out, error: null };
    }
    then(res, rej) { return Promise.resolve().then(() => this.exec()).then(res, rej); }
  }

  const ranking = () => {
    const users = {};
    T.sends.forEach((s) => {
      const p = byId('profiles', s.user_id);
      if (p.role !== 'climber' || p.hide_from_ranking) return;
      const b = byId('boulders', s.boulder_id);
      const u = users[p.id] = users[p.id] || { user_id: p.id, name: p.name, points: 0, sends: 0, flashes: 0, per_color: [0, 0, 0, 0, 0, 0, 0] };
      u.points += sendPointsFor(b.color, b.sub_grade, s.flash); u.sends++; if (s.flash) u.flashes++;
      u.per_color[COLORS.findIndex((c) => c.id === b.color)]++;
    });
    return Object.values(users).sort((a, b) => b.points - a.points);
  };

  const listeners = [];
  window.supabase = {
    createClient: () => ({
      from: (t) => new Q(t),
      rpc: async (name, args) => {
        if (name === 'ranking') return { data: ranking(), error: null };
        if (name === 'admin_list_users') return { data: T.profiles.map((p) => ({ id: p.id, name: p.name, email: p.email, role: p.role })), error: null };
        if (name === 'set_role') { byId('profiles', args.p_user).role = args.p_role; return { data: null, error: null }; }
        return { data: null, error: null };
      },
      storage: { from: () => ({
        getPublicUrl: (path) => ({ data: { publicUrl: path === 'p2' ? '../photos/elys_exemple_section_2.jpg' : path === 'p1' ? '../photos/elys_exemple_section.jpg' : URL.createObjectURL(new Blob()) } }),
        upload: async () => ({ data: {}, error: null }),
      }) },
      auth: {
        getSession: async () => ({ data: { session: window.__fakeSignedOut ? null : { user: { id: uid } } }, error: null }),
        onAuthStateChange: (cb) => { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
        signOut: async () => { window.__fakeSignedOut = true; listeners.forEach((cb) => cb('SIGNED_OUT', null)); return { error: null }; },
        signInWithPassword: async () => { window.__fakeSignedOut = false; listeners.forEach((cb) => cb('SIGNED_IN', { user: { id: uid } })); return { data: {}, error: null }; },
        signUp: async () => ({ data: { session: null }, error: null }),
        resetPasswordForEmail: async () => ({ data: {}, error: null }),
      },
    }),
  };
})();
