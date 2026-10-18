// Node.js 18+ | Vercel Serverless | Pakasir — Create Transaction
// POST /api/payment/create
// Body: { email: string }

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body ?? {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email tidak valid' });
  }

  // Cek kode aktif yang belum expired
  const { data: existing } = await supabase
    .from('activation_codes')
    .select('code, expires_at')
    .eq('email', email.toLowerCase())
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (existing) {
    return res.status(400).json({
      error: 'Email ini masih punya kode aktif',
      expiresAt: existing.expires_at,
    });
  }

  // order_id = identifier unik per transaksi
  const orderId = `AM-${uuidv4()}`;

  try {
    const pakasirRes = await fetch(
      `https://app.pakasir.com/api/v2/create-transaction/${process.env.PAKASIR_SLUG}/${orderId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': process.env.PAKASIR_API_KEY,
        },
        body: JSON.stringify({
          method: 'qris',
          amount: 15000,
        }),
      }
    );

    const data = await pakasirRes.json();

    if (!pakasirRes.ok || !data.txn_id) {
      console.error('[create] Pakasir error:', data);
      return res.status(502).json({ error: 'Gagal membuat transaksi pembayaran' });
    }

    // Simpan mapping order_id → email di pending_orders
    const { error: dbErr } = await supabase.from('pending_orders').insert({
      order_id: orderId,
      txn_id: data.txn_id,
      email: email.toLowerCase(),
      amount: 15000,
      created_at: new Date().toISOString(),
    });

    if (dbErr) {
      console.error('[create] Supabase error:', dbErr);
      return res.status(500).json({ error: 'Database error' });
    }

    return res.status(200).json({
      txnId: data.txn_id,
      orderId,
      // payment_link buat redirect ke halaman bayar Pakasir
      paymentUrl: `https://app.pakasir.com/pay-v2/${data.txn_id}?redirect=${encodeURIComponent(process.env.SITE_URL + '/bayar-sukses')}`,
      qrString: data.qr_string ?? null,
      expiredAt: data.expired_at,
    });
  } catch (err) {
    console.error('[create] Unexpected error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
