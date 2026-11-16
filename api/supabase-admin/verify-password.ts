import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleVerifyCallerPassword } from '../_lib/supabaseAdminService.js';

interface VercelRequestLike extends IncomingMessage {
  body?: unknown;
}

interface VercelResponseLike extends ServerResponse {
  status?: (code: number) => VercelResponseLike;
  json?: (payload: unknown) => void;
}

async function readJsonBody(req: VercelRequestLike): Promise<{ password?: unknown }> {
  if (req.body && typeof req.body === 'object') {
    return req.body as { password?: unknown };
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body) as { password?: unknown };
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw) as { password?: unknown };
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

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
    return;
  }

  const authHeader =
    typeof req.headers.authorization === 'string'
      ? req.headers.authorization
      : Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : undefined;

  let body: { password?: unknown };
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON request payload.' });
    return;
  }

  try {
    const result = await handleVerifyCallerPassword(authHeader, body?.password);
    sendJson(res, result.status, result.body);
  } catch (err) {
    console.error('[api/supabase-admin/verify-password] Unexpected error:', err instanceof Error ? err.message : err);
    sendJson(res, 500, { error: 'Unable to verify password on the server.' });
  }
}
