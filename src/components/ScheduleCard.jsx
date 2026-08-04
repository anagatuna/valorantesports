"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import MapBackground from "@/components/MapBackground";

/* ===== Helpers deterministas ===== */
const TIMEZONE = "America/Mexico_City";

// Convertimos 's' a String() explícitamente y usamos '|| ""' por si es null
const norm = (s) => String(s || "").toLowerCase().replace(/[\s\-_\.]+/g, "").trim();

function findLogo(name, map = {}, list = []) {
  const k = norm(name);
  if (!k) return null;
  // 1. Buscar en el mapa de logos (que viene de Supabase + Proxy)
  if (map[k]) return map[k];
  // 2. Fallback: Buscar en la lista de equipos
  for (const t of list) {
    const r = norm(t?.name);
    if (r && (r.includes(k) || k.includes(r))) return t?.img;
  }
  return null;
}

function pickScore(match, i) {
  const t = match?.teams?.[i];
  const direct = t?.score;
  const flat =
    i === 0
      ? match?.score1 ?? match?.team1?.score ?? match?.t1?.score
      : match?.score2 ?? match?.team2?.score ?? match?.t2?.score;
  const v = direct ?? flat;
  if (v === undefined || v === null) return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s || ["-", "–", "—"].includes(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : s;
  }
  return v;
}

function abbr(name = "") {
  const tag = officialTag(name);
  return tag || "—";
}

function tHM(d) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return "";
  }
}

function ddMMM(d) {
  try {
    const s = new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      day: "2-digit",
      month: "short",
    }).format(d);
    return s.toUpperCase();
  } catch {
    return "";
  }
}

function tzAbbr(d) {
  try {
    return (
      new Intl.DateTimeFormat("en-US", {
        timeZone: TIMEZONE,
        timeZoneName: "short",
      })
        .formatToParts(d)
        .find((p) => p.type === "timeZoneName")?.value || ""
    );
  } catch {
    return "";
  }
}

// Tags oficiales comunes
const OFFICIAL_TAGS = new Map([
  ["G2 ESPORTS", "G2"], ["SENTINELS", "SEN"], ["TEAM LIQUID", "TL"],
  ["EDWARD GAMING", "EDG"], ["EDWARD", "EDG"], ["EDWARDGAMING", "EDG"],
  ["DRX", "DRX"], ["BILIBILI GAMING", "BLG"], ["PAPER REX", "PRX"],
  ["REX REGUM QEON", "RRQ"], ["FNATIC", "FNC"], ["GIANTX", "GX"],
  ["MIBR", "MIBR"], ["NRG", "NRG"], ["LOUD", "LOUD"], ["T1", "T1"],
  ["GEN.G", "GEN"], ["NATUS VINCERE", "NAVI"], ["FUT ESPORTS", "FUT"],
  ["DRAGON RANGER GAMING", "DRG"], ["XI LAI GAMING", "XLG"],
]);

function officialTag(name = "") {
  if (!name) return "";
  const strName = String(name);

  const up = strName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
  if (OFFICIAL_TAGS.has(up)) return OFFICIAL_TAGS.get(up);
  if (/^EDWARD\s?GAMING|EDWARD$/i.test(name)) return "EDG";
  if (/^TEAM\s+LIQUID$/i.test(name)) return "TL";
  if (/^BILIBILI\s+GAMING$/i.test(name)) return "BLG";
  if (/^DRAGON\s+RANGER\s+GAMING$/i.test(name)) return "DRG";
  if (/^REX\s+REGUM\s+QEON$/i.test(name)) return "RRQ";
  if (/^PAPER\s+REX$/i.test(name)) return "PRX";
  if (/^XI\s+LAI\s+GAMING$/i.test(name)) return "XLG";
  const words = up.split(/\s+/).filter((w) => !["TEAM", "GAMING", "ESPORTS", "CLUB"].includes(w));
  const letters = words.slice(0, 3).map((w) => w.replace(/[^A-Z0-9]/g, "").slice(0, 1)).join("");
  return up;
}

