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
    // Carga/caché de logos independiente de los matches
    fetchAllTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
