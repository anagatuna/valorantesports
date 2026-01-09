"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

const safe = (n) => Number(n ?? 0) || 0;

/* ===== Agents Logic ===== */
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
  return { cover: `/agents/${k}/${k}-1.webp` };
}

/* ===== Diamantes ===== */
function SeriesDiamonds({ wins, side }) {
  const totalDots = wins > 2 ? 3 : 2; 
  return (
    <div className={`flex gap-1 ${side === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
      {Array.from({ length: totalDots }).map((_, i) => (
        <div key={i} className={`w-2 h-2 rounded-full border border-white/20 
            ${i < wins ? "bg-accent shadow-[0_0_8px_rgba(var(--accent-rgb),0.6)] border-accent" : "bg-white/10"}`}
        />
      ))}
    </div>
  );
}

export default function MatchDetail({ match }) {
  const [t1, t2] = match?.teams ?? [{}, {}];
  
  const [allStats, setAllStats] = useState([]);
  const [availableMaps, setAvailableMaps] = useState([]);
  const [selectedMap, setSelectedMap] = useState("");
  const [mapsResults, setMapsResults] = useState([]); 
  const [loading, setLoading] = useState(false);

  const wins1 = safe(match?.score1 ?? match?.series?.wins1 ?? match?.teams?.[0]?.score);
  const wins2 = safe(match?.score2 ?? match?.series?.wins2 ?? match?.teams?.[1]?.score);

  useEffect(() => {
    if (!match?.id || match.id === "demo-live") return;

    async function fetchData() {
        setLoading(true);
        
        // Cargar todo en paralelo
        const [statsRes, mapsRes] = await Promise.all([
            supabase.from('match_stats').select('*').eq('match_id', match.id),
            supabase.from('match_maps').select('*').eq('match_id', match.id).order('id', { ascending: true })
        ]);

        if (mapsRes.data) setMapsResults(mapsRes.data);

        if (statsRes.data && statsRes.data.length > 0) {
            setAllStats(statsRes.data);
            
            // Obtener mapas únicos
            // Si el scraper hizo su trabajo, en Bo1 solo vendrá "Ascent" (sin All Maps)
            // En Bo3 vendrá "All Maps", "Ascent", "Bind"
            let uniqueMaps = [...new Set(statsRes.data.map(s => s.map_name))];

            // Ordenar: "All Maps" siempre primero si existe
            uniqueMaps.sort((a, b) => {
                if (a === 'All Maps') return -1;
                if (b === 'All Maps') return 1;
                return 0;
            });

            setAvailableMaps(uniqueMaps);
            // Seleccionar el primero por defecto
            setSelectedMap(uniqueMaps[0]);
        }
        setLoading(false);
    }

    fetchData();
  }, [match?.id]);

  const scoreboard = useMemo(() => {
      if (allStats.length === 0 || !selectedMap) return { playersT1: [], playersT2: [] };

      const filtered = allStats.filter(s => s.map_name === selectedMap);
      
      const teamsInDb = [...new Set(filtered.map(s => s.team_name))];
      const teamAName = teamsInDb[0];
      const teamBName = teamsInDb.find(n => n !== teamAName);

      const formatPlayer = (p) => ({
          name: p.player_name,
          agentName: agentKey(p.agent_img), 
          agentImg: p.agent_img, 
          k: p.k, d: p.d, a: p.a,
          plusMinus: p.k - p.d
      });

      return {
          playersT1: filtered.filter(s => s.team_name === teamAName).map(formatPlayer),
          playersT2: filtered.filter(s => s.team_name === teamBName).map(formatPlayer)
      };
  }, [allStats, selectedMap]);

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
      
      {/* HEADER: Score */}
      <div className="flex flex-col gap-4 mb-4 border-b border-white/10 pb-4">
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-4 flex-1">
                <div className="text-right flex-1">
                    <div className="text-xl font-bold leading-none">{t1.name || "Team A"}</div>
                    <div className="flex justify-end mt-2 opacity-80"><SeriesDiamonds wins={wins1} side="right" /></div>
                </div>
            </div>
            <div className="px-8 flex flex-col items-center">
                <div className="text-4xl font-black tracking-widest text-white flex items-center gap-3">
                    <span className={wins1 > wins2 ? "text-accent" : "text-white"}>{wins1}</span>
                    <span className="text-white/20 text-2xl">:</span>
                    <span className={wins2 > wins1 ? "text-accent" : "text-white"}>{wins2}</span>
                </div>
                <span className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Final</span>
            </div>
            <div className="flex items-center gap-4 flex-1">
                <div className="text-left flex-1">
                    <div className="text-xl font-bold leading-none">{t2.name || "Team B"}</div>
                    <div className="flex justify-start mt-2 opacity-80"><SeriesDiamonds wins={wins2} side="left" /></div>
                </div>
            </div>
        </div>

        {/* Chips de Resultados de Mapas */}
        {mapsResults.length > 0 && (
            <div className="flex justify-center flex-wrap gap-2">
                {mapsResults.map((m) => (
                    <div key={m.id} className="px-3 py-1 rounded bg-white/5 border border-white/5 text-xs flex items-center gap-2">
                        <span className="text-gray-400 uppercase font-bold">{m.map_name}</span>
                        <span className="font-mono text-white">
                            <span className={m.score_a > m.score_b ? "text-accent" : ""}>{m.score_a}</span>:<span className={m.score_b > m.score_a ? "text-accent" : ""}>{m.score_b}</span>
                        </span>
                    </div>
                ))}
            </div>
        )}
      </div>

      {/* --- SELECTOR DE MAPAS (SOLO SI HAY MÁS DE 1) --- */}
      {availableMaps.length > 1 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-white/5">
            {availableMaps.map(mapName => (
                <button
                    key={mapName}
                    onClick={() => setSelectedMap(mapName)}
                    className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded transition-all
                        ${selectedMap === mapName 
                            ? "bg-accent text-black shadow-[0_0_15px_rgba(var(--accent-rgb),0.4)]" 
                            : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"}`}
                >
                    {mapName}
                </button>
            ))}
        </div>
      )}

      {/* --- TABLAS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        <div>
          <h3 className="text-xs font-bold text-accent uppercase tracking-wider mb-2">{t1.name}</h3>
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
        <div>
          <h3 className="text-xs font-bold text-accent uppercase tracking-wider lg:text-right mb-2 w-full">{t2.name}</h3>
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