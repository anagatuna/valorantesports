/**
 * Extrae el evento de la cabecera de un partido en vlr.gg.
 *
 * La cabecera es un enlace al torneo:
 *   <a href="/event/2776/vct-2026-pacific-stage-2/..." class="match-header-event">
 *     <div>VCT 2026: Pacific Stage 2</div>
 *     <div class="match-header-event-series">Group Stage–Week 4</div>
 *   </a>
 *
 * El id sale del href, que es lo único estable: el nombre puede cambiar a mitad
 * de temporada y los `div` internos no tienen clase propia salvo el de la fase.
 *
 * Todo devuelve null si no se encuentra, nunca cadena vacía, para que quien
 * llame pueda distinguir "no hay evento" de "el evento se llama ''".
 */

const clean = (s) => (s ? String(s).replace(/[\n\t\r]/g, ' ').replace(/\s+/g, ' ').trim() : '');

export function extractEvent($) {
  const link = $('.match-header-event').first();
  if (link.length === 0) return { event_id: null, event_name: null, match_stage: null };

  // /event/<id>/<slug>/<slug-fase>
  const href = link.attr('href') || '';
  const idMatch = href.match(/\/event\/(\d+)/);
  const event_id = idMatch ? idMatch[1] : null;

  const stageEl = link.find('.match-header-event-series');
  const match_stage = clean(stageEl.text()) || null;

  // El nombre es el texto del enlace menos la fase. Lo sacamos así en vez de
  // por posición porque vlr.gg mete divs de layout que varían.
  let event_name = clean(link.text());
  if (match_stage && event_name.endsWith(match_stage)) {
    event_name = clean(event_name.slice(0, -match_stage.length));
  }

  return { event_id, event_name: event_name || null, match_stage };
}

/**
 * Guarda el evento antes de enlazarlo. `matches.event_id` tiene FK contra
 * `events`, así que un evento histórico que no esté en la tabla haría fallar
 * el update. Solo tenemos id y nombre desde la página del partido; el resto de
 * campos los rellena scrape_events.mjs cuando el torneo sigue activo.
 */
export async function ensureEvent(supabase, { event_id, event_name }) {
  if (!event_id || !event_name) return false;

  const { error } = await supabase
    .from('events')
    .upsert({ id: event_id, name: event_name, updated_at: new Date() }, { onConflict: 'id', ignoreDuplicates: false });

  if (error) {
    console.error(`   ❌ No se pudo guardar el evento ${event_id}: ${error.message}`);
    return false;
  }
  return true;
}
