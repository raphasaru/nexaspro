const SUPABASE_URL = 'https://aeepepbqhdvatkmjuoyh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZXBlcGJxaGR2YXRrbWp1b3loIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE1NTI2MDYsImV4cCI6MjA0NzEyODYwNn0.FcHYzLrFSVHxzEBFAtRRhthVDdljr8IcvbmaYkeu3rY';

let _supabaseClient = null;

function getSupabaseClient() {
  if (!_supabaseClient) {
    _supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabaseClient;
}

// Get current session token (from supabase-js managed storage)
async function getAccessToken() {
  const sb = getSupabaseClient();
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token || SUPABASE_ANON_KEY;
}

// REST API helper with optional auth token
async function supabaseRest(path, options = {}) {
  const token = await getAccessToken();
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (options.prefer) headers['Prefer'] = options.prefer;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// RPC call helper
async function supabaseRpc(fnName, params = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`RPC ${fnName} failed: ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Auth guard — redirects to login if no session. Returns session if valid.
async function requireAuth() {
  const sb = getSupabaseClient();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = 'admin-login.html';
    return null;
  }
  // Listen for token refresh
  sb.auth.onAuthStateChange((event, session) => {
    if (!session) window.location.href = 'admin-login.html';
  });
  return session;
}

// Logout
async function logout() {
  const sb = getSupabaseClient();
  await sb.auth.signOut();
  window.location.href = 'admin-login.html';
}
