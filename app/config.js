// Public Supabase settings (Dashboard > Project Settings > API).
// The anon/publishable key is meant to be public: the data is protected by the database rules (RLS).
// Never put the service_role key here.
window.ELYS_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabaseAnonKey: 'YOUR-ANON-PUBLIC-KEY',
  googleLogin: false,
};
