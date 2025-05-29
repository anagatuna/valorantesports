// src/components/MatchCard.jsx
"use client";
import Image from "next/image";
import { motion } from "framer-motion";

function normalize(name) {
  return name?.toLowerCase().replace(/[\s\-_\.]+/g, "").trim();
}

function findLogoFor(name, logoMap = {}, teamList = []) {
  const norm = normalize(name);
  if (!norm) return null;

  // Coincidencia exacta
  if (logoMap[norm]) return logoMap[norm];

  // Coincidencia parcial más permisiva
  for (const team of teamList) {
    const ref = normalize(team.name);
    if (ref && (ref.includes(norm) || norm.includes(ref))) {
      return team.img;
    }
  }

  return null;
}

export default function MatchCard({ match, logos = {}, teamList = [] }) {
  const [team1, team2] = match.teams ?? [{}, {}];

  const isValidTeam = (name) => {
    const norm = normalize(name);
    return norm && norm !== "tbd";
  };

  const logo1 = isValidTeam(team1.name) ? findLogoFor(team1.name, logos, teamList) : null;
  const logo2 = isValidTeam(team2.name) ? findLogoFor(team2.name, logos, teamList) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.03 }}
      className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 hover:shadow-xl transition"
    >
      <div className="flex justify-between items-center text-sm text-gray-400 mb-2">
        <span>{match.event}</span>
        <span className={`font-semibold ${match.status === 'LIVE' ? 'text-red-500' : 'text-slate-500'}`}>
          {match.status}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {logo1 && (
            <Image
              src={logo1}
              alt={team1.name}
              width={24}
              height={24}
              style={{ height: 'auto' }}
              className="rounded-full"
            />
          )}
          <span className="text-white font-medium truncate">{team1.name ?? 'Team 1'}</span>
        </div>
        <span className="text-lg font-bold text-white">{team1.score ?? '-'}</span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {logo2 && (
            <Image
              src={logo2}
              alt={team2.name}
              width={24}
              height={24}
              style={{ height: 'auto' }}
              className="rounded-full"
            />
          )}
          <span className="text-white font-medium truncate">{team2.name ?? 'Team 2'}</span>
        </div>
        <span className="text-lg font-bold text-white">{team2.score ?? '-'}</span>
      </div>

      <p className="text-xs text-gray-500 mt-3">{match.in ?? 'Unknown time'}</p>
    </motion.div>
  );
}
