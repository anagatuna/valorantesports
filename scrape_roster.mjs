/**
 * Scrapea equipos + rosters (con foto de jugador) y los guarda en Supabase.
 *
 * Fuente: https://vlr.orlandomm.net (API pública sobre vlr.gg).
 * No se scrapea vlr.gg directo porque responde 403 a peticiones automatizadas.
 *
 * Uso:
 *   node scrape_roster.mjs                 # todas las regiones
 *   node scrape_roster.mjs --region=AMERICAS
 *   node scrape_roster.mjs --limit=20      # prueba rápida
 *   node scrape_roster.mjs --dry-run       # no escribe en la base
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const API = 'https://vlr.orlandomm.net/api/v1';

// Códigos válidos verificados contra el endpoint /teams.
// Ojo: 'mn', 'cn' y 'sa' devuelven 400, por eso no están.
const BUCKETS = {
  AMERICAS: ['na', 'br', 'lan', 'las'],
  EMEA: ['eu'],
  PACIFIC: ['ap', 'kr', 'jp', 'oce'],
  CN: ['ch']
};

// --- argumentos ---
const args = process.argv.slice(2);
const getArg = (n) => {
  const hit = args.find(a => a.startsWith(`--${n}=`));
  return hit ? hit.split('=')[1] : null;
};
const onlyRegion = getArg('region');
const limit = getArg('limit') ? parseInt(getArg('limit'), 10) : null;
const dryRun = args.includes('--dry-run');
const partnersOnly = args.includes('--partners-only');
const paginasResultados = getArg('pages') ? parseInt(getArg('pages'), 10) : 25;

const buckets = onlyRegion
  ? { [onlyRegion]: BUCKETS[onlyRegion] }
  : BUCKETS;

if (onlyRegion && !BUCKETS[onlyRegion]) {
  console.error(`Región inválida: ${onlyRegion}. Usá: ${Object.keys(BUCKETS).join(', ')}`);
  process.exit(1);
}

// --- supabase ---
const supabase = dryRun ? null : createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

if (!dryRun && (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL)) {
  console.error('Falta SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL');
  process.exit(1);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** GET con reintentos y backoff. La API es comunitaria: hay que ser amable. */
async function get(path, intentos = 3) {
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(`${API}${path}`);
      if (res.status === 429) {
        const espera = 2000 * (i + 1);
        console.log(`   429, esperando ${espera}ms...`);
        await sleep(espera);
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      if (i === intentos - 1) {
        console.log(`   fallo ${path}: ${e.message}`);
        return null;
      }
      await sleep(1000 * (i + 1));
    }
  }
  return null;
}

// Ligas VCT: "VCT 2026: Americas Stage 2" -> AMERICAS
const VCT_LEAGUE = /^VCT\s+(\d{4}):\s*(Americas|EMEA|Pacific|China)/i;
const LEAGUE_BUCKET = {
  americas: 'AMERICAS',
  emea: 'EMEA',
  pacific: 'PACIFIC',
  china: 'CN'
};

/**
 * Deriva los equipos VCT partner desde los partidos, en vez de una lista fija
 * escrita a mano: las franquicias cambian (fusiones, renombres) y una lista
 * hardcodeada envejece mal.
 *
 * Sólo se usan partidos COMPLETADOS (/results). Se probó incluir también
 * /matches (próximos) y mete falsos positivos: equipos de clasificatorios
 * y Ascension que la API agrupa bajo el nombre de la liga sin ser partner
 * (Eintracht Frankfurt, Joblife, REBORN, Enterprise en EMEA). Filtrando por
 * partidos ya jugados salen exactamente los 12 de cada liga.
 */
async function derivarPartners(paginas) {
  const partners = new Map();

  const registrar = (m) => {
    const mt = VCT_LEAGUE.exec(m.tournament || '');
    if (!mt) return;
    const bucket = LEAGUE_BUCKET[mt[2].toLowerCase()];
    if (!bucket) return;
    for (const t of m.teams || []) {
      if (!t?.id) continue;
      partners.set(String(t.id), {
        vlr_id: String(t.id),
        name: t.name,
        img: t.logo || null,
        country: t.country || null,
        region: bucket,
        league: m.tournament
      });
    }
  };

  for (let page = 1; page <= paginas; page++) {
    const j = await get(`/results?page=${page}`);
    const d = j?.data || [];
    if (!d.length) break;
    for (const m of d) registrar(m);
    process.stdout.write(`\r   resultados pág ${page}/${paginas} -> ${partners.size} equipos`);
    await sleep(200);
  }
  process.stdout.write('\n');

  return [...partners.values()];
}

/** Recorre todas las páginas de /teams para un código de subregión. */
async function listarEquipos(code, bucket) {
  const out = [];
  let page = 1;
  let totalPages = 1;

  do {
    const j = await get(`/teams?page=${page}&region=${code}`);
    if (!j) break;
    totalPages = j.pagination?.totalPages || 1;
    for (const t of j.data || []) {
      out.push({
        vlr_id: String(t.id),
        name: t.name,
        img: t.img || null,
        country: t.country || null,
        region: bucket
      });
    }
    page++;
    await sleep(250);
  } while (page <= totalPages);

  return out;
}

/**
 * Normaliza una URL de imagen. Devuelve null si no sirve.
 *
 * vlr.gg entrega /img/base/ph/sil.png (silueta) para gente sin foto. Esa URL
 * vive en vlr.gg, que responde 403 a todo, así que en el navegador sale rota:
 * conviene guardarla como null y dejar que la UI muestre el respaldo.
 */
