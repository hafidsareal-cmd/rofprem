import { supabase }    from '../../lib/db.js';
import { requireAdmin } from '../../lib/auth.js';
import { buildZip }    from '../../lib/zip.js';
import { audit }       from '../../lib/audit.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { batch_id } = req.query;
  if (!batch_id) return res.status(400).json({ error: 'batch_id required' });

  const { data, error } = await supabase
    .from('activation_codes')
    .select('code')
    .eq('batch_id', batch_id)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  if (!data?.length) return res.status(404).json({ error: 'Batch tidak ditemukan' });

  const codes  = data.map(r => r.code);
  const buffer = await buildZip(codes, batch_id);

  res.setHeader('Content-Type',        'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="kode-aktivasi-${batch_id.slice(0,8)}.zip"`);
  res.setHeader('Content-Length',      buffer.length);

  await audit('export_zip', 'admin', { batch_id, count: codes.length });
  return res.send(buffer);
}

export default requireAdmin(handler);
