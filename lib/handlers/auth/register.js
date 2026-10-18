import { supabase }              from '../../db.js';
import { hashPassword }          from '../../password.js';
import { generateVerifyToken }   from '../../crypto.js';
import { sendVerificationEmail } from '../../mailer.js';
import { audit }                 from '../../audit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const { email, password } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Email tidak valid' });
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'Password minimal 6 karakter' });

  const emailLower = email.trim().toLowerCase();

  // Check existing
  const { data: existing } = await supabase
    .from('users').select('id, email_verified').eq('email', emailLower).single();

  if (existing) {
    if (existing.email_verified) return res.status(400).json({ error: 'Email sudah terdaftar' });
    // Resend verification
    const token   = generateVerifyToken();
    const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    await supabase.from('users').update({
      verify_token: token, verify_expires: expires,
      password_hash: await hashPassword(password),
    }).eq('id', existing.id);
    await sendVerificationEmail(emailLower, token);
    return res.status(200).json({ message: 'Email verifikasi dikirim ulang. Cek inbox kamu.' });
  }

  const passwordHash = await hashPassword(password);
  const token        = generateVerifyToken();
  const expires      = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  const { error } = await supabase.from('users').insert({
    email:          emailLower,
    password_hash:  passwordHash,
    verify_token:   token,
    verify_expires: expires,
  });

  if (error) return res.status(500).json({ error: 'Gagal membuat akun: ' + error.message });

  await sendVerificationEmail(emailLower, token);
  await audit('register', emailLower, {}, ip);

  return res.status(201).json({ message: 'Akun dibuat. Cek email kamu untuk verifikasi.' });
}
