import { supabase } from '../../db.js';
import { sendWelcomeEmail } from '../../mailer.js';
import { checkRateLimit } from '../../ratelimit.js';
import { audit } from '../../audit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`verify_email:${ip}`, 10, 900);
  if (rl.limited) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan kode. Coba lagi dalam 15 menit.' });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email tidak valid.' });
  }
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Kode verifikasi harus 6 angka.' });
  }

  try {
    const { data: user, error: lookupError } = await supabase
      .from('users')
      .select('id, email, verify_expires, email_verified')
      .eq('email', email)
      .eq('verify_token', code)
      .maybeSingle();

    if (lookupError) {
      console.error('Email verification lookup failed:', lookupError.message);
      return res.status(500).json({ error: 'Gagal memeriksa kode. Coba lagi beberapa saat.' });
    }
    if (!user) {
      return res.status(400).json({ error: 'Kode salah atau tidak cocok dengan email tersebut.' });
    }
    if (user.email_verified) {
      return res.status(200).json({ message: 'Email sudah terverifikasi. Silakan login.' });
    }
    if (!user.verify_expires || new Date(user.verify_expires).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Kode sudah kadaluarsa. Daftar ulang dengan email yang sama untuk mendapatkan kode baru.' });
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ email_verified: true, verify_token: null, verify_expires: null })
      .eq('id', user.id);

    if (updateError) {
      console.error('Email verification update failed:', updateError.message);
      return res.status(500).json({ error: 'Kode benar, tetapi status verifikasi gagal disimpan.' });
    }

    await sendWelcomeEmail(user.email).catch(() => {});
    await audit('verify_email', user.email, {});
    return res.status(200).json({ message: 'Email berhasil diverifikasi! Silakan login.' });
  } catch (error) {
    console.error('Email verification error:', error?.message || error);
    return res.status(500).json({ error: 'Terjadi kesalahan server saat verifikasi.' });
  }
}
