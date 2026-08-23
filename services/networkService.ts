export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export const isOnline = () => !isOffline();

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Apps Script endpoints can hang well past a minute on a degraded link, which
 * would strand items in a 'syncing' state. Abort instead of waiting forever.
 */
export const fetchWithTimeout = async (
  input: RequestInfo,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};
