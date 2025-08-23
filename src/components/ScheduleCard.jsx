//src/components/ScheduleCard.jsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { classifyTier } from "@/lib/tier";

/*  helpers */
const norm = s => s?.toLowerCase().replace(/[\s\-_\.]+/g,"").trim();
function findLogo(name, map={}, list=[]){
  const k = norm(name); if(!k) return null;
  if (map[k]) return map[k];
  for (const t of list){
    const r = norm(t?.name);
    if (r && (r.includes(k) || k.includes(r))) return t?.img;
  }
  return null;
}
function pickScore(match, i){
  const t = match?.teams?.[i];
  const direct = t?.score;
  const flat = i===0
    ? (match?.score1 ?? match?.team1?.score ?? match?.t1?.score)
    : (match?.score2 ?? match?.team2?.score ?? match?.t2?.score);
  const v = (direct ?? flat);
  if (v === undefined || v === null) return null;
  if (typeof v === "string"){
    const s = v.trim(); if (!s || ["-","–","—"].includes(s)) return null;
    const n = Number(s); return Number.isFinite(n) ? n : s;
  }
  return v;
}
function abbr(name=""){
  const up=(name.normalize?.("NFD").replace(/[\u0300-\u036f]/g,"")||name).toUpperCase().trim();
  if (/^[A-Z0-9]{2,4}$/.test(up)) return up;
  const f=up.split(/\s+/)[0]; return f.length<=4?f:f.slice(0,3);
}
function tzAbbr(d){ try{ return new Intl.DateTimeFormat([], { timeZoneName:"short" })
  .formatToParts(d).find(p=>p.type==="timeZoneName")?.value || ""; }catch{return "";} }
function tHM(d){ try{ return d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }); }catch{return "";} }
function ddMMM(d){ try{ return `${String(d.getDate()).padStart(2,"0")} ${d.toLocaleString([], { month:"short" }).toUpperCase()}`; }catch{return "";} }
function diffHM(ms){ const m=Math.max(0,Math.floor(ms/60000)); const h=Math.floor(m/60); const mm=m%60; return h?`${h}h ${mm}m`:`${mm}m`; }
function statusText(match){
  const now=Date.now(), ts=typeof match.startTs==="number"?match.startTs:null;
  if (match.status==="LIVE")     return ts?`LIVE • ${diffHM(now-ts)}`:"LIVE";
  if (match.status==="UPCOMING") return ts && ts>now ? `${tHM(new Date(ts))} • en ${diffHM(ts-now)}` : (match.in || "UPCOMING");
  return "FINAL";
}
function vctRegionLabel(name=""){
  const s=name.toLowerCase();
  if (s.includes("americas")) return "VCT AMERICAS";
  if (s.includes("emea")) return "VCT EMEA";
  if (s.includes("pacific")) return "VCT PACIFIC";
  if (s.includes("china")||s.includes("cn")) return "VCT CN";
  return "VCT";
}
function tierLabel(eventName=""){
  const t=classifyTier(eventName);
  if (t==="T1") return vctRegionLabel(eventName);
  if (t==="T2") return "CHALLENGERS";
  if (t==="GC") return "GAME CHANGERS";
  return "LIGA";
}
function phaseFromEvent(e=""){
  const s=e.toLowerCase();
  if (s.includes("regular")) return "REGULAR SEASON";
  if (s.includes("group"))   return "GROUP STAGE";
  if (s.includes("swiss"))   return "SWISS STAGE";
  if (s.includes("playoff")) return "PLAYOFFS";
  if (s.includes("semifinal")) return "SEMIFINALS";
  if (s.includes("final"))   return "FINALS";
  return "MATCH";
}

/*  COMPONENT  */
export default function ScheduleCard({ match, logos={}, teamList=[] }){
  const [t1,t2] = match.teams ?? [{},{}];
  const wm1 = t1?.name ? findLogo(t1.name, logos, teamList) : null;
  const wm2 = t2?.name ? findLogo(t2.name, logos, teamList) : null;

  const s1 = pickScore(match,0);
  const s2 = pickScore(match,1);

  const ts = typeof match.startTs==="number" ? new Date(match.startTs) : null;
  const isLive = match.status==="LIVE";

  return (
    <div className={`sched ${isLive ? "is-live" : ""}`}>
      {/* overlay suave */}
      <div className="sched__overlay" />

      {/* watermarks (si hay logos) */}
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
          <div className="time__date">{ts ? ddMMM(ts) : "—"}</div>
          <div className="time__clock">{ts ? tHM(ts) : (match.in ?? "—")}</div>
          <div className="time__tz">{ts ? tzAbbr(ts) : ""}</div>
        </div>

        {/* team 1 */}
        <div className="team team--left">
          <div className="team__abbr">{abbr(t1?.name ?? "—")}</div>
          <div className="team__name">{t1?.name ?? "—"}</div>
        </div>

        {/* marcador */}
        <div className="scorebox">
          <div className="scorebox__row">
            <span className="score">{s1 ?? "–"}</span>
            <span className="vs">VS</span>
            <span className="score">{s2 ?? "–"}</span>
          </div>
          <div className="meta-line">
            {phaseFromEvent(match.event)} · {tierLabel(match.event)}
          </div>
        </div>

        {/* team 2 */}
        <div className="team team--right">
          <div className="team__abbr">{abbr(t2?.name ?? "—")}</div>
          <div className="team__name">{t2?.name ?? "—"}</div>
        </div>

        {/* estado + CTA */}
        <div className="cta">
          <span className="cta__status">{statusText(match)}</span>
          {match.id && (
            <Link href= '#' className="cta__btn"> {/* Esto va en el href {`/matches/${match.id}}` */}
              More info
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
