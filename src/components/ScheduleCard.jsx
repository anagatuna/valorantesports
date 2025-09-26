// src/components/ScheduleCard.jsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { classifyTier } from "@/lib/tier";

/* ===== Helpers deterministas ===== */
const TIMEZONE = "America/Mexico_City";

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

function diffHM(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h ? `${h}h ${mm}m` : `${mm}m`;
}

function vctRegionLabel(name = "") {
  const s = name.toLowerCase();
  if (s.includes("americas")) return "VCT AMERICAS";
  if (s.includes("emea")) return "VCT EMEA";
  if (s.includes("pacific")) return "VCT PACIFIC";
  if (s.includes("china") || s.includes("cn")) return "VCT CN";
  return "VCT";
}

function tierLabel(eventName = "") {
  const t = classifyTier(eventName);
  if (t === "T1") return vctRegionLabel(eventName);
  if (t === "T2") return "CHALLENGERS";
  if (t === "GC") return "GAME CHANGERS";
  return "LIGA";
}

function phaseFromEvent(e = "") {
  const s = e.toLowerCase();
  if (s.includes("regular")) return "REGULAR SEASON";
  if (s.includes("group")) return "Group Stage";
  if (s.includes("swiss")) return "SWISS STAGE";
  if (s.includes("playoff")) return "PLAYOFFS";
  if (s.includes("semifinal")) return "SEMIFINALS";
  if (s.includes("final")) return "FINALS";
  return "Match";
}

// Tags oficiales comunes
const OFFICIAL_TAGS = new Map([
  ["G2 ESPORTS", "G2"],
  ["SENTINELS", "SEN"],
  ["TEAM LIQUID", "TL"],
  ["EDWARD GAMING", "EDG"],
  ["EDWARD", "EDG"],
  ["EDWARDGAMING", "EDG"],
  ["DRX", "DRX"],
  ["BILIBILI GAMING", "BLG"],
  ["PAPER REX", "PRX"],
  ["REX REGUM QEON", "RRQ"],
  ["FNATIC", "FNC"],
  ["GIANTX", "GX"],
  ["MIBR", "MIBR"],
  ["NRG", "NRG"],
  ["LOUD", "LOUD"],
  ["T1", "T1"],
  ["GEN.G", "GEN"],
  ["NATUS VINCERE", "NAVI"],
  ["FUT ESPORTS", "FUT"],
  ["DRAGON RANGER GAMING", "DRG"],
  ["XI LAI GAMING", "XLG"],
]);

function officialTag(name = "") {
  if (!name) return "";
  const up = (name.normalize?.("NFD").replace(/[\u0300-\u036f]/g, "") || name).toUpperCase().trim();
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
  return letters.length >= 2 && letters.length <= 4 ? letters : up.slice(0, 3);
}

/* ===== Series (diamantes) ===== */
function getBestOf(match, s1, s2) {
  const candidates = [
    match?.series?.bestOf,
    match?.bestOf,
    match?.bo,
    match?.maxMaps,
    match?.series?.bo,
    match?.format?.bestOf,
    match?.format?.bo,
    Array.isArray(match?.maps) ? match.maps.length : null,
  ]
    .map(Number)
    .filter(Number.isFinite);
  const fromData = candidates.find((v) => v === 3 || v === 5);
  if (fromData) return fromData;

  const m1 = Number(match?.series?.wins1 ?? s1 ?? 0);
  const m2 = Number(match?.series?.wins2 ?? s2 ?? 0);
  return Math.max(m1, m2) >= 3 ? 5 : 3;
}

function SeriesDiamonds({ wins = 0, bestOf = 3, side = "left" }) {
  const total = Math.max(1, Math.ceil((Number(bestOf) || 3) / 2)); // Bo3→2, Bo5→3
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
    m.event ||
    m.event_name ||
    m.tournament ||
    m.tournament_name ||
    m.league?.name ||
    m.series?.event ||
    m.stage?.event ||
    m.competition?.name ||
    ""
  );
}

function buildEventFromPieces(m = {}) {
  const parts = [
    m.stage?.name,
    m.stage?.round,
    m.bracket?.name,
    m.bracket?.round_name,
    m.group?.name,
    m.group_round,
    m.round_info || m.roundInfo,
    m.series?.name,
    m.series_name,
  ]
    .map(v => (v == null ? "" : String(v).trim()))
    .filter(Boolean);

  // Unifica separadores tipo "Playoffs : Lower Round 1" → "Playoffs · Lower Round 1"
  const joined = parts.join(" · ").replace(/\s*[:|•]\s*/g, " · ").replace(/\s+/g, " ");
  return joined;
}

