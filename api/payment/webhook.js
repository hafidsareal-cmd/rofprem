// Node.js 18+ | Vercel Serverless | Pakasir — Webhook Handler
// POST /api/payment/webhook
//
// Pakasir webhook payload:
// {
//   "amount": 15000,
//   "order_id": "AM-uuid",
//   "project": "slug-kamu",
//   "status": "completed",
//   "payment_method": "qris",
//   "completed_at": "2026-10-18T08:07:02.819+07:00"
// }

import { createClient } from '@supabase/supabase-js';
import { generateCode } from '../../lib/codes.js';
import { sendActivationEmail } from '../../lib/mailer.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const { order_id, amount, status } = req.body ?? {};

  // Pakasir mengirim status "completed" saat sukses
  if (status !== 'completed') {
    return res.status(200).json({ received: true });
  }

  if (!order_id || amount < 15000) {
    console.warn('[webhook] Payload tidak valid:', req.body);
    return res.status(200).json({ received: true });
  }

  try {
    // Ambil email dari pending_orders
    const { data: order, error: orderErr } = await supabase
      .from('pending_orders')
      .select('email, txn_id')
      .eq('order_id', order_id)
      .maybeSingle();

    if (orderErr || !order) {
      console.error('[webhook] Order tidak ditemukan:', order_id, orderErr);
      return res.status(200).json({ received: true });
    }

    const { email, txn_id } = order;

    // Idempotency — jangan proses dua kali
    const { data: existing } = await supabase
      .from('activation_codes')
      .select('code')
      .eq('txn_id', txn_id)
      .maybeSingle();

    if (existing) {
      console.log('[webhook] Sudah diproses:', txn_id);
      return res.status(200).json({ received: true });
    }

    // Generate kode aktivasi
    const code = generateCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Simpan ke activation_codes
    const { error: insertErr } = await supabase.from('activation_codes').insert({
      code,
      email,
      txn_id,
      order_id,
      amount,
      expires_at: expiresAt.toISOString(),
      used_at: null,
      created_at: new Date().toISOString(),
    });

    if (insertErr) {
      console.error('[webhook] Gagal simpan kode:', insertErr);
      return res.status(200).json({ received: true });
    }

    // Hapus dari pending_orders
    await supabase.from('pending_orders').delete().eq('order_id', order_id);

    // Kirim email
    await sendActivationEmail(email, code, expiresAt);

    console.log(`[webhook] ✅ Kode ${code} → ${email}`);
    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('[webhook] Unexpected error:', err);
    return res.status(200).json({ received: true });
  }
}
