// src/app/api/vlrgg/live/route.js
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const upstream = "https://vlrggapi.vercel.app/match?q=live_score";
    const r = await fetch(upstream, { cache: "no-store" });
    const ct = r.headers.get("content-type") || "";
    const body = ct.includes("application/json") ? await r.json() : await r.text();

    return NextResponse.json(body, {
      status: r.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "fetch failed" },
      { status: 502, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
