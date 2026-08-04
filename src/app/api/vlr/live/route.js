import { NextResponse } from 'next/server';
import { fetchLiveMapDetail, isCircuitOpen } from '@/lib/vlrLiveMap';

export const dynamic = 'force-dynamic';
// https.Agent y cheerio necesitan runtime de Node, no edge.
export const runtime = 'nodejs';

/**
 * Estado en vivo de los partidos.
 *
 * Sustituye a vlrggapi.vercel.app, que quedo apagado (402 DEPLOYMENT_DISABLED).
 * Fuente: vlr.orlandomm.net, que usa el MISMO id de vlr.gg que nuestra tabla
 * `matches`, asi que el cruce es directo por id.
 *
 * Resuelve dos cosas que el scraper de cada 30 min no puede:
 *  - score al momento mientras el partido corre (/matches)
 *  - detectar que ya termino sin esperar al siguiente cron (/results)
 *
 * Ojo con /results: devuelve score vacio y `won: true` en ambos equipos, o sea
 * que solo es fiable como senal de "este partido ya acabo". El marcador final
 * lo sigue poniendo el scraper.
 */
const API = 'https://vlr.orlandomm.net/api/v1';

// Cache en memoria: varios visitantes comparten la misma respuesta en vez de
// multiplicar peticiones hacia el upstream.
const TTL_MS = 15_000;
let cache = { ts: 0, payload: null };

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  const j = await r.json();
  return Array.isArray(j?.data) ? j.data : [];
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// parseUnixTs en el cliente espera "YYYY-MM-DD HH:mm:ss" y le agrega la Z.
const toSegTs = (utc) => {
  if (!utc) return null;
  const d = new Date(utc);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' ');
};

function buildSegments(matches, results) {
  const segments = [];

  for (const m of matches) {
    if (String(m?.status || '').toUpperCase() !== 'LIVE') continue;
    const [a, b] = m.teams || [];
    segments.push({
      match_page: `https://www.vlr.gg/${m.id}`,
      match_id: String(m.id),
      team1: a?.name ?? null,
      team2: b?.name ?? null,
      score1: num(a?.score),
      score2: num(b?.score),
      series_score1: num(a?.score),
      series_score2: num(b?.score),
      // hydrateWithSegmentsOnce marca LIVE buscando este texto.
      time_until_match: 'LIVE',
      status: 'LIVE',
      unix_timestamp: toSegTs(m.utc),
    });
  }

  for (const m of results) {
    const [a, b] = m.teams || [];
    segments.push({
      match_page: `https://www.vlr.gg/${m.id}`,
      match_id: String(m.id),
      team1: a?.name ?? null,
      team2: b?.name ?? null,
      // Sin score: /results los manda vacios. El marcador lo pone el scraper.
      time_until_match: m.ago || 'Completed',
      status: 'COMPLETED',
      unix_timestamp: null,
    });
  }

  return segments;
}

// Cuantos partidos en vivo enriquecemos con la pagina de vlr.gg, y de cuantos
// en cuantos. Con esto son como mucho 2 tandas por refresco, y el cache de
// 15s evita que se repita por cada visitante.
const MAX_DETAIL = 12;
const BATCH = 4;

/**
 * Anade el detalle del mapa en curso a los segmentos LIVE.
 *
 * Es best-effort: si vlr.gg no responde o no publica el detalle (comun fuera de
 * tier 1) el segmento se queda como estaba y la card sigue funcionando con el
 * marcador de mapas. Nunca hacemos fallar la ruta por esto.
 */
async function enrichLiveSegments(segments) {
  if (isCircuitOpen()) return segments;
  const live = segments.filter((s) => s.status === 'LIVE').slice(0, MAX_DETAIL);

  for (let i = 0; i < live.length; i += BATCH) {
    const chunk = live.slice(i, i + BATCH);
    const details = await Promise.all(
      chunk.map((s) => fetchLiveMapDetail(s.match_id).catch(() => null))
    );

    chunk.forEach((seg, idx) => {
      const d = details[idx];
      if (!d) return;

      // vlr.gg manda: si ya cerro, lo pasamos a COMPLETED aunque orlandomm
      // siga listandolo como LIVE.
      if (d.isFinal) {
        seg.status = 'COMPLETED';
        seg.time_until_match = 'Completed';
        return;
      }

      if (d.current_map) seg.current_map = d.current_map;
      if (d.best_of != null) seg.best_of = d.best_of;

      // El marcador de serie del header de vlr.gg es mas fresco que el de la
      // lista; solo lo pisamos si de verdad lo pudimos leer.
      if (d.series1 != null && d.series2 != null) {
        seg.series_score1 = d.series1;
        seg.series_score2 = d.series2;
        seg.score1 = d.series1;
        seg.score2 = d.series2;
      }

      // Los nombres que espera mergeLiveRounds via readProvided().
      if (d.team_1_round_ct != null) seg.team_1_round_ct = d.team_1_round_ct;
      if (d.team_1_round_t != null) seg.team_1_round_t = d.team_1_round_t;
      if (d.team_2_round_ct != null) seg.team_2_round_ct = d.team_2_round_ct;
      if (d.team_2_round_t != null) seg.team_2_round_t = d.team_2_round_t;
    });
  }

  return segments;
}

export async function GET(request) {
  // ?match=<id> lee un partido suelto y devuelve el parseo crudo, sin cache.
  // Sirve para comprobar que los selectores de vlr.gg siguen vigentes usando
  // un partido ya terminado, sin esperar a que haya uno en vivo.
  const matchId = new URL(request.url).searchParams.get('match');
  if (matchId) {
    const detail = await fetchLiveMapDetail(matchId);
    return NextResponse.json({
      match_id: matchId,
      vlrUnreachable: isCircuitOpen(),
      // null con vlrUnreachable=false significa que los selectores cambiaron.
      detail,
    });
  }

  if (cache.payload && Date.now() - cache.ts < TTL_MS) {
    return NextResponse.json(cache.payload, { headers: { 'X-Cache': 'HIT' } });
  }

  try {
    const [matches, results] = await Promise.all([
      getJson(`${API}/matches?page=1`),
      getJson(`${API}/results?page=1`),
    ]);

    const segments = await enrichLiveSegments(buildSegments(matches, results));
    const payload = {
      data: { segments },
      counts: {
        live: segments.filter((s) => s.status === 'LIVE').length,
        completed: segments.filter((s) => s.status === 'COMPLETED').length,
        withRounds: segments.filter((s) => s.team_1_round_ct != null || s.team_1_round_t != null).length,
      },
      // Para diagnosticar: si sale true, vlr.gg no responde y solo hay marcador
      // de mapas hasta que expire el enfriamiento.
      vlrUnreachable: isCircuitOpen(),
    };

    cache = { ts: Date.now(), payload };
    return NextResponse.json(payload, { headers: { 'X-Cache': 'MISS' } });
  } catch (e) {
    // Servimos lo ultimo bueno antes que dejar al cliente sin nada: mejor un
    // estado de hace un minuto que revertir a lo que diga Supabase.
    if (cache.payload) {
      return NextResponse.json(cache.payload, { headers: { 'X-Cache': 'STALE' } });
    }
    return NextResponse.json(
      { error: e?.message || 'fetch failed', data: { segments: [] } },
      { status: 502 }
    );
  }
}
