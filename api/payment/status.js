// Explicit route wrapper to avoid dynamic-route routing issues on deployment.
import paymentHandler from './[action].js';

export default function paymentStatusRoute(req, res) {
  req.query = { ...(req.query || {}), action: 'status' };
  return paymentHandler(req, res);
}
