import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q"); // ej: 'live_score', 'upcoming', 'results'
  if (!q) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }
  const upstream = `https://vlrggapi.vercel.app/match?q=${encodeURIComponent(q)}`;

  try {
    const r = await fetch(upstream, { cache: "no-store" });
    const ct = r.headers.get("content-type") || "";
    const body = ct.includes("application/json") ? await r.json() : await r.text();
    return NextResponse.json(body, {
      status: r.status,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 502 });
  }
}
