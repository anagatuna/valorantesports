import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import axios from 'axios';
import https from 'https';
import crypto from 'crypto';
import { extractEvent, ensureEvent } from './vlr_event.mjs';

dotenv.config({ path: '.env.local' });

/**
 * Rellena el evento de los partidos históricos leyendo su página en vlr.gg.
 *
 * scrape_batch.mjs solo mira los ~60 partidos que vlr.gg lista como recientes,
 * y scrape_events.mjs depende de una API que solo expone ~250. Los partidos
 * viejos que ya están en nuestra tabla no los toca nadie: este script es para
 * ellos.
 *
 * Va uno a uno con pausa entre peticiones porque son cientos de páginas y no
 * queremos que vlr.gg nos corte. Es reanudable: solo busca filas con event_id
 * NULL, así que si se interrumpe basta con volver a lanzarlo.
 *
 * vlr.gg responde 403 a las IPs domésticas, así que en la práctica esto solo
 * corre desde GitHub Actions (igual que scrape_batch.mjs). Por eso acepta
 * configuración por variables de entorno además de por argumentos: el workflow
 * las pasa como inputs.
 *
 * Uso:
 *   node backfill_events.mjs              -> procesa hasta 100 partidos
 *   node backfill_events.mjs --limit 500  -> procesa hasta 500
 *   node backfill_events.mjs --dry        -> solo reporta, no escribe
 *
 * Equivalente por entorno: BACKFILL_LIMIT, BACKFILL_DELAY_MS, BACKFILL_DRY.
 */

const envInt = (name, fallback) => {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const limitArg = process.argv.indexOf('--limit');
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

async function main() {
  console.log(`📡 Backfill de eventos${DRY ? ' (dry run)' : ''} — hasta ${LIMIT} partidos, ${DELAY_MS}ms entre peticiones.`);

  const { data: pending, error } = await supabase
    .from('matches')
    .select('id, team_a, team_b')
    .is('event_id', null)
    .order('start_datetime', { ascending: false, nullsFirst: false })
    .limit(LIMIT);

  if (error) {
    console.error('❌ Error leyendo matches:', error.message);
    process.exit(1);
  }

  const { count: totalPending } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .is('event_id', null);

  console.log(`   ${totalPending} partidos sin evento en total. Procesando ${pending.length}.\n`);

  let ok = 0, sinEvento = 0, fallos = 0;

  // Si vlr.gg nos está bloqueando o limitando no tiene sentido gastar media
  // hora de job pidiendo mil páginas que van a fallar todas.
  let fallosSeguidos = 0;
  const MAX_FALLOS_SEGUIDOS = 10;

  for (let i = 0; i < pending.length; i++) {
    const m = pending[i];
    const etiqueta = `[${i + 1}/${pending.length}] ${m.id} ${m.team_a} vs ${m.team_b}`;

    let $;
    try {
      const res = await axiosClient.get(`https://www.vlr.gg/${m.id}`);
      $ = cheerio.load(res.data);
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

    const ev = extractEvent($);
    if (!ev.event_id || !ev.event_name) {
      console.log(`   ⚠️ ${etiqueta} -> sin evento en la página`);
      sinEvento++;
      await sleep(DELAY_MS);
      continue;
    }

    if (DRY) {
      console.log(`   · ${etiqueta} -> ${ev.event_name} (${ev.event_id})${ev.match_stage ? ` · ${ev.match_stage}` : ''}`);
      ok++;
      await sleep(DELAY_MS);
      continue;
    }

    if (!(await ensureEvent(supabase, ev))) {
      fallos++;
      await sleep(DELAY_MS);
      continue;
    }

    const { error: upErr } = await supabase
      .from('matches')
      .update({ event_id: ev.event_id, event_name: ev.event_name, match_stage: ev.match_stage })
      .eq('id', m.id);

    if (upErr) {
      console.log(`   ❌ ${etiqueta} -> ${upErr.message}`);
      fallos++;
    } else {
      console.log(`   ✅ ${etiqueta} -> ${ev.event_name}`);
      ok++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n🏁 ${ok} enlazados, ${sinEvento} sin evento, ${fallos} fallos.`);
  const restantes = totalPending - (DRY ? 0 : ok);
  if (restantes > 0) console.log(`   Quedan ~${restantes}. Vuelve a lanzarlo para continuar.`);
}

main().catch((e) => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
