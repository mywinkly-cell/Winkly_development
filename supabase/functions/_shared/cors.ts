type CorsOptions = {
  allowedOrigins: string[];
};

type CorsHeaderOverrides = {
  methods?: string;
  headers?: string;
};

function parseAllowedOrigins(): string[] {
  const raw = Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "";
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Safe dev default: allow common local origins when not configured.
  return items.length
    ? items
    : ["http://localhost:3000", "http://localhost:8081", "http://127.0.0.1:3000", "http://127.0.0.1:8081"];
}

export function getCorsOptions(): CorsOptions {
  return { allowedOrigins: parseAllowedOrigins() };
}

export function corsHeaders(req: Request, overrides?: CorsHeaderOverrides): Headers {
  const origin = req.headers.get("Origin") ?? "";
  const { allowedOrigins } = getCorsOptions();

  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? "";

  const h = new Headers();
  if (allowOrigin) h.set("Access-Control-Allow-Origin", allowOrigin);
  h.set("Vary", "Origin");
  h.set("Access-Control-Allow-Methods", overrides?.methods ?? "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", overrides?.headers ?? "Authorization, Content-Type");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

export function withCorsJson(req: Request, body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers ?? {});
  const cors = corsHeaders(req);
  for (const [k, v] of cors.entries()) headers.set(k, v);
  if (!headers.get("Content-Type")) headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function withCorsEmpty(req: Request, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers ?? {});
  const cors = corsHeaders(req);
  for (const [k, v] of cors.entries()) headers.set(k, v);
  return new Response(null, { ...init, headers });
}
