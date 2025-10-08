// src/components/MatchDetail.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import AgentCard from "@/components/AgentCard";

/* ===== Utils ===== */
const norm = (s) => s?.toLowerCase().replace(/[\s\-_\.]+/g, "").trim();
const safe = (n) => Number(n ?? 0) || 0;

function findLogo(name, map = {}, list = []) {
  const k = norm(name);
  if (!k) return null;
  if (map[k]) return map[k];
  for (const t of list) {
    const r = norm(t?.name);
    if (r && (r.includes(k) || k.includes(r))) return t?.img;
  }
  return null;
}

/* ===== Agents (local imgs) ===== */
const AGENT_ALIAS = { "kay/o": "kayo", brim: "brimstone", harbour: "harbor" };
const agentKey = (s = "") => {
  const base = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const key = base.replace(/[^a-z/]/g, "");
  return (AGENT_ALIAS[key] || key).replace("/", "");
};

function resolveAgentPair(name = "", fallback1 = null) {
  const k = agentKey(name);
  const cover = fallback1 || `/agents/${k}/${k}-1.webp`;
  const character = cover.replace(/-1(\.\w+)$/i, "-2$1");
  return { cover, character };
}

/* ===== Demo scoreboard fallback ===== */
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
  mapIndex: 1,
};

/* ===== Map selector helpers ===== */
function normalizeMapsFromMatch(match = {}) {
  const raw = match.maps || match.series?.maps || match.stage?.maps || match.sets || [];
  if (Array.isArray(raw) && raw.length) {
    return raw.map((m, i) => ({
      key: String(m.key ?? i),
      index: Number.isFinite(m.index) ? Number(m.index) : i,
      name: m.name || m.map || m.mapName || m.stage?.map || `Map ${i + 1}`,
      rounds: {
        t1ct: safe(m?.rounds?.t1ct ?? m?.t1ct),
        t1t: safe(m?.rounds?.t1t ?? m?.t1t),
        t2ct: safe(m?.rounds?.t2ct ?? m?.t2ct),
        t2t: safe(m?.rounds?.t2t ?? m?.t2t),
      },
    }));
  }
  if (match.currentMap) {
    return [{
      key: "cur",
      index: 0,
      name: match.currentMap,
      rounds: {
        t1ct: safe(match?.rounds?.t1ct),
        t1t: safe(match?.rounds?.t1t),
        t2ct: safe(match?.rounds?.t2ct),
        t2t: safe(match?.rounds?.t2t),
      },
    }];
  }
  return [];
}

/* ===== Build round track (scrollable, soporta OT) ===== */
function buildTrack({ t1ct = 0, t1t = 0, t2ct = 0, t2t = 0 }) {
  const wins1 = t1ct + t1t;
  const wins2 = t2ct + t2t;
  const total = wins1 + wins2;

  // 24 base rounds (12 + 12) usando CT/T
  const winners = [];
  for (let i = 0; i < 12; i++) {
    if (i < t1ct) winners.push(1);
    else if (i < t1ct + t2t) winners.push(2);
    else winners.push(0);
  }
  for (let i = 0; i < 12; i++) {
    if (i < t1t) winners.push(1);
    else if (i < t1t + t2ct) winners.push(2);
    else winners.push(0);
  }

  // Si hay OT (más de 24 rondas), añade ganadores extra alternando 1/2
  const c1 = winners.filter((w) => w === 1).length;
  const c2 = winners.filter((w) => w === 2).length;
  let left1 = Math.max(0, wins1 - c1);
  let left2 = Math.max(0, wins2 - c2);

  while (winners.length < total && (left1 > 0 || left2 > 0)) {
    if (left1-- > 0) winners.push(1);
    if (winners.length >= total) break;
    if (left2-- > 0) winners.push(2);
  }

  const rowT1 = winners.map((w) => (w === 1 ? "win" : w === 2 ? "loss" : "void"));
  const rowT2 = winners.map((w) => (w === 2 ? "win" : w === 1 ? "loss" : "void"));
  return { rowT1, rowT2 };
}

/* ===== Timeline UI ===== */
const CELL_W = 22; // px
const LABEL_W = 180; // px

