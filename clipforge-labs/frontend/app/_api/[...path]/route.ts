import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function internalApiOrigin(): string {
  return (
    process.env.INTERNAL_API_ORIGIN ||
    process.env.LABS_INTERNAL_API_ORIGIN ||
    "http://labs-backend:8000"
  )
    .trim()
    .replace(/\/+$/, "");
}

function buildTargetUrl(path: string[]): string {
  const base = internalApiOrigin();
  const joined = Array.isArray(path) ? path.join("/") : "";
  return `${base}/${joined}`.replace(/([^:]\/)\/+/g, "$1");
}

function copyResponseHeaders(src: Headers): Headers {
  const out = new Headers();
  src.forEach((value, key) => {
    // Let platform compute transfer/content length.
    if (key.toLowerCase() === "content-length") return;
    out.append(key, value);
  });
  return out;
}

async function proxy(req: NextRequest, params: { path: string[] }) {
  const target = buildTargetUrl(params.path);
  const url = new URL(target);
  url.search = req.nextUrl.search;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");

  const method = req.method.toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);
  const bodyBuffer = hasBody ? Buffer.from(await req.arrayBuffer()) : undefined;

  const upstream = await fetch(url.toString(), {
    method,
    headers,
    body: bodyBuffer,
    redirect: "manual",
    cache: "no-store",
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: copyResponseHeaders(upstream.headers),
  });
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
