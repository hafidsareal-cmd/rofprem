// api/auth.js
// Runtime: Node.js — Vercel Serverless Function
// Routes:
//   POST /api/auth   { action: 'register', email, password }
//   POST /api/auth   { action: 'login',    email, password }

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const { action, email, password } = req.body ?? {};

  if (!action || !email || !password) {
    return res.status(400).json({ error: 'action, email, dan password wajib diisi' });
  }

  // ── Register ───────────────────────────────────────────────────────────────
  if (action === 'register') {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) return res.status(400).json({ error: 'Email sudah terdaftar' });

    const hash = await bcrypt.hash(password, 10);
    const { data: user, error } = await supabase
      .from('users')
      .insert([{ email, password: hash, role: 'user', created_at: new Date().toISOString() }])
      .select('id, email, role')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(201).json({ token, user });
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  if (action === 'login') {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error || !user) return res.status(401).json({ error: 'Email atau password salah' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Email atau password salah' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(200).json({
      token,
      user: { id: user.id, email: user.email, role: user.role },
    });
  }

  return res.status(400).json({ error: `Action tidak dikenal: ${action}` });
}
