// Explicit route wrapper to avoid dynamic-route HTTP 405 issues on deployment.
import paymentHandler from './[action].js';

export default function createPaymentRoute(req, res) {
  req.query = { ...(req.query || {}), action: 'create' };
  return paymentHandler(req, res);
}
