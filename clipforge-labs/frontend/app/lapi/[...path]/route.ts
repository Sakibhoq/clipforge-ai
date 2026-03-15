import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const LABS_BACKEND_FALLBACK_ORIGIN = "http://labs-backend:8000";

function resolveInternalApiOrigin(raw: string): string {
  const fallback = LABS_BACKEND_FALLBACK_ORIGIN;
  const value = (raw || "").trim().replace(/\/+$/, "");
  if (!value) return fallback;
  try {
    const parsed = new URL(value);
    const host = (parsed.hostname || "").toLowerCase();
    // Guard against accidental Orbito backend proxying.
    if (host === "backend" || host === "0.0.0.0") return fallback;
    return value;
  } catch {
    if (value.includes("backend:8000")) return fallback;
    return value || fallback;
  }
}

function internalApiOrigin(): string {
  return resolveInternalApiOrigin(
    process.env.LABS_INTERNAL_API_ORIGIN ||
      process.env.INTERNAL_API_ORIGIN ||
      LABS_BACKEND_FALLBACK_ORIGIN,
  );
}

function internalApiOrigins(): string[] {
  const primary = internalApiOrigin();
  if (primary === LABS_BACKEND_FALLBACK_ORIGIN) return [primary];
  return [primary, LABS_BACKEND_FALLBACK_ORIGIN];
}

function buildTargetUrl(base: string, path: string[]): string {
  const joined = Array.isArray(path) ? path.join("/") : "";
  return `${base}/${joined}`.replace(/([^:]\/)\/+/g, "$1");
}

function copyResponseHeaders(src: Headers): Headers {
  const out = new Headers();
  src.forEach((value, key) => {
    if (key.toLowerCase() === "content-length") return;
    out.append(key, value);
  });
  return out;
}

async function proxy(req: NextRequest, params: { path: string[] }) {
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");

  const method = req.method.toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);
  const bodyBuffer = hasBody ? Buffer.from(await req.arrayBuffer()) : undefined;
  const pathParts = Array.isArray(params.path) ? params.path : [];
  const isLabsRoute = String(pathParts[0] || "").toLowerCase() === "labs";

  let lastError: unknown = null;
  for (const base of internalApiOrigins()) {
    const target = buildTargetUrl(base, pathParts);
    const url = new URL(target);
    url.search = req.nextUrl.search;
    try {
      const upstream = await fetch(url.toString(), {
        method,
        headers,
        body: bodyBuffer,
        redirect: "manual",
        cache: "no-store",
      });

      // If Labs endpoint returns not found on primary upstream, try labs-backend fallback.
      if (upstream.status === 404 && isLabsRoute && base !== LABS_BACKEND_FALLBACK_ORIGIN) {
        continue;
      }

      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: copyResponseHeaders(upstream.headers),
      });
    } catch (err) {
      lastError = err;
      if (base !== LABS_BACKEND_FALLBACK_ORIGIN) {
        continue;
      }
    }
  }

  return NextResponse.json(
    {
      detail: "Labs API proxy is unavailable",
      error: lastError instanceof Error ? lastError.message : String(lastError || "unknown"),
    },
    { status: 502 },
  );
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await ctx.params);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await ctx.params);
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await ctx.params);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await ctx.params);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await ctx.params);
}

export async function OPTIONS(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await ctx.params);
}
