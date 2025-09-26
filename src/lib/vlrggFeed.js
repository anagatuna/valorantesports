// src/lib/vlrggFeed.js
const MAP_IMAGES = {
  abyss: "/maps/abyss.webp",
  ascent: "/maps/ascent.webp",
  bind: "/maps/bind.webp",
  breeze: "/maps/breeze.webp",
  corrode: "/maps/corrode.webp",
  fracture: "/maps/fracture.webp",
  haven: "/maps/haven.webp",
  icebox: "/maps/icebox.webp",
  lotus: "/maps/lotus.webp",
  pearl: "/maps/pearl.webp",
  split: "/maps/split.webp",
  sunset: "/maps/sunset.webp",
  unknown: "/maps/unknown.webp",
};

const norm = (s = "") =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

function resolveMapImage(name) {
  const k = norm(name || "");
  return MAP_IMAGES[k] || MAP_IMAGES.unknown || null;
}

// "2025-09-02 17:00:00" -> ms (asumiendo UTC para no desfasar)
function parseVlrTimeAsUTC(s) {
  if (!s) return null;
  const iso = s.replace(" ", "T") + "Z";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function segmentToMatch(seg, explicitStatus) {
  const t1 = (seg?.team1 || "").trim();
  const t2 = (seg?.team2 || "").trim();
  const s1 = toNum(seg?.score1);
  const s2 = toNum(seg?.score2);
  const currentMap = seg?.current_map || null;

  const startTs = parseVlrTimeAsUTC(seg?.unix_timestamp);

  const status = explicitStatus || (String(seg?.time_until_match || "").toUpperCase().includes("LIVE")
    ? "LIVE"
    : startTs && startTs < Date.now()
      ? "FINAL" // por si VLR manda resultado en el feed
      : "UPCOMING");

  return {
    id: seg?.match_page || `${t1}-${t2}-${startTs || Date.now()}`,
    status,
    startTs, // renderizamos en la TZ del usuario en el ScheduleCard
    event: seg?.match_series || seg?.match_event || "MATCH",
    teams: [
      { name: t1, score: status === "UPCOMING" ? null : s1 },
      { name: t2, score: status === "UPCOMING" ? null : s2 },
    ],
    currentMap,
    mapImage: currentMap ? resolveMapImage(currentMap) : null,
    vlrUrl: seg?.match_page || null,
  };
}

async function getSegments(q) {
  try {
    // usamos el proxy local para evitar CORS/bloqueos del navegador
    const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/vlrgg/list?q=${encodeURIComponent(q)}`, { cache: "no-store" });
    if (!r.ok) return [];
    const j = await r.json();
    // tus respuestas vienen como { data: { status: 200, segments: [...] } }
    return Array.isArray(j?.data?.segments) ? j.data.segments : [];
  } catch {
    return [];
  }
}

function splitTodayAndNext(matches) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const startOfToday = new Date(y, m, d).getTime();
  const endOfToday = startOfToday + 24 * 60 * 60 * 1000;

  const today = [];
  const next = [];
  for (const mth of matches) {
    const ts = mth.startTs ?? 0;
    if (ts >= startOfToday && ts < endOfToday) today.push(mth);
    else if (ts >= endOfToday) next.push(mth);
    else today.push(mth); // sin fecha -> lo dejamos en hoy
  }
  return { today, next };
}

export async function getUpcomingTodayAndNextFromVlrgg() {
  // live
  const liveSegs = await getSegments("live_score");
  const live = liveSegs.map((s) => segmentToMatch(s, "LIVE"));

  // upcoming (probamos varios q por compatibilidad)
  const candidates = ["upcoming", "schedule", "upcoming_matches"];
  let upcomingSegs = [];
  for (const q of candidates) {
    upcomingSegs = await getSegments(q);
    if (upcomingSegs.length) break;
  }
  const upcoming = upcomingSegs.map((s) => segmentToMatch(s, "UPCOMING"));

  // mezclamos: LIVE primero + UPCOMING, ordenado por hora
  const all = [...live, ...upcoming]
    .filter((m) => m) 
    .sort((a, b) => (a.startTs ?? 0) - (b.startTs ?? 0));

  const { today, next } = splitTodayAndNext(all);
  return {
    today: { items: today },
    next: { items: next },
  };
}

export async function getCompletedTodayOrPrevFromVlrgg(size = 50) {
  const url = `https://vlr.orlandomm.net/api/v1/results?size=${size}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return { items: [] };
  const j = await r.json();

  const items = (j?.data || []).map(row => ({
    id: row.id,
    status: "FINAL",                   // normalizamos a lo que usa ScheduleCard
    event: row.event || "",            // ← IMPORTANTE: pasa el event del API
    tournament: row.tournament || "",
    // opcional: guarda la url del match si la tienes en otro lado
    // vlrUrl: row.url || null,

    teams: (row.teams || []).map(t => ({
      name: t.name,
      score: Number.isFinite(Number(t.score)) ? Number(t.score) : t.score,
      won: !!t.won,
      country: t.country || null,
    })),

    // puedes agregar más campos si los necesitas
    img: row.img || null,
    ago: row.ago || null,
  }));

  return { items };
}
