import { supabase } from '@/lib/supabaseClient';

export async function enrichMatchesWithSupabase(matches) {
  if (!matches || matches.length === 0) return matches;

  const ids = matches.map(m => m.id).filter(Boolean);
  if (ids.length === 0) return matches;

  // AHORA PEDIMOS TAMBIÉN LOS LOGOS (team_a_logo, team_b_logo)
  const { data: dbMatches, error } = await supabase
    .from('matches')
    .select('id, score_a, score_b, status, team_a, team_b, team_a_logo, team_b_logo')
    .in('id', ids);

  if (error || !dbMatches || dbMatches.length === 0) {
    return matches; 
  }

  const dbMap = new Map();
  dbMatches.forEach(db => dbMap.set(db.id, db));

  return matches.map(m => {
    const freshData = dbMap.get(m.id);
    if (!freshData) return m;

    return {
      ...m,
      status: freshData.status,
      // Inyectamos los logos de Supabase en el objeto del equipo
      teams: [
        { 
          name: m.teams[0]?.name || freshData.team_a, 
          score: freshData.score_a,
          logoDb: freshData.team_a_logo // <--- Logo VLR Equipo A
        },
        { 
          name: m.teams[1]?.name || freshData.team_b, 
          score: freshData.score_b,
          logoDb: freshData.team_b_logo // <--- Logo VLR Equipo B
        }
      ],
      is_completed_in_db: freshData.status === 'COMPLETED'
    };
  });
}