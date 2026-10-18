/**
 * Pakasir purchase API — one Vercel function for create/status/webhook.
 * Required env: PAKASIR_SLUG, PAKASIR_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY.
 * Price is fixed server-side at Rp20,000 per activation code.
 */
import { randomBytes } from 'node:crypto';
import { supabase } from '../../lib/db.js';
const PRICE = 20000;
const BASE = 'https://app.pakasir.com';
const slug = () => process.env.PAKASIR_SLUG || '';
const key = () => process.env.PAKASIR_API_KEY || '';

function orderId() {
  return 'RFP' + Date.now().toString(36).toUpperCase() + randomBytes(8).toString('hex').toUpperCase();
}
function makeCode() {
  const s = randomBytes(8).toString('hex').toUpperCase();
  return [s.slice(0,4),s.slice(4,8),s.slice(8,12),s.slice(12,16)].join('-');
}
function fail(res, status, error) { return res.status(status).json({ error }); }

async function create(req,res) {
  if (req.method !== 'POST') return fail(res,405,'Method not allowed');
  if (!slug() || !key()) return fail(res,503,'Pembayaran belum dikonfigurasi oleh admin.');
  const id = orderId();
  // Save the expected amount and order ID before calling Pakasir.
  const { error: insertError } = await supabase.from('payment_orders').insert({
    order_id:id, amount:PRICE, project:slug(), status:'pending', payment_method:'qris'
  });
  if (insertError) {
    console.error('Order insert failed:', insertError.message);
    return fail(res,500,'Gagal membuat pesanan.');
  }
  try {
    const r = await fetch(`${BASE}/api/v2/create-transaction/${encodeURIComponent(slug())}/${encodeURIComponent(id)}`,{
      method:'POST',
      headers:{'Content-Type':'application/json','X-Api-Key':key()},
      body:JSON.stringify({method:'qris',amount:PRICE}),
      signal:AbortSignal.timeout(12000)
    });
    const d = await r.json().catch(()=>({}));
    if (!r.ok || !d.qr_string) {
      console.error('Pakasir create failed:',r.status,JSON.stringify(d));
      await supabase.from('payment_orders').update({status:'failed'}).eq('order_id',id).eq('status','pending');
      return fail(res,502,'Pakasir gagal membuat QRIS. Coba lagi nanti.');
    }
    await supabase.from('payment_orders').update({
      txn_id:d.txn_id || null, qr_string:d.qr_string,
      total_payment:Number(d.total_payment || PRICE), expires_at:d.expired_at || null
    }).eq('order_id',id);
    return res.status(201).json({
      order_id:id, amount:PRICE, total_payment:Number(d.total_payment || PRICE),
      qr_string:d.qr_string, expires_at:d.expired_at || null, status:'pending'
    });
  } catch(e) {
    console.error('Pakasir request error:',e.message);
    return fail(res,502,'Tidak dapat terhubung ke Pakasir. Coba lagi.');
  }
}

// Server-side verification against Pakasir transaction detail before code issuance.
// Pakasir v2 create docs are available; transaction-detail endpoint is still documented as v1.
async function verifyPaid(order) {
  const u = new URL(BASE + '/api/transactiondetail');
  u.searchParams.set('project',slug());
  u.searchParams.set('amount',String(order.amount));
  u.searchParams.set('order_id',order.order_id);
  u.searchParams.set('api_key',key());
  const r = await fetch(u,{signal:AbortSignal.timeout(10000),cache:'no-store'});
  if (!r.ok) throw new Error('Pakasir status verification failed');
  const d = await r.json();
  const t = d.transaction || d.payment || {};
  return t.status === 'completed' &&
    String(t.order_id) === order.order_id &&
    Number(t.amount) === PRICE &&
    String(t.project) === slug();
}
async function issue(order) {
  // RPC locks the order and ensures repeated status requests cannot issue multiple codes.
  for (let i=0;i<3;i++) {
    const code = makeCode();
    const {data,error} = await supabase.rpc('finalize_pakasir_order',{
      p_order_id:order.order_id,p_project:slug(),p_amount:PRICE,p_code:code
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      return row?.issued_code || order.activation_code || null;
    }
    if (!String(error.message || '').toLowerCase().includes('duplicate')) {
      console.error('Code issuance failed:',error.message);
      throw new Error('Code issuance failed');
    }
  }
  throw new Error('Could not generate unique code');
}
async function status(req,res) {
  if (req.method !== 'GET') return fail(res,405,'Method not allowed');
  const id=String(req.query?.order_id || '');
  if (!/^RFP[A-Z0-9]{10,40}$/.test(id)) return fail(res,400,'Order ID tidak valid.');
  const {data:order,error}=await supabase.from('payment_orders')
    .select('order_id,amount,project,status,activation_code,expires_at')
    .eq('order_id',id).maybeSingle();
  if(error) return fail(res,500,'Gagal memeriksa pesanan.');
  if(!order) return fail(res,404,'Pesanan tidak ditemukan.');
  if(order.status === 'paid' && order.activation_code)
    return res.status(200).json({status:'paid',code:order.activation_code});
  if(order.status !== 'pending') return res.status(200).json({status:order.status});
  if(order.expires_at && Date.parse(order.expires_at)<Date.now()) {
    await supabase.from('payment_orders').update({status:'expired'}).eq('order_id',id).eq('status','pending');
    return res.status(200).json({status:'expired'});
  }
  try {
    if(await verifyPaid(order)) {
      const code=await issue(order);
      return res.status(200).json({status:'paid',code});
    }
  } catch(e) {
    console.error('Payment verification error:',e.message);
    return fail(res,503,'Verifikasi pembayaran belum tersedia. Coba periksa lagi sebentar.');
  }
  return res.status(200).json({status:'pending'});
}
async function webhook(req,res) {
  if(req.method!=='POST') return fail(res,405,'Method not allowed');
  const body=req.body || {};
  const id=String(body.order_id || '');
  const amount=Number(body.amount);
  if(!/^RFP[A-Z0-9]{10,40}$/.test(id) || amount!==PRICE || String(body.project)!==slug() || body.status!=='completed')
    return fail(res,400,'Webhook tidak cocok dengan pesanan.');
  const {data:order,error}=await supabase.from('payment_orders')
    .select('order_id,amount,project,status,activation_code,expires_at')
    .eq('order_id',id).maybeSingle();
  if(error || !order) return fail(res,404,'Pesanan tidak ditemukan.');
  if(order.status==='paid') return res.status(200).json({ok:true});
  if(order.status!=='pending') return fail(res,409,'Pesanan bukan pending.');
  try {
    if(!await verifyPaid(order)) return fail(res,400,'Status pembayaran belum terverifikasi.');
    await issue(order);
    return res.status(200).json({ok:true});
  } catch(e) {
    console.error('Webhook verification failed:',e.message);
    return fail(res,503,'Verifikasi gagal; Pakasir dapat mencoba ulang.');
  }
}
export default async function handler(req,res) {
  const action=String(req.query?.action || '').toLowerCase();
  if(action==='create') return create(req,res);
  if(action==='status') return status(req,res);
  if(action==='webhook') return webhook(req,res);
  return fail(res,404,'Endpoint pembayaran tidak ditemukan.');
}
