// Node.js 18+ | Vercel Serverless | KitaPay — Create Payment
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

  // Cek apakah email ini punya kode aktif
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

  const externalId = `AM-${uuidv4()}`;

  try {
    const kitaRes = await fetch('https://apikita.rinzgroup.web.id/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KITAPAY_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        merchantId: process.env.KITAPAY_MERCHANT_ID,
        amount: 15000,
        externalId,
        targetWebhookUrl: `${process.env.SITE_URL}/api/payment/webhook`,
      }),
    });

    const kitaData = await kitaRes.json();

    if (!kitaData.success) {
      console.error('[create] KitaPay error:', kitaData);
      return res.status(502).json({ error: 'Gagal membuat transaksi pembayaran' });
    }

    // Simpan pending order ke Supabase agar webhook tahu email-nya
    const { error: dbErr } = await supabase.from('pending_orders').insert({
      external_id: externalId,
      email: email.toLowerCase(),
      transaction_id: kitaData.transaction.id,
      amount: kitaData.transaction.amount,
      created_at: new Date().toISOString(),
    });

    if (dbErr) {
      console.error('[create] Supabase insert error:', dbErr);
      return res.status(500).json({ error: 'Database error' });
    }

    return res.status(200).json({
      transactionId: kitaData.transaction.id,
      externalId,
      amount: kitaData.transaction.amount,
      expiresAt: kitaData.transaction.expires_at,
    });
  } catch (err) {
    console.error('[create] Unexpected error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
