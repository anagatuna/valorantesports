"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ScheduleCard from "@/components/ScheduleCard";
import { loadLogosFromCache, saveLogosToCache } from "@/utils/teamLogoCache";
import MatchDetail from "@/components/MatchDetail";
import { resolveMapImage } from "@/lib/maps";
import { getLogo } from "@/lib/teams";
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURACIÓN SUPABASE ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/* ================== HELPERS ================== */
// Normalizadores
function resolveEvent(raw = {}) {
  return (raw.event && String(raw.event).trim()) || (raw.tournament && String(raw.tournament).trim()) || (raw.league?.name && String(raw.league.name).trim()) || "";
}
function normalizeMatch(raw = {}) { return { ...raw, event: resolveEvent(raw) }; }
function mapCompletedItem(seg = {}) {
  const teams = Array.isArray(seg.teams) && seg.teams.length >= 2 ? seg.teams : [{ name: seg.team1, score: Number(seg.score1) }, { name: seg.team2, score: Number(seg.score2) }];
  const time_completed = seg.time_completed ?? seg.timeCompleted ?? seg.ago ?? null;
  const match_page = seg.match_page ?? seg.matchPage ?? seg.vlrUrl ?? null;
  return { ...seg, status: "FINAL", teams, time_completed, match_page };
}

/* ================== LOGOS ================== */
async function ensureLogosFor(matches) {
  const needed = new Set();
  for (const m of matches) (m.teams || []).forEach((t) => t?.name && needed.add(t.name.trim()));
  const cleanNames = [...needed];
  if (cleanNames.length === 0) return { logoMap: {}, teamList: [] };

  const cached = loadLogosFromCache();
  const logoMap = { ...cached?.logoMap };
  const missingNames = cleanNames.filter(name => {
    const key = name.toLowerCase().replace(/[\s\-_\.]+/g, "").trim();
    return !logoMap[key];
  });

  if (missingNames.length > 0) {
    try {
      const { data: teamsData } = await supabase.from('teams').select('name, img').in('name', missingNames);
      if (teamsData) {
        teamsData.forEach((team) => {
          // getLogo descarta rutas relativas y placeholders de vlr.gg, que el
          // proxy no puede resolver (terminaban en 500).
          const img = getLogo(team.img);
          if (!img) return;
          const normalizedKey = team.name.toLowerCase().replace(/[\s\-_\.]+/g, "").trim();
          logoMap[normalizedKey] = `/api/image-proxy?url=${encodeURIComponent(img)}`;
        });
      }
    } catch (err) { console.error("Logo fetch error:", err); }
  }
  saveLogosToCache(logoMap, []);
  return { logoMap, teamList: [] };
}

/* ================== LIVE CACHE & FEED ================== */
const LIVE_CACHE_KEY = "vlr_live_rounds_v2";
function readLiveCache() { try { return JSON.parse(localStorage.getItem(LIVE_CACHE_KEY)) || {}; } catch { return {}; } }
function writeLiveCache(obj) { try { localStorage.setItem(LIVE_CACHE_KEY, JSON.stringify(obj)); } catch { } }
function liveCacheId(seg) { const url = (seg?.match_page || "").trim(); const map = mapKeyOf(seg); return url && map ? `${url}::${map}` : null; }
const clean = (s = "") => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
function teamsRoughEqual(a = "", b = "") {
  const A = clean(a); const B = clean(b); if (!A || !B) return false;
  return A === B || A.includes(B) || B.includes(A);
}

