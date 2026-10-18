// Consolidated admin endpoints for Vercel Hobby function limits.
// Existing URLs remain compatible: /api/admin/codes, /generate, /login, etc.
import codes from '../../lib/handlers/admin/codes.js';
import remove from '../../lib/handlers/admin/delete.js';
import download from '../../lib/handlers/admin/download.js';
import generate from '../../lib/handlers/admin/generate.js';
import login from '../../lib/handlers/admin/login.js';
import revoke from '../../lib/handlers/admin/revoke.js';
import stats from '../../lib/handlers/admin/stats.js';
const routes = { codes, delete: remove, download, generate, login, revoke, stats };
export default async function handler(req, res) {
  const action = String(req.query?.action || '').toLowerCase();
  const route = routes[action];
  if (!route) return res.status(404).json({ error: 'Admin endpoint tidak ditemukan' });
  return route(req, res);
}