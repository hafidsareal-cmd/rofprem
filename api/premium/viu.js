/**
 * POST /api/premium/viu
 * Only provisions for an email with an active, server-recorded activation.
 */
import { supabase } from '../../lib/db.js';
import { checkRateLimit } from '../../lib/ratelimit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email sesi tidak valid.' });

  const rl = await checkRateLimit('viu:' + ip, 3, 3600);
  if (rl.limited) return res.status(429).json({ error: 'Batas permintaan Viu tercapai. Coba lagi nanti.' });

  const { data: activation, error } = await supabase.from('activation_codes')
    .select('id').eq('used_by_email', email).eq('status', 'used')
    .gt('expires_at', new Date().toISOString()).limit(1).maybeSingle();
  if (error) {
    console.error('Viu activation lookup failed:', error.message);
    return res.status(500).json({ error: 'Pemeriksaan akses gagal. Coba lagi nanti.' });
  }
  if (!activation) return res.status(403).json({ error: 'Aktivasi untuk email ini belum tercatat di server.' });

  const apiKey = process.env.THERESA_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Provider Viu belum dikonfigurasi oleh admin.' });
  try {
    const upstream = await fetch('https://api.theresav.eu/api/premium/viu', {
      headers: { 'x-apikey': apiKey, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    const payload = await upstream.json().catch(() => null);
    const account = payload?.result?.account;
    if (!upstream.ok || payload?.status !== true || !account?.email || !account?.password) {
      console.error('Viu provider unsuccessful:', upstream.status);
      return res.status(502).json({ error: 'Provider Viu gagal menyiapkan akun.' });
    }
    return res.status(200).json({ account: { email: String(account.email), password: String(account.password) } });
  } catch (err) {
    console.error('Viu provider request failed:', err.message);
    return res.status(502).json({ error: 'Tidak dapat menghubungi provider Viu.' });
  }
}
