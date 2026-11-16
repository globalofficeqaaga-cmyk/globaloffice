import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  handleCreateManagedUser,
  type AdminUserPayload,
} from '../_lib/supabaseAdminService';

interface VercelRequestLike extends IncomingMessage {
  body?: unknown;
}

interface VercelResponseLike extends ServerResponse {
  status?: (code: number) => VercelResponseLike;
  json?: (payload: unknown) => void;
}

async function readJsonBody(req: VercelRequestLike): Promise<AdminUserPayload> {
  if (req.body && typeof req.body === 'object') {
    return req.body as AdminUserPayload;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body) as AdminUserPayload;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw) as AdminUserPayload;
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
    sendJson(res, 405, { error: 'Method not allowed. Use POST to create user accounts.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const authHeader =
      typeof req.headers.authorization === 'string'
        ? req.headers.authorization
        : Array.isArray(req.headers.authorization)
        ? req.headers.authorization[0]
        : undefined;
    const result = await handleCreateManagedUser(authHeader, body);
    sendJson(res, result.status, result.body);
  } catch (err) {
    sendJson(res, 400, {
      error:
        err instanceof SyntaxError
          ? 'Invalid JSON request payload.'
          : 'Unexpected server error while creating user account.',
    });
  }
}
