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
  if (!profile || !['admin', 'op'].includes(profile.rango)) {
    window.location.replace('inicio.html');
    return null;
  }
  return profile;
}

async function signOutAndRedirect() {
  await supabaseClient.auth.signOut();
  window.location.replace('iniciar_sesion.html');
}

function resolveStorageUrl(filePath) {
  if (!filePath) return '';
  if (/^https?:\/\//i.test(filePath)) return filePath;
  if (filePath.startsWith('/')) return filePath;

  const normalized = String(filePath).replace(/^\/+/, '').split('/').map(part => encodeURIComponent(part)).join('/');
  return `${SUPABASE_URL}/storage/v1/object/public/archivos/${normalized}`;
}

async function getSignedStorageUrl(filePath, expiresInSeconds = 3600) {
  if (!filePath) return '';
  if (/^https?:\/\//i.test(filePath)) return filePath;
  if (filePath.startsWith('/')) return filePath;

  try {
    const { data, error } = await supabaseClient.storage.from('archivos').createSignedUrl(filePath, expiresInSeconds);
    if (error || !data?.signedUrl) return resolveStorageUrl(filePath);
    return data.signedUrl;
  } catch (error) {
    return resolveStorageUrl(filePath);
  }
}

async function startPresenceTracking() {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    const presenceChannel = supabaseClient.channel('usuarios-online', {
      config: { presence: { key: user.id } }
    });

    presenceChannel.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({ email: user.email });
      }
    });

    return presenceChannel;
  } catch (error) {
    console.warn('No se pudo iniciar la presencia en línea.', error);
    return null;
  }
}

startPresenceTracking();