/* ===== Helpers p/ startTs y "hace X" ===== */
function parseTsValue(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

function getStartTsFromMatch(m = {}) {
  // Priorizamos m.startTs que viene limpio desde la DB (gracias al page.js)
  const cand = [
    m.startTs, m.start_time, m.startTime,
    m.scheduled_at, m.scheduledAt,
    m.time, m.date
  ];
  for (const c of cand) {
    const ts = parseTsValue(c);
    if (ts != null) return ts;
  }
  return null;
}

function parseAgoToMs(s = "") {
  const tot = { d: 0, h: 0, m: 0 };
  const rx = /(\d+)\s*(d|h|m)/gi;
  let k;
  while ((k = rx.exec(s))) {
    const val = Number(k[1]);
    const u = k[2].toLowerCase();
    if (u === "d") tot.d += val;
    if (u === "h") tot.h += val;
    if (u === "m") tot.m += val;
  }
  return ((tot.d * 24 + tot.h) * 60 + tot.m) * 60_000;
}

function formatAgo(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(mins / (60 * 24));
  const h = Math.floor((mins - d * 24 * 60) / 60);
  const mm = mins % 60;
  if (d > 0) return h ? `${d}d ${h}h` : `${d}d`;
  return h ? `${h}h ${mm}m` : `${mm}m`;
}

function getCompletedAgoStr(m = {}) {
  const s =
    m.time_completed ??
    m.timeCompleted ??
    m.completed_ago ??
    m.completedAgo ??
    m.finished_ago ??
    m.finishedAgo ??
    m.end_ago ??
    m.endAgo ??
    m.timeago ??
    m.ago ??
    null;
  return typeof s === "string" ? s.trim() : null;
}

function getEndTsFromMatch(m = {}, nowMs = Date.now()) {
  const explicit = [m.endTs, m.end_time, m.endTime, m.completedAt, m.finished_at];
  for (const c of explicit) {
    const ts = parseTsValue(c);
    if (ts != null) return ts;
  }
  const ago = getCompletedAgoStr(m);
  if (ago) {
    const ms = parseAgoToMs(ago);
    if (ms) return nowMs - ms;
  }
  return null;
}

function pickStartFromDetail(payload) {
  const cand = [];
  const push = (v) => {
    const n = parseTsValue(v);
    if (n != null) cand.push(n < 1e12 ? n * 1000 : n);
  };
  const scan = (o) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      const key = k.toLowerCase();
      if (typeof v === "object") scan(v);
      else if (/start|sched/.test(key) && (typeof v === "number" || typeof v === "string")) push(v);
      else if (/unix|timestamp/.test(key) && (typeof v === "number" || typeof v === "string")) push(v);
      else if (/time|date/.test(key) && (typeof v === "number" || typeof v === "string")) push(v);
    }
  };
  scan(payload);
  const now = Date.now();
  cand.sort((a, b) => Math.abs(now - a) - Math.abs(now - b));
  return cand[0] ?? null;
}

/* ===== Series (diamantes) ===== */
function getBestOf(match, s1, s2) {
  const candidates = [
    match?.series?.bestOf, match?.bestOf, match?.bo, match?.maxMaps,
    match?.series?.bo, match?.format?.bestOf, match?.format?.bo,
    Array.isArray(match?.maps) ? match.maps.length : null,
  ].map(Number).filter(Number.isFinite);
  const fromData = candidates.find((v) => v === 3 || v === 5);
  if (fromData) return fromData;
  const m1 = Number(match?.series?.wins1 ?? s1 ?? 0);
  const m2 = Number(match?.series?.wins2 ?? s2 ?? 0);
  return Math.max(m1, m2) >= 3 ? 5 : 3;
}

