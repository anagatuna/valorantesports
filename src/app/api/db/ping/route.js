import { NextResponse } from "next/server";
import mongoose from "mongoose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redact(uri) {
  try {
    const u = new URL(uri);
    const user = u.username;
    const host = u.host;
    const db = u.pathname || "/";
    return `mongodb+srv://${user}:***@${host}${db}`;
  } catch {
    return "URI inválida";
  }
}

export async function GET() {
  const uri = process.env.MONGODB_URI || "";
  const redacted = redact(uri);

  // reduce el tiempo de espera para no colgarse
  const opts = { serverSelectionTimeoutMS: 6000 };

  try {
    // fuerza nueva conexión para diagnóstico
    await mongoose.disconnect().catch(() => {});
    await mongoose.connect(uri, opts);
    await mongoose.connection.db.admin().command({ ping: 1 });
    await mongoose.disconnect();
    return NextResponse.json({ ok: true, uri: redacted });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        uri: redacted,
        message: e.message,
        // detalles útiles que suelen indicar el problema
        reason: e.reason?.codeName || null,
      },
      { status: 500 }
    );
  }
}
