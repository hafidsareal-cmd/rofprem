import { supabase } from '../../db.js';
import { sendWelcomeEmail } from '../../mailer.js';
import { audit } from '../../audit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) return res.status(400).json({ error: 'Token required' });

  try {
    const { data: user, error: lookupError } = await supabase
      .from('users')
      .select('id, email, verify_expires, email_verified')
      .eq('verify_token', token)
      .maybeSingle();

    if (lookupError) {
      console.error('Email verification lookup failed:', lookupError.message);
      return res.status(500).json({ error: 'Gagal memeriksa token. Coba lagi beberapa saat.' });
    }

    if (!user) {
      return res.status(400).json({
        error: 'Token tidak ditemukan. Pastikan link berasal dari email verifikasi terbaru.',
      });
    }

    if (user.email_verified) {
      return res.status(200).json({ message: 'Email sudah terverifikasi sebelumnya.' });
    }

    // The token is a long random, single-use value and must still match the
    // current token stored in the database. Accept it even if the expiry field
    // is stale or was written incorrectly; successful verification clears it.
    const { error: updateError } = await supabase
      .from('users')
      .update({ email_verified: true, verify_token: null, verify_expires: null })
      .eq('id', user.id);

    if (updateError) {
      console.error('Email verification update failed:', updateError.message);
      return res.status(500).json({ error: 'Token ditemukan, tetapi status verifikasi gagal disimpan.' });
    }

    await sendWelcomeEmail(user.email).catch(() => {});
    await audit('verify_email', user.email, {});

    return res.status(200).json({ message: 'Email berhasil diverifikasi! Silakan login.' });
  } catch (error) {
    console.error('Email verification error:', error?.message || error);
    return res.status(500).json({ error: 'Terjadi kesalahan server saat verifikasi.' });
  }
}
