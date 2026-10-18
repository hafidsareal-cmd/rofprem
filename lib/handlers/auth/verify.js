import { supabase }          from '../../db.js';
import { sendWelcomeEmail }  from '../../mailer.js';
import { audit }             from '../../audit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Token required' });

  const { data: user } = await supabase
    .from('users')
    .select('id, email, verify_expires, email_verified')
    .eq('verify_token', token)
    .single();

  if (!user) return res.status(400).json({ error: 'Token tidak valid' });
  if (user.email_verified) return res.status(200).json({ message: 'Email sudah terverifikasi sebelumnya.' });
  if (new Date(user.verify_expires) < new Date())
    return res.status(400).json({ error: 'Token kadaluarsa. Daftar ulang untuk mendapat link baru.' });

  await supabase.from('users').update({
    email_verified: true,
    verify_token:   null,
    verify_expires: null,
  }).eq('id', user.id);

  await sendWelcomeEmail(user.email).catch(() => {});
  await audit('verify_email', user.email, {});

  return res.status(200).json({ message: 'Email berhasil diverifikasi! Silakan login.' });
}
