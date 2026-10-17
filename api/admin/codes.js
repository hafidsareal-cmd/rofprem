import { supabase }    from '../../lib/db.js';
import { requireAdmin } from '../../lib/auth.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  await supabase.rpc('expire_codes').catch(() => {});

  const { status, search, page = '1', limit = '50', batch_id } = req.query;
  const pg   = Math.max(1, parseInt(page, 10));
  const lim  = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const from = (pg - 1) * lim;
  const to   = from + lim - 1;

  let q = supabase
    .from('activation_codes')
    .select('id,code,status,created_at,activated_at,expires_at,revoked_at,used_by_email,batch_id,note',
      { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status && status !== 'all') q = q.eq('status', status);
  if (batch_id) q = q.eq('batch_id', batch_id);
  if (search)   q = q.or(`code.ilike.%${search}%,used_by_email.ilike.%${search}%`);

  const { data, error, count } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const { data: stats } = await supabase.from('code_stats').select('*').single();

  return res.status(200).json({ codes: data, total: count, page: pg, limit: lim, stats });
}

export default requireAdmin(handler);