const RoundBubble = ({ type }) => {
  const cls =
    type === "win" ? "bg-emerald-500/80"
      : type === "loss" ? "bg-rose-500/80"
        : "bg-white/10";
  return <div className={`w-[22px] h-[22px] rounded-sm ${cls}`} />;
};

const RoundRow = ({ arr = [], logo, name }) => (
  <div className="flex items-center gap-2">
    <div className="shrink-0" style={{ width: LABEL_W }}>
      <div className="flex items-center gap-2">
        {logo ? (
          <Image src={logo} alt="" width={18} height={18} unoptimized className="opacity-80" />
        ) : (
          <span className="inline-block w-[18px] h-[18px] rounded bg-white/10" />
        )}
        <span className="text-sm font-medium">{name || "—"}</span>
      </div>
    </div>
    <div className="flex items-center gap-1">
      {arr.map((t, i) => <RoundBubble key={i} type={t} />)}
    </div>
  </div>
);

const MapTabs = ({ maps, selected, onSelect }) => (
  <div className="flex gap-2 mb-4 flex-wrap">
    <button
      onClick={() => onSelect("all")}
      className={`px-3 py-1 rounded-md border text-xs uppercase tracking-wide
        ${selected === "all" ? "bg-white/10 border-black/20" : "border-black/10 hover:bg-black/5"}`}
    >
      All Maps
    </button>
    {maps.map((m, i) => (
      <button
        key={m.key ?? i}
        onClick={() => onSelect(i)}
        className={`px-3 py-1 rounded-md border text-xs uppercase tracking-wide
          ${selected === i ? "bg-white/10 border-black/20" : "border-black/10 hover:bg-black/5"}`}
      >
        <span className="opacity-70 mr-1">{i + 1}</span>{m.name}
      </button>
    ))}
  </div>
);

