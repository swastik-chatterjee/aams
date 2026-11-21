/**
 * Small helpers shared by the API routes: tolerant body parsing (form or
 * JSON), client IP extraction, and consistent JSON/redirect responses.
 */

export async function readBody(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      const json: unknown = await request.json();
      if (json && typeof json === 'object' && !Array.isArray(json)) {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
          if (typeof v === 'string') out[k] = v;
        }
        return out;
      }
    } catch {
      // fall through
    }
    return {};
  }

  try {
    const form = await request.formData();
    const out: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function wantsJson(request: Request): boolean {
  const contentType = request.headers.get('content-type') ?? '';
  const accept = request.headers.get('accept') ?? '';
  return contentType.includes('application/json') || accept.includes('application/json');
}

export function clientIp(request: Request, fallback: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return fallback;
}

export function jsonError(message: string, status: number, code?: string): Response {
  return new Response(JSON.stringify({ error: message, code: code ?? 'error' }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function jsonOk(data: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
