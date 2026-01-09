// src/components/MatchDetail.jsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

/* ===== Utils ===== */
const safe = (n) => Number(n ?? 0) || 0;

/* ===== Agents Logic (Corregida para forzar local) ===== */
const AGENT_ALIAS = { "kay/o": "kayo", brim: "brimstone", harbour: "harbor" };

// Función para limpiar el nombre y que coincida con tus carpetas
const agentKey = (s = "") => {
  if (!s) return "unknown";
  // Intenta sacar el nombre limpio si viene una URL sucia
  let cleanName = s;
  if (s.includes('/')) {
      const parts = s.split('/');
      cleanName = parts[parts.length - 1].split('.')[0].replace(/\d/g, '');
  }

  const base = cleanName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const key = base.replace(/[^a-z]/g, "");
  return (AGENT_ALIAS[key] || key).replace("/", "");
};

function resolveAgentPair(agentNameFromDb = "", agentImgUrlFromDb = null) {
  // Usamos el nombre o la URL para deducir la 'key' (ej. "jett")
  const k = agentKey(agentNameFromDb || agentImgUrlFromDb);

  // --- CAMBIO CLAVE: FORZAMOS LA RUTA LOCAL ---
  // Asumimos que tus imágenes están en /public/agents/jett/jett-1.webp
  const localCoverPath = `/agents/${k}/${k}-1.webp`;
  // Asumimos que la imagen de personaje es jett-2.webp
  const localCharacterPath = `/agents/${k}/${k}-2.webp`;

  return {
      cover: localCoverPath,
      character: localCharacterPath
  };
}

/* ===== Demo Data (Restaurado) ===== */
const DEMO_SCOREBOARD = {
  playersT1: [
    { name: "Mixwell", tag: "g2", agent: "Jett", acs: 265, k: 19, d: 15, a: 3, plusMinus: +4 },
    { name: "AvovA", tag: "g2", agent: "Omen", acs: 185, k: 13, d: 14, a: 5, plusMinus: -1 },
    { name: "Nukkye", tag: "g2", agent: "Raze", acs: 230, k: 17, d: 16, a: 2, plusMinus: +1 },
    { name: "hoody", tag: "g2", agent: "Sage", acs: 150, k: 9, d: 14, a: 7, plusMinus: -5 },
    { name: "keloqz", tag: "g2", agent: "Sova", acs: 200, k: 14, d: 12, a: 6, plusMinus: +2 },
  ],
  playersT2: [
    { name: "TenZ", tag: "sen", agent: "Jett", acs: 290, k: 22, d: 15, a: 3, plusMinus: +7 },
    { name: "Zekken", tag: "sen", agent: "Raze", acs: 210, k: 15, d: 14, a: 4, plusMinus: +1 },
    { name: "Sacy", tag: "sen", agent: "Sova", acs: 170, k: 11, d: 13, a: 8, plusMinus: -2 },
    { name: "Zellsis", tag: "sen", agent: "Viper", acs: 195, k: 14, d: 12, a: 6, plusMinus: +2 },
    { name: "johnqt", tag: "sen", agent: "Killjoy", acs: 160, k: 10, d: 13, a: 7, plusMinus: -3 },
  ],
};

/* ===== Helper para formatear datos de Supabase ===== */
function formatDbPlayer(p) {
    let agentName = "Agent";
    if (p.agent_img && p.agent_img.includes('/')) {
        const parts = p.agent_img.split('/');
        agentName = parts[parts.length - 1].split('.')[0].replace(/\d/g, ''); 
    }

    return {
        name: p.player_name,
        tag: p.team_name,
        agent: p.agentName,
        agentImg: p.agent_img, 
        acs: 0,
        k: p.k, 
        d: p.d, 
        a: p.a,
        plusMinus: p.k - p.d
    };
}

