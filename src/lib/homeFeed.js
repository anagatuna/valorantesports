const API = 'https://vlr.orlandomm.net/api/v1';

/* fetch */
async function safeJson(res){ try{ return await res.json(); }catch{return null;} }
async function fetchJSON(url){
  const res = await fetch(url, { next: { revalidate: 60 } });
  if(!res.ok) return [];
  const j = await safeJson(res);
  return Array.isArray(j?.data) ? j.data : [];
}
function dedupeById(list){ const m=new Map(); for(const x of list) if(x?.id) m.set(x.id,x); return [...m.values()]; }

/* fechas */
const MONTHS={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
const localYMD=(d)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function parseMonthDay(s){
  if(!s||typeof s!=='string')return null;
  const m=s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b\.?\s+(\d{1,2})/i);
  if(!m)return null;
  const mm=MONTHS[m[1].slice(0,3).toLowerCase()], dd=parseInt(m[2],10);
  if(mm==null||!dd)return null;
  const now=new Date(); return localYMD(new Date(now.getFullYear(),mm,dd));
}
function ymdFrom(v){
  if(!v) return null;
  if(typeof v==='number'){ const d=v>1e12?new Date(v):new Date(v*1000); return isNaN(d)?null:localYMD(d); }
  if(typeof v==='string'){
    if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d=new Date(v); if(!isNaN(d)) return localYMD(d);
    const md=parseMonthDay(v); if(md) return md;
  }
  return null;
}

/* parse relativo (ej: "8h 45m", "Tomorrow", "2h ago") */
function addRelative(date,{d=0,h=0,m=0}){ const t=new Date(date); t.setDate(t.getDate()+d); t.setHours(t.getHours()+h); t.setMinutes(t.getMinutes()+m); return t; }
function parseRelativeToFutureTs(str){
  if(!str||typeof str!=='string') return null;
  const s=str.toLowerCase().trim();
  if(s.includes('tomorrow')) return addRelative(new Date(),{d:1}).getTime();
  const m=s.match(/(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?/i);
  if(m && (m[1]||m[2]||m[3])){
    const d=parseInt(m[1]||'0',10), h=parseInt(m[2]||'0',10), mi=parseInt(m[3]||'0',10);
    return addRelative(new Date(),{d,h,m:mi}).getTime();
  }
  return null;
}

/* timestamp de inicio (ms) */
function getStartTs(raw, kind){
  // 1) campos típicos
  let n = typeof raw?.time_unix === 'number' ? raw.time_unix : raw?.unix;
  if(typeof n === 'number') return n > 1e12 ? n : n * 1000;
  if(raw?.start_time){ const d=new Date(raw.start_time); if(!isNaN(d)) return d.getTime(); }
  if(typeof raw?.time === 'string'){ const d=new Date(raw.time); if(!isNaN(d)) return d.getTime(); }

  // 2) UPCOMING: si solo tenemos "in: 8h 45m"
  if(kind==='upcoming'){
    const rel = parseRelativeToFutureTs(raw?.in);
    if(rel) return rel;
  }

  // 3) LIVE/COMPLETED: usar la fecha del match si es hoy/pasado (mejor que nada)
  const ymd =
    ymdFrom(raw?.time_unix) || ymdFrom(raw?.unix) || ymdFrom(raw?.date_iso) ||
    ymdFrom(raw?.date) || ymdFrom(raw?.start_time) || ymdFrom(raw?.time_str) ||
    ymdFrom(raw?.time);
  if(ymd){
    const guess = new Date(`${ymd}T00:00:00`).getTime();
    if(kind!=='upcoming' && guess <= Date.now()) return guess;
  }
  return null;
}

/* normalización a shape de Card */
function fmtIn(m){ return m?.in || m?.time_str || m?.time || null; }
function normTeams(m){
  if(Array.isArray(m?.teams) && m.teams.length>=2){
    const [a,b]=m.teams;
    return [
      { name:a?.name ?? 'Team 1', score:a?.score ?? a?.score1 ?? m?.score1 ?? null },
      { name:b?.name ?? 'Team 2', score:b?.score ?? b?.score2 ?? m?.score2 ?? null },
    ];
  }
  return [
    { name:m?.team1?.name ?? 'Team 1', score:m?.team1?.score ?? m?.score1 ?? null },
    { name:m?.team2?.name ?? 'Team 2', score:m?.team2?.score ?? m?.score2 ?? null },
  ];
}
function normStatus(raw,kind){
  const s=(raw?.status||'').toString().toUpperCase();
  if(s.includes('LIVE')) return 'LIVE';
  if(s.includes('UPCOMING')) return 'UPCOMING';
  if(s.includes('COMPLETED')||s.includes('FINAL')) return 'COMPLETED';
  return kind==='completed' ? 'COMPLETED' : 'UPCOMING';
}
function normalizeMatch(raw,kind){
  return {
    id: raw?.id,
    event: raw?.event || raw?.tournament || raw?.name || '—',
    status: normStatus(raw,kind),
    in: fmtIn(raw),
    teams: normTeams(raw),
    startTs: getStartTs(raw,kind), // ⬅️ clave para LIVE y UPCOMING
    _date: (
      ymdFrom(raw?.time_unix) || ymdFrom(raw?.unix) || ymdFrom(raw?.date_iso) ||
      ymdFrom(raw?.date) || ymdFrom(raw?.start_time) || ymdFrom(raw?.time_str) ||
      ymdFrom(raw?.time) || localYMD(new Date())
    ),
  };
}

/* grouping + bloques (sin cambios fuertes) */
function groupByDate(items){ const g=new Map(); for(const it of items){ const k=it._date; if(!k) continue; if(!g.has(k)) g.set(k,[]); g.get(k).push(it);} return g; }

export async function getUpcomingTodayAndNext(){
  const [p1,p2]=await Promise.all([
    fetchJSON(`${API}/matches?page=1`),
    fetchJSON(`${API}/matches?page=2`),
  ]);
  const all = dedupeById([...p1,...p2]).map(x=>normalizeMatch(x,'upcoming'));
  const by = groupByDate(all);
  const today = localYMD(new Date());
  const keys = [...by.keys()].sort();

  let todayBlock = by.get(today) ? {date:today, items:by.get(today)} : null;
  if(!todayBlock){
    for(const k of keys){ if(k>=today && by.get(k)?.length){ todayBlock={date:k, items:by.get(k)}; break; } }
  }
  let nextBlock = null;
  if(todayBlock){
    const idx = keys.indexOf(todayBlock.date);
    for(let i=idx+1;i<keys.length;i++){ const k=keys[i]; if(by.get(k)?.length){ nextBlock={date:k,items:by.get(k)}; break; } }
  }
  return { today: todayBlock || {date:today,items:[]}, next: nextBlock };
}

export async function getCompletedTodayOrPrev(){
  const [p1,p2]=await Promise.all([
    fetchJSON(`${API}/results?page=1`),
    fetchJSON(`${API}/results?page=2`),
  ]);
  const all = dedupeById([...p1,...p2]).map(x=>normalizeMatch(x,'completed'));
  const by = groupByDate(all);
  const today = localYMD(new Date());
  if(by.get(today)?.length) return { date:today, items:by.get(today) };
  const keys=[...by.keys()].sort();
  for(let i=keys.length-1;i>=0;i--){ const k=keys[i]; if(k<=today && by.get(k)?.length) return {date:k,items:by.get(k)}; }
  return { date:today, items:[] };
}
