import type { PublicApiRequest } from './_lib/publicApi.js';
import { createPublicApiClients, getRequestIp, readJsonBody, sendJson, takeRateLimit } from './_lib/publicApi.js';

interface LookupBody extends Record<string, unknown> { phone?: unknown; }

export default async function handler(req: PublicApiRequest, res: import('node:http').ServerResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }
  let phone = '';
  try {
    if (req.method === 'POST') {
      const body = await readJsonBody<LookupBody>(req);
      phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    } else {
      phone = (new URL(req.url || '/', 'https://portal.invalid').searchParams.get('phone') || '').trim();
    }
  } catch {
    sendJson(res, 400, { error: 'Invalid request payload.' });
    return;
  }
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('880') && digits.length >= 13 ? digits.slice(2) : digits;
  if (!phone || normalized.length < 10 || normalized.length > 15) {
    sendJson(res, 400, { error: 'Please enter a valid complete phone number (at least 10 digits).' });
    return;
  }
  try {
    const { admin, serviceKey } = createPublicApiClients();
    const ipAllowed = await takeRateLimit(admin, serviceKey, 'client_lookup_ip', getRequestIp(req), 50);
    const phoneAllowed = await takeRateLimit(admin, serviceKey, 'client_lookup_phone', normalized, 5);
    if (!ipAllowed || !phoneAllowed) {
      sendJson(res, 429, { error: 'Too many lookup attempts. Please try again after 15 minutes.' });
      return;
    }
    const { data, error } = await admin.rpc('lookup_client_by_phone', { p_phone: phone });
    if (error) {
      console.error('[api/client-lookup] Database lookup failed:', error.message);
      sendJson(res, 503, { error: 'Client tracking is temporarily unavailable. Please try again later.' });
      return;
    }
    if (!data) {
      sendJson(res, 404, { error: 'No client record found for this phone number. Please verify the number or contact your coordinator.' });
      return;
    }
    sendJson(res, 200, data as Record<string, unknown>);
  } catch (err) {
    console.error('[api/client-lookup] Request failed:', err instanceof Error ? err.message : 'Unknown error');
    sendJson(res, 503, { error: 'Client tracking is temporarily unavailable. Please try again later.' });
  }
}
