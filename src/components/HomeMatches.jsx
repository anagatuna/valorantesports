//src/components/HomeMatches.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ScheduleCard from "@/components/ScheduleCard";
import { loadLogosFromCache, saveLogosToCache } from "@/utils/teamLogoCache";
import MatchDetail from "@/components/MatchDetail";
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURACIÓN SUPABASE ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/* ================== Mapas locales ================== */
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
const normMap = (s = "") =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const resolveMapImage = (mapName) => {
  const key = normMap(mapName || "");
  return MAP_IMAGES[key] || MAP_IMAGES.unknown || null;
};

/* ================== Normalizador para detectar el evento ================== */
function resolveEvent(raw = {}) {
  return (
    (raw.event && String(raw.event).trim()) ||
    (raw.tournament && String(raw.tournament).trim()) ||
    (raw.league?.name && String(raw.league.name).trim()) ||
    (raw.stage?.event && String(raw.stage.event).trim()) ||
    (raw.series?.event && String(raw.series.event).trim()) ||
    (raw.stage?.name && String(raw.stage.name).trim()) ||
    ""
  );
}
function normalizeMatch(raw = {}) {
  return { ...raw, event: resolveEvent(raw) };
}

function mapCompletedItem(seg = {}) {
  const teams =
    Array.isArray(seg.teams) && seg.teams.length >= 2
      ? seg.teams
      : [
        { name: seg.team1, score: Number(seg.score1) },
        { name: seg.team2, score: Number(seg.score2) },
      ];

  const time_completed =
    seg.time_completed ??
    seg.timeCompleted ??
    seg.completed_ago ??
    seg.completedAgo ??
    seg.finished_ago ??
    seg.finishedAgo ??
    seg.timeago ??
    seg.ago ??
    null;

  const match_page = seg.match_page ?? seg.matchPage ?? seg.vlrUrl ?? seg.url ?? null;

  return {
    ...seg,
    status: "FINAL",
    teams,
    time_completed,
    match_page,
  };
}

/* ================== Logos (SUPABASE + PROXY) ================== */
async function ensureLogosFor(matches) {
  const needed = new Set();
  // Recolectamos nombres de equipos
  for (const m of matches) {
    (m.teams || []).forEach((t) => t?.name && needed.add(t.name.trim()));
  }

  const cleanNames = [...needed];
  if (cleanNames.length === 0) return { logoMap: {}, teamList: [] };

  // 1. Cargar cache local (localStorage) para no saturar Supabase
  const cached = loadLogosFromCache();
  const logoMap = cached?.logoMap || {};

  // 2. Filtrar qué nos falta
  const missingNames = cleanNames.filter(name => {
    const key = name.toLowerCase().replace(/[\s\-_\.]+/g, "").trim();
    return !logoMap[key];
  });

  // 3. Si falta algo, pedirlo a Supabase
  if (missingNames.length > 0) {
    try {
      // Nota: Usamos la columna 'img' que es donde guardaste la URL de VLR
      const { data: teamsData } = await supabase
        .from('teams')
        .select('name, img')
        .in('name', missingNames);

      if (teamsData) {
        teamsData.forEach((team) => {
          if (!team.img) return;

          const normalizedKey = team.name.toLowerCase().replace(/[\s\-_\.]+/g, "").trim();

          // 🔴 AQUÍ APLICAMOS EL PROXY 🔴
          // Convertimos la URL externa (https://owcdn...) en ruta interna (/api/image-proxy?url=...)
          const proxiedUrl = `/api/image-proxy?url=${encodeURIComponent(team.img)}`;

          logoMap[normalizedKey] = proxiedUrl;
        });
      }
    } catch (err) {
      console.error("Error fetching logos form Supabase:", err);
    }
  }

  // 4. Guardar en cache local y retornar
  saveLogosToCache(logoMap, []);
  return { logoMap, teamList: [] };
}

/* ================== Live cache (persiste entre reloads) ================== */
const LIVE_CACHE_KEY = "vlr_live_rounds_v2";

