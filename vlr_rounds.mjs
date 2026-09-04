/**
 * Desglose ronda a ronda de un mapa, tal y como lo publica vlr.gg.
 *
 * En la pagina del partido cada mapa (.vm-stats-game[data-game-id]) trae un
 * bloque .vlr-rounds con una columna por ronda:
 *
 *   <div class="vlr-rounds-row-col" title="2-3">   <- marcador ACUMULADO
 *     <div class="rnd-num">5</div>
 *     <div class="rnd-sq mod-win mod-ct"><img src="/img/vlr/game/round/elim.webp"></div>
 *     <div class="rnd-sq "></div>                  <- el perdedor va vacio
 *   </div>
 *
 * Los dos .rnd-sq van en el mismo orden que el header del mapa, o sea equipo A
 * y luego equipo B: el mismo orden que t1_ct/t2_ct en match_maps.
 *
 * Ademas de las columnas de ronda hay dos que NO lo son y hay que descartar:
 * la primera (los nombres de los equipos, sin title ni .rnd-num) y las
 * .mod-spacing, que solo son el hueco del descanso.
 *
 * vlr.gg publica esto de forma desigual: en tier 1 suele estar completo, en
 * Challengers o partidos viejos puede no existir. Por eso devolvemos null en
 * vez de un array vacio, para poder distinguir "no lo publica" de "0 rondas".
 */

// Los cuatro finales posibles, sacados del nombre del icono que pinta vlr.gg.
const HOW_BY_ICON = {
  elim: 'elim', // aniquilacion del equipo rival
  defuse: 'defuse', // desactivada la spike
  boom: 'boom', // la spike exploto
  time: 'time', // se acabo el tiempo (ganan los defensores)
};

function howFromIcon(src) {
  if (!src) return null;
  const file = String(src).split('/').pop() || '';
  const name = file.split('.')[0].toLowerCase();
  return HOW_BY_ICON[name] || null;
}

/** "ct" | "t" del cuadro ganador, o null si vlr.gg no marco el lado. */
function sideFromClass(cls) {
  const c = ` ${cls || ''} `;
  if (c.includes(' mod-ct ')) return 'ct';
  if (c.includes(' mod-t ')) return 't';
  return null;
}

/**
 * @returns {Array|null} [{ n, w, side, how, score }] o null si no hay bloque.
 *   n     numero de ronda (1..n, tal cual lo escribe vlr.gg)
 *   w     1 o 2 -> equipo A o equipo B
 *   side  "ct" | "t" del ganador en esa ronda
 *   how   "elim" | "defuse" | "boom" | "time" | null
 *   score marcador acumulado tras la ronda, "5-4" (A-B)
 */
export function parseMapRounds($, gameId) {
  const block = $(`.vm-stats-game[data-game-id="${gameId}"]`).find('.vlr-rounds');
  if (block.length === 0) return null;

  const rounds = [];

  block.find('.vlr-rounds-row-col').each((_, el) => {
    const col = $(el);
    if (col.hasClass('mod-spacing')) return; // hueco del descanso
    const numTxt = col.find('.rnd-num').first().text().trim();
    if (!numTxt) return; // la columna de los nombres de equipo

    const n = parseInt(numTxt, 10);
    if (!Number.isFinite(n)) return;

    const squares = col.find('.rnd-sq');
    if (squares.length < 2) return;

    const winIdx = squares.toArray().findIndex((sq) => $(sq).hasClass('mod-win'));
    // Ronda sin ganador marcado: el mapa esta en curso y aun no se ha jugado.
    if (winIdx === -1) return;

    const winner = $(squares[winIdx]);
    rounds.push({
      n,
      w: winIdx === 0 ? 1 : 2,
      side: sideFromClass(winner.attr('class')),
      how: howFromIcon(winner.find('img').first().attr('src')),
      score: col.attr('title')?.trim() || null,
    });
  });

  return rounds.length ? rounds : null;
}
