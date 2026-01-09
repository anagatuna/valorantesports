"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

/* ===== Helpers & Utils ===== */
const safe = (n) => Number(n ?? 0) || 0;

/* ===== Agents Logic (Local Force) ===== */
const AGENT_ALIAS = { "kay/o": "kayo", brim: "brimstone", harbour: "harbor" };
const agentKey = (s = "") => {
  if (!s) return "unknown";
  let cleanName = s;
  if (s.includes('/')) {
      const parts = s.split('/');
      cleanName = parts[parts.length - 1].split('.')[0].replace(/\d/g, '');
  }
  const base = cleanName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const key = base.replace(/[^a-z]/g, "");
  return (AGENT_ALIAS[key] || key).replace("/", "");
};

function resolveAgentPair(agentNameOrUrl) {
  const k = agentKey(agentNameOrUrl);
  return {
      cover: `/agents/${k}/${k}-1.webp`,
      // character: `/agents/${k}/${k}-2.webp` // Por si la usas luego
  };
}

/* ===== Componente de Diamantes (Puntitos) ===== */
function SeriesDiamonds({ wins, side }) {
  // Asumimos Bo3 por defecto (2 victorias para ganar). 
  // Si wins > 2, asumimos Bo5.
  const totalDots = wins > 2 ? 3 : 2; 
  
  return (
    <div className={`flex gap-1 ${side === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
      {Array.from({ length: totalDots }).map((_, i) => (
        <div 
            key={i} 
            className={`w-2 h-2 rounded-full border border-white/20 
            ${i < wins ? "bg-accent shadow-[0_0_8px_rgba(var(--accent-rgb),0.6)] border-accent" : "bg-white/10"}`}
        />
      ))}
    </div>
  );
}

/* ===== Componente Principal ===== */
export default function MatchDetail({ match }) {
  const [t1, t2] = match?.teams ?? [{}, {}];
  const [scoreboard, setScoreboard] = useState({ playersT1: [], playersT2: [] });
  const [maps, setMaps] = useState([]); // Nuevo estado para mapas
  const [loading, setLoading] = useState(false);

  // Usamos el score del objeto match (que ya viene parchado de Supabase en HomeMatches)
  const wins1 = safe(match?.score1 ?? match?.series?.wins1 ?? match?.teams?.[0]?.score);
  const wins2 = safe(match?.score2 ?? match?.series?.wins2 ?? match?.teams?.[1]?.score);

  useEffect(() => {
    if (!match?.id || match.id === "demo-live") return;

    async function fetchData() {
        setLoading(true);
        
        // 1. Cargar Stats de Jugadores
        const { data: stats } = await supabase
            .from('match_stats')
            .select('*')
            .eq('match_id', match.id);

        // 2. Cargar Mapas (NUEVO)
        const { data: mapsData } = await supabase
            .from('match_maps')
            .select('*')
            .eq('match_id', match.id)
            .order('id', { ascending: true }); // Ordenar por orden de juego
        
        if (mapsData) setMaps(mapsData);

        if (stats && stats.length > 0) {
            const teamsInDb = [...new Set(stats.map(s => s.team_name))];
            const teamAName = teamsInDb[0];
            const teamBName = teamsInDb.find(n => n !== teamAName);

            const formatPlayer = (p) => ({
                name: p.player_name,
                // Extraemos nombre del agente de la URL para mostrarlo en texto
                agentName: agentKey(p.agent_img), 
                agentImg: p.agent_img, 
                k: p.k, d: p.d, a: p.a,
                plusMinus: p.k - p.d
            });

            setScoreboard({
                playersT1: stats.filter(s => s.team_name === teamAName).map(formatPlayer),
                playersT2: stats.filter(s => s.team_name === teamBName).map(formatPlayer)
            });
        }
        setLoading(false);
    }

    fetchData();
  }, [match?.id]);

  // Fila de jugador
  const Row = ({ p }) => {
    const { cover } = resolveAgentPair(p.agentImg);
    return (
      <tr className="border-b border-white/5 hover:bg-white/5 transition-colors group">
        <td className="py-2 pr-2 w-[180px]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 relative rounded bg-gray-800 shrink-0 overflow-hidden border border-white/10 group-hover:border-accent/50 transition-colors">
                <Image src={cover} alt={p.agentName} fill className="object-cover" unoptimized />
            </div>
            <div className="flex flex-col leading-none justify-center">
              <span className="font-bold text-white text-sm mb-1">{p.name}</span>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">{p.agentName}</span>
            </div>
          </div>
        </td>
        <td className="py-2 text-center text-gray-600 text-xs">-</td> 
        <td className="py-2 text-center font-mono text-white text-sm">
            <span className="text-white/90">{p.k}</span>
            <span className="text-gray-500 mx-1">/</span>
            <span className="text-white/90">{p.d}</span>
            <span className="text-gray-500 mx-1">/</span>
            <span className="text-white/90">{p.a}</span>
        </td>
        <td className={`py-2 text-center font-bold text-sm ${p.plusMinus > 0 ? "text-emerald-400" : p.plusMinus < 0 ? "text-rose-400" : "text-gray-500"}`}>
          {p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus}
        </td>
      </tr>
    );
  };

  return (
    <div className="w-full bg-[#111] p-5 rounded-xl border border-white/5 mt-4 shadow-xl">
      
      {/* --- HEADER: Score & Maps --- */}
      <div className="flex flex-col gap-4 mb-6 border-b border-white/10 pb-6">
        
        {/* Score Principal */}
        <div className="flex justify-between items-center">
             {/* Team 1 */}
            <div className="flex items-center gap-4 flex-1">
                <div className="text-right flex-1">
                    <div className="text-xl font-bold leading-none">{t1.name || "Team A"}</div>
                    <div className="flex justify-end mt-2 opacity-80">
                         <SeriesDiamonds wins={wins1} side="right" />
                    </div>
                </div>
            </div>

            {/* Marcador Central */}
            <div className="px-8 flex flex-col items-center">
                <div className="text-4xl font-black tracking-widest text-white flex items-center gap-3">
                    <span className={wins1 > wins2 ? "text-accent" : "text-white"}>{wins1}</span>
                    <span className="text-white/20 text-2xl">:</span>
                    <span className={wins2 > wins1 ? "text-accent" : "text-white"}>{wins2}</span>
                </div>
                <span className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Final</span>
            </div>

            {/* Team 2 */}
            <div className="flex items-center gap-4 flex-1">
                <div className="text-left flex-1">
                    <div className="text-xl font-bold leading-none">{t2.name || "Team B"}</div>
                    <div className="flex justify-start mt-2 opacity-80">
                         <SeriesDiamonds wins={wins2} side="left" />
                    </div>
                </div>
            </div>
        </div>

        {/* Lista de Mapas (Chips) */}
        {maps.length > 0 && (
            <div className="flex justify-center flex-wrap gap-2 mt-2">
                {maps.map((m) => (
                    <div key={m.id} className="px-3 py-1 rounded bg-white/5 border border-white/5 text-xs flex items-center gap-2">
                        <span className="text-gray-400 uppercase font-bold">{m.map_name}</span>
                        <span className="font-mono text-white">
                            <span className={m.score_a > m.score_b ? "text-accent" : ""}>{m.score_a}</span>
                            <span className="text-gray-600 mx-1">:</span>
                            <span className={m.score_b > m.score_a ? "text-accent" : ""}>{m.score_b}</span>
                        </span>
                    </div>
                ))}
            </div>
        )}
      </div>

      {/* --- BODY: Scoreboard --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Tabla T1 */}
        <div>
          <div className="flex justify-between items-end mb-3 pb-2 border-b border-white/10">
              <h3 className="text-xs font-bold text-accent uppercase tracking-wider">{t1.name}</h3>
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[10px] text-gray-500 uppercase">
                <th className="pb-2 pl-12">Agent / Name</th>
                <th className="pb-2 text-center">ACS</th>
                <th className="pb-2 text-center">K/D/A</th>
                <th className="pb-2 text-center">+/-</th>
              </tr>
            </thead>
            <tbody>
               {loading ? <tr><td colSpan="4" className="py-4 text-center text-xs opacity-50">Cargando...</td></tr> : 
                scoreboard.playersT1.map((p, i) => <Row key={i} p={p} />)}
            </tbody>
          </table>
        </div>

        {/* Tabla T2 */}
        <div>
          <div className="flex justify-between items-end mb-3 pb-2 border-b border-white/10">
              <h3 className="text-xs font-bold text-accent uppercase tracking-wider lg:text-right w-full">{t2.name}</h3>
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[10px] text-gray-500 uppercase">
                <th className="pb-2 pl-12">Agent / Name</th>
                <th className="pb-2 text-center">ACS</th>
                <th className="pb-2 text-center">K/D/A</th>
                <th className="pb-2 text-center">+/-</th>
              </tr>
            </thead>
            <tbody>
               {loading ? <tr><td colSpan="4" className="py-4 text-center text-xs opacity-50">Cargando...</td></tr> : 
                scoreboard.playersT2.map((p, i) => <Row key={i} p={p} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}