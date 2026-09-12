/* Public browser configuration. Use the anon key, never the service_role key. */
const SUPABASE_URL = 'https://jtfqkiwfyynysyqrvmjz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_TWB_R47PsejQ0gT8sce4-g_BdWX5H4R';

if (!window.supabase || SUPABASE_ANON_KEY === 'PEGA_AQUI_TU_ANON_KEY') {
  throw new Error('Configura la clave anon de Supabase en supabase-config.js.');
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getCurrentUser() {
  const { data: { user }, error } = await supabaseClient.auth.getUser();
  if (error && error.name !== 'AuthSessionMissingError') throw error;
  return user;
}

async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabaseClient
    .from('usuarios')
    .select('id, email, centro_estudios, curso, rango, email_verificado')
    .eq('email', user.email)
    .single();

  if (error) throw error;
  return data;
}

async function requireUser(redirect = 'iniciar_sesion.html') {
  const user = await getCurrentUser();
  if (!user) {
    window.location.replace(redirect);
    return null;
  }
  return user;
}

async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || profile.rango !== 'admin') {
    window.location.replace('inicio.html');
    return null;
  }
  return profile;
}

async function signOutAndRedirect() {
  await supabaseClient.auth.signOut();
  window.location.replace('iniciar_sesion.html');
}