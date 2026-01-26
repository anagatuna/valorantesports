export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import HomeMatches from "@/components/HomeMatches";

// --- Configuración Supabase ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- Adaptador CORREGIDO ---
function adaptarMatch(row) {
  // Aseguramos que haya nombres por defecto
  const t1Name = row.team_a || "TBA";
  const t2Name = row.team_b || "TBA";

  return {
    id: row.id,

    // 1. Strings planos para evitar errores de React (Object as Child)
    team1: t1Name,
    team2: t2Name,

    // 2. Array 'teams' REQUERIDO por HomeMatches/ScheduleCard para pintar info
    teams: [
      { name: t1Name, score: row.score_a },
      { name: t2Name, score: row.score_b }
    ],

    score1: row.score_a,
    score2: row.score_b,
    status: row.status,
    event: row.tournament || "Valorant Match",
    startTs: row.start_datetime ? new Date(row.start_datetime).getTime() : Date.now(),
    match_page: `https://www.vlr.gg/${row.id}`,
    vlrUrl: `https://www.vlr.gg/${row.id}`, // Importante para la hidratación en tiempo real
  };
}

const normalizeCollection = (items) => ({ items });

export default async function MatchesPage() {
  // 1. Traer partidos NO terminados (LIVE y UPCOMING)
  const { data: rawMatches } = await supabase
    .from('matches')
    .select('*')
    .in('status', ['LIVE', 'UPCOMING'])
    .order('start_datetime', { ascending: true });

  const allMatches = (rawMatches || []).map(adaptarMatch);

  // 2. Clasificar lógica simple
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  const todayMatches = [];
  const nextMatches = [];

  // Nueva lógica: Filtra zombis
  const cutoff = now - (6 * 60 * 60 * 1000); // 6 horas en el pasado

  allMatches.forEach(m => {
    // 1. Si el partido es UPCOMING pero empezó hace más de 6 horas, es un error (Zombie). Lo ignoramos.
    if (m.status === 'UPCOMING' && m.startTs < cutoff) {
      return;
    }

    // 2. Clasificación normal
    if (m.status === 'LIVE' || (m.startTs - now < oneDay)) {
      todayMatches.push(m);
    } else {
      nextMatches.push(m);
    }
  });

  const normToday = normalizeCollection(todayMatches);
  const normNext = normalizeCollection(nextMatches);

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <HomeMatches today={normToday} next={normNext} />
    </main>
  );
}