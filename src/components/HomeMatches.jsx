// src/components/HomeMatches.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ScheduleCard from "@/components/ScheduleCard";
import { loadLogosFromCache, saveLogosToCache } from "@/utils/teamLogoCache";

/* ========= helpers ========= */
async function getJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) return { data: [] };
  return res.json();
}

function dedupeKeepOrder(list) {
  const seen = new Set();
  const out = [];
  for (const m of list) {
    if (!m?.id) continue;
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

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

/* ========= component ========= */
export default function HomeMatches({ combined, hasLiveInitial, completed }) {
  // estado visible
  const [combo, setCombo] = useState(combined || []); // LIVE + UPCOMING ya ordenados por la API (asc)
  const [hasLive, setHasLive] = useState(Boolean(hasLiveInitial));
  const [completedItems, setCompletedItems] = useState(completed?.items || []);

  // logos
  const [logoMap, setLogoMap] = useState({});
  const [teamList, setTeamList] = useState([]);

  // polling handler
  const pollingRef = useRef(null);

  // visibles (máx 10 ya viene limitado desde server, pero por si acaso)
  const upcomingAndLive = useMemo(() => (combo || []).slice(0, 10), [combo]);
  const completedLimited = useMemo(() => (completedItems || []).slice(0, 10), [completedItems]);

  // cargar logos para lo que se ve
  useEffect(() => {
    (async () => {
      const visible = [...upcomingAndLive, ...completedLimited];
      const cache = await ensureLogosFor(visible);
      setLogoMap(cache?.logoMap || {});
      setTeamList(cache?.teamList || []);
    })();
  }, [upcomingAndLive, completedLimited]);

  // === Polling inteligente ===
  useEffect(() => {
    // si hay LIVE, cada 15s; si no, cada 60s
    const pollMs = hasLive ? 15000 : 60000;

    async function tick() {
      try {
        // La API ya entrega orden correcto:
        // - LIVE asc por startTs
        // - UPCOMING asc por startTs
        // Luego combinamos y de-duplicamos conservando el orden
        const [live, upc] = await Promise.all([
          getJSON("/api/matches?status=LIVE&limit=50"),
          getJSON("/api/matches?status=UPCOMING&limit=200"),
        ]);
        const merged = dedupeKeepOrder([...(live?.data || []), ...(upc?.data || [])]).slice(0, 10);
        setCombo(merged);
        setHasLive((live?.data || []).length > 0);

        // Actualizamos completed cada 60s (independiente de hasLive)
        // Lo hacemos junto aquí para no abrir otro intervalo
        const comp = await getJSON("/api/matches?status=COMPLETED&limit=10");
        setCompletedItems(comp?.data || []);
      } catch (e) {
        // opcional: console.warn(e);
      }
    }

    // primera ejecución inmediata
    tick();

    // limpiar/crear intervalo
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(tick, pollMs);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [hasLive]); // si cambia hasLive, cambia el intervalo

  return (
    <div className="home-matches">
      {/* UPCOMING + LIVE */}
      <section className="block">
        <div className="block__head">
          <h2 className="block__title text-3xl font-bold mb-10">Upcoming & Live</h2>
        </div>
        {upcomingAndLive.length ? (
          <div className="match-list">
            {upcomingAndLive.map(m => (
              <ScheduleCard key={`ul-${m.id}-${m.status}`} match={m} logos={logoMap} teamList={teamList} />
            ))}
          </div>
        ) : (
          <p className="block__empty">No hay partidos próximos.</p>
        )}
      </section>

      {/* COMPLETED */}
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
