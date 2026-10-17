/**
 * POST /api/activate
 * Body: { code: string }
 * Requires: user Bearer token
 *
 * FIX: Uses plaintext code lookup (no hash) — eliminates mismatch bug.
 * Atomic update: WHERE status='available' prevents double-use.
 */
import { supabase }      from '../lib/db.js';
import { normalizeCode } from '../lib/crypto.js';
import { requireUser }   from '../lib/auth.js';
import { checkRateLimit } from '../lib/ratelimit.js';
import { audit }         from '../lib/audit.js';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`activate:${req.user.id}`, 10, 900);
  if (rl.limited) return res.status(429).json({ error: 'Terlalu banyak percobaan. Tunggu 15 menit.' });

  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Kode aktivasi wajib diisi' });

  // Normalize: strip spaces/dashes, uppercase, re-format XXXX-XXXX-XXXX-XXXX
  const normalized = normalizeCode(code);
  if (!normalized) return res.status(400).json({ error: 'Format kode tidak valid (harus 16 karakter)' });

  // Auto-expire stale codes first
  await supabase.rpc('expire_codes').catch(() => {});

  const now       = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // ATOMIC: only updates if status = 'available'
  // Direct plaintext match — no hash involved
  const { data, error } = await supabase
    .from('activation_codes')
    .update({
      status:        'used',
      activated_at:  now.toISOString(),
      expires_at:    expiresAt.toISOString(),
      used_by:       req.user.id,
      used_by_email: req.user.email,
    })
    .eq('code', normalized)
    .eq('status', 'available')
    .select('id, expires_at')
    .single();

  if (error || !data) {
    // Find out why
    const { data: ex } = await supabase
      .from('activation_codes')
      .select('status')
      .eq('code', normalized)
      .single();

    if (!ex) return res.status(400).json({ error: 'Kode tidak valid' });

    const msgs = {
      used:    'Kode sudah pernah digunakan oleh akun lain',
      expired: 'Kode sudah kedaluwarsa',
      revoked: 'Kode telah dicabut oleh admin',
    };
    return res.status(400).json({ error: msgs[ex.status] || 'Kode tidak dapat digunakan' });
  }

  // Update user premium_until
  await supabase.from('users')
    .update({ premium_until: expiresAt.toISOString() })
    .eq('id', req.user.id);

  await audit('activate', req.user.email, { code_id: data.id }, ip);

  return res.status(200).json({
    success:    true,
    expires_at: data.expires_at,
    message:    'Aktivasi berhasil! Premium aktif 30 hari.',
  });
}

export default requireUser(handler);
