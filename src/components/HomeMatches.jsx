// src/components/HomeMatches.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import ScheduleCard from "@/components/ScheduleCard";
import { loadLogosFromCache, saveLogosToCache } from "@/utils/teamLogoCache";

/* ================== Mapas locales ================== */
const MAP_IMAGES = {
  abyss:    "/maps/abyss.webp",
  ascent:   "/maps/ascent.webp",
  bind:     "/maps/bind.webp",
  breeze:   "/maps/breeze.webp",
  corrode:  "/maps/corrode.webp",
  fracture: "/maps/fracture.webp",
  haven:    "/maps/haven.webp",
  icebox:   "/maps/icebox.webp",
  lotus:    "/maps/lotus.webp",
  pearl:    "/maps/pearl.webp",
  split:    "/maps/split.webp",
  sunset:   "/maps/sunset.webp",
  unknown:  "/maps/unknown.webp",
};

const normMap = (s = "") =>
  s.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const resolveMapImage = (mapName) => {
  const key = normMap(mapName || "");
  return MAP_IMAGES[key] || MAP_IMAGES.unknown || null;
};

/* ================== Logos (igual que tenías) ================== */
async function ensureLogosFor(matches) {
  const needed = new Set();
  for (const m of matches) (m.teams || []).forEach(t => t?.name && needed.add(t.name.toLowerCase().trim()));

  const cached = loadLogosFromCache();
  const logoMap = cached?.logoMap || {};
  const normalize = (s) => s.toLowerCase().replace(/[\s\-_\.]+/g, "").trim();
  const hasAll = () => [...needed].every(n => logoMap[normalize(n)]);
  if (hasAll()) return cached;

  let page = 1;
  while (page <= 5 && !hasAll()) {
    const res = await fetch(`https://vlr.orlandomm.net/api/v1/teams?page=${page}&size=200`);
    if (!res.ok) break;
    const json = await res.json();
    (json?.data || []).forEach(team => {
      const key = normalize(team?.name || "");
      const img = team?.img || team?.image;
      if (key && img) logoMap[key] = img;
    });
    page++;
  }
  saveLogosToCache(logoMap, []);
  return { logoMap, teamList: [] };
}

/* ================== Utils de matching de equipos ================== */
const clean = (s = "") =>
  s.toLowerCase()
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

/* ================== Fetch helpers (proxies) ================== */
async function fetchLiveSegmentsFromProxy() {
  try {
    const r = await fetch("/api/vlrgg/list?q=live_score", { cache: "no-store" });
    if (!r.ok) return [];
    const j = await r.json();
    // payload: { data: { status: 200, segments: [...] } }
    return Array.isArray(j?.data?.segments) ? j.data.segments : [];
  } catch {
    return [];
  }
}

/* ✅ NUEVA función de fallback “precisa” (sin 422)
   Re-usa q=live_score y filtra por match_page */
