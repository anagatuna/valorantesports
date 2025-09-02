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

// normaliza nombres de mapa para mapear a imagen local
const normMap = (s = "") =>
  s.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const resolveMapImage = (mapName) => {
  const key = normMap(mapName || "");
  return MAP_IMAGES[key] || MAP_IMAGES.unknown || null;
};

/* ================== Logos de equipos (igual que tenías) ================== */
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

/* ================== Live segments desde tu proxy ================== */
async function fetchLiveSegmentsFromProxy() {
  try {
    const r = await fetch("/api/vlrgg/live", { cache: "no-store" });
    if (!r.ok) return [];
    const j = await r.json();
    // tu payload: { data: { status: 200, segments: [ ... ] } }
    const segments = Array.isArray(j?.data?.segments) ? j.data.segments : [];
    return segments;
  } catch {
    return [];
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

/** Hidrata SOLO LIVE sin currentMap, usando /api/vlrgg/live (segments) */
async function hydrateLiveMapsWithSegments(matches) {
  const segments = await fetchLiveSegmentsFromProxy();
  if (!segments.length) return matches;

  // Para acelerar matching, preparamos pares normalizados
  const prepared = segments.map(seg => ({
    raw: seg,
    t1: clean(seg?.team1 || ""),
    t2: clean(seg?.team2 || ""),
  }));

  const out = [];
  for (const m of matches) {
    const isLive = String(m?.status || "").toUpperCase() === "LIVE";
    const hasMap = !!m?.currentMap;
    if (!isLive || hasMap) {
      out.push(m);
      continue;
    }

    const tm1 = clean(m?.teams?.[0]?.name || "");
    const tm2 = clean(m?.teams?.[1]?.name || "");

    const hit = prepared.find(seg =>
      (seg.t1 && seg.t2) &&
      (
        (seg.t1 === tm1 && seg.t2 === tm2) ||
        (seg.t1 === tm2 && seg.t2 === tm1) ||
        (teamsRoughEqual(seg.t1, tm1) && teamsRoughEqual(seg.t2, tm2)) ||
        (teamsRoughEqual(seg.t1, tm2) && teamsRoughEqual(seg.t2, tm1))
      )
    );

    if (hit?.raw?.current_map) {
      const name = hit.raw.current_map;
      out.push({
        ...m,
        currentMap: name,
        mapImage: resolveMapImage(name),
        // extra opcional útil si quieres guardarlo:
        vlrUrl: hit.raw.match_page || m.vlrUrl,
        start_time: hit.raw.unix_timestamp || m.start_time,
      });
    } else {
      out.push(m);
    }
  }
  return out;
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

  // 1) Base lists
  const baseUpcoming = useMemo(() => {
    const a = today?.items || [];
    const b = next?.items || [];
    return [demoLiveMatch, ...a, ...b].slice(0, 8);
  }, [today, next, demoLiveMatch]);

  const baseCompleted = useMemo(
    () => (completed?.items || []).slice(0, 8),
    [completed]
  );

  // 2) Estado con listas (primero decoramos con lo que ya venga)
  const [upcoming, setUpcoming] = useState(baseUpcoming.map(decorateWithLocalMap));
  const [completedList, setCompletedList] = useState(baseCompleted.map(decorateWithLocalMap));

  // 3) Hidratar currentMap (LIVE) + Logos
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Hidrata currentMap SOLO para LIVE que aún no lo traen, usando /api/vlrgg/live
      const hydUpcoming = await hydrateLiveMapsWithSegments(baseUpcoming.map(decorateWithLocalMap));
      const hydCompleted = await hydrateLiveMapsWithSegments(baseCompleted.map(decorateWithLocalMap));
      if (!cancelled) {
        setUpcoming(hydUpcoming);
        setCompletedList(hydCompleted);
      }

      // Logos de equipos
      const visible = [...hydUpcoming, ...hydCompleted];
      const cache = await ensureLogosFor(visible);
      if (!cancelled) {
        setLogoMap(cache?.logoMap || {});
        setTeamList(cache?.teamList || []);
      }
    })();
    return () => { cancelled = true; };
  }, [baseUpcoming, baseCompleted]);

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
