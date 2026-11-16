import type { IncomingMessage, ServerResponse } from 'node:http';
import { getSafeSupabaseHealthStatus } from './_lib/supabaseAdminService';

interface VercelResponseLike extends ServerResponse {
  status?: (code: number) => VercelResponseLike;
  json?: (payload: unknown) => void;
}

export default function handler(_req: IncomingMessage, res: VercelResponseLike) {
  const payload = {
    ok: true,
    backend: 'vercel-serverless',
    ...getSafeSupabaseHealthStatus(),
    timestamp: new Date().toISOString(),
  };
  const statusFn = res.status;
  const jsonFn = res.json;
  if (typeof statusFn === 'function' && typeof jsonFn === 'function') {
    const target = statusFn.call(res, 200);
    (target?.json || jsonFn).call(target || res, payload);
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}
