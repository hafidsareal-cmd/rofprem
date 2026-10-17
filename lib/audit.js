import { supabase } from './db.js';

export async function audit(action, actor, meta = {}, ip = null) {
  try {
    await supabase.from('audit_log').insert({ action, actor, meta, ip_addr: ip });
  } catch (_) {}
}
