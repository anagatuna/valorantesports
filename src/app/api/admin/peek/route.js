//src\app\api\admin\peek\route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Match from "@/models/Match";

export async function GET(req) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id"); // ej: 530929
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    const doc = await Match.findOne({ id }).lean();
    if (!doc) return NextResponse.json({ found: false });

    return NextResponse.json({
      found: true,
      id: doc.id,
      status: doc.status,
      updatedAt: doc.updatedAt,
      createdAt: doc.createdAt,
      startTs: doc.startTs ?? null,
      hasStartTime: Boolean(doc.startTime),
      sample: {
        event: doc.event, tournament: doc.tournament,
        team1: doc.teams?.[0]?.name, team2: doc.teams?.[1]?.name,
      }
    });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
