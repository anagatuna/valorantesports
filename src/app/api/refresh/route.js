import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Match from "@/models/Match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function okKey(req) {
  const url = new URL(req.url);
  const q = url.searchParams.get("key");
  const h = req.headers.get("x-refresh-key");
  return (q && q === process.env.REFRESH_SECRET) || (h && h === process.env.REFRESH_SECRET);
}

export async function GET(req) {
  if (!okKey(req)) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  return refresh();
}

export async function POST(req) {
  if (!okKey(req)) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  return refresh();
}

async function refresh() {
  try {
    await dbConnect();
    const resp = await fetch("https://vlr.orlandomm.net/api/v1/matches", { cache: "no-store" });
    const { data } = await resp.json();
    const ops = (data || []).map(m => ({ updateOne: { filter: { id: m.id }, update: { $set: m }, upsert: true } }));
    if (!ops.length) return NextResponse.json({ message: "Sin datos" });
    const res = await Match.bulkWrite(ops, { ordered: false });
    return NextResponse.json({ message: "Matches updated", upserted: res.upsertedCount ?? 0, modified: res.modifiedCount ?? 0 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