function getEventDisplay(m = {}) {
  const ev = String(resolveEventLoose(m) || "").trim();
  if (ev && !isGenericLabel(ev)) return ev;

  // usa seriesTitle si no es genérico
  const ser =
    m.seriesTitle ||
    m.match_series ||
    m.series_name ||
    m.round_info ||
    m.roundInfo ||
    m.stage?.round ||
    m.stage?.name ||
    m.bracket?.round_name ||
    m.bracket_round ||
    m.group_round ||
    m.group?.round ||
    "";
  if (ser && !isGenericLabel(ser)) return String(ser).replace(/\s*[:|•]\s*/g, " · ").replace(/\s+/g, " ").trim();

  // construye a partir de piezas
  const built = buildEventFromPieces(m);
  return isGenericLabel(built) ? "" : built;
}

// Normaliza separadores (: | • - – —) → ' · ' y colapsa espacios
const unifySep = (s = "") =>
  String(s).replace(/\s*[:|•\-–—]\s*/g, " · ").replace(/\s+/g, " ").trim();

/* ===== Componente ===== */
export default function ScheduleCard({ match, logos = {}, teamList = [], expanded = false, onToggle = () => { }, }) {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(null);

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

  const ts = useMemo(
    () => (typeof match.startTs === "number" ? new Date(match.startTs) : null),
    [match.startTs]
  );
  const isLive = match.status === "LIVE";

  const dateStr = mounted && ts ? ddMMM(ts) : "";
  const timeStr = mounted && ts ? tHM(ts) : "";
  const tzStr = mounted && ts ? tzAbbr(ts) : "";

  const statusStr = useMemo(() => {
    if (!mounted) return "";
    const nowMs = now ?? Date.now();
    const tsNum = typeof match.startTs === "number" ? match.startTs : null;
    if (match.status === "LIVE") return tsNum ? `LIVE • ${diffHM(nowMs - tsNum)}` : "LIVE";
    if (match.status === "UPCOMING") {
      if (tsNum && tsNum > nowMs) return `${diffHM(tsNum - nowMs)}`;
      return match.in || "UPCOMING";
    }
    return "FINAL";
  }, [mounted, now, match.status, match.startTs, match.in]);

  const evFull = useMemo(() => unifySep(getEventDisplay(match)), [match]);

  /* ====== Split CT/T SIEMPRE desde match.rounds (estado propio) ====== */
  const t1ct = Number(match?.rounds?.t1ct ?? 0);
  const t1t = Number(match?.rounds?.t1t ?? 0);
  const t2ct = Number(match?.rounds?.t2ct ?? 0);
  const t2t = Number(match?.rounds?.t2t ?? 0);

  const rounds1 = t1ct + t1t;
  const rounds2 = t2ct + t2t;

  // Solo mostrar split cuando el match está LIVE
  const showSplit = isLive;

  const wins1 = match.series?.wins1 ?? 0;
  const wins2 = match.series?.wins2 ?? 0;
  const bestOf = match.series?.bestOf ?? getBestOf(match, s1, s2);

  const seriesTitle = (
    match.seriesTitle ||
    match.match_series ||
    match.series?.name ||
    match.series_name ||
    match.round_info ||
    match.roundInfo ||
    match.stage?.round ||
    match.stage?.name ||
    match.bracket?.round_name ||
    match.bracket_round ||
    match.group_round ||
    match.group?.round ||
    ""
  ).toString().replace(/\s+/g, " ").trim();

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
      {/* ⬇️ NUEVO: overlay totalmente transparente que captura el click */}
      <button
        type="button"
        className="sched__click"
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggle()}
      />
      {/* blobs decorativos */}
      <span className="sched__blob sched__blob--l" aria-hidden />
      <span className="sched__blob sched__blob--r" aria-hidden />

      <div className="sched__overlay" />

      {match.mapImage && (
        <div className="sched__bg" aria-hidden="true">
          <div className="sched__center">
            <Image
              src={match.mapImage}
              alt={match.currentMap || "map"}
              fill
              priority={false}
              className="sched__center-img"
              sizes="(max-width: 640px) 48vw, (max-width: 820px) 42vw, 30vw"
            />
          </div>
        </div>
      )}

      {wm1 && (
        <div className="sched__wm sched__wm--left">
          <Image src={wm1} alt="" width={160} height={160} unoptimized className="sched__wm-img" />
          <div className="sched__wm-fade sched__wm-fade--left" />
        </div>
      )}
      {wm2 && (
        <div className="sched__wm sched__wm--right">
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
          {/* {match.id && <Link href="#" className="cta__btn">More info</Link>} */}
        </div>
      </div>
    </div>
  );
}
