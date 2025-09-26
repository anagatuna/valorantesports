// app/api/vlr/match/route.js
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const id   = searchParams.get("id");
  const url  = searchParams.get("url");
  const path = searchParams.get("path");

  // path y url son equivalentes aquí
  const upstream = id
    ? `https://vlrggapi.vercel.app/match?id=${encodeURIComponent(id)}`
    : (url || path)
    ? `https://vlrggapi.vercel.app/match?url=${encodeURIComponent(url || path)}`
    : null;

  if (!upstream) {
    return NextResponse.json({ error: "id or url (or path) required" }, { status: 400 });
  }

  try {
    const r = await fetch(upstream, { cache: "no-store" });
    const json = await r.json();
    return NextResponse.json(json, {
      status: r.status,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 502 });
  }
}
