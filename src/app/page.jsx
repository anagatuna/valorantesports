export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import HomeMatches from "@/components/HomeMatches";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- HELPER: Calcula "hace cuánto" ---
function calcularTiempoAtras(timestamp) {
  if (!timestamp) return "Recently";
  
  const diffMs = Date.now() - timestamp;
  // Si la diferencia es negativa (futuro), no aplica
  if (diffMs < 0) return "Recently";

  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return `${mins}m ago`;
}

// --- ADAPTADOR ---
function adaptarDesdeDB(row) {
  // Obtenemos el timestamp real
  const ts = row.start_datetime 
      ? new Date(row.start_datetime).getTime() 
      : (row.last_update ? new Date(row.last_update).getTime() : Date.now());

  // Calculamos el string "5h ago" dinámicamente
  const timeAgoStr = calcularTiempoAtras(ts);

  return {
    id: row.id,
    team1: row.team_a,
    team2: row.team_b,
    score1: row.score_a,
    score2: row.score_b,
    teams: [
      { name: row.team_a, score: row.score_a },
      { name: row.team_b, score: row.score_b }
    ],
    status: row.status, 
    event: "Valorant Match",
    match_page: `https://www.vlr.gg/${row.id}`, 
    vlrUrl: `https://www.vlr.gg/${row.id}`,
    
    startTs: ts,
    
    time_completed: (row.status === 'COMPLETED' || row.status === 'FINAL') 
      ? timeAgoStr 
      : null 
  };
}

const normalizeMatch = (raw = {}) => ({ ...raw });
const normalizeCollection = (coll) => ({ items: (coll?.items || []).map(normalizeMatch) });

export default async function HomePage() {
  const { data: dbMatches } = await supabase
    .from('matches')
    .select('*');

  const allMatches = (dbMatches || []).map(adaptarDesdeDB);

  // --- ORDENAMIENTO ---
  const liveMatches = allMatches
    .filter(m => m.status === 'LIVE')
    .sort((a, b) => a.startTs - b.startTs);
  
  const upcomingMatches = allMatches
    .filter(m => m.status === 'UPCOMING')
    .sort((a, b) => a.startTs - b.startTs);

  const completedMatches = allMatches
    .filter(m => m.status === 'COMPLETED' || m.status === 'FINAL')
    .sort((a, b) => b.startTs - a.startTs);

  const today = { items: [...liveMatches, ...upcomingMatches] };
  const completedRaw = { items: completedMatches };

  const normToday = normalizeCollection(today);
  const normCompleted = normalizeCollection(completedRaw); 

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <HomeMatches 
        today={normToday} 
        next={null} 
        completed={normCompleted} 
      />
    </main>
  );
}