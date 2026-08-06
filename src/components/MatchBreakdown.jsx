"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import MapBackground from "@/components/MapBackground";
import { resolveMapImage } from "@/lib/maps";
import { agentKey, resolveAgentPair, splitAgents, splitByTeam } from "@/lib/agents";

const ALL_MAPS = "All Maps";

/**
 * El marcador del mapa. Hay filas de match_maps donde score_a/score_b quedaron
 * en 0 aunque si se guardaron las rondas por lado (t1_ct/t1_t...), asi que en
 * ese caso lo derivamos: el marcador de un mapa ES la suma de sus rondas.
 */
function mapScore(m) {
  const stored = { a: m.score_a ?? 0, b: m.score_b ?? 0 };
  if (stored.a || stored.b) return stored;
  const a = (m.t1_ct ?? 0) + (m.t1_t ?? 0);
  const b = (m.t2_ct ?? 0) + (m.t2_t ?? 0);
  return a || b ? { a, b } : stored;
}

/* ===== Fila del scoreboard ===== */
function PlayerRow({ p }) {
  return (
    <tr className="border-b border-white/5 transition-colors hover:bg-white/5">
      <td className="py-2.5 pr-2">
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 items-center gap-1.5">
            {p.agentsList.map((raw, i) => {
              const pair = resolveAgentPair(raw);
              return (
                <div
                  key={i}
                  title={agentKey(raw)}
                  className="relative h-8 w-8 shrink-0 overflow-hidden rounded border border-white/10 bg-[#1f2937]"
                >
                  {pair && <Image src={pair.cover} alt={agentKey(raw)} fill className="object-cover" unoptimized />}
                </div>
              );
            })}
          </div>
          <div className="flex min-w-0 flex-col leading-none">
            <span className="truncate text-sm font-bold text-white">{p.name}</span>
            {/* En los partidos futuros el scraper guarda el roster sin agente:
                ahi el label salia como "UNKNOWN", mejor no mostrar nada. */}
            {p.agentName && p.agentName !== "unknown" && (
              <span className="mt-1 text-[10px] uppercase tracking-wider text-gray-400">{p.agentName}</span>
            )}
          </div>
        </div>
      </td>
      <td className="py-2.5 text-center font-mono text-sm">
        <span className="text-white/90">{p.k}</span>
        <span className="mx-1 text-gray-500">/</span>
        <span className="text-white/90">{p.d}</span>
        <span className="mx-1 text-gray-500">/</span>
        <span className="text-white/90">{p.a}</span>
      </td>
      <td
        className={`py-2.5 text-center text-sm font-bold ${
          p.plusMinus > 0 ? "text-emerald-400" : p.plusMinus < 0 ? "text-rose-400" : "text-gray-500"
        }`}
      >
        {p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus}
      </td>
    </tr>
  );
}

