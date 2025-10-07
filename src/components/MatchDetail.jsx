// src/components/MatchDetail.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

const norm = (s) => s?.toLowerCase().replace(/[\s\-_\.]+/g, "").trim();
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
const safe = (n) => Number(n ?? 0) || 0;

/* agente → imagen local (según tu carpeta /public/agents/<agent>/<agent>-1.webp) */
const AGENT_IMG = {
  jett: "/agents/jett/jett-1.webp",
  raze: "/agents/raze/raze-1.webp",
  phoenix: "/agents/phoenix/phoenix-1.webp",
  sage: "/agents/sage/sage-1.webp",
  sova: "/agents/sova/sova-1.webp",
  viper: "/agents/viper/viper-1.webp",
  brimstone: "/agents/brimstone/brimstone-1.webp",
  breach: "/agents/breach/breach-1.webp",
  omen: "/agents/omen/omen-1.webp",
  cypher: "/agents/cypher/cypher-1.webp",
  killjoy: "/agents/killjoy/killjoy-1.webp",
  skye: "/agents/skye/skye-1.webp",
  yoru: "/agents/yoru/yoru-1.webp",
  astra: "/agents/astra/astra-1.webp",
  kayo: "/agents/kayo/kayo-1.webp",
  chamber: "/agents/chamber/chamber-1.webp",
  neon: "/agents/neon/neon-1.webp",
  fade: "/agents/fade/fade-1.webp",
  harbor: "/agents/harbor/harbor-1.webp",
  gekko: "/agents/gekko/gekko-1.webp",
  deadlock: "/agents/deadlock/deadlock-1.webp",
  iso: "/agents/iso/iso-1.webp",
  clove: "/agents/clove/clove-1.webp",
  vyse: "/agents/vyse/vyse-1.webp",
  tejo: "/agents/tejo/tejo-1.webp",
  waylay: "/agents/waylay/waylay-1.webp",
  veto: "/agents/veto/veto-1.webp",
};

/* alias y normalizador: "KAY/O" -> "kayo", "harbour" -> "harbor", etc. */
const AGENT_ALIAS = {
  "kay/o": "kayo",
  brim: "brimstone",
  harbour: "harbor",
};

function agentKey(s = "") {
  const base = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const key = base.replace(/[^a-z/]/g, ""); // permite la slash de kay/o
  return AGENT_ALIAS[key] || key.replace("/", ""); // kay/o -> kayo
}

/* Usa imagen del API si viene; si no, la local */
function resolveAgentImg(name, apiImg) {
  if (apiImg) return apiImg;
  const k = agentKey(name);
  return AGENT_IMG[k] || null;
}

// ----- DEMO: scoreboard por defecto (5v5) -----
const DEMO_SCOREBOARD = {
  playersT1: [
    { name: "Mixwell", tag: "g2", agent: "Jett", agentImg: AGENT_IMG.jett, acs: 265, k: 19, d: 15, a: 3, plusMinus: +4 },
    { name: "AvovA", tag: "g2", agent: "Omen", agentImg: AGENT_IMG.omen, acs: 185, k: 13, d: 14, a: 5, plusMinus: -1 },
    { name: "Nukkye", tag: "g2", agent: "Raze", agentImg: AGENT_IMG.raze, acs: 230, k: 17, d: 16, a: 2, plusMinus: +1 },
    { name: "hoody", tag: "g2", agent: "Sage", agentImg: AGENT_IMG.sage, acs: 150, k: 9, d: 14, a: 7, plusMinus: -5 },
    { name: "keloqz", tag: "g2", agent: "Sova", agentImg: AGENT_IMG.sova, acs: 200, k: 14, d: 12, a: 6, plusMinus: +2 },
  ],
  playersT2: [
    { name: "TenZ", tag: "sen", agent: "Jett", agentImg: AGENT_IMG.jett, acs: 290, k: 22, d: 15, a: 3, plusMinus: +7 },
    { name: "Zekken", tag: "sen", agent: "Raze", agentImg: AGENT_IMG.raze, acs: 210, k: 15, d: 14, a: 4, plusMinus: +1 },
    { name: "Sacy", tag: "sen", agent: "Sova", agentImg: AGENT_IMG.sova, acs: 170, k: 11, d: 13, a: 8, plusMinus: -2 },
    { name: "Zellsis", tag: "sen", agent: "Viper", agentImg: AGENT_IMG.viper, acs: 195, k: 14, d: 12, a: 6, plusMinus: +2 },
    { name: "johnqt", tag: "sen", agent: "Killjoy", agentImg: AGENT_IMG.killjoy, acs: 160, k: 10, d: 13, a: 7, plusMinus: -3 },
  ],
  mapIndex: 1,
};

