export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import HomeMatches from "@/components/HomeMatches";

// --- 1. CONFIGURACIÓN SUPABASE ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- 2. ADAPTADOR (DB -> Formato Componente) ---
// Convierte tus columnas de Supabase al formato que espera HomeMatches
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
    
    // 🟢 CAMBIO AQUÍ: Usamos la fecha real si existe
    startTs: row.start_datetime 
      ? new Date(row.start_datetime).getTime() 
      : (row.last_update ? new Date(row.last_update).getTime() : Date.now()),
      
    time_completed: "Recently"
  };
}

/* normalizador que respeta event si ya viene (TU CÓDIGO ORIGINAL) */
function resolveEvent(raw = {}) {
  return (
    (raw.event && String(raw.event).trim()) ||      
    (raw.tournament && String(raw.tournament).trim()) ||
    (raw.league?.name && String(raw.league.name).trim()) ||
    (raw.stage?.event && String(raw.stage.event).trim()) ||
    (raw.series?.event && String(raw.series.event).trim()) ||
    (raw.stage?.name && String(raw.stage.name).trim()) ||
    ""
  );
}
const normalizeMatch = (raw = {}) => ({ ...raw, event: resolveEvent(raw) });
const normalizeCollection = (coll) => ({ items: (coll?.items || []).map(normalizeMatch) });

export default async function HomePage() {
  // 1. Pedimos TODO a Supabase (reemplazo de las llamadas a Vlrgg)
  const { data: dbMatches } = await supabase
    .from('matches')
    .select('*')
    .order('id', { ascending: false }); // Los más nuevos primero

  const allMatches = (dbMatches || []).map(adaptarDesdeDB);

  // 2. Filtramos manualmente para llenar tus variables 'today', 'next', 'completed'
  const upcomingList = allMatches.filter(m => m.status !== 'COMPLETED' && m.status !== 'FINAL');
  const completedList = allMatches.filter(m => m.status === 'COMPLETED' || m.status === 'FINAL');

  // Simulamos la estructura que retornaban tus funciones originales
  // 'today' tendrá los partidos LIVE y UPCOMING
  const today = { items: upcomingList };
  
  // 'next' lo dejamos vacío o puedes poner partidos lejanos si tuvieras lógica de fechas
  const next = { items: [] }; 

  // 'completed' tendrá los resultados
  const completedRaw = { items: completedList };

  // 3. Tu lógica de normalización original (INTACTA)
  const normToday = normalizeCollection(today);
  const normNext = normalizeCollection(next);
  const normCompleted = normalizeCollection(completedRaw); 

  // 4. Tu render original (INTACTO)
  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <HomeMatches today={normToday} next={normNext} completed={normCompleted} />
    </main>
  );
}