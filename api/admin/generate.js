// Explicit route wrapper to avoid dynamic-route HTTP 405 issues on deployment.
import generateHandler from '../../lib/handlers/admin/generate.js';

export default function generateRoute(req, res) {
  return generateHandler(req, res);
}