async function fetchLiveSegmentsFromProxy() {
  try {
    // /api/vlrgg/list apuntaba a vlrggapi.vercel.app, que quedo apagado (402).
    const r = await fetch(`/api/vlr/live?_=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j?.data?.segments) ? j.data.segments : [];
  } catch { return []; }
}

function getSegMapName(seg = {}) { return seg?.current_map || seg?.actual_map || seg?.map || seg?.currentMap || seg?.actualMap || null; }
const toInt = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null; };
function getSegSeries(seg = {}) {
  // null (no 0) cuando el segmento no trae score: los de /results vienen sin el,
  // y un 0 aqui pisaria el marcador real via getSegSeriesSafe.
  const wins1 = toInt(seg.series_score1) ?? toInt(seg.maps1) ?? toInt(seg.series1);
  const wins2 = toInt(seg.series_score2) ?? toInt(seg.maps2) ?? toInt(seg.series2);
  const bestOf = toInt(seg.best_of) ?? toInt(seg.bo) ?? null;
  return { wins1, wins2, bestOf };
}
const mapKeyOf = (seg) => String(seg?.current_map || seg?.map || "").toLowerCase().replace(/\s+/g, "").trim();

/* ================== LOGICA DE JUEGO (Merge) ================== */
// Ojo con el 0: `Number(x) || Number(y)` convertia un 0 legitimo (equipo con 0
// rondas CT, o sea el arranque de cada mapa) en NaN, y el lado inicial salia
// mal. Recorremos las claves quedandonos con la primera que sea un numero.
function firstNumber(seg, keys) {
  for (const k of keys) {
    const v = seg?.[k];
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
function readProvided(seg = {}, team = 1) {
  const ct = firstNumber(seg, [`team_${team}_round_ct`, `team${team}_round_ct`]);
  const t = firstNumber(seg, [`team_${team}_round_t`, `team${team}_round_t`]);
  return { provided: ct ?? t, side: ct != null ? "CT" : (t != null ? "T" : null) };
}
function opposite(side) { return side === "CT" ? "T" : (side === "T" ? "CT" : null); }
function sideForRound(startSide, roundIndex) { if (!startSide) return null; if (roundIndex < 12) return startSide; if (roundIndex < 24) return opposite(startSide); return (roundIndex - 24) % 2 === 0 ? opposite(startSide) : startSide; }
function distributeByPattern(startSide, fromRound, wins) { let ct = 0, t = 0; for (let i = 0; i < wins; i++) { const side = sideForRound(startSide, fromRound + i); if (side === "CT") ct++; else if (side === "T") t++; } return { ct, t }; }
function looksRegressive(prevTotals, curTotals) { return curTotals + 1 <= prevTotals; }

function mergeLiveRounds(prevRounds = null, seg = null, prevKey = "", prevMeta = {}) {
  const key = mapKeyOf(seg); const sameMap = key && prevKey && key === prevKey;
  const cache = readLiveCache(); const cid = liveCacheId(seg); const cached = cid ? cache[cid] : null;
  const baseRounds = sameMap && prevRounds ? { ...prevRounds } : cached?.rounds ? { ...cached.rounds } : { t1ct: 0, t1t: 0, t2ct: 0, t2t: 0 };
  const baseMeta = sameMap && prevMeta ? { ...prevMeta } : cached?.meta ? { ...cached.meta } : { start1: null, start2: null, _prov1: 0, _prov2: 0, _total: 0, lastStableTotal: 0, _wins1: Number(prevMeta?._wins1 ?? 0), _wins2: Number(prevMeta?._wins2 ?? 0), mapWin: false };

  const r1 = readProvided(seg, 1); const r2 = readProvided(seg, 2);
  if (!baseMeta.start1 && r1.side) baseMeta.start1 = r1.side; if (!baseMeta.start2 && r2.side) baseMeta.start2 = r2.side;
  const prov1 = Number.isFinite(r1.provided) ? r1.provided : baseMeta._prov1; const prov2 = Number.isFinite(r2.provided) ? r2.provided : baseMeta._prov2;
  const prevTotal = (baseMeta._prov1 || 0) + (baseMeta._prov2 || 0); const curTotal = prov1 + prov2;

  if (sameMap && looksRegressive(prevTotal, curTotal)) return { rounds: baseRounds, mapKey: prevKey, meta: baseMeta };
  baseMeta.lastStableTotal = Math.max(baseMeta.lastStableTotal || 0, curTotal);
  const d1 = Math.max(0, prov1 - (baseMeta._prov1 || 0)); const d2 = Math.max(0, prov2 - (baseMeta._prov2 || 0));

  if ((d1 > 0 || d2 > 0) && baseMeta.start1 && baseMeta.start2) {
    if (d1 > 0) { const dist = distributeByPattern(baseMeta.start1, prevTotal, d1); baseRounds.t1ct += dist.ct; baseRounds.t1t += dist.t; }
    if (d2 > 0) { const dist = distributeByPattern(baseMeta.start2, prevTotal, d2); baseRounds.t2ct += dist.ct; baseRounds.t2t += dist.t; }
  }
  const s = getSegSeries(seg);
  const curW1 = Number(s.wins1); const curW2 = Number(s.wins2);
  const total1 = baseRounds.t1ct + baseRounds.t1t; const total2 = baseRounds.t2ct + baseRounds.t2t;
  if ((curW1 > Number(baseMeta._wins1 || 0) || curW2 > Number(baseMeta._wins2 || 0)) && sameMap && prevTotal > 0) {
    baseMeta.mapWin = true;
  }
  const meta = { ...baseMeta, _prov1: prov1, _prov2: prov2, _total: curTotal, _wins1: curW1, _wins2: curW2 };
  if (cid) { cache[cid] = { rounds: baseRounds, meta, ts: Date.now() }; writeLiveCache(cache); }
  return { rounds: baseRounds, mapKey: key, meta };
}

// Map Decorators
function decorateWithLocalMap(m) {
  const name = m.currentMap || m.map || m.liveMap || null;
  return name ? { ...m, currentMap: name, mapImage: resolveMapImage(name) } : m;
}
function isMapFinal(r) {
  const a = (r?.t1ct || 0) + (r?.t1t || 0); const b = (r?.t2ct || 0) + (r?.t2t || 0);
  const mx = Math.max(a, b), mn = Math.min(a, b); return (mx >= 13 && mx - mn >= 2) || mx >= 14;
}
function isSeriesOver(m) {
  const bo = Number(m?.series?.bestOf || 3); const tw = Math.ceil(bo / 2);
  return Number(m?.series?.wins1 || 0) >= tw || Number(m?.series?.wins2 || 0) >= tw;
}

const FINAL_COOLDOWN_MS = 180_000;
function markFinalMeta(m) { const meta = { ...(m._mapMeta || {}) }; meta.finalTs = Date.now(); return { ...m, _mapMeta: meta }; }
function shouldResetForNextMap(m, seg) {
  const meta = m?._mapMeta || {}; const segMap = getSegMapName(seg);
  if (!!segMap && segMap !== m.currentMap) return true;
  if (meta.finalTs && Date.now() - meta.finalTs >= FINAL_COOLDOWN_MS) return true;
  return false;
}
function resetMapState(m, seg) {
  const segMap = getSegMapName(seg);
  return {
    ...m, status: "LIVE", currentMap: segMap || m.currentMap || null,
    mapImage: segMap ? resolveMapImage(segMap) : m.mapImage || null,
    _mapKey: mapKeyOf({ map: segMap }), _mapMeta: { start1: null, start2: null, _prov1: 0, _prov2: 0, _total: 0, lastStableTotal: 0, _wins1: m?.series?.wins1 ?? 0, _wins2: m?.series?.wins2 ?? 0, mapWin: false },
    rounds: { t1ct: 0, t1t: 0, t2ct: 0, t2t: 0 }
  };
}
function getSegSeriesSafe(seg, m) { const s = getSegSeries(seg); return { bestOf: s.bestOf ?? m.series?.bestOf ?? null, wins1: s.wins1 ?? m.series?.wins1 ?? 0, wins2: s.wins2 ?? m.series?.wins2 ?? 0 }; }

// Hydrate Logic
function hydrateWithSegmentsOnce(matches, segments) {
  if (!segments?.length) return matches;
  const isTBD = (s) => !s || /^tbd$/i.test(String(s).trim());
  const parseUnixTs = (s = "") => { const iso = String(s).replace(" ", "T") + "Z"; const t = Date.parse(iso); return Number.isFinite(t) ? t : null; };
  const prepared = segments.map((seg) => ({ raw: seg, t1: clean(seg?.team1), t2: clean(seg?.team2), url: (seg?.match_page || "").trim(), isLiveSeg: String(seg?.time_until_match || "").toUpperCase().includes("LIVE"), isDoneSeg: String(seg?.status || "").toUpperCase() === "COMPLETED" }));

  return matches.map((m) => {
    if (!m?.teams?.length) return m;
    const tm1 = clean(m.teams[0]?.name); const tm2 = clean(m.teams[1]?.name);
    const hasUrl = !!m.vlrUrl;
    const hit = prepared.find((seg) => {
      if (hasUrl && seg.url && seg.url === (m.vlrUrl || "").trim()) return true;
      const bothKnown = !isTBD(seg.t1) && !isTBD(seg.t2) && tm1 && tm2;
      if (bothKnown && ((seg.t1 === tm1 && seg.t2 === tm2) || (seg.t1 === tm2 && seg.t2 === tm1) || (teamsRoughEqual(seg.t1, tm1) && teamsRoughEqual(seg.t2, tm2)) || (teamsRoughEqual(seg.t1, tm2) && teamsRoughEqual(seg.t2, tm1)))) return true;
      const oneMatches = (!!tm1 && teamsRoughEqual(seg.t1, tm1)) || (!!tm1 && teamsRoughEqual(seg.t2, tm1)) || (!!tm2 && teamsRoughEqual(seg.t1, tm2)) || (!!tm2 && teamsRoughEqual(seg.t2, tm2));
      if (oneMatches) {
        const segTs = parseUnixTs(seg.raw?.unix_timestamp); const mTs = typeof m.startTs === "number" ? m.startTs : null;
        if (segTs && mTs && Math.abs(segTs - mTs) <= 15 * 60 * 1000) return true;
      }
      return false;
    });

    if (!hit) return m;
    // isDoneSeg: el partido ya salio en /results. Sin esto, un partido que
    // termino se quedaba LIVE hasta el siguiente scrape (hasta 30 min).
    const seg = hit.raw; const nextStatus = hit.isLiveSeg ? "LIVE" : (hit.isDoneSeg ? "FINAL" : (m.status || "UPCOMING")); const segMap = getSegMapName(seg);
    const merged = mergeLiveRounds(m.rounds, seg, m._mapKey, m._mapMeta);
    return {
      ...m, status: nextStatus,
      currentMap: nextStatus === "LIVE" ? (m.currentMap || segMap || null) : (segMap || m.currentMap || null),
      mapImage: nextStatus === "LIVE" ? (m.mapImage || (segMap ? resolveMapImage(segMap) : null)) : (segMap ? resolveMapImage(segMap) : m.mapImage || null),
      vlrUrl: seg.match_page || m.vlrUrl,
      _mapKey: merged.mapKey, _mapMeta: merged.meta, rounds: merged.rounds, series: getSegSeriesSafe(seg, m),
      teams: [{ ...(m.teams?.[0] || {}) }, { ...(m.teams?.[1] || {}) }],
    };
  });
}

async function hydratePreciselyOnce(matches) {
  const segs = await fetchLiveSegmentsFromProxy();
  const prepared = segs.map((seg) => ({ raw: seg, url: (seg?.match_page || "").trim() }));
  return matches.map((m) => {
    const isLive = String(m?.status || "").toUpperCase() === "LIVE";
    if (!isLive || !m?.vlrUrl) return m;
    const hit = prepared.find((p) => p.url === (m.vlrUrl || "").trim());
    if (!hit) return m;
    const seg = hit.raw; const segMap = getSegMapName(seg);
    const merged = mergeLiveRounds(m.rounds, seg, m._mapKey, m._mapMeta);
    let next = { ...m, _mapKey: merged.mapKey, _mapMeta: merged.meta, rounds: merged.rounds };
    if (!m.currentMap && segMap) { next.currentMap = segMap; next.mapImage = resolveMapImage(segMap); }
    next.series = getSegSeriesSafe(seg, next);
    return next;
  });
}

function mergeWithClientState(incomingMatches, currentMatches) {
  return incomingMatches.map(inc => {
    const existing = currentMatches.find(c => c.id === inc.id);
    if (!existing) return inc;
    if (existing.status === 'LIVE' && inc.status !== 'FINAL') {
      return { ...inc, status: 'LIVE', rounds: existing.rounds, _mapMeta: existing._mapMeta, currentMap: existing.currentMap, series: existing.series };
    }
    return inc;
  });
}

function sortMatches(list) {
  return [...list].sort((a, b) => {
    const aLive = a.status === 'LIVE' ? 1 : 0;
    const bLive = b.status === 'LIVE' ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;
    return (a.startTs || 0) - (b.startTs || 0);
  });
}

const POLL_MS = 30_000;

export default function HomeMatches({ today, next, completed }) {
  const [logoMap, setLogoMap] = useState({});
  const [teamList, setTeamList] = useState([]);
  const [openId, setOpenId] = useState(null);

  const hasUpcoming = Boolean(today || next);
  const hasCompleted = Boolean(completed);
  
  // 🟢 AQUI ESTA LA DEFINICIÓN QUE FALTABA
  const limitToEight = hasUpcoming && hasCompleted;

  const demoLiveMatch = useMemo(() => {
    const currentMap = "icebox";
    return {
      id: "demo-live", status: "LIVE", startTs: Date.now() - 25 * 60 * 1000, event: "PLAYOFFS • VCT",
      currentMap, mapImage: resolveMapImage(currentMap), in: null, rounds: { t1ct: 4, t1t: 6, t2ct: 8, t2t: 4 },
      _mapKey: "icebox", _mapMeta: { start1: "CT", start2: "T", _prov1: 10, _prov2: 12, _total: 22, lastStableTotal: 22 },
      series: { bestOf: 3, wins1: 0, wins2: 1 }, teams: [{ name: "G2 Esports" }, { name: "Sentinels" }],
    };
  }, []);

  const baseUpcoming = useMemo(() => {
    if (!hasUpcoming) return [];
    const a = (today?.items || []).map(normalizeMatch).map(decorateWithLocalMap);
    const b = (next?.items || []).map(normalizeMatch).map(decorateWithLocalMap);
    let list = [...a, ...b];
    
    // Ordenamos LIVE > UPCOMING
    list = sortMatches(list);

    // Limitamos si es la vista principal (para que no salgan 50 partidos)
    if (limitToEight) {
      list = list.slice(0, 8);
    }
    
    return list;
  }, [today, next, hasUpcoming, limitToEight]);

  const baseCompleted = useMemo(() => {
    if (!hasCompleted) return [];
    const c = (completed?.items || []).map(mapCompletedItem).map(normalizeMatch).map(decorateWithLocalMap);
    return limitToEight ? c.slice(0, 8) : c;
  }, [completed, hasCompleted, limitToEight]);

  const [upcoming, setUpcoming] = useState(baseUpcoming);
  const [completedList, setCompletedList] = useState(baseCompleted);
  const upRef = useRef(upcoming);
  const compRef = useRef(completedList);

  useEffect(() => { upRef.current = upcoming; }, [upcoming]);
  useEffect(() => { compRef.current = completedList; }, [completedList]);

  // 1. DATA FETCH
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mergedBase = mergeWithClientState(baseUpcoming, upRef.current);
      const segs = await fetchLiveSegmentsFromProxy();
      if (cancelled) return;

      const hyd1U = hydrateWithSegmentsOnce(mergedBase, segs);
      const hyd1C = hydrateWithSegmentsOnce(baseCompleted, segs);
      
      if (!cancelled) {
        setUpcoming(sortMatches(hyd1U));
        setCompletedList(hyd1C);
      }

      const hyd2U = await hydratePreciselyOnce(hyd1U);
      const hyd2C = await hydratePreciselyOnce(hyd1C);
      if (cancelled) return;

      const readyU = hyd2U.map((m) =>
        m.status === "LIVE" && (isMapFinal(m.rounds) || m?._mapMeta?.mapWin) ? { ...markFinalMeta(m), status: "FINAL" } : m
      );

      const segsNow = await fetchLiveSegmentsFromProxy();
      const findSegFor = (m) => segsNow.find((s) => (s?.match_page || "").trim() === (m?.vlrUrl || "").trim());

      const progressedU = readyU.map((m) => {
        const endedMap = isMapFinal(m.rounds) || m?._mapMeta?.mapWin;
        if (!endedMap) return m;
        const seg = findSegFor(m);
        if (isSeriesOver(m)) return { ...markFinalMeta(m), status: "FINAL" };
        if (seg && shouldResetForNextMap(m, seg)) return resetMapState(m, seg);
        return { ...m, status: "LIVE" }; 
      });

      const stayUp = progressedU.filter((m) => m.status !== "FINAL");
      const moved = progressedU.filter((m) => m.status === "FINAL");

      if (!cancelled) {
        setUpcoming(sortMatches(stayUp));
        setCompletedList(hyd2C.concat(moved));
      }

      const visible = [...stayUp, ...hyd2C];
      const cache = await ensureLogosFor(visible);
      if (!cancelled) {
        setLogoMap(prev => ({ ...prev, ...(cache?.logoMap || {}) }));
        setTeamList(cache?.teamList || []);
      }
    })();
    return () => { cancelled = true; };
  }, [baseUpcoming, baseCompleted]);

  // 2. POLLING TICK
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

      const findSegFor = (m) => segs.find((s) => (s?.match_page || "").trim() === (m?.vlrUrl || "").trim());
      const progressedU = twoU.map((m) => {
        const endedMap = isMapFinal(m.rounds) || m?._mapMeta?.mapWin;
        if (!endedMap) return m;
        const seg = findSegFor(m);
        const goneFromFeed = !seg;
        if (isSeriesOver(m) || (goneFromFeed && isSeriesOver(m))) return { ...markFinalMeta(m), status: "FINAL" };
        if (seg && shouldResetForNextMap(m, seg)) return resetMapState(m, seg);
        return { ...m, status: "LIVE" }; 
      });

      const stayUp = progressedU.filter((m) => m.status !== "FINAL");
      const moved = progressedU.filter((m) => m.status === "FINAL");

      setUpcoming(sortMatches(stayUp));
      setCompletedList(twoC.concat(moved));
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="home-matches">
      {hasUpcoming && (
        <section className="block">
          <div className="block__head"><h2 className="block__title text-3xl font-bold mb-10">Upcoming matches</h2></div>
          {upcoming.length ? (
            <div className="match-list">
              {upcoming.map((m) => {
                const uid = m.uid ?? m.id ?? `${m.startTs || "ts"}|${m.teams?.[0]?.name || "t1"}|${m.teams?.[1]?.name || "t2"}`;
                const isOpen = openId === uid;
                return (
                  <div key={`u-${uid}`} className={`match-stack ${isOpen ? "is-open" : ""}`}>
                    <ScheduleCard match={m} logos={logoMap} teamList={teamList} expanded={isOpen} onToggle={() => setOpenId(isOpen ? null : uid)} />
                    <div className="sched-anim"><div className="sched-detail-row"><div className="sched-detail-inner"><MatchDetail match={m} logos={logoMap} teamList={teamList} /></div></div></div>
                  </div>
                );
              })}
            </div>
          ) : (<p className="block__empty">No hay partidos próximos.</p>)}
        </section>
      )}
      {hasCompleted && (
        <section className="block">
          <div className="block__head"><h2 className="block__title text-3xl font-bold mb-10">Completed matches</h2></div>
          {completedList.length ? (
            <div className="match-list">
              {completedList.map((m) => {
                const uid = m.uid ?? m.id ?? `${m.startTs || "ts"}|${m.teams?.[0]?.name || "t1"}|${m.teams?.[1]?.name || "t2"}`;
                const isOpen = openId === uid;
                return (
                  <div key={`u-${uid}`} className={`match-stack ${isOpen ? "is-open" : ""}`}>
                    <ScheduleCard match={m} logos={logoMap} teamList={teamList} expanded={isOpen} onToggle={() => setOpenId(isOpen ? null : uid)} />
                    <div className="sched-anim"><div className="sched-detail-row"><div className="sched-detail-inner"><MatchDetail match={m} logos={logoMap} teamList={teamList} /></div></div></div>
                  </div>
                );
              })}
            </div>
          ) : (<p className="block__empty">No hay resultados disponibles.</p>)}
        </section>
      )}
    </div>
  );
}