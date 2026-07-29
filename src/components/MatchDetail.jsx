"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

const safe = (n) => Number(n ?? 0) || 0;

/* ===== Utils ===== */
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
// Un jugador puede tener 2 agentes en la vista "All Maps" (uno por mapa jugado).
// El scraper los guarda separados por "||" en la misma columna agent_img.
const splitAgents = (raw = "") => String(raw).split('||').map(s => s.trim()).filter(Boolean);
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
        const [statsRes, mapsRes] = await Promise.all([
            supabase.from('match_stats').select('*').eq('match_id', match.id),
            supabase.from('match_maps').select('*').eq('match_id', match.id).order('id', { ascending: true })
        ]);

        if (mapsRes.data) setMapsResults(mapsRes.data);

        if (statsRes.data && statsRes.data.length > 0) {
            setAllStats(statsRes.data);
            
            // Ordenar mapas: All Maps primero
            let uniqueMaps = [...new Set(statsRes.data.map(s => s.map_name))];
            uniqueMaps.sort((a, b) => (a === 'All Maps' ? -1 : b === 'All Maps' ? 1 : 0));
            
            setAvailableMaps(uniqueMaps);
            setSelectedMap(uniqueMaps[0]);
        }
        setLoading(false);
    }
    fetchData();
  }, [match?.id]);

  // Marcador del mapa actualmente seleccionado (evita repetir el 0:2 de la serie,
  // que ya se ve en la card sin expandir). Si el tab es "All Maps" no hay marcador propio.
  const selectedMapResult = useMemo(
    () => mapsResults.find(m => m.map_name === selectedMap),
    [mapsResults, selectedMap]
  );

  const scoreboard = useMemo(() => {
      if (allStats.length === 0 || !selectedMap) return { playersT1: [], playersT2: [] };
      const filtered = allStats.filter(s => s.map_name === selectedMap);
      
      const teamsInDb = [...new Set(filtered.map(s => s.team_name))];
      let teamAName = teamsInDb.find(dbName => dbName?.includes(t1.name)) || teamsInDb[0];
      let teamBName = teamsInDb.find(n => n !== teamAName);

      const formatPlayer = (p) => {
          const agents = splitAgents(p.agent_img);
          return {
              name: p.player_name,
              agentName: agentKey(agents[0] || p.agent_img),
              agentImg: agents[0] || p.agent_img,
              agentImg2: agents[1] || null,
              k: p.k, d: p.d, a: p.a,
              plusMinus: p.k - p.d
          };
      };

      return {
          playersT1: filtered.filter(s => s.team_name === teamAName).map(formatPlayer),
          playersT2: filtered.filter(s => s.team_name === teamBName).map(formatPlayer)
      };
  }, [allStats, selectedMap, t1, t2]);

  const Row = ({ p }) => {
    const { cover } = resolveAgentPair(p.agentImg);
    const cover2 = p.agentImg2 ? resolveAgentPair(p.agentImg2).cover : null;
    return (
      <tr className="border-b border-white/5 hover:bg-white/5 transition-colors group">
        <td className="py-2 pr-2 w-[180px]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 relative rounded bg-gray-800 shrink-0 overflow-hidden border border-white/10 group-hover:border-accent/50 transition-colors">
                <Image src={cover} alt={p.agentName} fill className="object-cover" unoptimized />
                {cover2 && (
                  <Image
                    src={cover2}
                    alt="agente secundario"
                    fill
                    unoptimized
                    className="object-cover absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-150"
                  />
                )}
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
      
      {/* HEADER */}
      <div className="flex flex-col gap-4 mb-4 border-b border-white/10 pb-4">
        <div className="flex justify-between items-center">
            {/* T1 */}
            <div className="flex items-center gap-4 flex-1">
                <div className="text-right flex-1">
                    <div className="text-xl font-bold leading-none">{t1.name || "Team A"}</div>
                    <div className="flex justify-end mt-2 opacity-80"><SeriesDiamonds wins={wins1} side="right" /></div>
                </div>
            </div>
            {/* Score del mapa seleccionado (la serie ya se ve en la card sin expandir) */}
            <div className="px-8 flex flex-col items-center">
                {selectedMapResult ? (
                  <>
                    <div className="text-4xl font-black tracking-widest text-white flex items-center gap-3">
                        <span className={selectedMapResult.score_a > selectedMapResult.score_b ? "text-accent" : "text-white"}>{selectedMapResult.score_a}</span>
                        <span className="text-white/20 text-2xl">:</span>
                        <span className={selectedMapResult.score_b > selectedMapResult.score_a ? "text-accent" : "text-white"}>{selectedMapResult.score_b}</span>
                    </div>
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">{selectedMap}</span>
                  </>
                ) : (
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest">{selectedMap || "All Maps"}</span>
                )}
            </div>
            {/* T2 */}
            <div className="flex items-center gap-4 flex-1">
                <div className="text-left flex-1">
                    <div className="text-xl font-bold leading-none">{t2.name || "Team B"}</div>
                    <div className="flex justify-start mt-2 opacity-80"><SeriesDiamonds wins={wins2} side="left" /></div>
                </div>
            </div>
        </div>

        {/* MAP CHIPS CON RONDAS */}
        {mapsResults.length > 0 && (
            <div className="flex justify-center flex-wrap gap-2">
                {mapsResults.map((m, i) => (
                    <div key={i} className="px-3 py-1 rounded bg-white/5 border border-white/5 text-xs flex items-center gap-3">
                        <span className="text-gray-400 uppercase font-bold">{m.map_name}</span>
                        <div className="font-mono text-white flex gap-1">
                            <span className={m.score_a > m.score_b ? "text-accent" : ""}>{m.score_a}</span>
                            <span className="text-gray-600">:</span>
                            <span className={m.score_b > m.score_a ? "text-accent" : ""}>{m.score_b}</span>
                        </div>
                        {/* Detalle de Rondas (ATK/DEF) */}
                        {(m.t1_t > 0 || m.t1_ct > 0) && (
                            <div className="text-[10px] text-gray-500 flex gap-2 border-l border-white/10 pl-2">
                                <span>CT:{m.t1_ct}/T:{m.t1_t}</span>
                                <span>vs</span>
                                <span>CT:{m.t2_ct}/T:{m.t2_t}</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        )}
      </div>

      {/* SELECTOR */}
      {availableMaps.length > 1 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-white/5 scrollbar-thin scrollbar-thumb-white/10">
            {availableMaps.map(mapName => (
                <button
                    key={mapName}
                    onClick={() => setSelectedMap(mapName)}
                    className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded transition-all whitespace-nowrap
                        ${selectedMap === mapName 
                            ? "bg-accent text-black shadow-[0_0_15px_rgba(var(--accent-rgb),0.4)]" 
                            : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"}`}
                >
                    {mapName}
                </button>
            ))}
        </div>
      )}

      {/* TABLAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Tabla T1 */}
        <div>
          <h3 className="text-xs font-bold text-accent uppercase tracking-wider mb-2 flex justify-between">
            <span>{t1.name}</span>
            <span className="text-gray-500 font-normal normal-case">{selectedMap}</span>
          </h3>
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
          <h3 className="text-xs font-bold text-accent uppercase tracking-wider lg:text-right mb-2 w-full flex justify-between lg:justify-end gap-4">
            <span className="lg:order-2">{t2.name}</span>
            <span className="text-gray-500 font-normal normal-case lg:order-1">{selectedMap}</span>
          </h3>
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