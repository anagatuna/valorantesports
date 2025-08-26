//export const runtime = "nodejs";
//export const dynamic = "force-dynamic";
//export const revalidate = 0;
//export const fetchCache = "force-no-store";
//
//import { NextResponse } from "next/server";
//import dbConnect from "@/lib/dbConnect";
//import Match from "@/models/Match";
//
//export async function GET() {
//  try {
//    await dbConnect();
//
//    // 1) Baja el feed externo
//    const r = await fetch("https://vlr.orlandomm.net/api/v1/matches", { cache: "no-store" });
//    if (!r.ok) return NextResponse.json({ error: `externo ${r.status}` }, { status: 502 });
//    const { data } = await r.json();
//    const external = data || [];
//
//    // 2) Busca esos mismos IDs en la DB
//    const ids = external.map(m => String(m.id));
//    const dbMatches = await Match.find({ id: { $in: ids } }).lean();
//
//    // 3) Compara campo por campo
//    const diffs = [];
//    for (const ext of external) {
//      const dbDoc = dbMatches.find(d => String(d.id) === String(ext.id));
//      if (!dbDoc) {
//        diffs.push({ id: ext.id, issue: "missing in DB" });
//        continue;
//      }
//
//      const statusDiff = dbDoc.status !== ext.status;
//      const scoreDiff =
//        (dbDoc.teams?.[0]?.score !== ext.teams?.[0]?.score) ||
//        (dbDoc.teams?.[1]?.score !== ext.teams?.[1]?.score);
//
//      if (statusDiff || scoreDiff) {
//        diffs.push({
//          id: ext.id,
//          status_api: ext.status,
//          status_db: dbDoc.status,
//          score_api: ext.teams?.map(t => t.score),
//          score_db: dbDoc.teams?.map(t => t.score),
//        });
//      }
//    }
//
//    return NextResponse.json({
//      checked: external.length,
//      diffsCount: diffs.length,
//      diffs: diffs.slice(0, 20), // muestra solo los primeros 20 para no explotar
//    });
//  } catch (e) {
//    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
//  }
//}
