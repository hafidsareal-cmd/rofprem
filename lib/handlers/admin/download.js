import { supabase } from '../../db.js';
import { requireAdmin } from '../../auth.js';
import { audit } from '../../audit.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { batch_id } = req.query;

  if (!batch_id) {
    return res.status(400).json({ error: 'batch_id required' });
  }

  const { data, error } = await supabase
    .from('activation_codes')
    .select('code')
    .eq('batch_id', batch_id)
    .order('created_at', { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!data?.length) {
    return res.status(404).json({ error: 'Batch tidak ditemukan' });
  }

  const password = 'https://rofprem.vercel.app';

  const content = data
    .map(({ code }) =>
      `email : ${code}\npassword : ${password}`
    )
    .join('\n');

  await audit('export_txt', 'admin', {
    batch_id,
    count: data.length
  });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="kode-aktivasi-${batch_id.slice(0, 8)}.txt"`
  );

  return res.send(content);
}

export default requireAdmin(handler);
