import { createHmac } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface PublicApiRequest extends IncomingMessage { body?: unknown; }
export interface PublicApiClients { admin: SupabaseClient; auth: SupabaseClient; serviceKey: string; }

export function createPublicApiClients(): PublicApiClients {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const publicKey = (
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY || ''
  ).trim();
  if (!url || !serviceKey || !publicKey) throw new Error('Required server-side Supabase configuration is missing.');
  const authOptions = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
  return {
    admin: createClient(url, serviceKey, authOptions),
    auth: createClient(url, publicKey, authOptions),
    serviceKey,
  };
}

export function sendJson(res: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

export async function readJsonBody<T extends Record<string, unknown>>(req: PublicApiRequest): Promise<T> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body as T;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body) as T;
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += part.length;
    if (totalBytes > 16 * 1024) throw new Error('Request body is too large.');
    chunks.push(part);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) as T : {} as T;
}

export function getRequestIp(req: PublicApiRequest): string {
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim().slice(0, 120);
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const parts = forwarded.split(',').map((item) => item.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1].slice(0, 120);
  }
  return (req.socket?.remoteAddress || 'unknown').slice(0, 120);
}

export async function takeRateLimit(
  admin: SupabaseClient, serviceKey: string,
  bucketScope: 'client_lookup_ip' | 'client_lookup_phone' | 'login_ip' | 'login_identifier',
  value: string, maxAttempts: number, windowSeconds = 900
): Promise<boolean> {
  const bucketHash = createHmac('sha256', serviceKey).update(bucketScope + ':' + value).digest('hex');
  const { data, error } = await admin.rpc('consume_public_api_rate_limit', {
    p_bucket_hash: bucketHash, p_bucket_scope: bucketScope,
    p_max_attempts: maxAttempts, p_window_seconds: windowSeconds,
  });
  if (error) throw new Error('Rate-limit check is unavailable.');
  return data === true;
}
