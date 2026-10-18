// Thin data layer over Supabase. Every function throws on error so the UI can show a message.
const Api = (() => {
  const cfg = window.ELYS_CONFIG;
  const configured = !/YOUR-/.test(cfg.supabaseUrl + cfg.supabaseAnonKey);
  const db = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  const today = () => new Date().toISOString().slice(0, 10);

  const check = ({ data, error, count }) => {
    if (error) throw error;
    return count !== undefined && count !== null && data === null ? count : data;
  };

  // PostgREST returns at most 1000 rows per request.
  async function fetchAll(build) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = check(await build().range(from, from + 999));
      out.push(...rows);
      if (rows.length < 1000) return out;
    }
  }

  const appUrl = () => `${location.origin}${location.pathname}`;

  return {
    configured,
    publicUrl: (path) => db.storage.from('walls').getPublicUrl(path).data.publicUrl,

    // ---------- Auth ----------
    session: async () => check(await db.auth.getSession()).session,
    onAuth: (cb) => db.auth.onAuthStateChange(cb),
    signUp: async (email, password, name, lang) => check(await db.auth.signUp({
      email, password, options: { data: { name, lang, terms: 'true' }, emailRedirectTo: appUrl() },
    })),
    signIn: async (email, password) => check(await db.auth.signInWithPassword({ email, password })),
    signInGoogle: async () => check(await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } })),
    resetPassword: async (email) => check(await db.auth.resetPasswordForEmail(email, { redirectTo: appUrl() })),
    updatePassword: async (password) => check(await db.auth.updateUser({ password })),
    signOut: async () => check(await db.auth.signOut()),

    // ---------- Profile ----------
    profile: async (id) => check(await db.from('profiles').select('*').eq('id', id).single()),
    updateProfile: async (id, patch) => check(await db.from('profiles').update(patch).eq('id', id)),
    staff: async () => check(await db.from('profiles').select('id, name, role').in('role', ['setter', 'admin']).order('name')),
    deleteMyAccount: async () => check(await db.rpc('delete_my_account')),
    adminUsers: async () => check(await db.rpc('admin_list_users')),
    setRole: async (userId, role) => check(await db.rpc('set_role', { p_user: userId, p_role: role })),

    // ---------- Walls and boulders ----------
    photos: async () => fetchAll(() => db.from('wall_photos').select('*').order('created_at')),
    addPhoto: async (sectorId, part, blob, w, h, userId) => {
      const path = `${sectorId}/${crypto.randomUUID()}.jpg`;
      check(await db.storage.from('walls').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' }));
      return check(await db.from('wall_photos').insert({ sector_id: sectorId, part, path, w, h, created_by: userId }).select().single());
    },
    retirePhoto: async (id) => check(await db.from('wall_photos').update({ retired: true }).eq('id', id)),
    activeBoulders: async () => fetchAll(() => db.from('boulders').select('*, setter:profiles(name)')
      .lte('opened_at', today()).or(`closes_at.is.null,closes_at.gte.${today()}`).order('created_at')),
    boulder: async (id) => check(await db.from('boulders').select('*, setter:profiles(name)').eq('id', id).maybeSingle()),
    saveBoulder: async (id, fields) => (id
      ? check(await db.from('boulders').update(fields).eq('id', id).select('*, setter:profiles(name)').single())
      : check(await db.from('boulders').insert(fields).select('*, setter:profiles(name)').single())),
    archiveBoulders: async (ids, date) => check(await db.from('boulders').update({ closes_at: date }).in('id', ids)),
    deleteBoulder: async (id) => check(await db.from('boulders').delete().eq('id', id)),
    stats: async (ids) => {
      const out = [];
      for (let i = 0; i < ids.length; i += 100) {
        out.push(...check(await db.from('boulder_stats').select('*').in('boulder_id', ids.slice(i, i + 100))));
      }
      return out;
    },

    // ---------- Personal climbing data ----------
    mySends: async (uid) => fetchAll(() => db.from('sends')
      .select('boulder_id, flash, created_at, boulder:boulders(id, color, sub_grade, sector_id, photo_id, opened_at, closes_at)')
      .eq('user_id', uid).order('created_at')),
    myVotes: async (uid) => fetchAll(() => db.from('votes').select('boulder_id, sub_grade').eq('user_id', uid)),
    myLikes: async (uid) => fetchAll(() => db.from('likes').select('boulder_id').eq('user_id', uid)),
    myProjects: async (uid) => fetchAll(() => db.from('projects').select('boulder_id, created_at').eq('user_id', uid)),
    myCommentCount: async (uid) => check(await db.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', uid)),
    setSend: async (uid, boulderId, flash) => check(await db.from('sends').upsert({ user_id: uid, boulder_id: boulderId, flash })),
    removeSend: async (uid, boulderId) => {
      check(await db.from('votes').delete().eq('user_id', uid).eq('boulder_id', boulderId));
      check(await db.from('sends').delete().eq('user_id', uid).eq('boulder_id', boulderId));
    },
    setVote: async (uid, boulderId, subGrade) => check(await db.from('votes').upsert({ user_id: uid, boulder_id: boulderId, sub_grade: subGrade })),
    setLike: async (uid, boulderId, on) => check(on
      ? await db.from('likes').upsert({ user_id: uid, boulder_id: boulderId })
      : await db.from('likes').delete().eq('user_id', uid).eq('boulder_id', boulderId)),
    setProject: async (uid, boulderId, on) => check(on
      ? await db.from('projects').upsert({ user_id: uid, boulder_id: boulderId })
      : await db.from('projects').delete().eq('user_id', uid).eq('boulder_id', boulderId)),

    // ---------- Boulder details ----------
    repeats: async (boulderId) => check(await db.from('sends')
      .select('user_id, flash, created_at, who:profiles(name, hide_from_ranking)')
      .eq('boulder_id', boulderId).order('created_at', { ascending: false }).limit(50)),
    comments: async (boulderId) => check(await db.from('comments')
      .select('*, author:profiles(name)').eq('boulder_id', boulderId).order('created_at')),
    addComment: async (uid, boulderId, body) => check(await db.from('comments').insert({ user_id: uid, boulder_id: boulderId, body })),
    videos: async (boulderId) => check(await db.from('videos')
      .select('*, author:profiles(name, role)').eq('boulder_id', boulderId).order('created_at')),
    addVideo: async (uid, boulderId, url) => check(await db.from('videos').insert({ user_id: uid, boulder_id: boulderId, url })),
    deleteContent: async (type, id) => check(await db.from(type === 'video' ? 'videos' : 'comments').delete().eq('id', id)),
    hideContent: async (type, id) => check(await db.from(type === 'video' ? 'videos' : 'comments').update({ hidden: true }).eq('id', id)),

    // ---------- Moderation and feedback ----------
    report: async (uid, type, id, reason) => check(await db.from('reports').insert({ reporter_id: uid, target_type: type, target_id: id, reason })),
    openReports: async () => {
      const reports = check(await db.from('reports').select('*').eq('resolved', false).order('created_at'));
      const ids = (type) => reports.filter((r) => r.target_type === type).map((r) => r.target_id);
      const comments = ids('comment').length ? check(await db.from('comments').select('*, author:profiles(name)').in('id', ids('comment'))) : [];
      const videos = ids('video').length ? check(await db.from('videos').select('*, author:profiles(name)').in('id', ids('video'))) : [];
      const targets = new Map([...comments, ...videos].map((x) => [x.id, x]));
      return reports.map((r) => ({ ...r, target: targets.get(r.target_id) || null }));
    },
    resolveReport: async (id) => check(await db.from('reports').update({ resolved: true }).eq('id', id)),
    sendFeedback: async (uid, type, body) => check(await db.from('feedback').insert({ user_id: uid, type, body })),
    feedback: async () => check(await db.from('feedback').select('*, author:profiles(name)').order('created_at', { ascending: false }).limit(100)),

    // ---------- Rankings and seasons ----------
    ranking: async (seasonId) => check(await db.rpc('ranking', { p_season: seasonId || null })),
    seasons: async () => check(await db.from('seasons').select('*').order('starts_on', { ascending: false })),
    addSeason: async (fields) => check(await db.from('seasons').insert(fields)),
    deleteSeason: async (id) => check(await db.from('seasons').delete().eq('id', id)),

    // ---------- Wall reset planning ----------
    plans: async () => check(await db.from('wall_plans').select('*, setter:profiles(name)').order('planned_on')),
    savePlan: async (id, fields) => check(id
      ? await db.from('wall_plans').update(fields).eq('id', id)
      : await db.from('wall_plans').insert(fields)),
    deletePlan: async (id) => check(await db.from('wall_plans').delete().eq('id', id)),

    // ---------- Personal data export ----------
    exportMyData: async (uid) => ({
      exported_at: new Date().toISOString(),
      profile: check(await db.from('profiles').select('*').eq('id', uid).single()),
      sends: check(await db.from('sends').select('*').eq('user_id', uid)),
      votes: check(await db.from('votes').select('*').eq('user_id', uid)),
      likes: check(await db.from('likes').select('*').eq('user_id', uid)),
      projects: check(await db.from('projects').select('*').eq('user_id', uid)),
      comments: check(await db.from('comments').select('*').eq('user_id', uid)),
      videos: check(await db.from('videos').select('*').eq('user_id', uid)),
      feedback: check(await db.from('feedback').select('*').eq('user_id', uid)),
    }),
  };
})();
