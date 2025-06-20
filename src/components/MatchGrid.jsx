// src/components/MatchGrid.jsx
"use client";

import { useEffect, useState } from "react";
import MatchCard from "./MatchCard";
import { loadLogosFromCache, saveLogosToCache } from "../utils/teamLogoCache";

export default function MatchGrid() {
  const [matches, setMatches] = useState([]);
  const [teamLogos, setTeamLogos] = useState({});
  const [teamList, setTeamList] = useState([]);

  const fetchAllTeams = async () => {
    const cached = loadLogosFromCache();
    if (cached) {
      console.log("♻️ Cargando logos desde caché válido");
      console.log("📦 Cache cargado:", cached);
      setTeamLogos(cached.logoMap);
      console.log("🧠 logoMap final:", cached.logoMap);
      setTeamList(cached.teamList);
      return;
    }

    let page = 1;
    let hasNextPage = true;
    const fullList = [];
    const logos = {};

    while (hasNextPage) {
      console.log(`🔄 Fetching page ${page}...`);
      try {
        const res = await fetch(`https://vlr.orlandomm.net/api/v1/teams?page=${page}&size=200`);

        if (!res.ok) {
          console.error(`❌ Error HTTP en página ${page}: ${res.status}`);
          break;
        }

        const json = await res.json();

        if (!Array.isArray(json.data)) {
          console.error(`❌ Respuesta inesperada en página ${page}`, json);
          break;
        }

        function normalize(name) {
          return name?.toLowerCase().replace(/[\s\-_\.]+/g, "").trim();
        }

        json.data.forEach(team => {
          const key = normalize(team.name);
          const image = team.img || team.image;
          if (key && image) {
            logos[key] = image;
          }

        });

        console.log(`✅ Página ${page} cargada con ${json.data.length} equipos.`);
        hasNextPage = json.pagination?.hasNextPage;
        page++;

      } catch (err) {
        console.error(`❌ Error inesperado en página ${page}`, err);
        break;
      }
    }

    console.log("🔎 Total de equipos cargados:", fullList.length);
    saveLogosToCache(logos, fullList);
    console.log("✅ Logos cacheados correctamente");
    setTeamLogos(logos);
    setTeamList(fullList);
  };

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        console.log("🎯 Iniciando fetchMatches...");
        const res = await fetch("https://vlr.orlandomm.net/api/v1/matches");
        const json = await res.json();
        setMatches(json.data);
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
    return <p className="text-gray-400">Cargando datos...</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {matches.map((match, index) => (
        <MatchCard
          key={index}
          match={match}
          logos={teamLogos}
          teamList={teamList}
        />
      ))}
    </div>
  );
}
