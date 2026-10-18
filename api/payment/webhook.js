// Node.js 18+ | Vercel Serverless | KitaPay — Webhook Handler
// POST /api/payment/webhook
// Dipanggil otomatis oleh KitaPay saat pembayaran sukses

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

  const { event, data } = req.body ?? {};

  // Selalu return 200 ke KitaPay agar tidak retry terus
  if (event !== 'payment.success') {
    return res.status(200).json({ received: true });
  }

  const { external_id, amount, status, transaction_id } = data;

  if (status !== 'PAID' || amount < 15000) {
    console.warn('[webhook] Transaksi tidak valid:', data);
    return res.status(200).json({ received: true });
  }

  try {
    // Ambil email dari pending_orders
    const { data: order, error: orderErr } = await supabase
      .from('pending_orders')
      .select('email')
      .eq('external_id', external_id)
      .maybeSingle();

    if (orderErr || !order) {
      console.error('[webhook] Order tidak ditemukan:', external_id, orderErr);
      return res.status(200).json({ received: true });
    }

    const { email } = order;

    // Cek idempotency — jangan generate dua kali untuk transaksi yang sama
    const { data: existing } = await supabase
      .from('activation_codes')
      .select('code')
      .eq('transaction_id', transaction_id)
      .maybeSingle();

    if (existing) {
      console.log('[webhook] Sudah diproses sebelumnya:', transaction_id);
      return res.status(200).json({ received: true });
    }

    // Generate kode unik
    const code = generateCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Simpan kode ke activation_codes
    const { error: insertErr } = await supabase.from('activation_codes').insert({
      code,
      email,
      transaction_id,
      external_id,
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
    await supabase.from('pending_orders').delete().eq('external_id', external_id);

    // Kirim email kode aktivasi
    await sendActivationEmail(email, code, expiresAt);

    console.log(`[webhook] ✅ Kode ${code} dikirim ke ${email}`);
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook] Unexpected error:', err);
    return res.status(200).json({ received: true });
  }
}
