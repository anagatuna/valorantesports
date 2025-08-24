// src/app/api/admin/backfill-startts/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Match from "@/models/Match";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  await dbConnect();
  const r = await Match.updateMany(
    { status: { $regex: "^COMPLETED$", $options: "i" }, $or: [{ startTs: null }, { startTs: { $exists: false } }] },
    [
      {
        $set: {
          startTs: {
            $cond: [
              { $and: [{ $ne: ["$startTs", null] }, { $ne: ["$startTs", undefined] }] },
              "$startTs",
              { $toLong: "$updatedAt" },
            ],
          },
        },
      },
    ]
  );
  return NextResponse.json({ updated: r.modifiedCount || 0 });
}
