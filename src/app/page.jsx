export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import HomeMatches from "@/components/HomeMatches";

// --- CONFIGURACIÓN SUPABASE ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function adaptarDesdeDB(row) {
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
    
    // 🟢 CLAVE: Usar start_datetime. Si no existe, usamos last_update
    startTs: row.start_datetime 
      ? new Date(row.start_datetime).getTime() 
      : (row.last_update ? new Date(row.last_update).getTime() : Date.now()),
      
    time_completed: "Recently" 
  };
}

const normalizeMatch = (raw = {}) => ({ ...raw });
const normalizeCollection = (coll) => ({ items: (coll?.items || []).map(normalizeMatch) });

export default async function HomePage() {
  // 1. Pedimos TODO a Supabase
  const { data: dbMatches } = await supabase
    .from('matches')
    .select('*');

  const allMatches = (dbMatches || []).map(adaptarDesdeDB);

  // 2. ORDENAMIENTO MANUAL (La clave para que LIVE salga arriba)
  
  // A. Filtramos LIVE
  const liveMatches = allMatches.filter(m => m.status === 'LIVE');
  
  // B. Filtramos UPCOMING (y ordenamos por fecha ascendente: el más próximo primero)
  const upcomingMatches = allMatches
    .filter(m => m.status === 'UPCOMING')
    .sort((a, b) => a.startTs - b.startTs);

  // C. Filtramos COMPLETED (y ordenamos por fecha descendente: el más reciente primero)
  const completedMatches = allMatches
    .filter(m => m.status === 'COMPLETED' || m.status === 'FINAL')
    .sort((a, b) => b.startTs - a.startTs); // O usar ID si prefieres

  // 3. ARMAMOS LAS COLECCIONES
  
  // En 'today' ponemos PRIMERO los LIVE, luego los UPCOMING
  const today = { items: [...liveMatches, ...upcomingMatches] };
  
  // 'completed' tal cual
  const completedRaw = { items: completedMatches };

  // Normalizamos (tu lógica de frontend)
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