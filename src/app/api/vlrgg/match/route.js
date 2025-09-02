import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const id  = searchParams.get("id");
  const url = searchParams.get("url");

  const upstream = id
    ? `https://vlrggapi.vercel.app/match?id=${encodeURIComponent(id)}`
    : url
    ? `https://vlrggapi.vercel.app/match?url=${encodeURIComponent(url)}`
    : null;

  if (!upstream) {
    return NextResponse.json({ error: "id or url required" }, { status: 400 });
  }

  try {
    const r = await fetch(upstream, { cache: "no-store" });
    const contentType = r.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await r.json() : await r.text();

    // Devuelve el cuerpo tal cual (JSON si viene JSON; si no, texto)
    return NextResponse.json(body, {
      status: r.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 502 });
  }
}
