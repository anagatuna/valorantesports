// src/lib/refresh.js
import dbConnect from "@/lib/dbConnect";
import Match from "@/models/Match";

/* ================= helpers ================= */

// LIVE | UPCOMING | COMPLETED
function normalizeStatus(raw){
  const s=(raw?.status||"").toString().toLowerCase();
  if(s.includes("live")) return "LIVE";
  if(s.includes("completed")||s.includes("final")) return "COMPLETED";
  if(s.includes("upcoming")||s.includes("scheduled")) return "UPCOMING";
  return "UPCOMING";
}

// "2d 3h 10m" => Date.now() + X
function parseInToFutureMs(str) {
  if (!str || typeof str !== "string") return null;
  const s = str.toLowerCase().replace(/live|en|•/g, "").trim();
  const m = s.match(/(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?/i);
  if (!m) return null;
  const d = parseInt(m[1] || "0", 10);
  const h = parseInt(m[2] || "0", 10);
  const mi = parseInt(m[3] || "0", 10);
  if (!d && !h && !mi) return null;
  return Date.now() + d * 86400000 + h * 3600000 + mi * 60000;
}

// "4h 22m" / "1d 3h" => Date.now() - X
function parseAgoToPastMs(str){
  if(!str||typeof str!=="string") return null;
  const s=str.toLowerCase().replace(/final|ago|hace|•/g,"").trim();
  const m=s.match(/(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?/i);
  if(!m) return null;
  const d=parseInt(m[1]||"0",10), h=parseInt(m[2]||"0",10), mi=parseInt(m[3]||"0",10);
  if(!d&&!h&&!mi) return null;
  return Date.now() - (d*86400000 + h*3600000 + mi*60000);
}

// "Aug 24" => ms (usa año actual)
const MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
function parseMonthDayToMs(s) {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b\.?\s+(\d{1,2})/i);
  if (!m) return null;
  const mm = MONTHS[m[1].slice(0, 3).toLowerCase()];
  const dd = parseInt(m[2], 10);
  if (mm == null || !dd) return null;
  const now = new Date();
  return new Date(now.getFullYear(), mm, dd, 0, 0, 0, 0).getTime();
}

// Si ambos scores son números, parece finalizado
function looksCompletedByScore(m) {
  const t = Array.isArray(m?.teams) ? m.teams : [];
  const toN = (i) => {
    const v = t[i]?.score;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const s1 = toN(0), s2 = toN(1);
  return s1 !== null && s2 !== null && (s1 !== 0 || s2 !== 0);
}

// Cálculo robusto de startTs
function calcStartTs(m) {
  if (typeof m?.startTs === "number") return m.startTs;

  if (m?.startTime) { const d = new Date(m.startTime); if (!isNaN(d)) return d.getTime(); }
  if (typeof m?.time_unix === "number") return m.time_unix > 1e12 ? m.time_unix : m.time_unix * 1000;
  if (typeof m?.unix === "number")      return m.unix      > 1e12 ? m.unix      : m.unix      * 1000;
  if (m?.time)       { const d = new Date(m.time);     if (!isNaN(d)) return d.getTime(); }
  if (m?.date_iso)   { const d = new Date(m.date_iso); if (!isNaN(d)) return d.getTime(); }
  if (m?.date) {
    const md = parseMonthDayToMs(m.date);
    if (md) return md;
  }

  // UPCOMING: "in: 2h 5m"
  if (String(m?.status).toUpperCase() === "UPCOMING") {
    const fut = parseInToFutureMs(m?.in || m?.time_str);
    if (fut) return fut;
  }

  // COMPLETED: "ago: 4h 22m"
  if (String(m?.status).toUpperCase() === "COMPLETED" && m?.ago) {
    const past = parseAgoToPastMs(m.ago);
    if (past) return past;
  }

  return null;
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch ${url} => ${res.status}`);
  return res.json();
}

/* ================= main ================= */

export async function refreshMatches() {
  await dbConnect();

  const BASE = "https://vlr.orlandomm.net/api/v1";

  // 1) feed principal (LIVE + UPCOMING)
  const matchesResp = await fetchJSON(`${BASE}/matches`);
  const matches = Array.isArray(matchesResp?.data) ? matchesResp.data : [];

  // 2) results (COMPLETED) si existe
  let results = [];
  try {
    const resultsResp = await fetchJSON(`${BASE}/results`);
    results = Array.isArray(resultsResp?.data) ? resultsResp.data : [];
  } catch {
    // si el proveedor no expone /results, lo ignoramos
  }

  // 3) normalización y startTs
  const now = new Date();
  const rows = [...matches, ...results].map((m) => {
    const normalized = { ...m };
    normalized.status = normalizeStatus(m);
    if (normalized.status !== "COMPLETED" && looksCompletedByScore(m)) {
      normalized.status = "COMPLETED";
    }
    normalized.startTs = calcStartTs({ ...m, status: normalized.status });
    return normalized;
  });

  // 4) upsert
  const ops = rows.map((m) => ({
    updateOne: {
      filter: { id: m.id },
      update: {
        $set: {
          ...m,
          status: m.status,
          startTs: typeof m.startTs === "number" ? m.startTs : null,
        },
        $setOnInsert: { createdAt: now },
        $currentDate: { updatedAt: true },
      },
      upsert: true,
    },
  }));

  let upserted = 0, modified = 0;
  if (ops.length) {
    const bw = await Match.bulkWrite(ops, { ordered: false });
    upserted = bw.upsertedCount ?? 0;
    modified = bw.modifiedCount ?? 0;
  }

  // 5) Promoción LIVE -> COMPLETED si ya debieron terminar y no aparecen en feed
  const liveIdsFromFeed = new Set(
    matches.filter((x) => normalizeStatus(x) === "LIVE").map((x) => x.id)
  );
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  const promoteRes = await Match.updateMany(
    {
      status: "LIVE",
      id: { $nin: Array.from(liveIdsFromFeed) },
      $or: [
        { startTs: { $type: "number", $lte: oneHourAgo } },
        { "teams.0.score": { $exists: true, $ne: "-" } },
        { "teams.1.score": { $exists: true, $ne: "-" } },
      ],
    },
    { $set: { status: "COMPLETED" }, $currentDate: { updatedAt: true } }
  );

  const out = {
    message: "Matches updated",
    upserted,
    modified,
    promotedToCompleted: promoteRes?.modifiedCount ?? 0,
    totals: {
      feedMatches: matches.length,
      feedResults: results.length,
      written: rows.length,
    },
  };

  if (process.env.NODE_ENV !== "production") {
    console.log("[refreshMatches]", out);
  }
  return out;
}

// refresca si está “stale”: 30s con LIVE, 5min sin LIVE
export async function refreshIfStaleForLive() {
  await dbConnect();

  const hasLive = (await Match.countDocuments({ status: "LIVE" })) > 0;
  const maxAgeMs = hasLive ? 30_000 : 300_000;

  const latest = await Match.findOne({}, { updatedAt: 1 }).sort({ updatedAt: -1 }).lean();
  const ageMs = latest?.updatedAt ? Date.now() - new Date(latest.updatedAt).getTime() : Infinity;

  if (ageMs > maxAgeMs) {
    return await refreshMatches();
  }
  return { skipped: true, ageMs, hasLive };
}
