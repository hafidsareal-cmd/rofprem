import { supabase } from '../../lib/db.js';
import { requireAdmin } from '../../lib/auth.js';
import { generateCode } from '../../lib/crypto.js';
import { audit } from '../../lib/audit.js';
import { randomUUID } from 'crypto';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  const count = Number.parseInt(req.body?.count, 10);
  const durationDays = Number.parseInt(
    req.body?.duration_days,
    10
  );
  const note = req.body?.note?.trim() || null;

  if (!Number.isInteger(count) || count < 1 || count > 500) {
    return res.status(400).json({
      error: 'Jumlah kode harus antara 1 sampai 500'
    });
  }

  if (
    !Number.isInteger(durationDays) ||
    durationDays < 1 ||
    durationDays > 3650
  ) {
    return res.status(400).json({
      error: 'Masa berlaku harus antara 1 sampai 3650 hari'
    });
  }

  const batchId = randomUUID();
  const expiresAt = new Date(
    Date.now() + durationDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const rows = [];
  const codes = [];
  const seen = new Set();

  const { data: existing, error: fetchError } = await supabase
    .from('activation_codes')
    .select('code');

  if (fetchError) {
    console.error(fetchError);
    return res.status(500).json({
      error: 'Gagal mengambil kode dari database'
    });
  }

  (existing || []).forEach(row => seen.add(row.code));

  let attempts = 0;

  while (rows.length < count && attempts < count * 20) {
    attempts++;

    const code = generateCode();

    if (seen.has(code)) continue;

    seen.add(code);
    codes.push(code);

    rows.push({
      code,
      batch_id: batchId,
      note,
      status: 'available',
      expires_at: expiresAt
    });
  }

  if (rows.length < count) {
    return res.status(500).json({
      error: 'Gagal membuat kode unik yang cukup'
    });
  }

  const { error: insertError } = await supabase
    .from('activation_codes')
    .insert(rows);

  if (insertError) {
    console.error(insertError);
    return res.status(500).json({
      error: 'Gagal menyimpan kode: ' + insertError.message
    });
  }

  try {
    await audit('generate', 'admin', {
      batch_id: batchId,
      count,
      duration_days: durationDays,
      expires_at: expiresAt,
      note
    });
  } catch (error) {
    console.error('Audit log gagal:', error);
  }

  return res.status(200).json({
    batch_id: batchId,
    codes,
    count: codes.length,
    duration_days: durationDays,
    expires_at: expiresAt
  });
}

export default requireAdmin(handler);
