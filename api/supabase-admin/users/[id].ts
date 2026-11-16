import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  handleDeleteManagedUser,
  handleUpdateManagedUser,
  type AdminUserPayload,
} from '../../_lib/supabaseAdminService.js';

interface VercelRequestLike extends IncomingMessage {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
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

function extractTargetId(req: VercelRequestLike): string {
  const qId = req.query?.id;
  if (typeof qId === 'string' && qId.trim()) return qId.trim();
  if (Array.isArray(qId) && qId[0]) return String(qId[0]).trim();
  const urlPath = (req.url || '').split('?')[0];
  const segments = urlPath.split('/').filter(Boolean);
  return segments[segments.length - 1] ? decodeURIComponent(segments[segments.length - 1]) : '';
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
  const targetId = extractTargetId(req);
  const authHeader =
    typeof req.headers.authorization === 'string'
      ? req.headers.authorization
      : Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : undefined;

  if (req.method === 'PUT') {
    let body: AdminUserPayload;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON request payload.' });
      return;
    }

    try {
      const result = await handleUpdateManagedUser(authHeader, targetId, body);
      sendJson(res, result.status, result.body);
    } catch (err) {
      console.error('[api/supabase-admin/users/:id PUT] Unexpected error:', err instanceof Error ? err.message : err);
      sendJson(res, 500, { error: 'Unexpected server error while updating user account.' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    try {
      const result = await handleDeleteManagedUser(authHeader, targetId);
      sendJson(res, result.status, result.body);
    } catch (err) {
      console.error('[api/supabase-admin/users/:id DELETE] Unexpected error:', err instanceof Error ? err.message : err);
      sendJson(res, 500, { error: 'Unexpected server error while deleting user account.' });
    }
    return;
  }

  res.setHeader('Allow', 'PUT, DELETE');
  sendJson(res, 405, { error: 'Method not allowed.' });
}
