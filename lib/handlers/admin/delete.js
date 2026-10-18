import { supabase } from '../../db.js';
import { requireAdmin } from '../../auth.js';
import { audit } from '../../audit.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  const ids = req.body?.ids;

  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 500 ||
    ids.some(id => typeof id !== 'string' || !id.trim())
  ) {
    return res.status(400).json({
      error: 'Daftar ID tidak valid'
    });
  }

  const uniqueIds = [...new Set(ids)];

  const { data, error } = await supabase
    .from('activation_codes')
    .delete()
    .in('id', uniqueIds)
    .eq('status', 'available')
    .select('id');

  if (error) {
    console.error('Delete codes error:', error);

    return res.status(500).json({
      error: 'Gagal menghapus kode. Periksa konfigurasi database.'
    });
  }

  const deleted = data?.length || 0;

  try {
    await audit('delete_codes', 'admin', {
      requested: uniqueIds.length,
      deleted
    });
  } catch (error) {
    console.error('Audit delete error:', error);
  }

  return res.status(200).json({
    success: true,
    deleted,
    requested: uniqueIds.length
  });
}

export default requireAdmin(handler);
