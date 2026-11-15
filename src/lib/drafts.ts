/**
 * Safe, non-sensitive draft persistence in sessionStorage.
 * Strictly avoids storing passwords, OTPs, passport numbers, medical info, or file blobs.
 */

const DRAFT_PREFIX = 'gp_safe_draft_v1_';

export function saveSafeDraft<T extends Record<string, unknown>>(
  key: string,
  payload: T
): void {
  try {
    sessionStorage.setItem(
      `${DRAFT_PREFIX}${key}`,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        data: payload,
      })
    );
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function loadSafeDraft<T extends Record<string, unknown>>(
  key: string
): { savedAt: string; data: T } | null {
  try {
    const raw = sessionStorage.getItem(`${DRAFT_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: string; data?: T };
    if (!parsed || typeof parsed !== 'object' || !parsed.data) return null;
    return {
      savedAt: parsed.savedAt || new Date().toISOString(),
      data: parsed.data,
    };
  } catch {
    return null;
  }
}

export function clearSafeDraft(key: string): void {
  try {
    sessionStorage.removeItem(`${DRAFT_PREFIX}${key}`);
  } catch {
    // Ignore
  }
}

export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
