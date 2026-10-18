import { supabase }                 from '../../db.js';
import { generateToken, hashToken } from '../../crypto.js';
import { checkRateLimit }           from '../../ratelimit.js';
import { audit }                    from '../../audit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`admin_login:${ip}`, 10, 900);
  if (rl.limited) return res.status(429).json({ error: 'Too many attempts.' });

  const { password } = req.body || {};
  if (!password || password !== process.env.ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Invalid password' });

  const token     = generateToken();
  const tokenHash = hashToken(token);

  await supabase.from('admin_sessions').insert({
    token_hash: tokenHash, ip_addr: ip,
  });

  // Cleanup old sessions
  await supabase.from('admin_sessions')
    .delete().lt('expires_at', new Date().toISOString());

  await audit('admin_login', 'admin', {}, ip);
  return res.status(200).json({ token });
}
