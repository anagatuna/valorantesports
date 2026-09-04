import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import axios from 'axios';
import https from 'https';
import crypto from 'crypto';
import { parseMapRounds } from './vlr_rounds.mjs';

dotenv.config({ path: '.env.local' });

/**
 * Rellena match_maps.rounds de los partidos que ya estan en la tabla.
 *
 * scrape_batch.mjs solo mira los ~60 partidos que vlr.gg lista como recientes,
 * asi que al estrenar la columna todo el historico se queda sin desglose y la
 * vista del partido sigue enseñando solo el CT/T. Este script es para ellos.
 *
 * Va uno a uno con pausa entre peticiones porque son cientos de paginas y no
 * queremos que vlr.gg nos corte. Es reanudable: solo coge mapas con `rounds`
 * NULL, asi que si se interrumpe basta con volver a lanzarlo.
 *
 * Un mapa cuyo desglose vlr.gg no publica (partidos viejos, parte de
 * Challengers/GC) se marca con [] en vez de dejarlo en NULL, para que salga de
 * la cola. Si no, volveria a salir en cada corrida y esto no terminaria nunca.
 * El resumen final dice cuantas corridas quedan.
 *
 * vlr.gg responde 403 a las IPs domesticas. backfill_events.mjs se rinde ahi
 * y solo corre desde GitHub Actions, pero este script tambien tiene que servir
 * para mirar el resultado en el dev local nada mas estrenar la columna, sin
 * esperar a mergear el workflow a main. Por eso, si la peticion directa falla,
 * reintenta por un lector publico (ver fetchMatch). Es un apaño para una
 * herramienta manual: scrape_batch.mjs sigue yendo directo, que corre en
 * Actions y alli no hace falta.
 *
 * Uso:
 *   node backfill_rounds.mjs              -> procesa hasta 100 partidos
 *   node backfill_rounds.mjs --limit 500  -> procesa hasta 500
 *   node backfill_rounds.mjs --dry        -> solo reporta, no escribe
 *   node backfill_rounds.mjs --match 1234 -> solo ese partido
 *
 * Equivalente por entorno: BACKFILL_LIMIT, BACKFILL_DELAY_MS, BACKFILL_DRY.
 */

const envInt = (name, fallback) => {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const limitArg = process.argv.indexOf('--limit');
const matchArg = process.argv.indexOf('--match');
const SOLO_MATCH = matchArg > -1 ? String(process.argv[matchArg + 1] || '').trim() : null;
const DRY = process.argv.includes('--dry') || process.env.BACKFILL_DRY === 'true';
const LIMIT = limitArg > -1
  ? parseInt(process.argv[limitArg + 1], 10) || 100
  : envInt('BACKFILL_LIMIT', 100);
const DELAY_MS = envInt('BACKFILL_DELAY_MS', 1500);

const httpsAgent = new https.Agent({
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
  rejectUnauthorized: false,
});

const axiosClient = axios.create({
  httpsAgent,
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  },
});

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => (s ? String(s).replace(/[\n\t\r]/g, ' ').replace(/\s+/g, ' ').trim() : '');

// Se avisa una sola vez, no en cada partido.
let avisadoLector = false;

/**
 * El HTML de la pagina de un partido.
 *
 * Primero directo. Si vlr.gg corta (403 desde IPs domesticas), reintenta por
 * r.jina.ai, que devuelve el HTML tal cual con la cabecera x-return-format.
 * Va mas lento y tiene limite de peticiones, asi que al caer ahi subimos la
 * pausa entre partidos.
 */
