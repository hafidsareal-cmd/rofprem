import { supabase }  from './db.js';
import { hashToken } from './crypto.js';

/* ── Admin ── */
export async function verifyAdmin(req) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) return false;
  const token = header.slice(7).trim();
  if (!token) return false;

  const { data } = await supabase
    .from('admin_sessions')
    .select('id, expires_at')
    .eq('token_hash', hashToken(token))
    .single();

  if (!data) return false;
  if (new Date(data.expires_at) < new Date()) {
    await supabase.from('admin_sessions').delete().eq('id', data.id);
    return false;
  }
  return true;
}

export function requireAdmin(handler) {
  return async (req, res) => {
    if (!(await verifyAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });
    return handler(req, res);
  };
}

/* ── User ── */
export async function verifyUser(req) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  const { data } = await supabase
    .from('user_sessions')
    .select('id, expires_at, user_id, users(id,email,premium_until,email_verified)')
    .eq('token_hash', hashToken(token))
    .single();

  if (!data) return null;
  if (new Date(data.expires_at) < new Date()) {
    await supabase.from('user_sessions').delete().eq('id', data.id);
    return null;
  }
  return data.users;
}

export function requireUser(handler) {
  return async (req, res) => {
    const user = await verifyUser(req);
    if (!user) return res.status(401).json({ error: 'Login required' });
    req.user = user;
    return handler(req, res);
  };
}
