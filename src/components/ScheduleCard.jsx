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
  const up =
    (name.normalize?.("NFD").replace(/[\u0300-\u036f]/g, "") || name)
      .toUpperCase()
      .trim();
  if (/^[A-Z0-9]{2,4}$/.test(up)) return up;
  const f = up.split(/\s+/)[0];
  return f.length <= 4 ? f : f.slice(0, 3);
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
  if (s.includes("group")) return "GROUP STAGE";
  if (s.includes("swiss")) return "SWISS STAGE";
  if (s.includes("playoff")) return "PLAYOFFS";
  if (s.includes("semifinal")) return "SEMIFINALS";
  if (s.includes("final")) return "FINALS";
  return "MATCH";
}

/* ===== Rounds helpers (compactos) ===== */
const toNum = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

function getRounds(match) {
  if (match?.rounds) {
    const r = match.rounds;
    return {
      t1ct: toNum(r.t1ct),
      t1t: toNum(r.t1t),
      t2ct: toNum(r.t2ct),
      t2t: toNum(r.t2t),
    };
  }
  return {
    t1ct: toNum(match?.team1_round_ct),
    t1t: toNum(match?.team1_round_t),
    t2ct: toNum(match?.team2_round_ct),
    t2t: toNum(match?.team2_round_t),
  };
}

/** Devuelve JSX coloreable para (CT/T) */
function fmtRoundsCompact(ct, t) {
  const hasCT = ct !== null && ct !== undefined;
  const hasT = t !== null && t !== undefined;
  if (!hasCT && !hasT) return null;

  if (hasCT && hasT) {
    return (
      <span className="score__rnd">
        <span className="par">(</span>
        <span className="ct">{ct}</span>
        <span className="sep">/</span>
        <span className="t">{t}</span>
        <span className="par">)</span>
      </span>
    );
  }
  if (hasCT) {
    return (
      <span className="score__rnd">
        <span className="par">(</span>
        <span className="ct">{ct}</span>
        <span className="par"> CT)</span>
      </span>
    );
  }
  return (
    <span className="score__rnd">
      <span className="par">(</span>
      <span className="t">{t}</span>
      <span className="par"> T)</span>
    </span>
  );
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
  return Math.max(m1, m2) >= 3 ? 5 : 3; // heurística
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

/* ===== Componente ===== */
export default function ScheduleCard({ match, logos = {}, teamList = [] }) {
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

  // NO usar esto para rondas; es solo fallback de series cuando no está LIVE
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
    if (match.status === "LIVE")
      return tsNum ? `LIVE • ${diffHM(nowMs - tsNum)}` : "LIVE";
    if (match.status === "UPCOMING")
      return tsNum && tsNum > nowMs
        ? `${tHM(new Date(tsNum))} • en ${diffHM(tsNum - nowMs)}`
        : match.in || "UPCOMING";
    return "FINAL";
  }, [mounted, now, match.status, match.startTs, match.in]);

  /* Rondas compactas (para score grande en LIVE) */
  const { t1ct, t1t, t2ct, t2t } = getRounds(match);
  const rounds1 = (t1ct ?? 0) + (t1t ?? 0);
  const rounds2 = (t2ct ?? 0) + (t2t ?? 0);

  /* Series (diamantes) desde match.series */
  const wins1 = match.series?.wins1 ?? 0;
  const wins2 = match.series?.wins2 ?? 0;
  const bestOf = match.series?.bestOf ?? getBestOf(match, s1, s2);

  return (
    <div className={`sched ${isLive ? "is-live" : ""}`}>
      {/* overlay global leve */}
      <div className="sched__overlay" />

      {/* === FONDO: MAPA (cinta centrada) === */}
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

      {/* watermarks (logos equipos) */}
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

      {/* contenido */}
      <div className="sched__grid">
        {/* fecha / hora */}
        <div className="time">
          <div className="time__date" suppressHydrationWarning>{dateStr || "—"}</div>
          <div className="time__clock" suppressHydrationWarning>{timeStr || match.in || "—"}</div>
          <div className="time__tz" suppressHydrationWarning>{tzStr}</div>
        </div>

        {/* team 1 */}
        <div className="team team--left">
          <div className="team__abbr">{abbr(t1?.name ?? "—")}</div>
          <div className="team__name">{t1?.name ?? "—"}</div>
        </div>

        {/* marcador */}
        <div className="scorebox">
          <div className="scorebox__content">
            {/* fila principal */}
            <div className="scorebox__row">
              <span className="score score--left">
                <span className="score__num">{isLive ? rounds1 : (s1 ?? "–")}</span>
                {fmtRoundsCompact(t1ct, t1t)}
              </span>

              <span className="vs">VS</span>

              <span className="score">
                <span className="score__num">{isLive ? rounds2 : (s2 ?? "–")}</span>
                {fmtRoundsCompact(t2ct, t2t)}
              </span>
            </div>

            {/* diamantes SOLO en LIVE */}
            {isLive && (
              <div className="series-row" aria-hidden="true">
                <SeriesDiamonds wins={wins1} bestOf={bestOf} side="left" />
                <span className="vs vs--ghost">VS</span>
                <SeriesDiamonds wins={wins2} bestOf={bestOf} side="right" />
              </div>
            )}

            {/* Si no quieres mostrar torneo/mapa, deja vacía o elimina esta línea */}
            {/* <div className="meta-line">{phaseFromEvent(match.event)} · {tierLabel(match.event)} {match.currentMap ? ` · ${match.currentMap.toUpperCase()}` : ""}</div> */}
          </div>
        </div>

        {/* team 2 */}
        <div className="team team--right">
          <div className="team__abbr">{abbr(t2?.name ?? "—")}</div>
          <div className="team__name">{t2?.name ?? "—"}</div>
        </div>

        {/* estado + CTA */}
        <div className="cta">
          <span className="cta__status" suppressHydrationWarning>{statusStr}</span>
          {match.id && <Link href="#" className="cta__btn">More info</Link>}
        </div>
      </div>
    </div>
  );
}
