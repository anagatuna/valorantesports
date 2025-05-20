'use client'
import { useEffect, useState } from 'react';

export default function Home() {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    fetch('https://vlresports.vercel.app/api/matches')
      .then((res) => res.json())
      .then((data) => setMatches(data.data));
  }, []);

  return (
    <main className="p-6 bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Partidos Recientes</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {matches.map((match, index) => (
          <div key={index} className="bg-gray-800 p-4 rounded shadow">
            <p className="text-lg font-semibold">
              {match.team1.name} vs {match.team2.name}
            </p>
            <p>{match.time}</p>
            <p className="text-sm text-gray-400">{match.event.name}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
