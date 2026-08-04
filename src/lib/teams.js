import { supabase } from '@/lib/supabaseClient';

export const BUCKET_LABELS = ['AMERICAS', 'EMEA', 'PACIFIC', 'CN'];

// La tabla `teams` guarda `region` ya normalizada por scrape_teams.mjs:
// 'AMERICAS' | 'EMEA' | 'PACIFIC' | 'CN' | 'UNKNOWN'
const COLS = 'name, img, region, tier, roster';

export function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Devuelve null para las imágenes que no sirven:
 *  - /img/vlr/tmp/vlr.png  -> placeholder relativo, rompe contra nuestro dominio
 *  - vlr.gg/img/base/ph/*  -> silueta de "sin foto"; además vlr.gg da 403,
 *                             así que en el navegador sale como imagen rota
 */
export function getLogo(img) {
  if (!img || !img.startsWith('http')) return null;
  if (/vlr\.gg\/img\/base\/ph\//.test(img)) return null;
  return img;
}

export function getInitials(name) {
  return name
    .split(/\s+/)
    .filter(w => /[a-z0-9]/i.test(w))
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

// El roster viene como array de strings tipo "nick Nombre Real [rol]".
// Los sufijos de rol van de más largo a más corto para no cortar de más.
const ROLES = [
  'performance coach',
  'assistant coach',
  'strategic coach',
  'head coach',
  'analyst',
  'manager',
  'coach',
  'stand-in',
  'inactive',
  'loan',
  'sub'
];

export function parseRoster(raw) {
  let list;
  try {
    list = JSON.parse(raw || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];

  return list
    .map(entry => {
      let rest = String(entry).trim();
      if (!rest) return null;

      let role = 'PLAYER';
      const lower = rest.toLowerCase();
      for (const r of ROLES) {
        if (lower.endsWith(r)) {
          role = r.toUpperCase();
          rest = rest.slice(0, rest.length - r.length).trim();
          break;
        }
      }

      const [nick, ...restName] = rest.split(/\s+/);
      if (!nick) return null;

      return {
        nick,
        realName: restName.join(' '),
        role
      };
    })
    .filter(Boolean);
}

function shape(row) {
  return {
    ...row,
    slug: slugify(row.name),
    logo: getLogo(row.img),
    players: parseRoster(row.roster)
  };
}

export async function getTeamsByBucket(bucket) {
  const { data, error } = await supabase
    .from('teams')
    .select(COLS)
    .eq('region', bucket)
    .order('name', { ascending: true });

  if (error) {
    console.error(`Error trayendo equipos de ${bucket}:`, error.message);
    return [];
  }
  return (data || []).map(shape);
}

/**
 * Equipos agrupados por bucket.
 *
 * Por defecto muestra sólo los VCT partner, como la sección de esports del
 * juego. Si la columna `partner` todavía no existe o nadie está marcado,
 * cae a mostrar todos los equipos con región conocida.
 *
 * Devuelve { groups, onlyPartners } para que la UI pueda avisar en qué modo está.
 */
export async function getTeamsGrouped({ partnersOnly = true } = {}) {
  const agrupar = (rows) =>
    BUCKET_LABELS.map(label => ({
      label,
      teams: rows.filter(t => t.region === label)
    }));

  if (partnersOnly) {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('partner', true)
      .order('name', { ascending: true });

    if (!error && data && data.length > 0) {
      return { groups: agrupar(data.map(shape)), onlyPartners: true };
    }
  }

  const { data, error } = await supabase
    .from('teams')
    .select(COLS)
    .in('region', BUCKET_LABELS)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error trayendo equipos:', error.message);
    return { groups: agrupar([]), onlyPartners: false };
  }

  return { groups: agrupar((data || []).map(shape)), onlyPartners: false };
}

/**
 * Roster desde la tabla `players` (la que llena scrape_roster.mjs).
 * Devuelve null si la tabla todavía no existe o el equipo no tiene vlr_id,
 * para que el llamador caiga al parseo del texto viejo.
 */
async function getPlayersFromTable(vlrId) {
  if (!vlrId) return null;

  const { data, error } = await supabase
    .from('players')
    .select('id, user, name, img, country, role, staff_tag')
    .eq('team_vlr_id', vlrId);

  if (error || !data || data.length === 0) return null;

  const orden = { player: 0, staff: 1, inactive: 2 };
  return data
    .sort((a, b) => (orden[a.role] ?? 9) - (orden[b.role] ?? 9))
    .map(p => ({
      key: p.id,
      nick: p.user || p.name || '?',
      realName: p.user && p.name && p.user !== p.name ? p.name : '',
      role: (p.staff_tag || p.role || 'player').toUpperCase(),
      isPlayer: p.role === 'player',
      isInactive: p.role === 'inactive',
      img: getLogo(p.img),
      country: p.country || null
    }));
}

/**
 * Busca por slug. Como la tabla no tiene columna slug, se resuelve
 * comparando el slug generado desde `name`.
 */
export async function getTeamBySlug(slug) {
  const { data, error } = await supabase.from('teams').select('*');
  if (error) {
    console.error('Error buscando equipo:', error.message);
    return null;
  }

  const row = (data || []).find(t => slugify(t.name) === slug);
  if (!row) return null;

  const team = shape(row);

  const desdeTabla = await getPlayersFromTable(row.vlr_id);
  if (desdeTabla) {
    team.players = desdeTabla;
  } else {
    // Respaldo: la columna `roster` de texto del scraper viejo.
    team.players = team.players.map((p, i) => ({
      ...p,
      key: `${p.nick}-${i}`,
      isPlayer: p.role === 'PLAYER',
      isInactive: p.role === 'INACTIVE',
      img: null,
      country: null
    }));
  }

  return team;
}
