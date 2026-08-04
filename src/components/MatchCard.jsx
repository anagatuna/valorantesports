"use client";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { getLogo } from "@/lib/teams";

function normalize(name) {
  return name?.toLowerCase().replace(/[\s\-_\.]+/g, "").trim();
}

// 🔴 AGREGAR ESTA FUNCIÓN
function getProxyUrl(url) {
  if (!url) return null;
  // /img/... es una ruta relativa de vlr.gg (normalmente el placeholder
  // /img/vlr/tmp/vlr.png): contra nuestro dominio no resuelve.
  if (url.startsWith('/img/')) return null;
  if (url.startsWith('/')) return url; // Si es local, no tocar
  return getLogo(url) ? `/api/image-proxy?url=${encodeURIComponent(url)}` : null;
}

function findLogoFor(name, logoMap = {}, teamList = []) {
  const norm = normalize(name);
  if (!norm) return null;
  if (logoMap[norm]) return logoMap[norm];
  for (const team of teamList) {
    const ref = normalize(team.name);
    if (ref && (ref.includes(norm) || norm.includes(ref))) return team.img;
  }
  return null;
}

export default function MatchCard({ match, logos = {}, teamList = [] }) {
  const [team1, team2] = match.teams ?? [{}, {}];
  
  const isValidTeam = (name) => {
    const norm = normalize(name);
    return norm && norm !== "tbd";
  };

  const rawLogo1 = team1.logoDb || (isValidTeam(team1.name) ? findLogoFor(team1.name, logos, teamList) : null);
  const rawLogo2 = team2.logoDb || (isValidTeam(team2.name) ? findLogoFor(team2.name, logos, teamList) : null);

  // 🔴 APLICAR EL PROXY AQUÍ
  const logo1 = getProxyUrl(rawLogo1);
  const logo2 = getProxyUrl(rawLogo2);

  const Card = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.03 }}
      className="bg-gradient-to-br from-[#0F1923] via-[#1A1F25] to-[#1F2326] rounded-xl p-4 hover:shadow-xl transition"
    >
      <div className="flex justify-between items-center text-sm text-gray-400 mb-2">
        <span className="truncate max-w-[70%]">{match.event}</span>
        <span className={`font-semibold text-xs px-2 py-0.5 rounded ${match.status === 'LIVE' ? 'bg-red-500/20 text-red-500' : 'bg-white/5 text-slate-500'}`}>
          {match.status}
        </span>
      </div>

      {/* TEAM 1 */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 relative flex-shrink-0 flex items-center justify-center bg-white/5 rounded-full p-1">
              {logo1 ? (
                <Image
                  src={logo1} // Usa la variable con proxy
                  alt={team1.name}
                  fill
                  className="object-contain p-1"
                  unoptimized // 🔴 IMPORTANTE: Añadir esto
                />
              ) : (
                <div className="w-full h-full bg-white/10 rounded-full" />
              )}
          </div>
          <span className="text-white font-bold truncate max-w-[120px]">{team1.name ?? 'TBD'}</span>
        </div>
        <span className={`text-xl font-bold ${Number(team1.score) > Number(team2.score) ? 'text-accent' : 'text-white/60'}`}>
            {team1.score ?? '-'}
        </span>
      </div>

      {/* TEAM 2 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 relative flex-shrink-0 flex items-center justify-center bg-white/5 rounded-full p-1">
              {logo2 ? (
                <Image
                  src={logo2} // Usa la variable con proxy
                  alt={team2.name}
                  fill
                  className="object-contain p-1"
                  unoptimized // 🔴 IMPORTANTE: Añadir esto
                />
              ) : (
                <div className="w-full h-full bg-white/10 rounded-full" />
              )}
          </div>
          <span className="text-white font-bold truncate max-w-[120px]">{team2.name ?? 'TBD'}</span>
        </div>
        <span className={`text-xl font-bold ${Number(team2.score) > Number(team1.score) ? 'text-accent' : 'text-white/60'}`}>
            {team2.score ?? '-'}
        </span>
      </div>

      <p className="text-[10px] text-gray-600 mt-4 text-right uppercase tracking-wider font-bold">
          {match.in || (match.status === 'FINAL' ? 'Ended' : '')}
      </p>
    </motion.div>
  );

  return match.id ? <div className="cursor-pointer">{Card}</div> : Card;
}