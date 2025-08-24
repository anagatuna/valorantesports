// src/components/MatchGrid.jsx
"use client";

import { useEffect, useState } from "react";
import MatchCard from "./MatchCard";
import { loadLogosFromCache, saveLogosToCache } from "@/utils/teamLogoCache";

export default function MatchGrid({ matches = [] }) {
  const [teamLogos, setTeamLogos] = useState({});
  const [teamList, setTeamList] = useState([]);

  // Igual que antes: solo gestión de logos
  const fetchAllTeams = async () => {
    const cached = loadLogosFromCache();
    if (cached) {
      setTeamLogos(cached.logoMap);
      setTeamList(cached.teamList);
      return;
    }

    let page = 1;
    let hasNextPage = true;
    const fullList = [];
    const logos = {};

    const normalize = (name) => name?.toLowerCase().replace(/[\s\-_\.]+/g, "").trim();

    while (hasNextPage) {
      try {
        const res = await fetch(`https://vlr.orlandomm.net/api/v1/teams?page=${page}&size=200`);
        if (!res.ok) break;
        const json = await res.json();
        if (!Array.isArray(json.data)) break;

        json.data.forEach((team) => {
          const key = normalize(team.name);
          const image = team.img || team.image;
          if (key && image) logos[key] = image;
          if (team?.name) fullList.push({ name: team.name, img: image });
        });

        hasNextPage = json.pagination?.hasNextPage;
        page++;
      } catch {
        break;
      }
    }

    saveLogosToCache(logos, fullList);
    setTeamLogos(logos);
    setTeamList(fullList);
  };

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        console.log("🎯 Iniciando fetchMatches...");
        const res = await fetch("https://vlr.orlandomm.net/api/v1/matches");
        const json = await res.json();
        fetchMatches(json.data);
        console.log("✅ Partidos cargados. Ahora llamando a fetchAllTeams()...");

        const teamNamesInMatches = new Set();

        json.data.forEach(match => {
          match.teams?.forEach(team => {
            if (team?.name) {
              teamNamesInMatches.add(team.name.trim().toLowerCase());
            }
          });
        });

        const knownTeamNames = new Set(teamList.map(t => t.name.trim().toLowerCase()));

        const noLogoTeams = [...teamNamesInMatches].filter(name => !knownTeamNames.has(name));

        console.log("🔍 Equipos en partidos sin coincidencia exacta en logoMap:");
        console.table(noLogoTeams);

        await fetchAllTeams();

        console.log("✅ fetchAllTeams ejecutado.");
      } catch (err) {
        console.error("❌ Error cargando partidos o equipos:", err);
      }
    };

    fetchMatches();
  }, []);
  
  if (!matches.length) {
    return <p className="text-gray-400">No hay partidos para mostrar.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {matches.map((match, index) => (
        <MatchCard key={match.id || index} match={match} logos={teamLogos} teamList={teamList} />
      ))}
    </div>
  );
}
