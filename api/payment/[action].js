import { randomUUID } from 'node:crypto';
import { supabase } from '../../lib/db.js';
import { requireUser } from '../../lib/auth.js';
import { generateCode } from '../../lib/codes.js';

const PRICE_PER_CODE = 1000;
const MAX_CODES_PER_ORDER = 10;

async function createPayment(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const quantity = Number(req.body?.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CODES_PER_ORDER) {
    return res.status(400).json({ error: `Jumlah kode harus 1–${MAX_CODES_PER_ORDER}.` });
  }
  if (!process.env.PAKASIR_SLUG || !process.env.PAKASIR_API_KEY) {
    console.error('Missing PAKASIR_SLUG or PAKASIR_API_KEY');
    return res.status(503).json({ error: 'Pembayaran belum dikonfigurasi oleh admin.' });
  }

  const amount = quantity * PRICE_PER_CODE;
  const orderId = `RP-${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`;

  try {
    const paymentResponse = await fetch(
      `https://app.pakasir.com/api/v2/create-transaction/${encodeURIComponent(process.env.PAKASIR_SLUG)}/${encodeURIComponent(orderId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': process.env.PAKASIR_API_KEY,
        },
        body: JSON.stringify({ method: 'qris', amount }),
        signal: AbortSignal.timeout(15000),
      }
    );
    const payment = await paymentResponse.json().catch(() => ({}));
    if (!paymentResponse.ok || !payment.txn_id) {
      console.error('Pakasir create transaction failed:', payment);
      return res.status(502).json({ error: 'Gagal membuat tagihan. Coba lagi nanti.' });
    }

    const { error } = await supabase.from('payment_orders').insert({
      order_id: orderId,
      txn_id: payment.txn_id,
      user_id: req.user.id,
      email: req.user.email,
      quantity,
      amount,
      status: 'pending',
    });
    if (error) {
      console.error('Failed to save payment order:', error.message);
      return res.status(500).json({ error: 'Tagihan dibuat, tetapi gagal disimpan. Hubungi admin sebelum membayar.' });
    }

    const paymentUrl = `https://app.pakasir.com/pay-v2/${encodeURIComponent(payment.txn_id)}?qris_only=1&redirect=${encodeURIComponent(process.env.SITE_URL || 'https://rofprem.vercel.app')}`;
    return res.status(200).json({
      orderId,
      txnId: payment.txn_id,
      quantity,
      amount,
      paymentUrl,
      // Pakasir v2 returns the QRIS payload as qr_string.
      qrString: payment.qr_string || null,
      fee: Number(payment.fee || 0),
      totalPayment: Number(payment.total_payment || amount),
      expiredAt: payment.expired_at || null,
    });
  } catch (error) {
    console.error('Create payment error:', error?.message || error);
    return res.status(502).json({ error: 'Tidak dapat terhubung ke layanan pembayaran.' });
  }
}

async function checkPayment(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const orderId = String(req.body?.orderId || '').trim();
  if (!/^RP-[A-F0-9]{20}$/.test(orderId)) {
    return res.status(400).json({ error: 'Nomor pesanan tidak valid.' });
  }

  try {
    const { data: order, error: orderError } = await supabase
      .from('payment_orders')
      .select('order_id, txn_id, user_id, quantity, amount, status, issued_codes')
      .eq('order_id', orderId)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (orderError) {
      console.error('Payment order lookup failed:', orderError.message);
      return res.status(500).json({ error: 'Gagal memeriksa pesanan.' });
    }
    if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    if (order.status === 'completed') {
      return res.status(200).json({ status: 'completed', codes: order.issued_codes || [] });
    }
    if (order.status === 'canceled') {
      return res.status(200).json({ status: 'canceled', codes: [] });
    }

    if (!process.env.PAKASIR_SLUG || !process.env.PAKASIR_API_KEY) {
      return res.status(503).json({ error: 'Pembayaran belum dikonfigurasi.' });
    }

    const statusResponse = await fetch(
      `https://app.pakasir.com/api/v2/transaction-status/${encodeURIComponent(process.env.PAKASIR_SLUG)}/${encodeURIComponent(order.txn_id)}`,
      {
        method: 'GET',
        headers: { 'X-Api-Key': process.env.PAKASIR_API_KEY },
        signal: AbortSignal.timeout(12000),
      }
    );
    const payment = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) {
      console.error('Pakasir status check failed:', payment);
      return res.status(502).json({ error: 'Status pembayaran belum bisa diperiksa. Coba lagi sebentar.' });
    }

    // Never issue codes unless Pakasir confirms the exact order and amount.
    if (payment.order_id !== order.order_id || Number(payment.amount) !== order.amount) {
      console.error('Pakasir transaction mismatch:', order.order_id);
      return res.status(409).json({ error: 'Data transaksi tidak cocok. Hubungi admin.' });
    }

    if (payment.status === 'canceled') {
      await supabase.from('payment_orders').update({ status: 'canceled' })
        .eq('order_id', order.order_id).eq('status', 'pending');
      return res.status(200).json({ status: 'canceled', codes: [] });
    }

    if (payment.status !== 'completed') {
      return res.status(200).json({ status: 'pending', codes: [] });
    }

    const codes = Array.from({ length: order.quantity }, () => generateCode());
    const { data: fulfillment, error: fulfillError } = await supabase.rpc('fulfill_paid_order', {
      p_order_id: order.order_id,
      p_txn_id: order.txn_id,
      p_amount: order.amount,
      p_codes: codes,
    });

    if (fulfillError) {
      console.error('Payment fulfillment failed:', fulfillError.message);
      return res.status(500).json({ error: 'Pembayaran terkonfirmasi, tetapi kode belum dapat diterbitkan. Tekan cek status lagi.' });
    }

    return res.status(200).json({
      status: fulfillment?.status || 'completed',
      codes: fulfillment?.codes || [],
    });
  } catch (error) {
    console.error('Check payment error:', error?.message || error);
    return res.status(500).json({ error: 'Terjadi kesalahan saat memeriksa pembayaran.' });
  }
}

async function handler(req, res) {
  const action = String(req.query?.action || '').toLowerCase();
  if (action === 'create') return createPayment(req, res);
  if (action === 'status') return checkPayment(req, res);
  return res.status(404).json({ error: 'Endpoint pembayaran tidak ditemukan.' });
}

export default requireUser(handler);
