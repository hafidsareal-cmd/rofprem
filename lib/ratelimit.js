import { supabase } from './db.js';

export async function checkRateLimit(key, limit = 10, windowSec = 900) {
  const now    = new Date();
  const winEnd = new Date(now.getTime() + windowSec * 1000);

  const { data } = await supabase
    .from('rate_limits')
    .select('count, window_end')
    .eq('key', key)
    .single();

  if (!data || new Date(data.window_end) < now) {
    await supabase.from('rate_limits').upsert(
      { key, count: 1, window_end: winEnd.toISOString() },
      { onConflict: 'key' }
    );
    return { limited: false, remaining: limit - 1 };
  }

  if (data.count >= limit) return { limited: true, remaining: 0 };

  await supabase.from('rate_limits')
    .update({ count: data.count + 1 })
    .eq('key', key);

  return { limited: false, remaining: limit - data.count - 1 };
}
