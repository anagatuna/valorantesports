// src/app/api/admin/force-resync/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Match from "@/models/Match";
import { refreshMatches } from "@/lib/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    await dbConnect();

    // ⚠️ Elimina todo
    const delRes = await Match.deleteMany({});
    console.log(`[force-resync] eliminados=${delRes.deletedCount}`);

    // 🔄 Reimporta desde el API externo
    const refRes = await refreshMatches();

    return NextResponse.json({
      message: "Resync completo",
      deleted: delRes.deletedCount,
      ...refRes,
    });
  } catch (err) {
    console.error("[force-resync] ERROR", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
