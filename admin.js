// api/admin.js
// Runtime: Node.js — Vercel Serverless Function
// Handles semua route /api/admin/* sesuai kontrak admin.html:
//
//   POST /api/admin/login       { password }
//   GET  /api/admin/stats       → { stats, audit, recent, errors? }
//   GET  /api/admin/codes       ?page&limit&status&search
//   POST /api/admin/generate    { count, duration_days, note }
//   POST /api/admin/revoke      { id }
//   POST /api/admin/delete      { ids[] }
//   GET  /api/admin/download    ?batch_id → file TXT
//
// Auth: semua kecuali /login pakai Bearer JWT (role=admin)

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cors(res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
}

function verifyAdmin(req) {
  const auth = req.headers['authorization'] ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  try {
    const d = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    return d.role === 'admin' ? d : null;
  } catch {
    return null;
  }
}

function generateCode() {
  // Format XXXX-XXXX-XXXX-XXXX, tanpa 0 / O / 1 / I biar nggak ambigu
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) s += '-';
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

async function logAudit(action, actor, meta = {}) {
  await supabase.from('audit_log').insert([{
    action,
    actor,
    meta,
    created_at: new Date().toISOString(),
  }]).catch(() => {});
}

// ─── Route dispatcher ─────────────────────────────────────────────────────────

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Ambil segment terakhir dari path, misalnya /api/admin/stats → "stats"
  const seg = (req.url ?? '').split('?')[0].split('/').pop();

  // ── POST /api/admin/login ────────────────────────────────────────────────
  if (seg === 'login') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { password } = req.body ?? {};
    if (!password) return res.status(400).json({ error: 'Password wajib diisi' });

    const adminPass = process.env.ADMIN_PASSWORD;
    if (!adminPass) return res.status(500).json({ error: 'ADMIN_PASSWORD env belum di-set' });

    const ok = password === adminPass;
    if (!ok) {
      await logAudit('login_fail', 'admin', { ip: req.headers['x-forwarded-for'] });
      return res.status(401).json({ error: 'Password salah' });
    }

    const token = jwt.sign(
      { role: 'admin', actor: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    await logAudit('login', 'admin', { ip: req.headers['x-forwarded-for'] });
    return res.status(200).json({ token });
  }

  // Semua route di bawah butuh auth
  const admin = verifyAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Unauthorized — login ulang' });

  // ── GET /api/admin/stats ─────────────────────────────────────────────────
  if (seg === 'stats') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const errors = {};

    // Stats ringkasan
    const now = new Date().toISOString();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const [totRes, availRes, usedRes, expRes, revRes, todayRes] = await Promise.all([
      supabase.from('activation_codes').select('id', { count: 'exact', head: true }),
      supabase.from('activation_codes').select('id', { count: 'exact', head: true }).eq('status', 'available'),
      supabase.from('activation_codes').select('id', { count: 'exact', head: true }).eq('status', 'used'),
      supabase.from('activation_codes').select('id', { count: 'exact', head: true }).eq('status', 'expired'),
      supabase.from('activation_codes').select('id', { count: 'exact', head: true }).eq('status', 'revoked'),
      supabase.from('activation_codes').select('id', { count: 'exact', head: true })
        .eq('status', 'used').gte('activated_at', today.toISOString()),
    ]);

    const stats = {
      total:           totRes.count   ?? 0,
      available:       availRes.count ?? 0,
      used:            usedRes.count  ?? 0,
      expired:         expRes.count   ?? 0,
      revoked:         revRes.count   ?? 0,
      activated_today: todayRes.count ?? 0,
    };

    // Audit log 50 terbaru
    let audit = [];
    const auditRes = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (auditRes.error) errors.audit = auditRes.error.message;
    else audit = auditRes.data ?? [];

    // Aktivasi terbaru (kode terpakai terbaru)
    let recent = [];
    const recentRes = await supabase
      .from('activation_codes')
      .select('code, used_by, used_by_email, activated_at, expires_at')
      .eq('status', 'used')
      .order('activated_at', { ascending: false })
      .limit(20);
    if (recentRes.error) errors.recent = recentRes.error.message;
    else recent = recentRes.data ?? [];

    return res.status(200).json({
      stats,
      audit,
      recent,
      ...(Object.keys(errors).length && { errors }),
    });
  }

  // ── GET /api/admin/codes ─────────────────────────────────────────────────
  if (seg === 'codes') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const { page = '1', limit = '50', status, search } = req.query ?? {};
    const pg  = Math.max(1, parseInt(page, 10));
    const lim = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const from = (pg - 1) * lim;
    const to   = from + lim - 1;

    let q = supabase
      .from('activation_codes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status && status !== 'all') q = q.eq('status', status);
    if (search) {
      // cari di code atau used_by_email
      q = q.or(`code.ilike.%${search}%,used_by_email.ilike.%${search}%`);
    }

    const { data, count, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ codes: data ?? [], total: count ?? 0, page: pg });
  }

  // ── POST /api/admin/generate ─────────────────────────────────────────────
  if (seg === 'generate') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { count = 1, duration_days = 30, note = null } = req.body ?? {};
    const safeCount = Math.min(500, Math.max(1, parseInt(count, 10)));
    const safeDays  = Math.max(1, parseInt(duration_days, 10));
    const batch_id  = crypto.randomUUID();
    const rows = [];

    for (let i = 0; i < safeCount; i++) {
      const expires_at = new Date();
      expires_at.setDate(expires_at.getDate() + safeDays);
      rows.push({
        code:         generateCode(),
        status:       'available',
        duration_days: safeDays,
        batch_id,
        note:         note || null,
        expires_at:   expires_at.toISOString(),
        created_at:   new Date().toISOString(),
      });
    }

    // Insert batch (Supabase max ~500 per insert, sudah di-cap)
    const { data, error } = await supabase
      .from('activation_codes')
      .insert(rows)
      .select('code');

    if (error) return res.status(500).json({ error: error.message });

    await logAudit('generate', admin.actor ?? 'admin', {
      count: data.length,
      duration_days: safeDays,
      batch_id,
      note,
    });

    return res.status(200).json({
      count:    data.length,
      batch_id,
      codes:    data.map(r => r.code),
    });
  }

  // ── POST /api/admin/revoke ───────────────────────────────────────────────
  if (seg === 'revoke') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { id } = req.body ?? {};
    if (!id) return res.status(400).json({ error: 'id wajib diisi' });

    const { data: existing } = await supabase
      .from('activation_codes')
      .select('code, status')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return res.status(404).json({ error: 'Kode tidak ditemukan' });
    if (existing.status !== 'available') {
      return res.status(400).json({ error: `Kode berstatus ${existing.status}, tidak bisa dicabut` });
    }

    const { error } = await supabase
      .from('activation_codes')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });

    await logAudit('revoke', admin.actor ?? 'admin', { code: existing.code, id });
    return res.status(200).json({ success: true });
  }

  // ── POST /api/admin/delete ───────────────────────────────────────────────
  if (seg === 'delete') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { ids } = req.body ?? {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids harus array tidak kosong' });
    }
    if (ids.length > 500) {
      return res.status(400).json({ error: 'Maksimal 500 id per request' });
    }

    const { data, error } = await supabase
      .from('activation_codes')
      .delete()
      .in('id', ids)
      .eq('status', 'available') // hanya boleh hapus yang belum dipakai
      .select('id');

    if (error) return res.status(500).json({ error: error.message });

    await logAudit('delete_codes', admin.actor ?? 'admin', { deleted: data?.length ?? 0 });
    return res.status(200).json({ deleted: data?.length ?? 0 });
  }

  // ── GET /api/admin/download ──────────────────────────────────────────────
  if (seg === 'download') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const { batch_id } = req.query ?? {};
    if (!batch_id) return res.status(400).json({ error: 'batch_id wajib diisi' });

    const { data, error } = await supabase
      .from('activation_codes')
      .select('code, expires_at, note')
      .eq('batch_id', batch_id)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    if (!data?.length) return res.status(404).json({ error: 'Batch tidak ditemukan' });

    const lines = data.map(r => {
      const exp = r.expires_at ? new Date(r.expires_at).toLocaleDateString('id-ID') : '—';
      return `${r.code}  | exp: ${exp}${r.note ? '  | ' + r.note : ''}`;
    });

    const header = [
      `AM Premium Activator — Kode Aktivasi`,
      `Batch: ${batch_id}`,
      `Total: ${data.length} kode`,
      `Digenerate: ${new Date().toLocaleString('id-ID')}`,
      '─'.repeat(60),
      '',
    ].join('\n');

    const txt = header + lines.join('\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kode-aktivasi-${batch_id.slice(0, 8)}.txt"`);
    return res.status(200).send(txt);
  }

  return res.status(404).json({ error: `Endpoint /api/admin/${seg} tidak ditemukan` });
}