/* ===== Componente Principal ===== */
export default function MatchDetail({ match }) {
  const [t1, t2] = match?.teams ?? [{}, {}];
  const [scoreboard, setScoreboard] = useState({ playersT1: [], playersT2: [] });
  const [loading, setLoading] = useState(false);

  const wins1 = safe(match?.series?.wins1);
  const wins2 = safe(match?.series?.wins2);

  useEffect(() => {
    // 1. Si es la demo, cargamos datos falsos al instante
    if (match?.id === "demo-live") {
        setScoreboard(DEMO_SCOREBOARD);
        return;
    }

    // 2. Si no hay ID, no hacemos nada
    if (!match?.id) return;

    // 3. Si es un partido real, buscamos en Supabase
    async function fetchFromSupabase() {
        setLoading(true);
        
        const { data: stats, error } = await supabase
            .from('match_stats')
            .select('*')
            .eq('match_id', match.id);

        if (error || !stats || stats.length === 0) {
            setLoading(false);
            return;
        }

        const teamsInDb = [...new Set(stats.map(s => s.team_name))];
        const teamAName = teamsInDb[0];
        const teamBName = teamsInDb.find(n => n !== teamAName);

        const p1 = stats.filter(s => s.team_name === teamAName).map(formatDbPlayer);
        const p2 = stats.filter(s => s.team_name === teamBName).map(formatDbPlayer);

        setScoreboard({
            playersT1: p1,
            playersT2: p2
        });
        setLoading(false);
    }

    fetchFromSupabase();
  }, [match?.id]);

  // --- Render de Fila ---
  const Row = ({ p }) => {
    const { cover } = resolveAgentPair(p.agent, p.agentImg);
    return (
      <tr className="border-b border-white/5 align-top hover:bg-white/5 transition-colors">
        <td className="py-2 pr-2 w-[180px]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 relative rounded overflow-hidden bg-gray-800 shrink-0">
                <Image src={cover} alt={p.agent} fill className="object-cover" unoptimized />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-bold text-white text-sm">{p.name || "—"}</span>
              <span className="text-[10px] text-gray-400 capitalize">{p.agent}</span>
            </div>
          </div>
        </td>
        <td className="py-2 pr-2 text-center text-gray-500 text-xs">{p.acs || "-"}</td> 
        <td className="py-2 pr-2 text-center font-mono text-white text-sm">
            <span className="text-green-400">{p.k}</span> / <span className="text-red-400">{p.d}</span> / <span className="text-blue-400">{p.a}</span>
        </td>
        <td className={`py-2 pr-2 text-center font-bold text-sm ${p.plusMinus > 0 ? "text-green-500" : p.plusMinus < 0 ? "text-red-500" : "text-gray-500"}`}>
          {p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus}
        </td>
      </tr>
    );
  };

  return (
    <div className="mdetail w-full bg-black/20 p-4 rounded-xl border border-white/10 mt-4">
      <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
        <div className="text-lg font-bold truncate max-w-[40%]">{t1.name || "Team A"}</div>
        <div className="text-2xl font-black tracking-widest text-accent px-4">
            {wins1} - {wins2}
        </div>
        <div className="text-lg font-bold text-right truncate max-w-[40%]">{t2.name || "Team B"}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h3 className="text-xs font-bold opacity-60 mb-2 uppercase tracking-wider">{t1.name}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-white/10 text-[10px] text-gray-500 uppercase">
                  <th className="py-2 pl-2">Player</th>
                  <th className="py-2 text-center">ACS</th>
                  <th className="py-2 text-center">K / D / A</th>
                  <th className="py-2 text-center">+/-</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                    <tr><td colSpan="4" className="text-center py-4 text-xs opacity-50">Cargando stats...</td></tr>
                ) : scoreboard.playersT1.length > 0 ? (
                    scoreboard.playersT1.map((p, i) => <Row key={`t1-${i}`} p={p} />)
                ) : (
                    <tr><td colSpan="4" className="text-center py-4 text-xs opacity-50">Sin datos en DB</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold opacity-60 mb-2 uppercase tracking-wider lg:text-right">{t2.name}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-white/10 text-[10px] text-gray-500 uppercase">
                  <th className="py-2 pl-2">Player</th>
                  <th className="py-2 text-center">ACS</th>
                  <th className="py-2 text-center">K / D / A</th>
                  <th className="py-2 text-center">+/-</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                    <tr><td colSpan="4" className="text-center py-4 text-xs opacity-50">Cargando stats...</td></tr>
                ) : scoreboard.playersT2.length > 0 ? (
                    scoreboard.playersT2.map((p, i) => <Row key={`t2-${i}`} p={p} />)
                ) : (
                    <tr><td colSpan="4" className="text-center py-4 text-xs opacity-50">Sin datos en DB</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}