export default function MatchDetail({ match, logos = {}, teamList = [] }) {
  const [t1, t2] = match?.teams ?? [{}, {}];
  const [scoreboard, setScoreboard] = useState({ playersT1: [], playersT2: [], mapIndex: null });
  const [loading, setLoading] = useState(false);

  const logo1 = t1?.name ? findLogo(t1.name, logos, teamList) : null;
  const logo2 = t2?.name ? findLogo(t2.name, logos, teamList) : null;

  const t1ct = safe(match?.rounds?.t1ct);
  const t1t = safe(match?.rounds?.t1t);
  const t2ct = safe(match?.rounds?.t2ct);
  const t2t = safe(match?.rounds?.t2t);

  const tot1 = t1ct + t1t;
  const tot2 = t2ct + t2t;

  const wins1 = safe(match?.series?.wins1);
  const wins2 = safe(match?.series?.wins2);
  const bo = Number(match?.series?.bestOf ?? 3);

  // ====== Hidratar scoreboard cuando hay path o id ======
  useEffect(() => {
    let abort = false;

    async function load() {
      const path =
        match?.match_page ||
        match?.matchPage ||
        match?.vlrUrl ||
        match?.url ||
        null;

      // intenta deducir id del path /match/<id>/
      let id = null;
      if (path) {
        const m = /\/match\/(\d+)\//.exec(String(path));
        if (m?.[1]) id = m[1];
      }

      if (!path && !id) return;

      setLoading(true);
      try {
        // 👈 usa TU endpoint interno que normaliza vlrggapi
        const qs = id ? `?id=${encodeURIComponent(id)}` : `?path=${encodeURIComponent(path)}`;
        const res = await fetch(`/api/scoreboard${qs}`, { cache: "no-store" });
        const j = await res.json();
        if (!abort && j?.ok && j?.data) {
          setScoreboard(j.data);
        }
      } catch {
        // silencioso
      } finally {
        !abort && setLoading(false);
      }
    }

    load();
    return () => { abort = true; };
  }, [match]);

  useEffect(() => {
    if (match?.id === "demo-live") {
      setScoreboard(DEMO_SCOREBOARD); // se muestra de inmediato
    }
  }, [match]);

  const Row = ({ p }) => {
    const agentImg = resolveAgentImg(p.agent, p.agentImg);
    return (
      <tr className="border-b border-white/5">
        <td className="py-2 pr-2">
          <div className="flex items-center gap-2">
            {agentImg ? (
              <Image src={agentImg} alt={p.agent || ""} width={20} height={20} unoptimized />
            ) : (
              <span className="inline-block w-5 h-5 rounded bg-white/10" />
            )}
            <div className="flex flex-col leading-tight">
              <span className="font-medium">{p.name || "—"}</span>
              {p.tag ? <span className="text-xs opacity-60">@{p.tag}</span> : null}
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
      {/* Encabezado (mapa + estado + serie) */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {match?.currentMap ? (
          <span className="inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-wide">
            MAP • {match.currentMap}
          </span>
        ) : null}
        {match?.status ? (
          <span className="inline-flex items-center rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-wide">
            {match.status}
          </span>
        ) : null}
        <span className="ml-auto text-xs opacity-75">
          Series: {wins1}-{wins2} (Bo{bo})
        </span>
      </div>

      {/* Tabla CT/T/Total */}
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-white/10">
              <th className="py-2 pr-2">Team</th>
              <th className="py-2 pr-2 text-center">CT</th>
              <th className="py-2 pr-2 text-center">T</th>
              <th className="py-2 pr-2 text-center">Total</th>
              <th className="py-2 pr-2 text-center">Series</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-white/5">
              <td className="py-3 pr-2">
                <div className="flex items-center gap-2">
                  {logo1 && <Image src={logo1} alt="" width={18} height={18} unoptimized className="opacity-80" />}
                  <span className="font-medium">{t1?.name ?? "—"}</span>
                </div>
              </td>
              <td className="py-3 pr-2 text-center">{t1ct}</td>
              <td className="py-3 pr-2 text-center">{t1t}</td>
              <td className="py-3 pr-2 text-center font-semibold">{tot1}</td>
              <td className="py-3 pr-2 text-center">{wins1}</td>
            </tr>
            <tr>
              <td className="py-3 pr-2">
                <div className="flex items-center gap-2">
                  {logo2 && <Image src={logo2} alt="" width={18} height={18} unoptimized className="opacity-80" />}
                  <span className="font-medium">{t2?.name ?? "—"}</span>
                </div>
              </td>
              <td className="py-3 pr-2 text-center">{t2ct}</td>
              <td className="py-3 pr-2 text-center">{t2t}</td>
              <td className="py-3 pr-2 text-center font-semibold">{tot2}</td>
              <td className="py-3 pr-2 text-center">{wins2}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Roster / scoreboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            {logo1 && <Image src={logo1} alt="" width={18} height={18} unoptimized />}
            <span className="text-sm font-semibold">{t1?.name ?? "—"}</span>
          </div>
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
          <div className="flex items-center gap-2 mb-2">
            {logo2 && <Image src={logo2} alt="" width={18} height={18} unoptimized />}
            <span className="text-sm font-semibold">{t2?.name ?? "—"}</span>
          </div>
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
