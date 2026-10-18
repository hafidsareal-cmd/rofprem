// Explicit route wrapper to avoid dynamic-route HTTP 405 issues on deployment.
import loginHandler from '../../lib/handlers/admin/login.js';

export default function loginRoute(req, res) {
  return loginHandler(req, res);
}
