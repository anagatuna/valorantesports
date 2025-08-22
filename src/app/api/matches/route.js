import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Match from "@/models/Match";

export async function GET() {
  try {
    await dbConnect(); // aquí esta la conexión

    const matches = await Match.find().sort({ startTime: 1 }).limit(10);
    return NextResponse.json({ items: matches });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
