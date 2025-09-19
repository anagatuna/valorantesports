// src/components/HomeMatches.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ScheduleCard from "@/components/ScheduleCard";
import { loadLogosFromCache, saveLogosToCache } from "@/utils/teamLogoCache";

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

/* ================== Logos ================== */
async function ensureLogosFor(matches) {
  const needed = new Set();
  for (const m of matches) (m.teams || []).forEach((t) => t?.name && needed.add(t.name.toLowerCase().trim()));

  const cached = loadLogosFromCache();
  const logoMap = cached?.logoMap || {};
  const normalize = (s) => s.toLowerCase().replace(/[\s\-_\.]+/g, "").trim();
  const hasAll = () => [...needed].every((n) => logoMap[normalize(n)]);
  if (hasAll()) return cached;

  let page = 1;
  while (page <= 5 && !hasAll()) {
    const res = await fetch(`https://vlr.orlandomm.net/api/v1/teams?page=${page}&size=200`);
    if (!res.ok) break;
    const json = await res.json();
    (json?.data || []).forEach((team) => {
      const key = normalize(team?.name || "");
      const img = team?.img || team?.image;
      if (key && img) logoMap[key] = img;
    });
    page++;
  }
  saveLogosToCache(logoMap, []);
  return { logoMap, teamList: [] };
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
    // cache-buster para evitar respuestas viejas del proxy/CDN
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
    toInt(seg.series_score1) ??
    toInt(seg.maps1) ??
    toInt(seg.series1) ??
    toInt(seg.score1);

  const wins2 =
    toInt(seg.series_score2) ??
    toInt(seg.maps2) ??
    toInt(seg.series2) ??
    toInt(seg.score2);

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

/* ================== Reconstrucción CT/T con OT ==================
   El feed solo incrementa el lado con el que arrancó cada team y deja "N/A" el otro.
   Reconstruimos CT/T:
   - Rondas 0–11  (total<12):  sumamos al lado inicial.
   - Rondas 12–23 (12<=total<24): sumamos al lado opuesto.
   - Overtime (total>=24): alterna CADA RONDA (set de 2: cada team juega 1 CT y 1 T).
   Nota: No conocemos el orden exacto de victorias dentro del intervalo, así que asignamos
   los 'wins' del team siguiendo el patrón de lados desde el índice de ronda actual.
*/
function readProvided(seg = {}, team = 1) {
  const ct = Number(seg?.[`team_${team}_round_ct`]) || Number(seg?.[`team${team}_round_ct`]);
  const t = Number(seg?.[`team_${team}_round_t`]) || Number(seg?.[`team${team}_round_t`]);
  const hasCT = Number.isFinite(ct);
  const hasT = Number.isFinite(t);
  return {
    provided: hasCT ? ct : (hasT ? t : null),
    side: hasCT ? "CT" : (hasT ? "T" : null),
  };
}
function opposite(side) { return side === "CT" ? "T" : side === "T" ? "CT" : null; }

/** lado que juega un team en la ronda (0-based) dadas sus sides iniciales */
function sideForRound(startSide, roundIndex) {
  if (!startSide) return null;
  if (roundIndex < 12) return startSide;                // primera mitad
  if (roundIndex < 24) return opposite(startSide);      // segunda mitad
  // OT: alterna cada ronda a partir de la 24 (r=24 → cambia respecto a 2ª mitad)
  return ((roundIndex - 24) % 2 === 0) ? opposite(startSide) : startSide;
}

/** reparte 'wins' de un team a CT/T siguiendo el patrón de lados desde 'fromRound' */
function distributeByPattern(startSide, fromRound, wins) {
  let ct = 0, t = 0;
  for (let i = 0; i < wins; i++) {
    const side = sideForRound(startSide, fromRound + i);
    if (side === "CT") ct++; else if (side === "T") t++;
  }
  return { ct, t };
}

/** Anti-regresión: si el snapshot tiene MUCHAS menos rondas que antes, ignorar */
function looksRegressive(prevTotals, curTotals) {
  return curTotals + 2 <= prevTotals; // tolerancia 2
}

function mergeLiveRounds(prevRounds = null, seg = null, prevKey = "", prevMeta = {}) {
  const key = mapKeyOf(seg);
  const sameMap = key && prevKey && key === prevKey;

  // estado base
  const baseRounds = sameMap && prevRounds ? { ...prevRounds } : { t1ct: 0, t1t: 0, t2ct: 0, t2t: 0 };
  const baseMeta = sameMap && prevMeta ? { ...prevMeta } : { start1: null, start2: null, _prov1: 0, _prov2: 0, _total: 0 };

  // lecturas sesgadas (campo que SÍ crece en cada team)
  const r1 = readProvided(seg, 1);
  const r2 = readProvided(seg, 2);

  // inicializar lados de arranque si aún no los conocemos
  if (!baseMeta.start1 && r1.side) baseMeta.start1 = r1.side;
  if (!baseMeta.start2 && r2.side) baseMeta.start2 = r2.side;

  const prov1 = Number.isFinite(r1.provided) ? r1.provided : baseMeta._prov1;
  const prov2 = Number.isFinite(r2.provided) ? r2.provided : baseMeta._prov2;

  // totales
  const prevTotal = (baseMeta._prov1 || 0) + (baseMeta._prov2 || 0);
  const curTotal = prov1 + prov2;

  // snapshot regresivo → ignóralo
  if (sameMap && looksRegressive(prevTotal, curTotal)) {
    return { rounds: baseRounds, mapKey: prevKey, meta: baseMeta };
  }

  // deltas (crecimientos)
  const d1 = Math.max(0, prov1 - (baseMeta._prov1 || 0));
  const d2 = Math.max(0, prov2 - (baseMeta._prov2 || 0));

  // distribuir por patrón (incluye OT alternando por ronda)
  if (d1 > 0 && baseMeta.start1) {
    const dist = distributeByPattern(baseMeta.start1, prevTotal, d1);
    baseRounds.t1ct += dist.ct;
    baseRounds.t1t += dist.t;
  }
  if (d2 > 0 && baseMeta.start2) {
    const dist = distributeByPattern(baseMeta.start2, prevTotal, d2);
    baseRounds.t2ct += dist.ct;
    baseRounds.t2t += dist.t;
  }

  // actualizar meta
  const meta = {
    ...baseMeta,
    _prov1: prov1,
    _prov2: prov2,
    _total: curTotal,
  };

  return { rounds: baseRounds, mapKey: key, meta };
}

/* ================== Decoradores de mapa ================== */
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

/* ================== Hidrataciones ================== */
/** Promueve a LIVE si el segmento lo marca + actualiza currentMap + RONDAS acumuladas + SERIES */
function hydrateWithSegmentsOnce(matches, segments) {
  if (!segments?.length) return matches;

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

    const hit = prepared.find(
      (seg) =>
        seg.t1 &&
        seg.t2 &&
        ((seg.t1 === tm1 && seg.t2 === tm2) ||
          (seg.t1 === tm2 && seg.t2 === tm1) ||
          (teamsRoughEqual(seg.t1, tm1) && teamsRoughEqual(seg.t2, tm2)) ||
          (teamsRoughEqual(seg.t1, tm2) && teamsRoughEqual(seg.t2, tm1)))
    );

    if (!hit) return m;

    const seg = hit.raw;
    const nextStatus = hit.isLiveSeg ? "LIVE" : m.status || "UPCOMING";
    const segMap = getSegMapName(seg);

    const merged = mergeLiveRounds(m.rounds, seg, m._mapKey, m._mapMeta);
    const rounds = merged.rounds;
    const series = getSegSeries(seg);

    return {
      ...m,
      status: nextStatus,
      currentMap: segMap || m.currentMap || null,
      mapImage: segMap ? resolveMapImage(segMap) : m.mapImage || null,
      vlrUrl: seg.match_page || m.vlrUrl,
      mapNumber: seg.map_number ?? m.mapNumber,

      // NUEVO:
      event: seg.match_event || m.event || null,
      seriesTitle: seg.match_series || m.seriesTitle || null,

      _mapKey: merged.mapKey,
      _mapMeta: merged.meta,
      rounds,

      series: {
        bestOf: series.bestOf ?? m.series?.bestOf ?? null,
        wins1: series.wins1 ?? m.series?.wins1 ?? 0,
        wins2: series.wins2 ?? m.series?.wins2 ?? 0,
      },

      teams: [{ ...(m.teams?.[0] || {}) }, { ...(m.teams?.[1] || {}) }],
    };
  });
}

