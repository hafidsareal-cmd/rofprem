import { supabase }    from '../../db.js';
import { requireAdmin } from '../../auth.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { error: expireError } = await supabase.rpc('expire_codes');
  if (expireError) console.error('Gagal menjalankan expire_codes:', expireError);

  const [statsR, auditR, recentR, usersR] = await Promise.all([
    supabase.from('code_stats').select('*').single(),
    supabase.from('audit_log').select('action,actor,meta,ip_addr,created_at')
      .order('created_at', { ascending: false }).limit(50),
    supabase.from('activation_codes')
      .select('code,used_by_email,used_by,activated_at,expires_at')
      .eq('status', 'used')
      .order('activated_at', { ascending: false }).limit(10),
    supabase.from('users').select('id', { count: 'exact', head: true }),
  ]);

  if (statsR.error) {
    console.error('Gagal membaca code_stats:', statsR.error);
    return res.status(500).json({ error: 'Gagal membaca statistik kode: ' + statsR.error.message });
  }

  const errors = {};
  if (auditR.error) {
    console.error('Gagal membaca audit_log:', auditR.error);
    errors.audit = auditR.error.message;
  }
  if (recentR.error) {
    console.error('Gagal membaca aktivasi terbaru:', recentR.error);
    errors.recent = recentR.error.message;
  }
  if (usersR.error) {
    console.error('Gagal membaca jumlah pengguna:', usersR.error);
    errors.users = usersR.error.message;
  }

  return res.status(200).json({
    stats: statsR.data || {},
    audit: auditR.data || [],
    recent: recentR.data || [],
    user_count: usersR.count || 0,
    errors,
  });
}

export default requireAdmin(handler);
