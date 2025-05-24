// src/components/MatchGrid.jsx
"use client";
import { useEffect, useState } from "react";
import MatchCard from "./MatchCard";

export default function MatchGrid() {
  const [matches, setMatches] = useState([]);
  const [teamLogos, setTeamLogos] = useState({});

  useEffect(() => {
    const fetchMatches = async () => {
      const res = await fetch("https://vlr.orlandomm.net/api/v1/matches");
      const json = await res.json();
      const matchData = json.data;
      setMatches(matchData);

      // Obtener nombres únicos de equipos
      const teamNames = new Set();
      matchData.forEach((match) => {
        match.teams?.forEach((team) => {
          if (team?.name) teamNames.add(team.name);
        });
      });

      // Fetch logos por nombre
      const logoMap = {};
      await Promise.all(
        [...teamNames].map(async (name) => {
          try {
            const res = await fetch(`https://vlr.orlandomm.net/api/v1/teams?name=${encodeURIComponent(name)}`);
            const json = await res.json();
            if (json.data?.[0]?.img) {
              logoMap[name] = json.data[0].img;
            }
          } catch (err) {
            console.error("Error fetching logo for", name, err);
          }
        })
      );
      setTeamLogos(logoMap);
    };

    fetchMatches();
  }, []);

  if (!matches.length) {
    return <p className="text-gray-400">Loading matches...</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {matches.map((match, index) => (
        <MatchCard key={index} match={match} logos={teamLogos} />
      ))}
    </div>
  );
}