function SeriesDiamonds({ wins = 0, bestOf = 3, side = "left" }) {
  const total = Math.max(1, Math.ceil((Number(bestOf) || 3) / 2));
  const w = Math.min(Math.max(0, Number(wins) || 0), total);
  return (
    <div className={`series series--${side}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={`diamond ${i < w ? "diamond--win" : ""}`} />
      ))}
    </div>
  );
}

/* ===== Helper evento/serie ===== */
function isGenericLabel(s = "") {
  const x = String(s).trim().toLowerCase();
  return !x || x === "match" || x === "partido" || x === "game";
}

function resolveEventLoose(m = {}) {
  return (
    m.event || m.event_name || m.tournament || m.tournament_name ||
    m.league?.name || m.series?.event || m.stage?.event || m.competition?.name || ""
  );
}

function buildEventFromPieces(m = {}) {
  const parts = [
    m.stage?.name, m.stage?.round, m.bracket?.name, m.bracket?.round_name,
    m.group?.name, m.group_round, m.round_info || m.roundInfo,
    m.series?.name, m.series_name,
  ].map(v => (v == null ? "" : String(v).trim())).filter(Boolean);
  const joined = parts.join(" · ").replace(/\s*[:|•]\s*/g, " · ").replace(/\s+/g, " ");
  return joined;
}

function getEventDisplay(m = {}) {
  const ev = String(resolveEventLoose(m) || "").trim();
  if (ev && !isGenericLabel(ev)) return ev;
  const ser =
    m.seriesTitle || m.match_series || m.series_name || m.round_info || m.roundInfo ||
    m.stage?.round || m.stage?.name || m.bracket?.round_name || m.bracket_round ||
    m.group_round || m.group?.round || "";
  if (ser && !isGenericLabel(ser)) return String(ser).replace(/\s*[:|•]\s*/g, " · ").replace(/\s+/g, " ").trim();
  const built = buildEventFromPieces(m);
  return isGenericLabel(built) ? "" : built;
}

const unifySep = (s = "") => String(s).replace(/\s*[:|•\-–—]\s*/g, " · ").replace(/\s+/g, " ").trim();

/* ===== Componente ===== */
export default function ScheduleCard({ match, logos = {}, teamList = [], expanded = false, onToggle = () => { }, }) {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(null);
  const [startTsLocal, setStartTsLocal] = useState(null);

  useEffect(() => {
    setMounted(true);
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [t1, t2] = match.teams ?? [{}, {}];
  const wm1 = t1?.name ? findLogo(t1.name, logos, teamList) : null;
  const wm2 = t2?.name ? findLogo(t2.name, logos, teamList) : null;

  // Series fallback cuando NO es LIVE
  const s1 = pickScore(match, 0);
  const s2 = pickScore(match, 1);

  const ts = useMemo(() => {
    const raw = getStartTsFromMatch(match);
    return raw != null ? new Date(raw) : (startTsLocal ? new Date(startTsLocal) : null);
  }, [match, startTsLocal]);

  // Si falta la hora, intentar buscarla en VLR (Fallback)
  useEffect(() => {
    let abort = false;
    async function loadStart() {
      const hasStart = getStartTsFromMatch(match) != null || startTsLocal != null;
      // Solo buscamos si NO tenemos hora y es un partido completed con URL
      const isCompletedFeed = !!match.time_completed && !!match.match_page;
      
      if (!hasStart && isCompletedFeed) {
        try {
          const url = `/api/vlr/match?path=${encodeURIComponent(match.match_page)}`;
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) return;
          const data = await res.json();
          let tsCandidate =
            data?.data?.unix_time ?? data?.data?.start_unix ?? data?.data?.startTime ??
            data?.data?.time_iso ?? data?.data?.start_iso ?? data?.data?.unix_timestamp ?? null;
          if (tsCandidate == null) {
            tsCandidate = pickStartFromDetail(data);
          }
          const parsed = parseTsValue(tsCandidate);
          if (!abort && parsed != null) setStartTsLocal(parsed);
        } catch { }
      }
    }
    loadStart();
    return () => { abort = true; };
  }, [match, startTsLocal]);

  const isLive = match.status === "LIVE";

  // Calcular Tiempos
  const endTsMs = useMemo(() => getEndTsFromMatch(match, Date.now()), [match]);
  const endTs = endTsMs ? new Date(endTsMs) : null;
  const displayTs = ts || endTs;
  
  const dateStr = mounted && displayTs ? ddMMM(displayTs) : "";
  const timeStr = mounted && displayTs ? tHM(displayTs) : "";
  const tzStr = mounted && displayTs ? tzAbbr(displayTs) : "";

  const statusStr = useMemo(() => {
    if (!mounted) return "";
    const nowMs = now ?? Date.now();
    const startNum = getStartTsFromMatch(match) ?? startTsLocal ?? null;

    if (match.status === "LIVE") {
      return startNum ? `LIVE · ${formatAgo(nowMs - startNum)}` : "LIVE";
    }

    if (match.status === "UPCOMING") {
      if (startNum && startNum > nowMs) return formatAgo(startNum - nowMs);
      // Fallback si no tenemos cálculo
      return match.in || "UPCOMING";
    }

    // FINAL
    const agoStr = getCompletedAgoStr(match);
    if (agoStr) {
      // Si ya viene formateado "5h ago" desde page.js, úsalo
      if (agoStr.includes("ago")) return agoStr; 
      
      // Si viene crudo, calcúlalo
      const ms = parseAgoToMs(agoStr);
      return ms ? `${formatAgo(ms)} ago`
        : `${agoStr.replace(/\s*ago\s*$/i, "").trim()} ago`;
    }
    return "FINAL";
  }, [mounted, now, match, startTsLocal]);

  const evFull = useMemo(() => unifySep(getEventDisplay(match)), [match]);

  /* ====== Split CT/T ====== */
  const t1ct = Number(match?.rounds?.t1ct ?? 0);
  const t1t = Number(match?.rounds?.t1t ?? 0);
  const t2ct = Number(match?.rounds?.t2ct ?? 0);
  const t2t = Number(match?.rounds?.t2t ?? 0);

  const rounds1 = t1ct + t1t;
  const rounds2 = t2ct + t2t;
  const showSplit = isLive;

  const wins1 = match.series?.wins1 ?? 0;
  const wins2 = match.series?.wins2 ?? 0;
  const bestOf = match.series?.bestOf ?? getBestOf(match, s1, s2);

  const fmtRoundsCompact = (ct, t) => (
    <span className="score__rnd">
      <span className="par">(</span>
      <span className="ct">{ct}</span>
      <span className="sep">/</span>
      <span className="t">{t}</span>
      <span className="par">)</span>
    </span>
  );

  return (
    <div className={`sched sched--glass ${isLive ? "is-live" : ""} ${expanded ? "is-open" : ""}`}>
      <button
        type="button"
        className="sched__click"
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggle()}
      />
      <span className="sched__blob sched__blob--l" aria-hidden />
      <span className="sched__blob sched__blob--r" aria-hidden />
      <div className="sched__overlay" />

      <MapBackground
        src={match.mapImage}
        alt={match.currentMap}
        sizes="(max-width: 640px) 48vw, (max-width: 820px) 42vw, 30vw"
      />

      {wm1 && (
        <div className="sched__wm sched__wm--left">
          {/* 🔴 unoptimized: Clave para el proxy */}
          <Image src={wm1} alt="" width={160} height={160} unoptimized className="sched__wm-img" />
          <div className="sched__wm-fade sched__wm-fade--left" />
        </div>
      )}
      {wm2 && (
        <div className="sched__wm sched__wm--right">
          {/* 🔴 unoptimized: Clave para el proxy */}
          <Image src={wm2} alt="" width={160} height={160} unoptimized className="sched__wm-img" />
          <div className="sched__wm-fade sched__wm-fade--right" />
        </div>
      )}

      <div className="sched__grid">
        {/* fecha / hora */}
        <div className="time">
          <div className="time__date" suppressHydrationWarning>
            {dateStr || "—"}
          </div>
          <div className="time__clock" suppressHydrationWarning>
            {timeStr || match.in || "—"}
          </div>
          <div className="time__tz" suppressHydrationWarning>
            {tzStr}
          </div>
        </div>

        {/* team 1 */}
        <div className="team team--left">
          <div className="team__abbr">{abbr(t1?.name ?? "—")}</div>
          <div className="team__name">{t1?.name ?? "—"}</div>
        </div>

        {/* marcador */}
        <div className="scorebox">
          <div className="scorebox__content">
            <div className="scorebox__row">
              <span className="score score--left">
                <span className="score__num">{isLive ? rounds1 : s1 ?? "–"}</span>
                {showSplit ? fmtRoundsCompact(t1ct, t1t) : null}
              </span>

              <span className="vs">VS</span>

              <span className="score">
                <span className="score__num">{isLive ? rounds2 : s2 ?? "–"}</span>
                {showSplit ? fmtRoundsCompact(t2ct, t2t) : null}
              </span>
            </div>

            {isLive && (
              <div className="series-row" aria-hidden="true">
                <SeriesDiamonds wins={wins1} bestOf={bestOf} side="left" />
                <span className="vs vs--ghost">VS</span>
                <SeriesDiamonds wins={wins2} bestOf={bestOf} side="right" />
              </div>
            )}
            {evFull && (
              <div className="meta-line" title={evFull}>
                <span className="meta-chip meta-chip--series">
                  {evFull}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* team 2 */}
        <div className="team team--right">
          <div className="team__abbr">{abbr(t2?.name ?? "—")}</div>
          <div className="team__name">{t2?.name ?? "—"}</div>
        </div>

        {/* estado + CTA */}
        <div className="cta">
          <span className="cta__status" suppressHydrationWarning>
            {statusStr}
          </span>
        </div>
      </div>
    </div>
  );
}