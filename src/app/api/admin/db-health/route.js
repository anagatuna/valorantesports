//\src\app\api\admin\db-health\route.js
//export const dynamic = "force-dynamic";
//export const runtime = "nodejs";
//export const revalidate = 0;
//export const fetchCache = "force-no-store";
//
//import { NextResponse } from "next/server";
//import mongoose from "mongoose";
//import dbConnect from "@/lib/dbConnect";
//import Match from "@/models/Match";
//
//export async function GET() {
//  try {
//    const conn = await dbConnect();
//    const { name: dbName } = conn.connection;
//    const colName = Match.collection.name;
//
//    const [live, upc, comp, latest] = await Promise.all([
//      Match.countDocuments({ status: /live/i }),
//      Match.countDocuments({ status: /upcoming/i }),
//      Match.countDocuments({ status: /completed|final/i }),
//      Match.findOne({}, { updatedAt: 1, startTs: 1, status: 1, id: 1 })
//        .sort({ updatedAt: -1 }).lean(),
//    ]);
//
//    return NextResponse.json({
//      dbName,
//      collection: colName,
//      counts: { live, upcoming: upc, completed: comp },
//      latestUpdatedAt: latest?.updatedAt ?? null,
//      latestId: latest?.id ?? null,
//      latestStatus: latest?.status ?? null,
//      hasStartTs: typeof latest?.startTs === "number",
//      mongooseState: mongoose.connection.readyState, // 1 = conectado
//    });
//  } catch (e) {
//    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
//  }
//}
//