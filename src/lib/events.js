import { supabase } from '@/lib/supabaseClient';

const API = 'https://vlr.orlandomm.net/api/v1';

export const EVENT_STATUS = ['ongoing', 'upcoming', 'completed'];

// El orden en que los queremos ver: lo que se juega ahora primero.
const STATUS_RANK = { ongoing: 0, paused: 1, upcoming: 2, completed: 3 };

/**
 * Region a partir del nombre del torneo.
 *
 * El parametro `region` de la API no sirve: probamos los codigos que usaba
 * lib/events.js (na, br, eu, ap, kr, jp...) y todos devuelven 0 eventos. El
 * nombre, en cambio, viene con la region para todo lo que es circuito oficial
 * ("VCT 2026: Pacific Stage 2", "Game Changers 2026: EMEA Stage 3").
 */
export function regionOf(name = '') {
  const n = name.toLowerCase();
  if (/\bchina\b|\bcn\b/.test(n)) return 'CN';
  if (/\bemea\b|\beurope\b|\bdach\b|\biberia\b|\bfrance\b|\bitaly\b|\bturkey\b|\bmena\b|\bcis\b|\bportugal\b|\bspain\b|\bnordic\b|\bpoland\b/.test(n)) return 'EMEA';
  // Pacific agrupa lo mismo que vlr.gg: el circuito Pacific mas los nacionales
  // de Japon/Corea/SEA/Oceania, que antes se quedaban sin region.
  if (/\bpacific\b|\bapac\b|\bjapan\b|\bkorea\b|\boceania\b|\bsoutheast asia\b|\bsouth asia\b|\bsea\b|\btaiwan\b|\bvietnam\b|\bthailand\b|\bindonesia\b|\bphilippines\b|\bsingapore\b|\bmalaysia\b|\bhong kong\b/.test(n)) return 'PACIFIC';
  if (/\bamericas\b|\bnorth america\b|\bsouth america\b|\blatin america\b|\blatam\b|\bbrazil\b|\bbrasil\b|\bmexico\b|\bna\b/.test(n)) return 'AMERICAS';
  return null;
}

/**
 * Tier a partir del nombre, siguiendo la misma taxonomia que el filtro de
 * vlr.gg: VCT (tier 1) / VCL (Challengers, tier 2) / GC (Game Changers) /
 * CG (Collegiate) / T3 (todo lo demas, sobre todo community y grassroots).
 *
 * Igual que con la region, la API no publica el tier, asi que se deriva del
 * nombre. El orden importa: lo mas especifico primero, porque "Valorant
 * Champions" y "Challengers" conviven en muchos nombres.
 */
export const EVENT_TIERS = ['VCT', 'VCL', 'T3', 'GC', 'CG', 'OFF'];

/**
 * Offseason: torneos de terceros fuera del calendario de Riot. vlr.gg los
 * etiqueta a mano, y el nombre no trae ninguna marca generica que los separe
 * ("Invitational" tambien lo usan circuitos T3 como TXG o Road 2 Invitational),
 * asi que la lista va por marca conocida en vez de por patron.
 *
 * Es deliberadamente conservadora: preferimos que un offseason caiga en T3 a
 * que un T3 se cuele como offseason. Para sumar torneos basta agregar aqui.
 */
const OFFSEASON = /esports world cup|nations cup|twitch rivals|red bull|\bshowmatch\b/;

export function tierOf(name = '') {
  const n = name.toLowerCase();
  if (/\bcollegiate\b|\bcollege\b|\bcval\b|\buniversity\b|\bcampus\b/.test(n)) return 'CG';
  if (/game changers/.test(n)) return 'GC';
  if (/\bvct\b|valorant champions|\bmasters\b/.test(n)) return 'VCT';
  if (/\bvcl\b|\bchallengers\b|ascension/.test(n)) return 'VCL';
  // Va despues del circuito oficial a proposito: un evento de Riot nunca puede
  // acabar marcado como offseason por mucho que su nombre coincida.
  if (OFFSEASON.test(n)) return 'OFF';
  return 'T3';
}

const normalize = (e) => ({
  id: String(e.id),
  name: e.name,
  status: e.status || null,
  prizepool: e.prizepool || null,
  dates: e.dates || null,
  country: e.country || null,
  img: e.img || null,
  region: regionOf(e.name),
  tier: tierOf(e.name),
});

function sortEvents(list) {
  return [...list].sort((a, b) => {
    const ra = STATUS_RANK[a.status] ?? 9;
    const rb = STATUS_RANK[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(a.name).localeCompare(String(b.name));
  });
}

/**
 * Lee de nuestra tabla `events`. Si todavia no existe (migracion 003 sin
 * correr) o esta vacia, cae a la API para que la pantalla no salga en blanco.
 *
 * @returns {Promise<{events: Array, source: 'db' | 'api'}>}
 */
export async function getEvents() {
  const { data, error } = await supabase
    .from('events')
    .select('id, name, status, prizepool, dates, country, img');

  if (!error && data?.length) {
    return { events: sortEvents(data.map(normalize)), source: 'db' };
  }

  try {
    const res = await fetch(`${API}/events`, { next: { revalidate: 300 } });
    if (!res.ok) return { events: [], source: 'api' };
    const json = await res.json();
    const list = Array.isArray(json?.data) ? json.data : [];
    return { events: sortEvents(list.map(normalize)), source: 'api' };
  } catch {
    return { events: [], source: 'api' };
  }
}

export async function getEventById(id) {
  const { events } = await getEvents();
  return events.find((e) => e.id === String(id)) || null;
}

/** Partidos de un evento, via la FK que rellena scrape_events.mjs. */
export async function getEventMatches(eventId) {
  const { data, error } = await supabase
    .from('matches')
    .select('id, team_a, team_b, score_a, score_b, status, start_datetime, team_a_logo, team_b_logo, match_stage')
    .eq('event_id', String(eventId))
    .order('start_datetime', { ascending: false, nullsFirst: false });

  if (error) return [];
  return data || [];
}
