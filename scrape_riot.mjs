/**
 * Trae los assets OFICIALES de Riot (logo de equipo y foto de jugador) desde
 * la API de esports y los guarda en `teams.riot_img` / `players.riot_img`,
 * emparejando contra las filas que ya dejó scrape_roster.mjs (vlr.gg).
 *
 * POR QUÉ
 * -------
 * vlr.gg sirve avatares subidos por la comunidad: baja resolución, fondos
 * distintos y —lo peor— desactualizados, con jugadores luciendo la jersey de
 * su equipo anterior. Las de Riot son la sesión de estudio del media day de
 * cada liga: mismo fondo, misma luz, la jersey correcta de la temporada.
 *
 * CÓMO SE LLEGA AL ROSTER
 * -----------------------
 * No hay un endpoint directo. El namespace /persisted/val/ sólo tiene
 * getLeagues, getSchedule, getStandings y getEventDetails: pedirle getTeams
 * o getRosters devuelve 400. Pero la base de equipos es COMÚN con la de LoL,
 * así que el id de un equipo de VALORANT sí resuelve en /persisted/gw/. La
 * cadena es:
 *
 *   val/getSchedule?leagueId   -> un partido ya jugado
 *   val/getEventDetails?id     -> el tournamentId de ese partido
 *   val/getStandings?tournamentId -> los 12-16 equipos CON su id de Riot
 *   gw/getTeams?id=<teamId>    -> el roster, con foto oficial por persona
 *
 * Ojo: gw/getTeams SIN id devuelve sólo equipos de LoL. Hay que pedirlo por
 * id, y el id tiene que salir del lado `val`.
 *
 * HOST
 * ----
 * Se usa prod-relapi.ewp.gg y no esports-api.lolesports.com: son la misma
 * API, pero el segundo lo intercepta el filtro TLS de algunas redes (da
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE desde Node). Con --probe se ve cuál
 * responde desde donde estés.
 *
 * Uso:
 *   node scrape_riot.mjs --probe       # qué responde y qué no
 *   node scrape_riot.mjs --dry-run     # ver el emparejamiento sin escribir
 *   node scrape_riot.mjs               # escribir en la base
 *   node scrape_riot.mjs --verbose     # listar cada foto emparejada
 *   node scrape_riot.mjs --solo-equipos  # saltarse los rosters
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

/**
 * Clave pública del front de esports de Riot. No es un secreto: va incrustada
 * en el bundle de lolesports/valorantesports, es la misma para todos y no
 * está atada a ninguna cuenta. Sobreescribible por si Riot la rota.
 */
const DEFAULT_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';

const HOSTS = [
  'https://prod-relapi.ewp.gg',
  'https://esports-api.lolesports.com'
];

// Ids de /persisted/val/getLeagues?sport=val. Fijos a mano: son estables y
// así una caída del endpoint de ligas no tumba el script entero.
const LIGAS = {
  AMERICAS: '109974795266458277',
  EMEA: '106109559530232966',
  PACIFIC: '109974804058058602',
  CN: '111691194187846945'
};