/* ===== Main component ===== */
export default function MatchDetail({ match, logos = {}, teamList = [] }) {
  const [t1, t2] = match?.teams ?? [{}, {}];
  const [scoreboard, setScoreboard] = useState({ playersT1: [], playersT2: [], mapIndex: null });
  const [loading, setLoading] = useState(false);

  const logo1 = t1?.name ? findLogo(t1.name, logos, teamList) : null;
  const logo2 = t2?.name ? findLogo(t2.name, logos, teamList) : null;

  const wins1 = safe(match?.series?.wins1);
  const wins2 = safe(match?.series?.wins2);
  const bo = Number(match?.series?.bestOf ?? 3);

  const t1ct = safe(match?.rounds?.t1ct);
  const t1t = safe(match?.rounds?.t1t);
  const t2ct = safe(match?.rounds?.t2ct);
  const t2t = safe(match?.rounds?.t2t);

  /* Map selector */
  const maps = useMemo(() => normalizeMapsFromMatch(match), [match]);
  const [selectedMap, setSelectedMap] = useState("all");
  useEffect(() => { setSelectedMap(maps.length ? 0 : "all"); }, [maps.length]);

  const activeRounds = useMemo(() => {
    if (selectedMap === "all") return { t1ct, t1t, t2ct, t2t };
    const r = maps[selectedMap]?.rounds || {};
    return { t1ct: safe(r.t1ct), t1t: safe(r.t1t), t2ct: safe(r.t2ct), t2t: safe(r.t2t) };
  }, [selectedMap, maps, t1ct, t1t, t2ct, t2t]);

  const track = useMemo(() => buildTrack(activeRounds), [activeRounds]);
  const roundsCount = track.rowT1.length;
  const contentWidth = LABEL_W + roundsCount * (CELL_W + 4); // + gap aprox

  /* Scoreboard fetch */
  useEffect(() => {
    let abort = false;

    async function load() {
      const path =
        match?.match_page || match?.matchPage || match?.vlrUrl || match?.url || null;

      let id = null;
      if (path) {
        const m = /\/match\/(\d+)\//.exec(String(path));
        if (m?.[1]) id = m[1];
      }
      if (!path && !id) return;

      setLoading(true);
      try {
        const base = id ? `?id=${encodeURIComponent(id)}` : `?path=${encodeURIComponent(path)}`;
        const mapParam =
          selectedMap !== "all" && Number.isFinite(maps[selectedMap]?.index)
            ? `&map=${maps[selectedMap].index}`
            : "";
        const res = await fetch(`/api/scoreboard${base}${mapParam}`, { cache: "no-store" });
        const j = await res.json();
        if (!abort && j?.ok && j?.data) setScoreboard(j.data);
      } catch {
        // silent
      } finally {
        !abort && setLoading(false);
      }
    }

    load();
    return () => { abort = true; };
  }, [match, selectedMap, maps]);

  useEffect(() => {
    if (match?.id === "demo-live") setScoreboard(DEMO_SCOREBOARD);
  }, [match]);

  const Row = ({ p }) => {
    const { cover, character } = resolveAgentPair(p.agent, p.agentImg);
    return (
      <tr className="border-b border-white/5 align-top">
        <td className="py-2 pr-2 w-[120px]">
          <div className="flex items-start gap-3">
            <AgentCard
              coverSrc={cover}
              charSrc={character}
              size="sm"            // compacto
              className="agent-card--table"
            />
            <div className="flex flex-col leading-tight mt-1">
              <span className="font-medium">{p.name || "—"}</span>
              <span className="text-xs opacity-70 mt-1">{p.agent}</span>
              {p.tag ? <span className="text-xs opacity-60">{p.tag}</span> : null}
            </div>
          </div>
        </td>
        <td className="py-2 pr-2 text-center">{p.acs}</td>
        <td className="py-2 pr-2 text-center">{p.k} / {p.d} / {p.a}</td>
        <td className="py-2 pr-2 text-center">{p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus}</td>
      </tr>
    );
  };

  return (
    <div className="mdetail w-full">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="ml-auto text-xs opacity-75">
          Series: {wins1}-{wins2} (Bo{bo})
        </span>
      </div>

      {/* Map tabs */}
      <MapTabs maps={maps} selected={selectedMap} onSelect={setSelectedMap} />

      {/* Timeline (scrollable) */}
      {selectedMap !== "all" && (
        <div className="mb-6 overflow-x-auto">
          <div className="relative" style={{ width: Math.max(contentWidth, 560) }}>
            {/* Header de números 1..N */}
            <div className="flex items-center gap-2 mb-2">
              <div className="shrink-0" style={{ width: LABEL_W }} />
              <div className="flex items-center gap-1">
                {Array.from({ length: roundsCount }, (_, i) => (
                  <div key={`h-${i}`} className="w-[22px] h-[22px] grid place-items-center text-[10px] opacity-60">
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>
            {/* Filas */}
            <RoundRow arr={track.rowT1} logo={logo1} name={t1?.name} />
            <div className="mt-2">
              <RoundRow arr={track.rowT2} logo={logo2} name={t2?.name} />
            </div>
          </div>
        </div>
      )}

      {/* Scoreboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-white/10">
                  <th className="py-2 pr-2">Player</th>
                  <th className="py-2 pr-2 text-center">ACS</th>
                  <th className="py-2 pr-2 text-center">K / D / A</th>
                  <th className="py-2 pr-2 text-center">+/-</th>
                </tr>
              </thead>
              <tbody>
                {loading && !scoreboard.playersT1.length ? (
                  <tr><td className="py-3 text-xs opacity-60" colSpan={4}>Cargando…</td></tr>
                ) : scoreboard.playersT1.length ? (
                  scoreboard.playersT1.map((p, i) => <Row key={`t1-${i}`} p={p} />)
                ) : (
                  <tr><td className="py-3 text-xs opacity-60" colSpan={4}>Sin datos aún</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-white/10">
                  <th className="py-2 pr-2">Player</th>
                  <th className="py-2 pr-2 text-center">ACS</th>
                  <th className="py-2 pr-2 text-center">K / D / A</th>
                  <th className="py-2 pr-2 text-center">+/-</th>
                </tr>
              </thead>
              <tbody>
                {loading && !scoreboard.playersT2.length ? (
                  <tr><td className="py-3 text-xs opacity-60" colSpan={4}>Cargando…</td></tr>
                ) : scoreboard.playersT2.length ? (
                  scoreboard.playersT2.map((p, i) => <Row key={`t2-${i}`} p={p} />)
                ) : (
                  <tr><td className="py-3 text-xs opacity-60" colSpan={4}>Sin datos aún</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {typeof scoreboard.mapIndex === "number" && (
        <div className="mt-3 text-xs opacity-60">Map index: {scoreboard.mapIndex}</div>
      )}
    </div>
  );
}
