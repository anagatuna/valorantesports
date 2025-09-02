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

 return (
    <div className={`sched ${isLive ? "is-live" : ""}`}>
      {/* overlay opcional para oscurecer todo ligeramente */}
      <div className="sched__overlay" />

      {/* === FONDO GLOBAL: MAPA DE LA CARD === */}
      {match.mapImage && (
        <div className="sched__bg">
          <Image
            src={match.mapImage}
            alt={match.currentMap || "map"}
            fill
            priority={false}
            className="sched__bg-img"
          />
          {/* fade / viñeta para lados y bordes */}
          <div className="sched__bg-fade" />
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

        {/* marcador SIN fondo de mapa */}
        <div className="scorebox">
          <div className="scorebox__content">
            <div className="scorebox__row">
              <span className="score">{s1 ?? "–"}</span>
              <span className="vs">VS</span>
              <span className="score">{s2 ?? "–"}</span>
            </div>
            <div className="meta-line">
              {phaseFromEvent(match.event)} · {tierLabel(match.event)}
            </div>
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