/** Revalida usando la foto más nueva del mismo endpoint */
async function hydratePreciselyOnce(matches) {
  const segs = await fetchLiveSegmentsFromProxy();
  const prepared = segs.map((seg) => ({
    raw: seg,
    url: (seg?.match_page || "").trim(),
  }));

  const updated = matches.map((m) => {
    const isLive = String(m?.status || "").toUpperCase() === "LIVE";
    if (!isLive || !m?.vlrUrl) return m;

    const hit = prepared.find((p) => p.url === (m.vlrUrl || "").trim());
    if (!hit) return m;

    const seg = hit.raw;
    const segMap = getSegMapName(seg);

    const merged = mergeLiveRounds(m.rounds, seg, m._mapKey, m._mapMeta);

    let next = { ...m, _mapKey: merged.mapKey, _mapMeta: merged.meta, rounds: merged.rounds };

    if (segMap && segMap !== m.currentMap) {
      next.currentMap = segMap;
      next.mapImage = resolveMapImage(segMap);
    }

    const series = getSegSeries(seg);
    if (series) {
      next.series = {
        bestOf: series.bestOf ?? next.series?.bestOf ?? null,
        wins1: series.wins1 ?? next.series?.wins1 ?? 0,
        wins2: series.wins2 ?? next.series?.wins2 ?? 0,
      };
    }
    return next;
  });

  return updated;
}