// --- argumentos ---
const args = process.argv.slice(2);
const getArg = (n) => {
  const hit = args.find(a => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : null;
};
const probe = args.includes('--probe');
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const soloEquipos = args.includes('--solo-equipos');
const KEY = getArg('key') || process.env.RIOT_ESPORTS_KEY || DEFAULT_KEY;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const supabase = probe ? null : createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/**
 * Distingue los tres fracasos que importan, porque el diagnóstico cambia:
 *   'red'  -> no salió del equipo (proxy corporativo, DNS, TLS interceptado)
 *   'http' -> contestó con error (400 = la operación no existe aquí)
 *   'json' -> 200 con HTML, típica página de un filtro intermedio
 */
async function get(url, intentos = 3) {
  for (let i = 0; i < intentos; i++) {
    let res;
    try {
      res = await fetch(url, {
        headers: {
          'x-api-key': KEY,
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
    } catch (e) {
      // TLS y DNS no se arreglan reintentando.
      return { fallo: 'red', detalle: e.cause?.code || e.message };
    }

    if (res.status === 429 || res.status === 502) {
      await sleep(2000 * (i + 1));
      continue;
    }
    if (!res.ok) return { fallo: 'http', detalle: `HTTP ${res.status}`, status: res.status };

    const texto = await res.text();
    try {
      return { data: JSON.parse(texto) };
    } catch {
      return {
        fallo: 'json',
        detalle: /fortinet|blocked|access denied/i.test(texto)
          ? 'HTML: hay un filtro de red por medio'
          : `no-JSON (${texto.slice(0, 60).replace(/\s+/g, ' ')}...)`
      };
    }
  }
  return { fallo: 'http', detalle: 'error persistente tras reintentos' };
}

async function elegirHost() {
  for (const h of HOSTS) {
    const r = await get(`${h}/persisted/val/getLeagues?hl=en-US&sport=val`, 1);
    if (r.data) return h;
  }
  return null;
}

/**
 * Normaliza una URL de imagen de Riot, o null si no sirve.
 *
 * Se descartan los marcadores de posición: `default-headshot.png` para gente
 * sin foto y `team-tbd.png` para el rival por decidir. Guardarlos sería peor
 * que no tener nada, porque taparían la foto real de vlr.gg — que en la
 * mayoría de esos casos sí existe.
 *
 * El CDN devuelve http://; se fuerza https o el navegador lo bloquea por
 * contenido mixto al servir la app sobre TLS.
 */
const imagen = (v) => {
  if (typeof v !== 'string' || !/^https?:\/\//.test(v)) return null;
  if (/default-headshot|team-tbd/i.test(v)) return null;
  return v.replace(/^http:/, 'https:');
};

// ---------------------------------------------------------------------------
// Riot: equipos y rosters
// ---------------------------------------------------------------------------

/** Un tournamentId cualquiera de la liga, sacado de un partido ya jugado. */
async function tournamentDeLiga(host, leagueId) {
  const r = await get(`${host}/persisted/val/getSchedule?hl=en-US&sport=val&leagueId=${leagueId}`);
  if (!r.data) return { error: `${r.fallo}: ${r.detalle}` };

  const eventos = r.data.data?.schedule?.events || [];
  const jugados = eventos.filter(e => e.state === 'completed' && e.match?.id);
  if (!jugados.length) return { error: 'la liga no tiene partidos jugados' };

  const ed = await get(
    `${host}/persisted/val/getEventDetails?hl=en-US&sport=val&id=${jugados[jugados.length - 1].match.id}`);
  if (!ed.data) return { error: `getEventDetails -> ${ed.fallo}: ${ed.detalle}` };

  const tid = ed.data.data?.event?.tournament?.id;
  return tid ? { tid } : { error: 'el partido no trae tournamentId' };
}

/**
 * Equipos de la liga CON su id de Riot. Salen de los standings del torneo:
 * el calendario trae nombre y logo pero no id, y sin id no hay roster.
 */
async function equiposDeLiga(host, leagueId) {
  const { tid, error } = await tournamentDeLiga(host, leagueId);
  if (error) return { error, equipos: [] };

  const r = await get(`${host}/persisted/val/getStandings?hl=en-US&sport=val&tournamentId=${tid}`);
  if (!r.data) return { error: `getStandings -> ${r.fallo}: ${r.detalle}`, equipos: [] };

  // Los standings anidan stages > sections > rankings > teams. Se recorre en
  // bruto porque la profundidad cambia según el formato del torneo.
  const equipos = new Map();
  const visitar = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visitar);
    if (n.id && n.name && n.name !== 'TBD' && n.code && !equipos.has(String(n.id))) {
      equipos.set(String(n.id), {
        riot_id: String(n.id),
        name: n.name,
        tag: n.code,
        img: imagen(n.image)
      });
    }
    Object.values(n).forEach(visitar);
  };
  visitar(r.data);

  return { equipos: [...equipos.values()] };
}

/** Roster de un equipo. Requiere el id de Riot; va por el namespace `gw`. */
async function rosterDeEquipo(host, riotId) {
  const r = await get(`${host}/persisted/gw/getTeams?hl=en-US&id=${riotId}`);
  if (!r.data) return null;

  const t = r.data.data?.teams?.[0];
  if (!t) return null;

  return (t.players || []).map(p => ({
    riot_id: p.id != null ? String(p.id) : null,
    nick: p.summonerName || null,
    realName: [p.firstName, p.lastName].filter(Boolean).join(' ') || null,
    img: imagen(p.image)
  })).filter(p => p.nick);
}

// ---------------------------------------------------------------------------
// Emparejamiento
// ---------------------------------------------------------------------------

/** "KRÜ Visa" -> "kruvisa";  "Leviatán Esports" -> "leviatanesports" */
const norm = (s) => (s || '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

/**
 * Riot y vlr.gg no nombran igual a todos los equipos. Se amplía a mano cuando
 * el informe final liste equipos sin cruzar.
 * clave: nombre normalizado de Riot -> nombre normalizado en nuestra base
 */
const ALIAS = {
  navi: 'natusvincere',
  nrg: 'nrgesports'
};

async function cargarBase() {
  const { data: teams, error: e1 } = await supabase
    .from('teams')
    .select('name, vlr_id, tag')
    .not('vlr_id', 'is', null);
  if (e1) throw new Error(`leyendo teams: ${e1.message}`);

  const { data: players, error: e2 } = await supabase
    .from('players')
    .select('id, team_vlr_id, "user", name');
  if (e2) throw new Error(`leyendo players: ${e2.message}`);

  return { teams: teams || [], players: players || [] };
}

/**
 * Respaldo cuando el nick no coincide exacto: Riot abrevia algunos ("Cryo"
 * por "Cryocells"). Se acepta sólo si uno de los dos es prefijo del otro, con
 * al menos 4 caracteres, y hay UN único candidato en el equipo. Sin la
 * comprobación de unicidad esto emparejaría mal en cuanto dos compañeros
 * compartan raíz.
 */
function porPrefijo(nickRiot, candidatos) {
  const a = norm(nickRiot);
  if (a.length < 4) return null;

  const hits = candidatos.filter(c => {
    const b = norm(c.user);
    return b.length >= 4 && (a.startsWith(b) || b.startsWith(a));
  });
  return hits.length === 1 ? hits[0] : null;
}

function cruzar(riotTeam, porNombre, porTag) {
  const n = norm(riotTeam.name);
  return porNombre.get(ALIAS[n] || n)
    || (riotTeam.tag ? porTag.get(norm(riotTeam.tag)) : null)
    || null;
}

/** Tareas con concurrencia limitada: la API es de Riot, hay que ser amable. */
async function enLotes(items, concurrencia, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += concurrencia) {
    out.push(...await Promise.all(items.slice(i, i + concurrencia).map(fn)));
    process.stdout.write(`\r   ${Math.min(i + concurrencia, items.length)}/${items.length}`);
    await sleep(200);
  }
  process.stdout.write('\n');
  return out;
}

// ---------------------------------------------------------------------------
// Modos
// ---------------------------------------------------------------------------

async function correrProbe() {
  console.log(`Clave: ${KEY.slice(0, 8)}...${KEY.slice(-4)}\n`);

  console.log('Hosts:');
  for (const h of HOSTS) {
    const r = await get(`${h}/persisted/val/getLeagues?hl=en-US&sport=val`, 1);
    console.log(`  ${r.data ? 'OK   ' : 'fallo'} ${h.replace('https://', '')}`
      + (r.data ? '' : `  ${r.fallo}: ${r.detalle}`));
  }

  const host = await elegirHost();
  if (!host) {
    console.log('\nNingún host responde. Si todos dan "red", es tu conexión:');
    console.log('probá desde otra red o desactivá el filtro TLS.');
    return;
  }

  console.log(`\nCadena hasta el roster (host ${host.replace('https://', '')}):`);
  const { tid, error } = await tournamentDeLiga(host, LIGAS.AMERICAS);
  console.log(`  tournamentId AMERICAS  ${tid || error}`);
  if (tid) {
    const { equipos, error: e2 } = await equiposDeLiga(host, LIGAS.AMERICAS);
    console.log(`  standings              ${e2 || `${equipos.length} equipos con id`}`);
    if (equipos[0]) {
      const roster = await rosterDeEquipo(host, equipos[0].riot_id);
      console.log(`  roster ${equipos[0].name.padEnd(14)} ${roster
        ? `${roster.length} personas, ${roster.filter(p => p.img).length} con foto`
        : 'sin datos'}`);
      if (roster?.[0]) console.log(`  ejemplo                ${roster[0].nick} -> ${roster[0].img}`);
    }
  }

  console.log('\nEquipos por liga:');
  for (const [bucket, id] of Object.entries(LIGAS)) {
    const { equipos, error: e } = await equiposDeLiga(host, id);
    console.log(`  ${bucket.padEnd(9)} ${e || `${equipos.length} equipos`}`);
  }
}

async function correrSync() {
  const host = await elegirHost();
  if (!host) {
    console.error('Ningún host de la API responde. Corré --probe para ver por qué.');
    process.exit(1);
  }
  console.log(`Host: ${host}\n`);

  // 1) equipos oficiales con id
  const riotTeams = [];
  for (const [bucket, id] of Object.entries(LIGAS)) {
    const { equipos, error } = await equiposDeLiga(host, id);
    if (error) {
      console.error(`  ${bucket.padEnd(9)} ${error}`);
      continue;
    }
    console.log(`  ${bucket.padEnd(9)} ${equipos.length} equipos`);
    riotTeams.push(...equipos.map(e => ({ ...e, bucket })));
    await sleep(200);
  }

  // 2) rosters
  let rosters = new Map();
  if (!soloEquipos) {
    console.log('\nTrayendo rosters...');
    const res = await enLotes(riotTeams, 4, async (t) => ({
      id: t.riot_id,
      personas: await rosterDeEquipo(host, t.riot_id)
    }));
    rosters = new Map(res.filter(r => r.personas).map(r => [r.id, r.personas]));
    const tot = [...rosters.values()].flat();
    console.log(`  ${tot.length} personas, ${tot.filter(p => p.img).length} con foto oficial`);
  }

  // 3) emparejar
  const { teams: nuestros, players: nuestrasPersonas } = await cargarBase();
  const porNombre = new Map(nuestros.map(t => [norm(t.name), t]));
  const porTag = new Map(nuestros.filter(t => t.tag).map(t => [norm(t.tag), t]));
  const porEquipo = new Map();
  for (const p of nuestrasPersonas) {
    if (!porEquipo.has(p.team_vlr_id)) porEquipo.set(p.team_vlr_id, []);
    porEquipo.get(p.team_vlr_id).push(p);
  }
  console.log(`\nBase: ${nuestros.length} equipos, ${nuestrasPersonas.length} personas`);

  const filasTeams = [];
  const filasPlayers = [];
  const equiposSinCruzar = [];
  const personasSinCruzar = [];

  for (const rt of riotTeams) {
    const mio = cruzar(rt, porNombre, porTag);
    if (!mio) {
      equiposSinCruzar.push(`${rt.bucket.padEnd(9)} ${rt.name} (${rt.tag})`);
      continue;
    }

    filasTeams.push({
      name: mio.name,
      riot_id: rt.riot_id,
      riot_img: rt.img,
      tag: rt.tag || mio.tag,
      updated_at: new Date().toISOString()
    });

    const candidatos = porEquipo.get(mio.vlr_id) || [];
    const porNick = new Map(candidatos.map(p => [norm(p.user), p]));

    for (const persona of rosters.get(rt.riot_id) || []) {
      if (!persona.img) continue;
      const suyo = porNick.get(norm(persona.nick)) || porPrefijo(persona.nick, candidatos);
      if (!suyo) {
        personasSinCruzar.push(`${rt.name} / ${persona.nick}`);
        continue;
      }
      filasPlayers.push({
        id: suyo.id,
        riot_img: persona.img,
        riot_id: persona.riot_id,
        updated_at: new Date().toISOString()
      });
      if (verbose) {
        console.log(`  ${mio.name.padEnd(20)} ${persona.nick.padEnd(12)} ${persona.img}`);
      }
    }
  }

  console.log(`\nEquipos emparejados:  ${filasTeams.length}/${riotTeams.length}`);
  console.log(`Fotos emparejadas:    ${filasPlayers.length}`);

  if (equiposSinCruzar.length) {
    console.log(`\nEquipos sin equivalente local (${equiposSinCruzar.length}):`);
    equiposSinCruzar.forEach(s => console.log(`  - ${s}`));
    console.log('  -> si alguno debería cruzar, agregalo a ALIAS.');
  }
  if (personasSinCruzar.length) {
    console.log(`\nPersonas de Riot que no están en tu base (${personasSinCruzar.length}):`);
    personasSinCruzar.slice(0, 25).forEach(p => console.log(`  - ${p}`));
    if (personasSinCruzar.length > 25) console.log(`  ... y ${personasSinCruzar.length - 25} más`);
    console.log('  -> son fichajes que vlr.gg todavía no refleja; corré');
    console.log('     scrape_roster.mjs y volvé a pasar este script.');
  }

  if (dryRun) {
    console.log('\nDRY-RUN: no se escribió nada.');
    if (filasPlayers[0]) console.log('Muestra:', JSON.stringify(filasPlayers[0], null, 2));
    return;
  }

  console.log('\nGuardando...');
  const guardar = async (tabla, filas, onConflict) => {
    if (!filas.length) return;
    for (let i = 0; i < filas.length; i += 200) {
      const { error } = await supabase
        .from(tabla).upsert(filas.slice(i, i + 200), { onConflict });
      if (error) {
        console.error(`  error ${tabla}: ${error.message}`);
        if (/riot_img|riot_id|column/i.test(error.message)) {
          console.error('  -> falta la migración: corré sql/004_players_riot.sql.');
        }
        process.exit(1);
      }
    }
    console.log(`  ${tabla}: ${filas.length} guardados`);
  };

  await guardar('teams', filasTeams, 'name');
  await guardar('players', filasPlayers, 'id');
  console.log('\nListo.');
}

const run = probe ? correrProbe : correrSync;

run().catch(e => {
  console.error('Error crítico:', e.message);
  process.exit(1);
});
