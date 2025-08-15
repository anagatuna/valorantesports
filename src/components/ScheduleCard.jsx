"use client";

import Link from "next/link";
import Image from "next/image";
import { classifyTier } from "@/lib/tier";

/* --------- helpers --------- */
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

/* --------- COMPONENT --------- */
export default function ScheduleCard({ match, logos={}, teamList=[] }){
  const [t1,t2] = match.teams ?? [{},{}];
  const wm1 = t1?.name ? findLogo(t1.name, logos, teamList) : null;
  const wm2 = t2?.name ? findLogo(t2.name, logos, teamList) : null;

  const s1 = pickScore(match,0);
  const s2 = pickScore(match,1);

  const ts = typeof match.startTs==="number" ? new Date(match.startTs) : null;
  const isLive = match.status==="LIVE";

  return (
    <div
      className="
        relative w-full overflow-hidden
        flex h-[88px] items-center md:h-[92px]
        bg-[#121920] shadow-inner
      "
    >
      {/* capa oscura para contraste */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.25),transparent,rgba(0,0,0,0.25))] pointer-events-none z-0" />

      {/* watermarks (ahora más visibles) */}
      {wm1 && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 flex items-center justify-center opacity-20 z-0">
          <Image src={wm1} alt="" width={160} height={160} unoptimized className="max-h-[72%] w-auto" />
          <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-transparent to-[#121920]" />
        </div>
      )}
      {wm2 && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 flex items-center justify-center opacity-20 z-0">
          <Image src={wm2} alt="" width={160} height={160} unoptimized className="max-h-[72%] w-auto" />
          <div className="absolute left-0 top-0 h-full w-1/2 bg-gradient-to-r from-transparent to-[#121920]" />
        </div>
      )}

      {/* contenido */}
      <div className="relative z-10 grid w-full grid-cols-[130px,1fr,160px,1fr,128px] items-center px-4">
        {/* FECHA/HORA bien visible */}
        <div className="text-center">
          <div className="text-[11px] font-semibold tracking-wider text-white/90">
            {ts ? ddMMM(ts) : "—"}
          </div>
          <div className="text-base font-bold text-white leading-tight">
            {ts ? tHM(ts) : (match.in ?? "—")}
          </div>
          <div className="text-[11px] text-white/70">{ts ? tzAbbr(ts) : ""}</div>
        </div>

        {/* TEAM 1 (sigla + nombre pequeño debajo) */}
        <div className="min-w-0 text-left">
          <div className="text-white font-extrabold text-xl leading-none">{abbr(t1?.name ?? "—")}</div>
          <div className="text-[11px] text-white/70 truncate">{t1?.name ?? "—"}</div>
        </div>

        {/* SCOREBOARD centrado y grande */}
        <div className="flex flex-col items-center justify-center">
          <div className="flex items-center gap-4">
            <span className="w-8 text-center text-white font-extrabold text-2xl">{s1 ?? "–"}</span>
            <span className="px-2 py-[2px] rounded-full border border-white/20 text-[11px] text-white/90">VS</span>
            <span className="w-8 text-center text-white font-extrabold text-2xl">{s2 ?? "–"}</span>
          </div>
          <div className="text-[11px] text-white/70 mt-[2px]">
            {phaseFromEvent(match.event)} · {tierLabel(match.event)}
          </div>
        </div>

        {/* TEAM 2 */}
        <div className="min-w-0 text-right">
          <div className="text-white font-extrabold text-xl leading-none">{abbr(t2?.name ?? "—")}</div>
          <div className="text-[11px] text-white/70 truncate">{t2?.name ?? "—"}</div>
        </div>

        {/* STATUS + CTA */}
        <div className="flex flex-col items-end gap-1">
          <span className={`text-[12px] font-semibold ${isLive ? "text-red-400" : "text-white/80"}`}>
            {statusText(match)}
          </span>
          {match.id && (
            <Link
              href={`/matches/${match.id}`}
              className="px-3 py-1.5 rounded-md text-[12px] font-semibold border border-white/25 bg-white/10 hover:bg-white/15 transition"
            >
              More info
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
