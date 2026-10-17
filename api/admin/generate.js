import { supabase }        from '../../lib/db.js';
import { requireAdmin }    from '../../lib/auth.js';
import { generateCode }    from '../../lib/crypto.js';
import { audit }           from '../../lib/audit.js';
import { randomUUID }      from 'crypto';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const count = parseInt(req.body?.count, 10);
  const note  = req.body?.note || null;

  if (!Number.isFinite(count) || count < 1)   return res.status(400).json({ error: 'count >= 1' });
  if (count > 500) return res.status(400).json({ error: 'count <= 500' });

  const batchId = randomUUID();
  const rows    = [];
  const codes   = [];
  const seen    = new Set();

  // Fetch all existing codes to avoid collision
  const { data: existing } = await supabase
    .from('activation_codes').select('code');
  (existing || []).forEach(r => seen.add(r.code));

  let attempts = 0;
  while (rows.length < count && attempts < count * 10) {
    attempts++;
    const code = generateCode();
    if (seen.has(code)) continue;
    seen.add(code);
    rows.push({ code, batch_id: batchId, note, status: 'available' });
    codes.push(code);
  }

  if (rows.length < count)
    return res.status(500).json({ error: 'Gagal generate cukup kode unik' });

  const { error } = await supabase.from('activation_codes').insert(rows);
  if (error) return res.status(500).json({ error: 'DB error: ' + error.message });

  await audit('generate', 'admin', { batch_id: batchId, count, note });

  return res.status(200).json({ batch_id: batchId, codes, count: codes.length });
}

export default requireAdmin(handler);
