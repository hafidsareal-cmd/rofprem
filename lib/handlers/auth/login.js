import { supabase }                 from '../../db.js';
import { verifyPassword }           from '../../password.js';
import { generateToken, hashToken } from '../../crypto.js';
import { checkRateLimit }           from '../../ratelimit.js';
import { audit }                    from '../../audit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`login_user:${ip}`, 10, 900);
  if (rl.limited) return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email dan password wajib diisi' });

  const emailLower = email.trim().toLowerCase();

  const { data: user } = await supabase
    .from('users')
    .select('id, email, password_hash, email_verified, premium_until')
    .eq('email', emailLower)
    .single();

  if (!user) return res.status(401).json({ error: 'Email atau password salah' });
  if (!user.email_verified) return res.status(401).json({ error: 'Email belum diverifikasi. Cek inbox kamu.' });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Email atau password salah' });

  // Create session token
  const token     = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

  await supabase.from('user_sessions').insert({
    user_id:    user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    ip_addr:    ip,
  });

  // Update last login
  await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', user.id);

  // Check premium status
  const premiumActive = user.premium_until && new Date(user.premium_until) > new Date();

  await audit('login', emailLower, {}, ip);

  return res.status(200).json({
    token,
    user: {
      id:            user.id,
      email:         user.email,
      premium:       premiumActive,
      premium_until: user.premium_until,
    },
  });
}
