"use client";

import { useEffect, useMemo, useState } from "react";
import MatchCard from "@/components/MatchCard";
import { loadLogosFromCache, saveLogosToCache } from "@/utils/teamLogoCache";

async function ensureLogosFor(matches) {
  const needed = new Set();
  for (const m of matches) {
    (m.teams || []).forEach(t => t?.name && needed.add(t.name.toLowerCase().trim()));
  }
  const cached = loadLogosFromCache();
  const logoMap = cached?.logoMap || {};
  const norm = (s) => s.toLowerCase().replace(/[\s\-_\.]+/g, "").trim();
  const hasAll = () => [...needed].every(n => logoMap[norm(n)]);
  if (hasAll()) return cached;

  let page = 1;
  const maxPages = 5;
  while (page <= maxPages && !hasAll()) {
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
  saveLogosToCache(logoMap, []); // tu util acepta (logoMap, teamList)
  return { logoMap, teamList: [] };
}

export default function HomeMatches({ today, next, completed }) {
  const [logoMap, setLogoMap] = useState({});
  const [teamList, setTeamList] = useState([]);

  useEffect(() => {
    (async () => {
      const visible = [
        ...(today?.items || []),
        ...(next?.items || []),
        ...(completed?.items || []),
      ];
      const cache = await ensureLogosFor(visible);
      setLogoMap(cache?.logoMap || {});
      setTeamList(cache?.teamList || []);
    })();
  }, [today?.date, next?.date, completed?.date]);

  const Today = useMemo(() => today?.items || [], [today]);
  const Next = useMemo(() => next?.items?.slice(0, 6) || [], [next]); // primeras del próximo día
  const Done = useMemo(() => completed?.items || [], [completed]);

  return (
    <div className="space-y-12">
      {/* UPCOMING hoy (o siguiente día con juegos) */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-2xl font-bold">Upcoming matches</h2>
          <span className="opacity-70 text-sm">{today?.date}</span>
        </div>
        {Today.length ? (
          <div className="grid md:grid-cols-3 gap-6">
            {Today.map((match, i) => (
              <MatchCard key={`u-${match.id}-${i}`} match={match} logos={logoMap} teamList={teamList} />
            ))}
          </div>
        ) : (
          <p className="opacity-70">No hay partidos programados hoy. Mostramos el siguiente día con juegos.</p>
        )}

        {/* También mañana */}
        {Next.length ? (
          <>
            <div className="flex items-end justify-between mt-8 mb-4">
              <h3 className="text-xl font-semibold">También mañana</h3>
              <span className="opacity-70 text-sm">{next?.date}</span>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {Next.map((match, i) => (
                <MatchCard key={`n-${match.id}-${i}`} match={match} logos={logoMap} teamList={teamList} />
              ))}
            </div>
          </>
        ) : null}
      </section>

      {/* COMPLETED hoy (o ayer) */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-2xl font-bold">Completed matches</h2>
          <span className="opacity-70 text-sm">{completed?.date}</span>
        </div>
        {Done.length ? (
          <div className="grid md:grid-cols-3 gap-6">
            {Done.map((match, i) => (
              <MatchCard key={`c-${match.id}-${i}`} match={match} logos={logoMap} teamList={teamList} />
            ))}
          </div>
        ) : (
          <p className="opacity-70">No hay resultados disponibles.</p>
        )}
      </section>
    </div>
  );
}
