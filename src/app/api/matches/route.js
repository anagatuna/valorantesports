// src/app/api/matches/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Match from "@/models/Match";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toInt(v, d){ const n=parseInt(v??"",10); return Number.isFinite(n)&&n>0?n:d; }

export async function GET(req){
  try{
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const statusRaw = searchParams.get("status") || "";
    const status = statusRaw.toUpperCase();
    const page  = Math.max(1, toInt(searchParams.get("page"), 1));
    const limit = Math.min(200, toInt(searchParams.get("limit"), 50));

    const filter = {};
    if (status) filter.status = { $regex: `^${status}$`, $options: "i" };

    const pipeline = [
      { $match: filter },
      {
        $addFields: {
          _orderTs: {
            $ifNull: ["$completedAtTs", { $ifNull: ["$startTs", "$updatedAt"] }]
          }
        }
      },
      ...(status === "COMPLETED"
        ? [{ $sort: { _orderTs: -1, _id: -1 } }]
        : [{ $sort: { _orderTs:  1, _id:  1 } }]),
      { $skip: (page-1)*limit },
      { $limit: limit }
    ];

    const [items, total] = await Promise.all([
      Match.aggregate(pipeline).exec(),
      Match.countDocuments(filter),
    ]);

    return NextResponse.json({
      data: items.map(m => ({
        ...m,
        startTs: typeof m.startTs==="number" ? m.startTs : new Date(m._orderTs || m.updatedAt).getTime(),
        status: (m.status||"").toUpperCase(),
      })),
      page, limit, total
    });
  }catch(e){
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
