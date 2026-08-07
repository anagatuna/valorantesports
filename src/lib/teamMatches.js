import { supabase } from '@/lib/supabaseClient';
import { slugify } from '@/lib/teams';

// La tabla `matches` guarda los equipos como texto (`team_a` / `team_b`), no
// por id, así que el cruce es por nombre. Para sacar el tag y el logo del
// rival hay que pasar por `teams`.
const MATCH_COLS =
  'id, team_a, team_b, score_a, score_b, status, start_datetime, event_name, match_stage, team_a_logo, team_b_logo';

// Un UPCOMING que debió empezar hace rato es un partido que el scraper todavía
// no ha cerrado. Mismo margen que usa la página de matches.
const ZOMBIE_MS = 3 * 60 * 60 * 1000;

// PostgREST separa los filtros de `or()` por comas: un nombre con coma o con
// paréntesis rompería la consulta, así que va entre comillas.
const quote = (v) => `"${String(v).replace(/"/g, '\\"')}"`;

function shape(row, teamName, index) {
  const isHome = row.team_a === teamName;
  const ts = row.start_datetime ? new Date(row.start_datetime).getTime() : null;

  return {
    id: row.id,
    ts,
    isHome,
    status: row.status,
    event: row.event_name || null,
    stage: row.match_stage || null,
    self: {
      name: isHome ? row.team_a : row.team_b,
      score: isHome ? row.score_a : row.score_b,
      logo: isHome ? row.team_a_logo : row.team_b_logo,
    },
    rival: {
      name: isHome ? row.team_b : row.team_a,
      score: isHome ? row.score_b : row.score_a,
      logo: isHome ? row.team_b_logo : row.team_a_logo,
      ...(index.get(isHome ? row.team_b : row.team_a) || {}),
    },
  };
}

/**
 * Próximos partidos y últimos resultados de un equipo.
 *
 * Devuelve listas ya ordenadas para pintar: `upcoming` de más cercano a más
 * lejano, `recent` del más reciente hacia atrás. Las filas sin fecha se
 * descartan, porque no se pueden colocar en el tiempo.
 */
export async function getTeamMatches(teamName, { upcomingLimit = 4, recentLimit = 4 } = {}) {
  if (!teamName) return { upcoming: [], recent: [] };

  const [{ data: rows, error }, { data: teamRows }] = await Promise.all([
    supabase
      .from('matches')
      .select(MATCH_COLS)
      .or(`team_a.eq.${quote(teamName)},team_b.eq.${quote(teamName)}`)
      .order('start_datetime', { ascending: true }),
    supabase.from('teams').select('name, tag, img'),
  ]);

  if (error) {
    console.error(`Error trayendo partidos de ${teamName}:`, error.message);
    return { upcoming: [], recent: [] };
  }

  // name -> { tag, img, slug } para resolver al rival.
  const index = new Map(
    (teamRows || []).map(t => [t.name, { tag: t.tag || null, img: t.img || null, slug: slugify(t.name) }])
  );

  const now = Date.now();
  const all = (rows || []).map(r => shape(r, teamName, index)).filter(m => m.ts);

  const upcoming = all
    .filter(m => m.status !== 'COMPLETED' && m.ts > now - ZOMBIE_MS)
    .slice(0, upcomingLimit);

  const recent = all
    .filter(m => m.status === 'COMPLETED')
    .sort((a, b) => b.ts - a.ts)
    .slice(0, recentLimit);

  return { upcoming, recent };
}
