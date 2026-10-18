import { requireUser } from '../../auth.js';
import { supabase }    from '../../db.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  await supabase.rpc('expire_codes').catch(() => {});

  const user = req.user;
  const premiumActive = user.premium_until && new Date(user.premium_until) > new Date();

  return res.status(200).json({
    id:            user.id,
    email:         user.email,
    premium:       premiumActive,
    premium_until: user.premium_until,
  });
}

export default requireUser(handler);