function readLiveCache() {
  try {
    const raw = localStorage.getItem(LIVE_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function writeLiveCache(obj) {
  try {
    localStorage.setItem(LIVE_CACHE_KEY, JSON.stringify(obj));
  } catch { }
}
function liveCacheId(seg) {
  const url = (seg?.match_page || "").trim();
  const map = mapKeyOf(seg);
  return url && map ? `${url}::${map}` : null;
}

/* ================== Matching/clean ================== */
const clean = (s = "") =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function teamsRoughEqual(a = "", b = "") {
  const A = clean(a);
  const B = clean(b);
  if (!A || !B) return false;
  return A === B || A.includes(B) || B.includes(A);
}

/* ================== Feed helpers ================== */
async function fetchLiveSegmentsFromProxy() {
  try {
    // Ajusta esta URL si tu endpoint de live score es diferente
    const r = await fetch(`/api/vlrgg/list?q=live_score&_=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j?.data?.segments) ? j.data.segments : [];
  } catch {
    return [];
  }
}

function getSegMapName(seg = {}) {
  return seg?.current_map || seg?.actual_map || seg?.map || seg?.currentMap || seg?.actualMap || null;
}

/* ================== Rondas (lectura de feed) ================== */
const toInt = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

function getSegSeries(seg = {}) {
  const wins1 =
    toInt(seg.series_score1) ?? toInt(seg.maps1) ?? toInt(seg.series1) ?? toInt(seg.score1);
  const wins2 =
    toInt(seg.series_score2) ?? toInt(seg.maps2) ?? toInt(seg.series2) ?? toInt(seg.score2);

  const bestOf =
    toInt(seg.best_of) ??
    toInt(seg.bo) ??
    toInt(seg.max_maps) ??
    toInt(seg.series_best_of) ??
    toInt(seg.format?.bo) ??
    null;

  return { wins1: wins1 ?? 0, wins2: wins2 ?? 0, bestOf };
}

/* ===== Clave estable de mapa ===== */
const mapKeyOf = (seg) =>
  String(seg?.current_map || seg?.map || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();

/* ================== Reconstrucción CT/T con OT ================== */
function readProvided(seg = {}, team = 1) {
  const ct = Number(seg?.[`team_${team}_round_ct`]) || Number(seg?.[`team${team}_round_ct`]);
  const t = Number(seg?.[`team_${team}_round_t`]) || Number(seg?.[`team${team}_round_t`]);
  const hasCT = Number.isFinite(ct);
  const hasT = Number.isFinite(t);
  return {
    provided: hasCT ? ct : hasT ? t : null,
    side: hasCT ? "CT" : hasT ? "T" : null,
  };
}
function opposite(side) {
  return side === "CT" ? "T" : side === "T" ? "CT" : null;
}
function sideForRound(startSide, roundIndex) {
  if (!startSide) return null;
  if (roundIndex < 12) return startSide;
  if (roundIndex < 24) return opposite(startSide);
  return (roundIndex - 24) % 2 === 0 ? opposite(startSide) : startSide;
}
function distributeByPattern(startSide, fromRound, wins) {
  let ct = 0,
    t = 0;
  for (let i = 0; i < wins; i++) {
    const side = sideForRound(startSide, fromRound + i);
    if (side === "CT") ct++;
    else if (side === "T") t++;
  }
  return { ct, t };
}

function looksRegressive(prevTotals, curTotals) {
  return curTotals + 1 <= prevTotals;
}

function mergeLiveRounds(prevRounds = null, seg = null, prevKey = "", prevMeta = {}) {
  const key = mapKeyOf(seg);
  const sameMap = key && prevKey && key === prevKey;

  const cache = readLiveCache();
  const cid = liveCacheId(seg);
  const cached = cid ? cache[cid] : null;

  const baseRounds =
    sameMap && prevRounds
      ? { ...prevRounds }
      : cached?.rounds
        ? { ...cached.rounds }
        : { t1ct: 0, t1t: 0, t2ct: 0, t2t: 0 };

  const baseMeta =
    sameMap && prevMeta
      ? { ...prevMeta }
      : cached?.meta
        ? { ...cached.meta }
        : {
          start1: null,
          start2: null,
          _prov1: 0,
          _prov2: 0,
          _total: 0,
          lastStableTotal: 0,
          _wins1: Number(prevMeta?._wins1 ?? 0),
          _wins2: Number(prevMeta?._wins2 ?? 0),
          mapWin: false,
        };

  const r1 = readProvided(seg, 1);
  const r2 = readProvided(seg, 2);

  if (!baseMeta.start1 && r1.side) baseMeta.start1 = r1.side;
  if (!baseMeta.start2 && r2.side) baseMeta.start2 = r2.side;

  const prov1 = Number.isFinite(r1.provided) ? r1.provided : baseMeta._prov1;
  const prov2 = Number.isFinite(r2.provided) ? r2.provided : baseMeta._prov2;

  const prevTotal = (baseMeta._prov1 || 0) + (baseMeta._prov2 || 0);
  const curTotal = prov1 + prov2;

  if (sameMap && looksRegressive(prevTotal, curTotal)) {
    return { rounds: baseRounds, mapKey: prevKey, meta: baseMeta };
  }

  baseMeta.lastStableTotal = Math.max(baseMeta.lastStableTotal || 0, curTotal);

  const d1 = Math.max(0, prov1 - (baseMeta._prov1 || 0));
  const d2 = Math.max(0, prov2 - (baseMeta._prov2 || 0));

  if ((d1 > 0 || d2 > 0) && baseMeta.start1 && baseMeta.start2) {
    if (d1 > 0) {
      const dist = distributeByPattern(baseMeta.start1, prevTotal, d1);
      baseRounds.t1ct += dist.ct; baseRounds.t1t += dist.t;
    }
    if (d2 > 0) {
      const dist = distributeByPattern(baseMeta.start2, prevTotal, d2);
      baseRounds.t2ct += dist.ct; baseRounds.t2t += dist.t;
    }
  }

  const s = getSegSeries(seg) || { wins1: 0, wins2: 0, bestOf: null };
  const curW1 = Number(s.wins1 || 0);
  const curW2 = Number(s.wins2 || 0);
  const prevW1 = Number(baseMeta._wins1 || 0);
  const prevW2 = Number(baseMeta._wins2 || 0);

  const total1 = baseRounds.t1ct + baseRounds.t1t;
  const total2 = baseRounds.t2ct + baseRounds.t2t;

  const canSnap = sameMap && prevTotal > 0;
  if ((curW1 > prevW1 || curW2 > prevW2) && canSnap) {
    const winner = curW1 > prevW1 ? 1 : 2;
    const totalWinner = winner === 1 ? total1 : total2;

    if (totalWinner < 13) {
      const missing = 13 - totalWinner;
      const startSide = winner === 1 ? baseMeta.start1 : baseMeta.start2;
      const dist = distributeByPattern(startSide, prevTotal + d1 + d2, missing);
      if (winner === 1) {
        baseRounds.t1ct += dist.ct; baseRounds.t1t += dist.t;
      } else {
        baseRounds.t2ct += dist.ct; baseRounds.t2t += dist.t;
      }
    }
    baseMeta.mapWin = true;
  }

  const meta = {
    ...baseMeta,
    _prov1: prov1,
    _prov2: prov2,
    _total: curTotal,
    _wins1: curW1,
    _wins2: curW2,
  };

  if (cid) {
    cache[cid] = { rounds: baseRounds, meta, ts: Date.now() };
    writeLiveCache(cache);
  }

  return { rounds: baseRounds, mapKey: key, meta };
}

// Helpers extra
function inferSeriesTitleFromItem(m = {}) {
  const cand =
    m.seriesTitle ||
    m.match_series ||
    m.series_name ||
    m.round_info ||
    m.roundInfo ||
    m.stage?.round ||
    m.stage?.name ||
    m.bracket?.round_name ||
    m.bracket_round ||
    m.group_round ||
    m.group?.round ||
    m.event_phase ||
    null;
  return cand ? String(cand).replace(/\s+/g, " ").trim() : null;
}

function decorateWithLocalMapAndSeries(m) {
  const base = decorateWithLocalMap(m);
  const ser = inferSeriesTitleFromItem(base);
  return ser ? { ...base, seriesTitle: ser } : base;
}

function getMapNameLocal(m = {}) {
  return (
    m.currentMap ||
    m.map ||
    m.liveMap ||
    m.live_map ||
    m.mapName ||
    m.actual_map ||
    m.actualMap ||
    m.stage?.map ||
    m.series?.current_map ||
    m.series?.actual_map ||
    null
  );
}
function decorateWithLocalMap(m) {
  const name = getMapNameLocal(m);
  return name ? { ...m, currentMap: name, mapImage: resolveMapImage(name) } : m;
}

function isMapFinal(r) {
  const a = (r?.t1ct || 0) + (r?.t1t || 0);
  const b = (r?.t2ct || 0) + (r?.t2t || 0);
  const mx = Math.max(a, b),
    mn = Math.min(a, b);
  return (mx >= 13 && mx - mn >= 2) || mx >= 14;
}

function seriesTargetWins(bestOf) {
  return Math.ceil((Number(bestOf) || 3) / 2);
}
function isSeriesOver(m) {
  const bo = Number(m?.series?.bestOf || 3);
  const tw = seriesTargetWins(bo);
  return Number(m?.series?.wins1 || 0) >= tw || Number(m?.series?.wins2 || 0) >= tw;
}

const FINAL_COOLDOWN_MS = 180_000;

function markFinalMeta(m) {
  const meta = { ...(m._mapMeta || {}) };
  meta.finalTs = Date.now();
  return { ...m, _mapMeta: meta };
}

function shouldResetForNextMap(m, seg) {
  const meta = m?._mapMeta || {};
  const segMap = getSegMapName(seg);
  const segMapNum = Number(seg?.map_number ?? seg?.mapNumber ?? NaN);
  const curMapNum = Number(m?.mapNumber ?? NaN);

  const p1 =
    Number(seg?.team_1_round_ct || seg?.team1_round_ct || seg?.team_1_round_t || seg?.team1_round_t || 0) || 0;
  const p2 =
    Number(seg?.team_2_round_ct || seg?.team2_round_ct || seg?.team_2_round_t || seg?.team2_round_t || 0) || 0;
  const sum = p1 + p2;

  const mapNumberAdvanced = Number.isFinite(segMapNum) && Number.isFinite(curMapNum) && segMapNum > curMapNum;
  const mapNameChanged = !!segMap && segMap !== m.currentMap;
  const newRoundsOnNewMap = (mapNumberAdvanced || mapNameChanged) && sum >= 0;

  if (mapNumberAdvanced || mapNameChanged || newRoundsOnNewMap) return true;

  if (!meta.finalTs) return false;
  const cooled = Date.now() - meta.finalTs >= FINAL_COOLDOWN_MS;
  const looksReset = sum === 0;

  return cooled && looksReset;
}

function resetMapState(m, seg) {
  const segMap = getSegMapName(seg);
  const newKey = mapKeyOf({ map: segMap });

  const start1 = m?._mapMeta?.start1 || null;
  const start2 = m?._mapMeta?.start2 || null;

  const freshMeta = {
    start1,
    start2,
    _prov1: 0,
    _prov2: 0,
    _total: 0,
    lastStableTotal: 0,
    _wins1: m?._mapMeta?._wins1 ?? m?.series?.wins1 ?? 0,
    _wins2: m?._mapMeta?._wins2 ?? m?.series?.wins2 ?? 0,
    mapWin: false,
    finalTs: undefined
  };

  const freshRounds = { t1ct: 0, t1t: 0, t2ct: 0, t2t: 0 };
  const nextMapNumber = Number(seg?.map_number ?? seg?.mapNumber ?? (Number(m?.mapNumber ?? 0) + 1));

  return {
    ...m,
    status: "LIVE",
    currentMap: segMap || m.currentMap || null,
    mapImage: segMap ? resolveMapImage(segMap) : m.mapImage || null,
    _mapKey: newKey || m._mapKey,
    _mapMeta: freshMeta,
    rounds: freshRounds,
    mapNumber: Number.isFinite(nextMapNumber) ? nextMapNumber : m.mapNumber
  };
}

function getSegSeriesSafe(seg, m) {
  const s = getSegSeries(seg);
  return {
    bestOf: s.bestOf ?? m.series?.bestOf ?? null,
    wins1: s.wins1 ?? m.series?.wins1 ?? 0,
    wins2: s.wins2 ?? m.series?.wins2 ?? 0,
  };
}

function hydrateWithSegmentsOnce(matches, segments) {
  if (!segments?.length) return matches;

  const isTBD = (s = "") => !s || /^tbd$/i.test(String(s).trim());
  const parseUnixTs = (s = "") => {
    const iso = String(s).replace(" ", "T") + "Z";
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
  };

  const prepared = segments.map((seg) => ({
    raw: seg,
    t1: clean(seg?.team1 || ""),
    t2: clean(seg?.team2 || ""),
    url: (seg?.match_page || "").trim(),
    isLiveSeg: String(seg?.time_until_match || "").toUpperCase().includes("LIVE"),
  }));

  return matches.map((m) => {
    if (!m?.teams?.length) return m;

    const tm1 = clean(m.teams[0]?.name || "");
    const tm2 = clean(m.teams[1]?.name || "");

    const hasUrl = !!m.vlrUrl;
    const hit = prepared.find((seg) => {
      if (hasUrl && seg.url && seg.url === (m.vlrUrl || "").trim()) return true;

      const bothKnown = !isTBD(seg.t1) && !isTBD(seg.t2) && tm1 && tm2;
      if (bothKnown) {
        if (
          (seg.t1 === tm1 && seg.t2 === tm2) ||
          (seg.t1 === tm2 && seg.t2 === tm1) ||
          (teamsRoughEqual(seg.t1, tm1) && teamsRoughEqual(seg.t2, tm2)) ||
          (teamsRoughEqual(seg.t1, tm2) && teamsRoughEqual(seg.t2, tm1))
        ) return true;
      }

      const oneMatches =
        (!!tm1 && teamsRoughEqual(seg.t1, tm1)) ||
        (!!tm1 && teamsRoughEqual(seg.t2, tm1)) ||
        (!!tm2 && teamsRoughEqual(seg.t1, tm2)) ||
        (!!tm2 && teamsRoughEqual(seg.t2, tm2));

      if (oneMatches) {
        const segTs = parseUnixTs(seg.raw?.unix_timestamp);
        const mTs = typeof m.startTs === "number" ? m.startTs : null;
        if (segTs && mTs && Math.abs(segTs - mTs) <= 15 * 60 * 1000) return true;
      }
      return false;
    });

    if (!hit) return m;

    const seg = hit.raw;
    const nextStatus = hit.isLiveSeg ? "LIVE" : (m.status || "UPCOMING");
    const segMap = getSegMapName(seg);

    const merged = mergeLiveRounds(m.rounds, seg, m._mapKey, m._mapMeta);
    const rounds = merged.rounds;
    const series = getSegSeriesSafe(seg, m);

    return {
      ...m,
      status: nextStatus,
      currentMap:
        nextStatus === "LIVE"
          ? (m.currentMap || segMap || null)
          : (segMap || m.currentMap || null),
      mapImage:
        nextStatus === "LIVE"
          ? (m.mapImage || (segMap ? resolveMapImage(segMap) : null))
          : (segMap ? resolveMapImage(segMap) : m.mapImage || null),
      vlrUrl: seg.match_page || m.vlrUrl,
      mapNumber:
        nextStatus === "LIVE"
          ? m.mapNumber
          : (seg.map_number ?? m.mapNumber),
      event: seg.match_event || m.event || null,
      seriesTitle: seg.match_series || m.seriesTitle || null,
      _mapKey: merged.mapKey,
      _mapMeta: merged.meta,
      rounds,
      series,
      teams: [{ ...(m.teams?.[0] || {}) }, { ...(m.teams?.[1] || {}) }],
    };
  });
}

async function hydratePreciselyOnce(matches) {
  const segs = await fetchLiveSegmentsFromProxy();
  const prepared = segs.map((seg) => ({ raw: seg, url: (seg?.match_page || "").trim() }));

  const updated = matches.map((m) => {
    const isLive = String(m?.status || "").toUpperCase() === "LIVE";
    if (!isLive || !m?.vlrUrl) return m;

    const hit = prepared.find((p) => p.url === (m.vlrUrl || "").trim());
    if (!hit) return m;

    const seg = hit.raw;
    const segMap = getSegMapName(seg);
    const merged = mergeLiveRounds(m.rounds, seg, m._mapKey, m._mapMeta);

    let next = { ...m, _mapKey: merged.mapKey, _mapMeta: merged.meta, rounds: merged.rounds };

    if (!m.currentMap && segMap) {
      next.currentMap = segMap;
      next.mapImage = resolveMapImage(segMap);
    }

    next.series = getSegSeriesSafe(seg, next);
    return next;
  });

  return updated;
}

const POLL_MS = 30_000;

export default function HomeMatches({ today, next, completed }) {
  const [logoMap, setLogoMap] = useState({});
  const [teamList, setTeamList] = useState([]);
  const [openId, setOpenId] = useState(null);

  const hasUpcoming = Boolean(today || next);
  const hasCompleted = Boolean(completed);
  const limitToEight = hasUpcoming && hasCompleted;

  const demoLiveMatch = useMemo(() => {
    const currentMap = "icebox";
    return {
      id: "demo-live",
      status: "LIVE",
      startTs: Date.now() - 25 * 60 * 1000,
      event: "PLAYOFFS • VCT",
      currentMap,
      mapImage: resolveMapImage(currentMap),
      in: null,
      rounds: { t1ct: 4, t1t: 6, t2ct: 8, t2t: 4 },
      _mapKey: "icebox",
      _mapMeta: { start1: "CT", start2: "T", _prov1: 10, _prov2: 12, _total: 22, lastStableTotal: 22 },
      series: { bestOf: 3, wins1: 0, wins2: 1 },
      teams: [{ name: "G2 Esports" }, { name: "Sentinels" }],
    };
  }, []);

  const baseUpcoming = useMemo(() => {
    if (!hasUpcoming) return [];

    const a = (today?.items || []).map(normalizeMatch);
    const b = (next?.items || []).map(normalizeMatch);

    let list = [demoLiveMatch, ...a, ...b].map(decorateWithLocalMapAndSeries);

    if (limitToEight) {
      list = list.slice(0, 8);
    }

    return list;
  }, [today, next, demoLiveMatch, hasUpcoming, limitToEight]);

  const baseCompleted = useMemo(() => {
    if (!hasCompleted) return [];

    const c = (completed?.items || [])
      .map(mapCompletedItem)
      .map(normalizeMatch)
      .map(decorateWithLocalMapAndSeries);

    return limitToEight ? c.slice(0, 8) : c;
  }, [completed, hasCompleted, limitToEight]);

  const [upcoming, setUpcoming] = useState(baseUpcoming);
  const [completedList, setCompletedList] = useState(baseCompleted);
  const upRef = useRef(upcoming);
  const compRef = useRef(completedList);
  useEffect(() => {
    upRef.current = upcoming;
  }, [upcoming]);
  useEffect(() => {
    compRef.current = completedList;
  }, [completedList]);

  // PRIMERA HIDRATACIÓN + CARGA DE LOGOS
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const segs = await fetchLiveSegmentsFromProxy();
      if (cancelled) return;

      const hyd1U = hydrateWithSegmentsOnce(baseUpcoming, segs);
      const hyd1C = hydrateWithSegmentsOnce(baseCompleted, segs);
      if (!cancelled) {
        setUpcoming(hyd1U);
        setCompletedList(hyd1C);
      }

      const hyd2U = await hydratePreciselyOnce(hyd1U);
      const hyd2C = await hydratePreciselyOnce(hyd1C);
      if (cancelled) return;

      const readyU = hyd2U.map((m) =>
        m.status === "LIVE" && (isMapFinal(m.rounds) || m?._mapMeta?.mapWin)
          ? { ...markFinalMeta(m), status: "FINAL" }
          : m
      );

      const segsNow = await fetchLiveSegmentsFromProxy();
      const findSegFor = (m) =>
        segsNow.find((s) => (s?.match_page || "").trim() === (m?.vlrUrl || "").trim());

      const progressedU = readyU.map((m) => {
        const endedMap = isMapFinal(m.rounds) || m?._mapMeta?.mapWin;
        if (!endedMap) return m;

        const seg = findSegFor(m);
        if (isSeriesOver(m)) {
          return { ...markFinalMeta(m), status: "FINAL" };
        }
        if (seg && shouldResetForNextMap(m, seg)) {
          return resetMapState(m, seg);
        }
        return m;
      });

      const stayUp = progressedU.filter((m) => m.status !== "FINAL");
      const moved = progressedU.filter((m) => m.status === "FINAL");

      setUpcoming(stayUp);
      setCompletedList(hyd2C.concat(moved));

      // ========== LOGOS (DB + PROXY) ==========
      const visible = [...stayUp, ...hyd2C];
      const cache = await ensureLogosFor(visible);
      if (!cancelled) {
        setLogoMap(cache?.logoMap || {});
        setTeamList(cache?.teamList || []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseUpcoming, baseCompleted]);

  // POLLING (Actualización automática)
  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const segs = await fetchLiveSegmentsFromProxy();
      if (cancelled) return;

      const oneU = hydrateWithSegmentsOnce(upRef.current, segs);
      const oneC = hydrateWithSegmentsOnce(compRef.current, segs);

      const twoU = await hydratePreciselyOnce(oneU);
      const twoC = await hydratePreciselyOnce(oneC);
      if (cancelled) return;

      const findSegFor = (m) =>
        segs.find((s) => (s?.match_page || "").trim() === (m?.vlrUrl || "").trim());

      const progressedU = twoU.map((m) => {
        const endedMap = isMapFinal(m.rounds) || m?._mapMeta?.mapWin;
        if (!endedMap) return m;

        const seg = findSegFor(m);
        const goneFromFeed = !seg;

        if (isSeriesOver(m) || (goneFromFeed && isSeriesOver(m))) {
          return { ...markFinalMeta(m), status: "FINAL" };
        }
        if (seg && shouldResetForNextMap(m, seg)) {
          return resetMapState(m, seg);
        }
        return m;
      });

      const stayUp = progressedU.filter((m) => m.status !== "FINAL");
      const moved = progressedU.filter((m) => m.status === "FINAL");

      setUpcoming(stayUp);
      setCompletedList(twoC.concat(moved));
    }

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="home-matches">
      {/* Upcoming */}
      {hasUpcoming && (
        <section className="block">
          <div className="block__head">
            <h2 className="block__title text-3xl font-bold mb-10">Upcoming matches</h2>
          </div>
          {upcoming.length ? (
            <div className="match-list">
              {upcoming.map((m) => {
                const uid =
                  m.uid ??
                  m.id ??
                  `${m.startTs || "ts"}|${m.teams?.[0]?.name || "t1"}|${m.teams?.[1]?.name || "t2"}`;

                const isOpen = openId === uid;

                return (
                  <div key={`u-${uid}`} className={`match-stack ${isOpen ? "is-open" : ""}`}>
                    <ScheduleCard
                      match={m}
                      logos={logoMap}
                      teamList={teamList}
                      expanded={isOpen}
                      onToggle={() => setOpenId(isOpen ? null : uid)}
                    />

                    <div className="sched-anim">
                      <div className="sched-detail-row">
                        <div className="sched-detail-inner">
                          <MatchDetail match={m} logos={logoMap} teamList={teamList} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="block__empty">No hay partidos próximos.</p>
          )}
        </section>
      )}
      {/* Completed */}
      {hasCompleted && (
        <section className="block">
          <div className="block__head">
            <h2 className="block__title text-3xl font-bold mb-10">Completed matches</h2>
          </div>
          {completedList.length ? (
            <div className="match-list">
              {completedList.map((m) => {
                const uid =
                  m.uid ??
                  m.id ??
                  `${m.startTs || "ts"}|${m.teams?.[0]?.name || "t1"}|${m.teams?.[1]?.name || "t2"}`;

                const isOpen = openId === uid;

                return (
                  <div key={`u-${uid}`} className={`match-stack ${isOpen ? "is-open" : ""}`}>
                    <ScheduleCard
                      match={m}
                      logos={logoMap}
                      teamList={teamList}
                      expanded={isOpen}
                      onToggle={() => setOpenId(isOpen ? null : uid)}
                    />

                    <div className="sched-anim">
                      <div className="sched-detail-row">
                        <div className="sched-detail-inner">
                          <MatchDetail match={m} logos={logoMap} teamList={teamList} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="block__empty">No hay resultados disponibles.</p>
          )}
        </section>
      )}
    </div>
  );
}