function Scoreboard({ title, players, align = "left" }) {
  return (
    <div className="min-w-0">
      <h3
        className={`mb-2 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-accent ${
          align === "right" ? "lg:justify-end" : ""
        }`}
      >
        {title}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[380px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-gray-500">
              <th className="pb-2">Agente / Jugador</th>
              <th className="pb-2 text-center">K / D / A</th>
              <th className="pb-2 text-center">+/-</th>
            </tr>
          </thead>
          <tbody>
            {players.length ? (
              players.map((p, i) => <PlayerRow key={`${p.name}-${i}`} p={p} />)
            ) : (
              <tr>
                <td colSpan="3" className="py-4 text-center text-xs text-white/40">
                  Sin estadisticas para este mapa.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ===== Barra CT/T de un mapa ===== */
function SideSplit({ label, ct, t }) {
  const total = ct + t;
  if (!total) return null;
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-24 shrink-0 truncate text-white/60">{label}</span>
      <span className="rounded bg-sky-500/15 px-2 py-0.5 font-mono text-sky-300">CT {ct}</span>
      <span className="rounded bg-amber-500/15 px-2 py-0.5 font-mono text-amber-300">T {t}</span>
    </div>
  );
}

export default function MatchBreakdown({ match, maps, stats }) {
  const name1 = match.team_a || "Equipo A";
  const name2 = match.team_b || "Equipo B";

  // Los tabs salen de match_maps (que trae el marcador por mapa). "All Maps"
  // solo se ofrece si el scraper guardo esa vista agregada en match_stats.
  const tabs = useMemo(() => {
    const fromMaps = maps.map((m) => m.map_name).filter(Boolean);
    const hasAll = stats.some((s) => s.map_name === ALL_MAPS);
    return hasAll ? [ALL_MAPS, ...fromMaps] : fromMaps;
  }, [maps, stats]);

  const [selected, setSelected] = useState(tabs[0] || ALL_MAPS);

  const mapResult = useMemo(() => maps.find((m) => m.map_name === selected), [maps, selected]);

  const board = useMemo(() => {
    const rows = stats.filter((s) => s.map_name === selected);
    const { rowsA, rowsB } = splitByTeam(rows, name1, name2);
    const format = (p) => {
      const agents = splitAgents(p.agent_img);
      return {
        name: p.player_name,
        agentName: agentKey(agents[0] || p.agent_img),
        agentsList: agents.length ? agents : [p.agent_img],
        k: p.k,
        d: p.d,
        a: p.a,
        plusMinus: (p.k ?? 0) - (p.d ?? 0),
      };
    };
    return { playersA: rowsA.map(format), playersB: rowsB.map(format) };
  }, [stats, selected, name1, name2]);

  const mapImage = selected && selected !== ALL_MAPS ? resolveMapImage(selected) : null;

  const seriesA = match.score_a ?? 0;
  const seriesB = match.score_b ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ===== Cabecera de la serie ===== */}
      <header className="relative overflow-hidden rounded-xl border border-white/10 bg-[#111]">
        <MapBackground src={mapImage} alt={selected} sizes="90vw" style={{ "--center-w": "70%", "--center-radius": "8px" }} />
        <div className="relative z-10 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-center gap-2 text-[11px] uppercase tracking-widest text-white/50">
            <span>{match.event_name || match.tournament || "Valorant Match"}</span>
            {match.match_stage && <span className="text-white/30">// {match.match_stage}</span>}
          </div>

          <div className="flex items-center justify-center gap-4 sm:gap-10">
            <div className="min-w-0 flex-1 text-right text-lg font-bold leading-tight text-white sm:text-2xl">{name1}</div>
            <div className="flex shrink-0 items-center gap-3 text-4xl font-black tracking-widest sm:text-5xl">
              <span className={seriesA > seriesB ? "text-accent" : "text-white"}>{seriesA}</span>
              <span className="text-2xl text-white/20">:</span>
              <span className={seriesB > seriesA ? "text-accent" : "text-white"}>{seriesB}</span>
            </div>
            <div className="min-w-0 flex-1 text-left text-lg font-bold leading-tight text-white sm:text-2xl">{name2}</div>
          </div>

          <div className="mt-4 flex justify-center">
            <span
              className={`rounded px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                match.status === "LIVE"
                  ? "bg-[#ff4655] text-white"
                  : match.status === "COMPLETED"
                  ? "bg-white/10 text-white/70"
                  : "bg-sky-500/20 text-sky-200"
              }`}
            >
              {match.status}
            </span>
          </div>
        </div>
      </header>

      {/* ===== Resumen de todos los mapas ===== */}
      {maps.length > 0 && (
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-white/50">Mapas · {maps.length}</h2>
          <div className="flex flex-col gap-4">
            {maps.map((m) => {
              const sc = mapScore(m);
              return (
              <div key={m.id} className="flex flex-col gap-2 border-b border-white/5 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-bold uppercase tracking-wider text-white">{m.map_name}</span>
                  <div className="flex items-center gap-2 font-mono text-lg">
                    <span className={sc.a > sc.b ? "font-bold text-accent" : "text-white/80"}>{sc.a}</span>
                    <span className="text-white/20">:</span>
                    <span className={sc.b > sc.a ? "font-bold text-accent" : "text-white/80"}>{sc.b}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <SideSplit label={name1} ct={m.t1_ct ?? 0} t={m.t1_t ?? 0} />
                  <SideSplit label={name2} ct={m.t2_ct ?? 0} t={m.t2_t ?? 0} />
                </div>
              </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ===== Tabs de mapa ===== */}
      {tabs.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-b border-white/10 pb-2">
          {tabs.map((name, i) => (
            <button
              key={name}
              type="button"
              onClick={() => setSelected(name)}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                selected === name
                  ? "bg-accent text-black"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              {name !== ALL_MAPS && <span className="text-[10px] opacity-50">{tabs[0] === ALL_MAPS ? i : i + 1}</span>}
              {name}
            </button>
          ))}
        </div>
      )}

      {/* ===== Scoreboard del mapa seleccionado ===== */}
      {stats.length > 0 ? (
        <section className="flex flex-col gap-6">
          {mapResult && (() => {
            const sc = mapScore(mapResult);
            return (
              <div className="flex items-center justify-center gap-3 font-mono text-2xl">
                <span className={sc.a > sc.b ? "font-bold text-accent" : "text-white/80"}>{sc.a}</span>
                <span className="text-sm uppercase tracking-widest text-white/40">{selected}</span>
                <span className={sc.b > sc.a ? "font-bold text-accent" : "text-white/80"}>{sc.b}</span>
              </div>
            );
          })()}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
            <Scoreboard title={name1} players={board.playersA} />
            <Scoreboard title={name2} players={board.playersB} align="right" />
          </div>
        </section>
      ) : (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-white/50">
          Todavia no hay estadisticas de jugadores para este partido.
        </p>
      )}
    </div>
  );
}
