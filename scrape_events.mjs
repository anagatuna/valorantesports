import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

/**
 * Sincroniza la tabla `events` y enlaza cada partido con su torneo.
 *
 * Fuente: vlr.orlandomm.net, que expone los eventos con el mismo id que usa
 * vlr.gg en /event/<id>. No scrapeamos vlr.gg aquí porque su lista de eventos
 * está paginada y esta API ya la entrega resuelta.
 *
 * El enlace se hace por nombre: los partidos traen `tournament` como texto y
 * los eventos traen `name`. Medido sobre 150 partidos contra 68 eventos, cruza
 * el 100%. Aun así guardamos el id resuelto, no el nombre, para que la FK
 * aguante si el torneo se renombra.
 *
 * Uso:
 *   node scrape_events.mjs          -> escribe en Supabase
 *   node scrape_events.mjs --dry    -> solo reporta, no escribe
 */

const API = 'https://vlr.orlandomm.net/api/v1';
const DRY = process.argv.includes('--dry');
const MAX_PAGES = 4; // 50 por página

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const norm = (s) => String(s || '').trim().toLowerCase();

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  const j = await r.json();
  return Array.isArray(j?.data) ? j.data : [];
}

/** Recorre páginas hasta que una venga vacía o se acabe el tope. */
async function getAllPages(path) {
  const out = [];
  for (let p = 1; p <= MAX_PAGES; p++) {
    const batch = await getJson(`${API}/${path}?page=${p}`);
    if (batch.length === 0) break;
    out.push(...batch);
  }
  return out;
}

async function main() {
  console.log(`📡 Sincronizando eventos${DRY ? ' (dry run)' : ''}...`);

  // --- 1. EVENTOS ---
  // getAllPages, no getJson: sin paginar solo entraba la primera página (69 de
  // 219), y lo que se quedaba fuera era justo lo ya terminado — entre ello todo
  // el circuito collegiate, que hacía que el filtro CG saliera siempre vacío.
  const events = await getAllPages('events');
  console.log(`   ✅ ${events.length} eventos en la fuente.`);

  const rows = events
    .filter((e) => e?.id && e?.name)
    .map((e) => ({
      id: String(e.id),
      name: e.name.trim(),
      status: e.status || null,
      prizepool: e.prizepool || null,
      dates: e.dates || null,
      country: e.country || null,
      img: e.img || null,
      updated_at: new Date(),
    }));

  if (!DRY) {
    const { error } = await supabase.from('events').upsert(rows);
    if (error) {
      console.error('   ❌ Error guardando eventos:', error.message);
      process.exit(1);
    }
    console.log(`   💾 ${rows.length} eventos guardados.`);
  }

  // --- 2. PARTIDOS -> EVENTO ---
  const [upcoming, results] = await Promise.all([
    getAllPages('matches'),
    getAllPages('results'),
  ]);
  const all = [...new Map([...upcoming, ...results].map((m) => [String(m.id), m])).values()];
  console.log(`   ✅ ${all.length} partidos en la fuente.`);

  const byName = new Map(rows.map((e) => [norm(e.name), e]));

  // Solo tocamos partidos que ya existen: `matches` la llena scrape_batch.mjs,
  // aquí únicamente completamos las columnas del torneo.
  const { data: existing, error: readErr } = await supabase
    .from('matches')
    .select('id')
    .range(0, 4999);
  if (readErr) {
    console.error('   ❌ Error leyendo matches:', readErr.message);
    process.exit(1);
  }
  const known = new Set((existing || []).map((r) => String(r.id)));

  const updates = [];
  const sinEvento = [];
  let fuera = 0;

  for (const m of all) {
    if (!known.has(String(m.id))) { fuera++; continue; }
    const ev = byName.get(norm(m.tournament));
    if (!ev) { sinEvento.push(m.tournament); continue; }
    updates.push({
      id: String(m.id),
      event_id: ev.id,
      event_name: ev.name,
      match_stage: m.event || null, // "Group Stage–Week 3"
    });
  }

  console.log(`   🔗 ${updates.length} partidos enlazados.`);
  if (fuera) console.log(`   ↷ ${fuera} no están todavía en nuestra tabla (los trae scrape_batch).`);
  if (sinEvento.length) {
    console.log(`   ⚠️ ${sinEvento.length} sin evento que cruce:`);
    [...new Set(sinEvento)].slice(0, 5).forEach((n) => console.log(`      - ${JSON.stringify(n)}`));
  }

  if (DRY) {
    console.log('\n   (dry run: no se escribió nada)');
    console.log('   muestra:', JSON.stringify(updates.slice(0, 3), null, 1));
    return;
  }

  // update por id en vez de upsert: un upsert sin las demás columnas dejaría
  // en NULL el marcador y los equipos de las filas existentes.
  let ok = 0;
  for (const u of updates) {
    const { id, ...fields } = u;
    const { error } = await supabase.from('matches').update(fields).eq('id', id);
    if (error) console.error(`   ❌ ${id}: ${error.message}`);
    else ok++;
  }
  console.log(`   💾 ${ok}/${updates.length} partidos actualizados.`);
}

main().catch((e) => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
