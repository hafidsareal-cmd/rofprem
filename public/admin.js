// api/admin.js
// Runtime: Node.js — Vercel Serverless Function
// Routes:
//   GET  /api/admin?action=codes       → daftar semua kode aktivasi
//   POST /api/admin?action=codes       → generate kode baru (body: { count, duration_days })
//   DELETE /api/admin?action=codes     → hapus kode (body: { code_id })
//   GET  /api/admin?action=audit       → audit log 100 entri terakhir
//   GET  /api/admin?action=recent      → 20 aktivasi terbaru
// Auth: Bearer JWT dengan role === 'admin'

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Auth middleware ───────────────────────────────────────────────────────

function verifyAdmin(req) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    return decoded.role === 'admin' ? decoded : null;
  } catch {
    return null;
  }
}

// ─── Code generator ────────────────────────────────────────────────────────

function generateCode() {
  // Format: XXXX-XXXX-XXXX-XXXX (tanpa I, O, 0, 1 biar nggak ambigu)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Handler utama ─────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const admin = verifyAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Unauthorized' });

  const { action } = req.query;

  // ── 📋 Daftar Kode ────────────────────────────────────────────────────────

  if (action === 'codes') {

    // GET — ambil semua kode
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('activation_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ codes: data });
    }

    // POST — generate kode baru
    if (req.method === 'POST') {
      const { count = 1, duration_days = 30 } = req.body ?? {};
      const safeCount = Math.min(Math.max(1, parseInt(count)), 50);
      const generated = [];
      const errors = [];

      for (let i = 0; i < safeCount; i++) {
        const code = generateCode();
        const expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + duration_days);

        const { data, error } = await supabase
          .from('activation_codes')
          .insert([{
            code,
            is_used: false,
            duration_days: parseInt(duration_days),
            expires_at: expires_at.toISOString(),
            created_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (error) errors.push(error.message);
        else generated.push(data);
      }

      // catat ke audit log
      await supabase.from('audit_logs').insert([{
        admin_email: admin.email,
        action: 'generate_codes',
        detail: `${generated.length} kode dibuat (${duration_days} hari)`,
        created_at: new Date().toISOString()
      }]);

      return res.status(200).json({ generated, errors });
    }

    // DELETE — hapus kode by id
    if (req.method === 'DELETE') {
      const { code_id } = req.body ?? {};
      if (!code_id) return res.status(400).json({ error: 'code_id wajib diisi' });

      const { error } = await supabase
        .from('activation_codes')
        .delete()
        .eq('id', code_id);

      if (error) return res.status(500).json({ error: error.message });

      await supabase.from('audit_logs').insert([{
        admin_email: admin.email,
        action: 'delete_code',
        detail: `Kode ID ${code_id} dihapus`,
        created_at: new Date().toISOString()
      }]);

      return res.status(200).json({ success: true });
    }
  }

  // ── 📝 Audit Log ──────────────────────────────────────────────────────────

  if (action === 'audit') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ logs: data });
  }

  // ── 🕐 Aktivasi Terbaru ───────────────────────────────────────────────────

  if (action === 'recent') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const { data, error } = await supabase
      .from('activations')
      .select(`
        id,
        activated_at,
        expires_at,
        activation_codes ( code, duration_days ),
        users ( email )
      `)
      .order('activated_at', { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ recent: data });
  }

  return res.status(400).json({ error: `Action tidak dikenal: ${action}` });
}