async function fetchCurrentMapByUrlFromSegments(vlrUrl) {
  if (!vlrUrl) return null;
  try {
    const r = await fetch(`/api/vlrgg/list?q=live_score`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    const segs = Array.isArray(j?.data?.segments) ? j.data.segments : [];
    const hit = segs.find(s => (s?.match_page || "").trim() === vlrUrl.trim());
    const name = hit?.current_map;
    return (typeof name === "string" && name.trim()) ? name : null;
  } catch {
    return null;
  }
}

/* ================== Decoradores de mapa ================== */
function getMapNameLocal(m = {}) {
  return (
    m.currentMap ||
    m.map ||
    m.liveMap ||
    m.live_map ||
    m.mapName ||
    m.stage?.map ||
    m.series?.current_map ||
    null
  );
}

function decorateWithLocalMap(m) {
  const name = getMapNameLocal(m);
  return name ? { ...m, currentMap: name, mapImage: resolveMapImage(name) } : m;
}

/* ================== Hidrataciones ================== */
// Usa live_score para actualizar mapas LIVE (rápido)
function hydrateWithSegmentsOnce(matches, segments) {
  if (!segments?.length) return matches;

  const prepared = segments.map(seg => ({
    raw: seg,
    t1: clean(seg?.team1 || ""),
    t2: clean(seg?.team2 || ""),
  }));

  return matches.map(m => {
    const isLive = String(m?.status || "").toUpperCase() === "LIVE";
    if (!isLive || !m?.teams?.length) return m;

    const tm1 = clean(m.teams[0]?.name || "");
    const tm2 = clean(m.teams[1]?.name || "");

    const hit = prepared.find(seg =>
      (seg.t1 && seg.t2) &&
      (
        (seg.t1 === tm1 && seg.t2 === tm2) ||
        (seg.t1 === tm2 && seg.t2 === tm1) ||
        (teamsRoughEqual(seg.t1, tm1) && teamsRoughEqual(seg.t2, tm2)) ||
        (teamsRoughEqual(seg.t1, tm2) && teamsRoughEqual(seg.t2, tm1))
      )
    );

    const segMap = hit?.raw?.current_map;
    if (segMap && segMap !== m.currentMap) {
      return {
        ...m,
        currentMap: segMap,
        mapImage: resolveMapImage(segMap),
        vlrUrl: hit?.raw?.match_page || m.vlrUrl, // guardamos url para fallback
      };
    }
    if (hit?.raw?.match_page && !m.vlrUrl) {
      return { ...m, vlrUrl: hit.raw.match_page };
    }
    return m;
  });
}

// ✅ Fallback preciso: re-usa live_score pero por match_page (sin tocar startTs)
async function hydratePreciselyOnce(matches) {
  const updated = await Promise.all(
    matches.map(async (m) => {
      const isLive = String(m?.status || "").toUpperCase() === "LIVE";
      if (!isLive || !m?.vlrUrl) return m;
      const precise = await fetchCurrentMapByUrlFromSegments(m.vlrUrl); // 👈 cambio aquí
      if (precise && precise !== m.currentMap) {
        return { ...m, currentMap: precise, mapImage: resolveMapImage(precise) };
      }
      return m;
    })
  );
  return updated;
}

/* ================== Componente ================== */
export default function HomeMatches({ today, next, completed }) {
  const [logoMap, setLogoMap] = useState({});
  const [teamList, setTeamList] = useState([]);

  // Demo LIVE fijo (para que siempre haya una card con mapa)
  const demoLiveMatch = useMemo(() => {
    const currentMap = "icebox";
    return {
      id: "demo-live",
      status: "LIVE",
      startTs: Date.now() - 25 * 60 * 1000,
      event: "PLAYOFFS • VCT",
      teams: [
        { name: "G2 Esports", score: 2 },
        { name: "SENTINELS", score: 10 },
      ],
      currentMap,
      mapImage: resolveMapImage(currentMap),
      in: null,
    };
  }, []);

  // Listas base (de tu feed ya mapeado a matches)
  const baseUpcoming = useMemo(() => {
    const a = today?.items || [];
    const b = next?.items || [];
    return [demoLiveMatch,...a, ...b].slice(0, 8).map(decorateWithLocalMap);
  }, [today, next]);

  const baseCompleted = useMemo(
    () => (completed?.items || []).slice(0, 8).map(decorateWithLocalMap),
    [completed]
  );

  // Estado
  const [upcoming, setUpcoming] = useState(baseUpcoming);
  const [completedList, setCompletedList] = useState(baseCompleted);

  // Primera hidratación + logos
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) hidrata rápidamente con live_score
      const segs = await fetchLiveSegmentsFromProxy();
      if (cancelled) return;
      const hyd1U = hydrateWithSegmentsOnce(baseUpcoming, segs);
      const hyd1C = hydrateWithSegmentsOnce(baseCompleted, segs);
      if (!cancelled) {
        setUpcoming(hyd1U);
        setCompletedList(hyd1C);
      }

      // 2) fallback “preciso” por match_page (sin endpoint de detalle)
      const hyd2U = await hydratePreciselyOnce(hyd1U);
      const hyd2C = await hydratePreciselyOnce(hyd1C);
      if (!cancelled) {
        setUpcoming(hyd2U);
        setCompletedList(hyd2C);
      }

      // 3) logos
      const visible = [...hyd2U, ...hyd2C];
      const cache = await ensureLogosFor(visible);
      if (!cancelled) {
        setLogoMap(cache?.logoMap || {});
        setTeamList(cache?.teamList || []);
      }
    })();
    return () => { cancelled = true; };
  }, [baseUpcoming, baseCompleted]);

  // Polling cada 45s solo para LIVE
  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const segs = await fetchLiveSegmentsFromProxy();
      if (cancelled) return;

      // 1) hidrata por segmentos (rápido)
      setUpcoming(prev => hydrateWithSegmentsOnce(prev, segs));
      setCompletedList(prev => hydrateWithSegmentsOnce(prev, segs));

      // 2) fallback por match_page
      const nextU = await hydratePreciselyOnce(
        hydrateWithSegmentsOnce(upcoming, segs)
      );
      const nextC = await hydratePreciselyOnce(
        hydrateWithSegmentsOnce(completedList, segs)
      );
      if (!cancelled) {
        setUpcoming(nextU);
        setCompletedList(nextC);
      }
    }

    tick();
    const id = setInterval(tick, 45_000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // polling independiente del re-render

  return (
    <div className="home-matches">
      {/* Upcoming */}
      <section className="block">
        <div className="block__head">
          <h2 className="block__title text-3xl font-bold mb-10">Upcoming matches</h2>
        </div>
        {upcoming.length ? (
          <div className="match-list">
            {upcoming.map(m => (
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
            {completedList.map(m => (
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