/* ================== Clasificación a Completed ================== */
function isMapFinal(r) {
  const a = (r?.t1ct || 0) + (r?.t1t || 0);
  const b = (r?.t2ct || 0) + (r?.t2t || 0);
  const mx = Math.max(a, b), mn = Math.min(a, b);
  // Regla práctica: 13 con diferencia 2 (tiempo regular) o >=14 (OT)
  return (mx >= 13 && mx - mn >= 2) || mx >= 14;
}

/* ================== Componente ================== */
const POLL_MS = 30_000;

export default function HomeMatches({ today, next, completed }) {
  const [logoMap, setLogoMap] = useState({});
  const [teamList, setTeamList] = useState([]);

  // Demo LIVE
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
      _mapMeta: { start1: "CT", start2: "T", _prov1: 10, _prov2: 12, _total: 22 },

      series: { bestOf: 3, wins1: 0, wins2: 1 },

      teams: [{ name: "G2 Esports" }, { name: "Sentinels" }],
    };
  }, []);

  // Base lists (del feed server)
  const baseUpcoming = useMemo(() => {
    const a = today?.items || [];
    const b = next?.items || [];
    return [demoLiveMatch, ...a, ...b].slice(0, 8).map(decorateWithLocalMap);
  }, [today, next, demoLiveMatch]);

  const baseCompleted = useMemo(
    () => (completed?.items || []).slice(0, 8).map(decorateWithLocalMap),
    [completed]
  );

  // Estado + refs para evitar stale-closure en polling
  const [upcoming, setUpcoming] = useState(baseUpcoming);
  const [completedList, setCompletedList] = useState(baseCompleted);
  const upRef = useRef(upcoming);
  const compRef = useRef(completedList);
  useEffect(() => { upRef.current = upcoming; }, [upcoming]);
  useEffect(() => { compRef.current = completedList; }, [completedList]);

  // Primera hidratación + logos
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
      if (!cancelled) {
        // reclasificar finalizados
        const readyU = hyd2U.map(m => (m.status === "LIVE" && isMapFinal(m.rounds)) ? { ...m, status: "FINAL" } : m);
        const stayUp = readyU.filter(m => m.status !== "FINAL");
        const moved = readyU.filter(m => m.status === "FINAL");
        setUpcoming(stayUp);
        setCompletedList(hyd2C.concat(moved));
      }

      const visible = [...hyd2U, ...hyd2C];
      const cache = await ensureLogosFor(visible);
      if (!cancelled) {
        setLogoMap(cache?.logoMap || {});
        setTeamList(cache?.teamList || []);
      }
    })();
    return () => { cancelled = true; };
  }, [baseUpcoming, baseCompleted]);

  // Polling
  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const segs = await fetchLiveSegmentsFromProxy();
      if (cancelled) return;

      const oneU = hydrateWithSegmentsOnce(upRef.current, segs);
      const oneC = hydrateWithSegmentsOnce(compRef.current, segs);

      const twoU = await hydratePreciselyOnce(oneU);
      const twoC = await hydratePreciselyOnce(oneC);

      if (!cancelled) {
        // mover los que terminaron
        const readyU = twoU.map(m => (m.status === "LIVE" && isMapFinal(m.rounds)) ? { ...m, status: "FINAL" } : m);
        const stayUp = readyU.filter(m => m.status !== "FINAL");
        const moved = readyU.filter(m => m.status === "FINAL");

        setUpcoming(stayUp);
        setCompletedList(twoC.concat(moved));
      }
    }

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="home-matches">
      {/* Upcoming */}
      <section className="block">
        <div className="block__head">
          <h2 className="block__title text-3xl font-bold mb-10">Upcoming matches</h2>
        </div>
        {upcoming.length ? (
          <div className="match-list">
            {upcoming.map((m) => (
              <ScheduleCard key={`u-${m.id}`} match={m} logos={logoMap} teamList={teamList} />
            ))}
          </div>
        ) : (
          <p className="block__empty">No hay partidos próximos.</p>
        )}
      </section>

      {/* Completed */}
      <section className="block">
        <div className="block__head">
          <h2 className="block__title text-3xl font-bold mb-10">Completed matches</h2>
        </div>
        {completedList.length ? (
          <div className="match-list">
            {completedList.map((m) => (
              <ScheduleCard key={`c-${m.id}`} match={m} logos={logoMap} teamList={teamList} />
            ))}
          </div>
        ) : (
          <p className="block__empty">No hay resultados disponibles.</p>
        )}
      </section>
    </div>
  );
}
