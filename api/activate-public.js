/**
 * POST /api/activate-public
 * Activates a single-use code and associates it with the supplied email.
 * The activation code acts as the secret; never expose Supabase service key.
 */
import { supabase } from '../lib/db.js';
import { normalizeCode } from '../lib/crypto.js';
import { checkRateLimit } from '../lib/ratelimit.js';
import { audit } from '../lib/audit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const rl = await checkRateLimit(`activate_public:${ip}`, 10, 900);
  if (rl.limited) return res.status(429).json({ error: 'Terlalu banyak percobaan. Tunggu 15 menit.' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = normalizeCode(req.body?.code);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email tidak valid.' });
  }
  if (!code) return res.status(400).json({ error: 'Format kode tidak valid (harus 16 karakter).' });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Atomic single-use claim: only an available code can be consumed.
  const { data, error } = await supabase
    .from('activation_codes')
    .update({
      status: 'used',
      activated_at: now.toISOString(),
      expires_at: expiresAt,
      used_by_email: email,
    })
    .eq('code', code)
    .eq('status', 'available')
    .select('id, expires_at')
    .maybeSingle();

  if (error) {
    console.error('Public activation database error:', error.message);
    return res.status(500).json({ error: 'Database aktivasi sedang bermasalah. Coba lagi nanti.' });
  }

  if (!data) {
    const { data: existing, error: lookupError } = await supabase
      .from('activation_codes')
      .select('status')
      .eq('code', code)
      .maybeSingle();

    if (lookupError) {
      console.error('Activation status lookup failed:', lookupError.message);
      return res.status(500).json({ error: 'Tidak dapat memeriksa kode saat ini.' });
    }
    if (!existing) return res.status(400).json({ error: 'Kode tidak valid.' });

    const messages = {
      used: 'Kode sudah pernah digunakan.',
      expired: 'Kode sudah kedaluwarsa.',
      revoked: 'Kode telah dicabut oleh admin.',
    };
    return res.status(400).json({ error: messages[existing.status] || 'Kode tidak dapat digunakan.' });
  }

  const { error: expireError } = await supabase.rpc('expire_codes');
  if (expireError) console.error('expire_codes failed after activation:', expireError.message);

  await audit('activate_public', email, { code_id: data.id }, ip);

  return res.status(200).json({
    success: true,
    expires_at: data.expires_at,
    message: 'Aktivasi berhasil! Premium aktif 30 hari.',
  });
}
