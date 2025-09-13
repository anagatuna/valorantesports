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

function getSegRounds(seg = {}) {
  const n = (x) => {
    const v = Number(x);
    return Number.isFinite(v) ? v : null;
  };
  return {
    t1ct: n(seg?.team1_round_ct),
    t1t: n(seg?.team1_round_t),
    t2ct: n(seg?.team2_round_ct),
    t2t: n(seg?.team2_round_t),
  };
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
function hydrateWithSegmentsOnce(matches, segments) {
  if (!segments?.length) return matches;

  const prepared = segments.map((seg) => ({
    raw: seg,
    t1: clean(seg?.team1 || ""),
    t2: clean(seg?.team2 || ""),
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

    const nextStatus = hit.isLiveSeg ? "LIVE" : m.status || "UPCOMING";
    const segMap = getSegMapName(hit.raw);
    const rounds = getSegRounds(hit.raw);

    // series wins (mapas ganados)
    const s1 = Number(hit.raw?.score1);
    const s2 = Number(hit.raw?.score2);
    const score1 = Number.isFinite(s1) ? s1 : m?.teams?.[0]?.score ?? null;
    const score2 = Number.isFinite(s2) ? s2 : m?.teams?.[1]?.score ?? null;

    return {
      ...m,
      status: nextStatus,
      currentMap: segMap || m.currentMap || null,
      mapImage: segMap ? resolveMapImage(segMap) : m.mapImage || null,
      vlrUrl: hit.raw?.match_page || m.vlrUrl,
      mapNumber: hit.raw?.map_number ?? m.mapNumber,
      rounds,
      teams: [
        { ...(m.teams?.[0] || {}), score: nextStatus === "UPCOMING" ? null : score1 },
        { ...(m.teams?.[1] || {}), score: nextStatus === "UPCOMING" ? null : score2 },
      ],
    };
  });
}

async function hydratePreciselyOnce(matches) {
  const segs = await fetchLiveSegmentsFromProxy();
  const prepared = segs.map((seg) => ({
    raw: seg,
    url: (seg?.match_page || "").trim(),
  }));

  const updated = matches.map((m) => {
    const isLive = String(m?.status || "").toUpperCase() === "LIVE";
    if (!isLive || !m?.vlrUrl) return m;
    const hit = prepared.find((p) => p.url === m.vlrUrl.trim());
    if (!hit) return m;

    const segMap = getSegMapName(hit.raw);
    const rounds = getSegRounds(hit.raw);
    if (segMap && segMap !== m.currentMap) {
      return { ...m, currentMap: segMap, mapImage: resolveMapImage(segMap), rounds };
    }
    if (rounds && JSON.stringify(rounds) !== JSON.stringify(m.rounds)) {
      return { ...m, rounds };
    }
    return m;
  });

  return updated;
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

      bestOf: 3, // Bo3

      // 👇 ESTO es "mapas ganados" (para los diamantes)
      teams: [
        { name: "G2 Esports", score: 0 },
        { name: "SENTINELS",  score: 1 },
      ],

      // 👇 Esto es el mapa actual (para el score grande)
      currentMap,
      mapImage: resolveMapImage(currentMap),
      in: null,
      rounds: {
        t1ct: 4,
        t1t:  6,
        t2ct: 8,
        t2t:  4,
      },
    };
  }, []);

  const baseUpcoming = useMemo(() => {
    const a = today?.items || [];
    const b = next?.items || [];
    return [demoLiveMatch, ...a, ...b].slice(0, 8).map(decorateWithLocalMap);
  }, [today, next, demoLiveMatch]);

  const baseCompleted = useMemo(
    () => (completed?.items || []).slice(0, 8).map(decorateWithLocalMap),
    [completed]
  );

  const [upcoming, setUpcoming] = useState(baseUpcoming);
  const [completedList, setCompletedList] = useState(baseCompleted);
  const upRef = useRef(upcoming);
  const compRef = useRef(completedList);
  useEffect(() => { upRef.current = upcoming; }, [upcoming]);
  useEffect(() => { compRef.current = completedList; }, [completedList]);

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
        setUpcoming(hyd2U);
        setCompletedList(hyd2C);
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
        setUpcoming(twoU);
        setCompletedList(twoC);
      }
    }

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="home-matches">
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
