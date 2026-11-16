import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleVerifySupabaseSetup } from '../_lib/supabaseAdminService.js';

interface VercelResponseLike extends ServerResponse {
  status?: (code: number) => VercelResponseLike;
  json?: (payload: unknown) => void;
}

function sendJson(res: VercelResponseLike, statusCode: number, payload: Record<string, unknown>) {
  const statusFn = res.status;
  const jsonFn = res.json;
  if (typeof statusFn === 'function' && typeof jsonFn === 'function') {
    const target = statusFn.call(res, statusCode);
    (target?.json || jsonFn).call(target || res, payload);
    return;
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default async function handler(req: IncomingMessage, res: VercelResponseLike) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { error: 'Method not allowed. Use GET to verify Supabase setup.' });
    return;
  }

  const authHeader =
    typeof req.headers.authorization === 'string'
      ? req.headers.authorization
      : Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : undefined;

  const result = await handleVerifySupabaseSetup(authHeader);
  sendJson(res, result.status, result.body);
}