async function fetchMatch(matchId) {
  const url = `https://www.vlr.gg/${matchId}`;
  try {
    const res = await axiosClient.get(url);
    return { html: res.data, viaLector: false };
  } catch (e) {
    const status = e?.response?.status;
    // Un timeout o un 500 son cosa del momento: solo tiramos de lector cuando
    // vlr.gg nos esta cerrando la puerta a proposito.
    if (status !== 403 && status !== 429) throw e;

    if (!avisadoLector) {
      console.log('   ℹ️ vlr.gg nos bloquea desde esta red; tirando del lector publico (mas lento).');
      avisadoLector = true;
    }

    const ctrl = new AbortController();
    const corte = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(`https://r.jina.ai/${url}`, {
        headers: { 'x-return-format': 'html' },
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error(`lector -> ${r.status}`);
      return { html: await r.text(), viaLector: true };
    } finally {
      clearTimeout(corte);
    }
  }
}

/**
 * Los tabs de mapa de la pagina, con el data-game-id que necesita el parser.
 *
 * Es el mismo recorrido que hace scrape_batch.mjs, pero aqui solo nos importa
 * emparejar cada game-id con el map_name que ya tenemos guardado en la fila.
 */
function mapTabs($) {
  let nav = $('.vm-stats-gamesnav-item');
  if (nav.length === 0) nav = $('.vm-stats-games-nav-item');
  if (nav.length === 0) nav = $('.js-map-switch');

  const tabs = [];
  nav.each((_, el) => {
    const id = $(el).attr('data-game-id');
    if (!id || id === 'all') return;
    // El texto viene como "2 Breeze 13:8"; quitamos el indice y el marcador.
    const raw = clean($(el).text()).replace(/^\d+\s+/, '');
    const sc = raw.match(/(\d+)[:\-\s]+(\d+)/);
    const name = sc ? raw.replace(sc[0], '').trim() : raw;
    if (!name) return;
    tabs.push({ id, name });
  });
  return tabs;
}

async function main() {
  console.log(`📡 Backfill de rondas${DRY ? ' (dry run)' : ''} — hasta ${LIMIT} partidos, ${DELAY_MS}ms entre peticiones.`);

  // Agrupamos por partido: una sola descarga de la pagina cubre sus mapas.
  let q = supabase
    .from('match_maps')
    .select('id, match_id, map_name')
    .is('rounds', null)
    .order('match_id', { ascending: false });
  if (SOLO_MATCH) q = q.eq('match_id', SOLO_MATCH);

  const { data: pendientes, error } = await q;

  if (error) {
    console.error('❌ Error leyendo match_maps:', error.message);
    if (/rounds/i.test(error.message)) {
      console.error('   Falta la columna: corre sql/005_match_rounds.sql en Supabase primero.');
    }
    process.exit(1);
  }

  const porPartido = new Map();
  for (const fila of pendientes) {
    if (!porPartido.has(fila.match_id)) porPartido.set(fila.match_id, []);
    porPartido.get(fila.match_id).push(fila);
  }

  // La consulta de arriba la corta Supabase en 1000 filas, asi que
  // porPartido.size no es el total: para saber cuanto queda de verdad —y
  // cuantas corridas mas hacen falta— hay que contar aparte.
  let totalMapas = null;
  if (!SOLO_MATCH) {
    const { count } = await supabase
      .from('match_maps')
      .select('id', { count: 'exact', head: true })
      .is('rounds', null);
    totalMapas = count;
  }

  const ids = [...porPartido.keys()].slice(0, LIMIT);
  console.log(`   ${porPartido.size} partidos en esta tanda (${totalMapas ?? '?'} mapas sin comprobar en total). Procesando ${ids.length}.\n`);

  let ok = 0, sinDatos = 0, fallos = 0;

  // Si vlr.gg nos esta bloqueando o limitando no tiene sentido gastar media
  // hora de job pidiendo mil paginas que van a fallar todas.
  let fallosSeguidos = 0;
  const MAX_FALLOS_SEGUIDOS = 10;

  for (let i = 0; i < ids.length; i++) {
    const matchId = ids[i];
    const filas = porPartido.get(matchId);
    const etiqueta = `[${i + 1}/${ids.length}] ${matchId} (${filas.length} mapas)`;

    let $, viaLector = false;
    try {
      const res = await fetchMatch(matchId);
      $ = cheerio.load(res.html);
      viaLector = res.viaLector;
      fallosSeguidos = 0;
    } catch (e) {
      console.log(`   ❌ ${etiqueta} -> ${e.message}`);
      fallos++;
      fallosSeguidos++;
      if (fallosSeguidos >= MAX_FALLOS_SEGUIDOS) {
        console.log(`\n🛑 ${MAX_FALLOS_SEGUIDOS} fallos seguidos: vlr.gg no responde. Abortando.`);
        break;
      }
      await sleep(DELAY_MS);
      continue;
    }

    const tabs = mapTabs($);
    let escritos = 0, marcados = 0;

    // Sin tabs no hemos leido nada util (pagina rara o a medio cargar): no
    // damos por comprobado nada, que se reintente en la siguiente corrida.
    const paginaValida = tabs.length > 0;

    for (const fila of filas) {
      const tab = tabs.find((t) => t.name.toLowerCase() === String(fila.map_name).toLowerCase());
      const rounds = tab ? parseMapRounds($, tab.id) : null;

      // Aqui esta la diferencia entre "aun no lo he mirado" y "lo he mirado y
      // vlr.gg no lo publica". Si dejaramos NULL en el segundo caso, esos
      // mapas volverian a salir en la consulta de pendientes en cada corrida
      // y el backfill no terminaria nunca: siempre habria 700 partidos por
      // hacer, los mismos. Guardamos [] para que salgan de la cola.
      const valor = rounds && rounds.length ? rounds : (paginaValida ? [] : null);
      if (valor === null) continue;

      if (DRY) {
        if (valor.length) escritos++; else marcados++;
        continue;
      }

      const { error: upErr } = await supabase
        .from('match_maps')
        .update({ rounds: valor })
        .eq('id', fila.id);

      if (upErr) console.log(`   ❌ ${etiqueta} ${fila.map_name} -> ${upErr.message}`);
      else if (valor.length) escritos++;
      else marcados++;
    }

    if (escritos > 0) {
      console.log(`   ✅ ${etiqueta} -> ${escritos} mapas con rondas${marcados ? `, ${marcados} sin desglose` : ''}`);
      ok++;
    } else if (marcados > 0) {
      console.log(`   ⚠️ ${etiqueta} -> vlr.gg no publica el desglose (marcado, no vuelve a salir)`);
      sinDatos++;
    } else {
      console.log(`   ⚠️ ${etiqueta} -> pagina sin mapas, se reintentara`);
      sinDatos++;
    }

    // El lector publico limita peticiones; con la pausa normal salta el 429.
    await sleep(viaLector ? Math.max(DELAY_MS, 3000) : DELAY_MS);
  }

  console.log(`\n🏁 ${ok} partidos rellenados, ${sinDatos} sin desglose en vlr.gg, ${fallos} fallos.`);

  if (SOLO_MATCH) return;

  const { count: quedan } = await supabase
    .from('match_maps')
    .select('id', { count: 'exact', head: true })
    .is('rounds', null);

  if (quedan > 0) {
    console.log(`   Quedan ${quedan} mapas sin comprobar (~${Math.ceil(quedan / 900)} corridas mas). Vuelve a lanzarlo.`);
  } else {
    console.log('   No queda nada por comprobar.');
  }
}

main().catch((e) => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
