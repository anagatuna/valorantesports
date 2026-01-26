export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import HomeMatches from "@/components/HomeMatches";

// --- Configuración Supabase ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- Adaptador (CORREGIDO) ---
function adaptarMatch(row) {
  const t1Name = row.team_a || "TBA";
  const t2Name = row.team_b || "TBA";

  return {
    id: row.id,
    
    // ⚠️ CORRECCIÓN CLAVE: 
    // Restauramos 'team1' y 'team2' como STRINGS simples.
    // Esto evita el error "Objects are not valid as a React child".
    team1: t1Name, 
    team2: t2Name,

    // ✅ AGREGAMOS 'teams':
    // ScheduleCard necesita este array de objetos para mostrar nombres y scores.
    teams: [
      { name: t1Name, score: row.score_a },
      { name: t2Name, score: row.score_b }
    ],

    // Datos planos para fallbacks
    score1: row.score_a,
    score2: row.score_b,
    
    status: row.status,
    event: row.tournament || "Valorant Match",
    startTs: row.start_datetime ? new Date(row.start_datetime).getTime() : Date.now(),
    match_page: `https://www.vlr.gg/${row.id}`,
  };
}

const normalizeCollection = (items) => ({ items });

export default async function ResultsPage() {
  // Consulta a Supabase: Solo partidos TERMINADOS
  const { data: rawMatches } = await supabase
    .from('matches')
    .select('*')
    .in('status', ['COMPLETED', 'FINAL']) 
    .order('start_datetime', { ascending: false }) // Más recientes primero
    .limit(50);

  const adaptedMatches = (rawMatches || []).map(adaptarMatch);
  const normCompleted = normalizeCollection(adaptedMatches);

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <HomeMatches today={null} next={null} completed={normCompleted} />
    </main>
  );
}