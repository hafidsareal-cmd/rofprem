import { supabase }    from '../../db.js';
import { requireAdmin } from '../../auth.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { error: expireError } = await supabase.rpc('expire_codes');

if (expireError) {
  console.error('Gagal menjalankan expire_codes:', expireError);
}

  const [statsR, auditR, recentR, usersR] = await Promise.all([
    supabase.from('code_stats').select('*').single(),
    supabase.from('audit_log').select('action,actor,meta,ip_addr,created_at')
      .order('created_at', { ascending: false }).limit(50),
    supabase.from('activation_codes')
      .select('code,used_by_email,activated_at,expires_at')
      .eq('status', 'used')
      .order('activated_at', { ascending: false }).limit(10),
    supabase.from('users').select('id', { count: 'exact', head: true }),
  ]);

  return res.status(200).json({
    stats:      statsR.data  || {},
    audit:      auditR.data  || [],
    recent:     recentR.data || [],
    user_count: usersR.count || 0,
  });
}

export default requireAdmin(handler);
