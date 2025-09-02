//src/components/HomeMatches.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import ScheduleCard from "@/components/ScheduleCard";
import { loadLogosFromCache, saveLogosToCache } from "@/utils/teamLogoCache";

// 🔹 Diccionario de mapas → imágenes locales (en /public/maps)
const MAP_IMAGES = {
  abyss:   "/maps/abyss.webp",
  ascent:  "/maps/ascent.webp",
  bind:    "/maps/bind.webp",
  breeze:  "/maps/breeze.webp",
  corrode:  "/maps/corrode.webp",
  fracture:  "/maps/fracture.webp",
  haven:   "/maps/haven.webp",
  icebox:  "/maps/icebox.webp",
  lotus:   "/maps/lotus.webp",
  pearl:   "/maps/pearl.webp",
  split:   "/maps/split.webp",
  sunset:  "/maps/sunset.webp",
  // fallback opcional
  unknown: "/maps/unknown.webp",
};

// Normaliza nombres como "Icebox", "ICE BOX", "ice-box" → "icebox"
const norm = (s = "") => s.toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")   // quita acentos
  .replace(/[^a-z0-9]/g, "");        // compacta

  const resolveMapImage = (mapName) => {
  const key = norm(mapName);
  return MAP_IMAGES[key] || MAP_IMAGES.unknown || null;
};

async function ensureLogosFor(matches) {
  const needed = new Set();
  for (const m of matches) (m.teams || []).forEach(t => t?.name && needed.add(t.name.toLowerCase().trim()));
  const cached = loadLogosFromCache();
  const logoMap = cached?.logoMap || {};
  const norm = (s) => s.toLowerCase().replace(/[\s\-_\.]+/g, "").trim();
  const hasAll = () => [...needed].every(n => logoMap[norm(n)]);
  if (hasAll()) return cached;

  let page = 1;
  while (page <= 5 && !hasAll()) {
    const res = await fetch(`https://vlr.orlandomm.net/api/v1/teams?page=${page}&size=200`);
    if (!res.ok) break;
    const json = await res.json();
    (json?.data || []).forEach(team => {
      const key = norm(team?.name || "");
      const img = team?.img || team?.image;
      if (key && img) logoMap[key] = img;
    });
    page++;
  }
  saveLogosToCache(logoMap, []);
  return { logoMap, teamList: [] };
}

export default function HomeMatches({ today, next, completed }) {
  const [logoMap, setLogoMap] = useState({});
  const [teamList, setTeamList] = useState([]);

  // 🔹 Match DEMO: se fija una vez al montar (para que el contador LIVE avance bien)
  const demoLiveMatch = useMemo(() => {
  const currentMap = "icebox"; // ✅ aquí lo defines (ejemplo fijo)
    return {
      id: "demo-live",
      status: "LIVE",
      // empezó hace ~25 min
      startTs: Date.now() - 25 * 60 * 1000,
      event: "PLAYOFFS • VCT",
      teams: [
        { name: "G2 Esports", score: 2 },
        { name: "SENTINELS", score: 10 },
      ],
      currentMap,
      mapImage: resolveMapImage(currentMap),
      in: null,    };
  }, []);

  const upcomingCombined = useMemo(() => {
    const a = today?.items || [];
    const b = next?.items || [];
    // SIEMPRE anteponer el DEMO LIVE
    return [demoLiveMatch, ...a, ...b].slice(0, 8);
  }, [today, next, demoLiveMatch]);

  const completedLimited = useMemo(
    () => (completed?.items || []).slice(0, 8),
    [completed]
  );

  useEffect(() => {
    (async () => {
      const visible = [...upcomingCombined, ...completedLimited];
      const cache = await ensureLogosFor(visible);
      setLogoMap(cache?.logoMap || {});
      setTeamList(cache?.teamList || []);
    })();
  }, [upcomingCombined, completedLimited]);

  return (
    <div className="home-matches">
      {/* Upcoming */}
      <section className="block">
        <div className="block__head">
          <h2 className="block__title text-3xl font-bold mb-10">Upcoming matches</h2>
        </div>
        {upcomingCombined.length ? (
          <div className="match-list">
            {upcomingCombined.map(m => (
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
        {completedLimited.length ? (
          <div className="match-list">
            {completedLimited.map(m => (
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
