// AlignMD — shared HTTP helper for job-feed adapters.
//
// Every external request goes through here so the timeout + abort behavior is
// uniform. Adapters stay defensive: this resolves to the Response, and the
// caller is still responsible for try/catch around the whole fetch().

const DEFAULT_TIMEOUT_MS = 12_000;

/** GET a URL with an AbortController timeout. Throws on network error/abort. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      // Always hit the live feed — never serve a stale cached response.
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}
