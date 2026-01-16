import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_URL ||
  "http://127.0.0.1:8000";

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";

    const formData = await req.formData();

    // Forward to FastAPI
    const upstream = await fetch(`${BACKEND_URL}/upload`, {
      method: "POST",
      headers: {
        // do NOT set Content-Type here; fetch will set proper multipart boundary automatically
        Authorization: auth,
      },
      body: formData,
    });

    const contentType = upstream.headers.get("content-type") || "";

    if (!upstream.ok) {
      const text = await upstream.text();
      return new NextResponse(text, {
        status: upstream.status,
        headers: {
          "content-type": contentType || "text/plain; charset=utf-8",
        },
      });
    }

    // Return JSON if backend returns JSON, otherwise pass-through text
    if (contentType.includes("application/json")) {
      const data = await upstream.json();
      return NextResponse.json(data, { status: upstream.status });
    } else {
      const text = await upstream.text();
      return new NextResponse(text, {
        status: upstream.status,
        headers: {
          "content-type": contentType || "text/plain; charset=utf-8",
        },
      });
    }
  } catch (e: any) {
    return NextResponse.json(
      { detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}
