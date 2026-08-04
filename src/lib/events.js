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
  if (/\bemea\b|\beurope\b/.test(n)) return 'EMEA';
  if (/\bpacific\b|\bapac\b/.test(n)) return 'PACIFIC';
  if (/\bamericas\b|\bna\b|\blatam\b|\bbrazil\b/.test(n)) return 'AMERICAS';
  return null;
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
