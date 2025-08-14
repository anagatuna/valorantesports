// src/app/api/set_region/route.js
import { NextResponse } from "next/server";

export async function POST(req) {
  let region = "AMERICAS";

  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const body = await req.json();
      region = (body.region || "AMERICAS").toString();
    } else {
      const fd = await req.formData();
      region = (fd.get("region") || "AMERICAS").toString();
    }
  } catch {}

  const res = NextResponse.json({ ok: true, region });
  res.cookies.set("region", region, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
  });
  return res;
}
