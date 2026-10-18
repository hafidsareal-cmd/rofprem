import { supabase }    from '../../db.js';
import { requireAdmin } from '../../auth.js';
import { audit }       from '../../audit.js';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id required' });

  const { data, error } = await supabase
    .from('activation_codes')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'available')
    .select('id')
    .single();

  if (error || !data) return res.status(400).json({ error: 'Kode tidak ditemukan atau sudah dipakai' });

  await audit('revoke', 'admin', { code_id: id });
  return res.status(200).json({ success: true });
}

export default requireAdmin(handler);
