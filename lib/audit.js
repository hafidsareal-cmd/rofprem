import { supabase } from './db.js';

export async function audit(action, actor, meta = {}, ip = null) {
  try {
    const { error } = await supabase
      .from('audit_log')
      .insert({ action, actor, meta, ip_addr: ip });
    if (error) {
      console.error('Gagal menyimpan audit log:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Gagal menyimpan audit log:', error);
    return false;
  }
}
