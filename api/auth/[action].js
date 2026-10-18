// Consolidated auth endpoints for Vercel Hobby function limits.
// Existing URLs remain compatible: /api/auth/login, /register, /verify, /me.
import login from '../../lib/handlers/auth/login.js';
import me from '../../lib/handlers/auth/me.js';
import register from '../../lib/handlers/auth/register.js';
import verify from '../../lib/handlers/auth/verify.js';
const routes = { login, me, register, verify };
export default async function handler(req, res) {
  const action = String(req.query?.action || '').toLowerCase();
  const route = routes[action];
  if (!route) return res.status(404).json({ error: 'Auth endpoint tidak ditemukan' });
  return route(req, res);
}