function imagenUtil(url) {
  if (!url || !url.startsWith('http')) return null;
  if (/vlr\.gg\/img\/base\/ph\//.test(url)) return null;
  return url;
}

/** Trae el detalle de un equipo: tag, logo y roster con fotos. */
async function detalleEquipo(vlr_id) {
  const j = await get(`/teams/${vlr_id}`);
  if (!j?.data) return null;
  const d = j.data;

  const personas = [];
  const push = (arr, role) => {
    for (const p of arr || []) {
      if (!p?.id) continue;
      personas.push({
        id: String(p.id),
        team_vlr_id: String(vlr_id),
        user: p.user || p.name || null,
        name: p.name || null,
        img: imagenUtil(p.img),
        country: p.country || null,
        role,
        staff_tag: p.tag || null,
        url: p.url || null,
        updated_at: new Date().toISOString()
      });
    }
  };

  push(d.players, 'player');
  push(d.staff, 'staff');
  push(d.inactive, 'inactive');

  return {
    tag: d.info?.tag || null,
    logo: imagenUtil(d.info?.logo),
    personas
  };
}

/** Ejecuta tareas con concurrencia limitada. */
async function enLotes(items, concurrencia, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += concurrencia) {
    const lote = items.slice(i, i + concurrencia);
    out.push(...await Promise.all(lote.map(fn)));
    process.stdout.write(`\r   ${Math.min(i + concurrencia, items.length)}/${items.length}`);
    await sleep(200);
  }
  process.stdout.write('\n');
  return out;
}

async function run() {
  console.log(`Fuente: ${API}`);
  if (dryRun) console.log('MODO DRY-RUN: no se escribe en la base\n');

  // 1) listar equipos
  let equipos = [];

  if (partnersOnly) {
    console.log('Derivando equipos VCT partner desde los partidos...');
    equipos = await derivarPartners(paginasResultados);
    for (const b of Object.keys(BUCKETS)) {
      const n = equipos.filter(e => e.region === b).length;
      console.log(`${b.padEnd(9)} -> ${n} equipos partner`);
    }
    if (onlyRegion) equipos = equipos.filter(e => e.region === onlyRegion);
  } else {
    for (const [bucket, codes] of Object.entries(buckets)) {
      for (const code of codes) {
        const lista = await listarEquipos(code, bucket);
        console.log(`${bucket.padEnd(9)} ${code.padEnd(4)} -> ${lista.length} equipos`);
        equipos.push(...lista);
      }
    }
  }

  // dedupe por vlr_id (un equipo puede aparecer en dos subregiones)
  equipos = [...new Map(equipos.map(e => [e.vlr_id, e])).values()];
  if (limit) equipos = equipos.slice(0, limit);
  console.log(`\nTotal equipos únicos: ${equipos.length}\n`);

  // 2) detalle + roster
  console.log('Trayendo rosters...');
  const detalles = await enLotes(equipos, 4, async (e) => {
    const d = await detalleEquipo(e.vlr_id);
    return { equipo: e, detalle: d };
  });

  const filasEquipos = [];
  const filasPlayers = [];

  for (const { equipo, detalle } of detalles) {
    const fila = {
      name: equipo.name,
      vlr_id: equipo.vlr_id,
      img: detalle?.logo || equipo.img || null,
      region: equipo.region,
      country: equipo.country,
      tag: detalle?.tag || null,
      updated_at: new Date().toISOString()
    };

    // Sólo se tocan `partner`/`league` cuando la corrida los derivó. En una
    // corrida completa se omiten para no borrar las marcas de una previa.
    if (equipo.league) {
      fila.partner = true;
      fila.league = equipo.league;
    }

    filasEquipos.push(fila);
    if (detalle?.personas) filasPlayers.push(...detalle.personas);
  }

  const conFoto = filasPlayers.filter(p => p.img).length;
  console.log(`\nEquipos: ${filasEquipos.length}`);
  console.log(`Personas: ${filasPlayers.length} (con foto: ${conFoto})`);

  if (dryRun) {
    console.log('\nMuestra equipo:', JSON.stringify(filasEquipos[0], null, 2));
    console.log('Muestra persona:', JSON.stringify(filasPlayers[0], null, 2));
    return;
  }

  // 3) guardar en tandas (Supabase limita el tamaño del payload)
  const fallos = [];

  const guardar = async (tabla, filas, onConflict) => {
    let ok = 0;
    for (let i = 0; i < filas.length; i += 200) {
      const chunk = filas.slice(i, i + 200);
      const { error } = await supabase.from(tabla).upsert(chunk, { onConflict });
      if (error) {
        fallos.push(`${tabla}: ${error.message}`);
        console.error(`  error ${tabla}:`, error.message);
      } else {
        ok += chunk.length;
      }
    }
    console.log(`  ${tabla}: ${ok}/${filas.length} guardadas`);
    return ok;
  };

  console.log('\nGuardando equipos...');
  await guardar('teams', filasEquipos, 'name');

  console.log('Guardando jugadores...');
  await guardar('players', filasPlayers, 'id');

  if (fallos.length) {
    const unicos = [...new Set(fallos)];
    console.error('\nFALLÓ el guardado:');
    unicos.forEach(f => console.error('  - ' + f));
    if (unicos.some(f => /column|schema cache|does not exist/i.test(f))) {
      console.error('\nParece que falta la migración. Corré sql/001_teams_players.sql');
      console.error('en Supabase → SQL Editor y volvé a intentar.');
    }
    process.exit(1);
  }

  console.log('\nListo.');
}

run().catch(e => {
  console.error('Error crítico:', e.message);
  process.exit(1);
});
