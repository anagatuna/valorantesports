import * as cheerio from 'cheerio';
import axios from 'axios';
import https from 'https';
import crypto from 'crypto';

/**
 * Lee el mapa en curso de un partido directo de vlr.gg.
 *
 * Los selectores son los mismos que usa scrape_batch.mjs, que lleva tiempo
 * corriendo en GitHub Actions: si vlr.gg los cambia, se rompen los dos a la vez
 * y se arreglan en un solo sitio conceptual.
 *
 * vlr.gg publica el detalle ronda a ronda de forma desigual: en eventos tier 1
 * (VCT) suele estar completo y al momento, en Game Changers o Challengers puede
 * ir con retraso o no existir. Por eso todo aqui degrada a null en vez de
 * inventar ceros, que el cliente interpretaria como "0 rondas jugadas".
 */

// vlr.gg exige renegociacion legacy; sin esto Node tira EPROTO.
const httpsAgent = new https.Agent({
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
  rejectUnauthorized: false,
});

const client = axios.create({
  httpsAgent,
  timeout: 5000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  },
});

const clean = (s) => (s ? String(s).replace(/[\n\t\r]/g, ' ').replace(/\s+/g, ' ').trim() : '');

// null (no 0) cuando no hay dato: distingue "0 rondas" de "vlr.gg no lo publica".
const toInt = (s) => {
  const m = clean(s).match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
};

const isOverviewTab = (name) => {
  const n = name.toLowerCase();
  return n.includes('all') || n.includes('overview');
};

/** Un mapa se da por cerrado con 13 (o mas, si hubo prorroga) y 2 de ventaja. */
function mapLooksFinished(a, b) {
  if (a == null || b == null) return false;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi >= 13 && hi - lo >= 2) || hi >= 14;
}

function parseMapTabs($) {
  let nav = $('.vm-stats-gamesnav-item');
  if (nav.length === 0) nav = $('.vm-stats-games-nav-item');
  if (nav.length === 0) nav = $('.js-map-switch');

  const tabs = [];
  nav.each((_, el) => {
    const id = $(el).attr('data-game-id');
    if (!id) return;
    // El texto viene como "2 Breeze 13:8"; quitamos el indice y el marcador.
    const raw = clean($(el).text()).replace(/^\d+\s+/, '');
    const sc = raw.match(/(\d+)[:\-\s]+(\d+)/);
    const name = sc ? raw.replace(sc[0], '').trim() : raw;
    if (!name || isOverviewTab(name)) return;
    tabs.push({ id, name });
  });
  return tabs;
}

/** Rondas por lado de un mapa concreto, o null si vlr.gg no las publica. */
function parseGameRounds($, gameId) {
  const game = $(`.vm-stats-game[data-game-id="${gameId}"]`);
  if (game.length === 0) return null;

  const teams = game.find('.vm-stats-game-header .team');
  if (teams.length < 2) return null;

  const t1 = $(teams[0]);
  const t2 = $(teams[1]);
  const rounds = {
    t1_ct: toInt(t1.find('.mod-ct').text()),
    t1_t: toInt(t1.find('.mod-t').text()),
    t2_ct: toInt(t2.find('.mod-ct').text()),
    t2_t: toInt(t2.find('.mod-t').text()),
  };

  // Sin ningun lado informado no hay nada util que devolver.
  if (Object.values(rounds).every((v) => v == null)) return null;

  const score1 = toInt(t1.find('.score').first().text());
  const score2 = toInt(t2.find('.score').first().text());
  return { ...rounds, score1, score2 };
}

/**
 * Devuelve el mapa en juego: el ultimo con datos que aun no esta cerrado. Si
 * todos estan cerrados (hueco entre mapas) devolvemos el ultimo jugado, que es
 * lo que la card debe seguir mostrando.
 */
function pickCurrentMap($, tabs) {
  const played = [];
  for (const tab of tabs) {
    const r = parseGameRounds($, tab.id);
    if (r) played.push({ ...tab, ...r });
  }
  if (played.length === 0) return null;

  const open = played.filter((m) => !mapLooksFinished(m.score1, m.score2));
  return open.length > 0 ? open[open.length - 1] : played[played.length - 1];
}

/**
 * Parseo puro, separado de la red para poder probarlo con HTML fijo.
 *
 * @returns {null | {current_map, best_of, series1, series2, isFinal,
 *   team_1_round_ct, team_1_round_t, team_2_round_ct, team_2_round_t}}
 */
export function parseMatchHtml(html) {
  if (!html) return null;
  try {
    const $ = cheerio.load(html);

    const note = clean($('.match-header-vs-note').text()).toLowerCase();
    const isFinal = note.includes('final') || note.includes('completed');

    const headerScore = clean($('.match-header-vs-score').text()).match(/(\d+)[:\-\s]+(\d+)/);
    const series1 = headerScore ? parseInt(headerScore[1], 10) : null;
    const series2 = headerScore ? parseInt(headerScore[2], 10) : null;

    const boMatch = note.match(/bo\s*(\d)/i);
    const best_of = boMatch ? parseInt(boMatch[1], 10) : null;

    const current = pickCurrentMap($, parseMapTabs($));

    return {
      current_map: current?.name ?? null,
      best_of,
      series1,
      series2,
      isFinal,
      team_1_round_ct: current?.t1_ct ?? null,
      team_1_round_t: current?.t1_t ?? null,
      team_2_round_ct: current?.t2_ct ?? null,
      team_2_round_t: current?.t2_t ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Corte de circuito: si vlr.gg no responde (caido, bloqueado por red, rate
 * limit) cada refresco pagaria el timeout completo por partido. Tras varios
 * fallos seguidos dejamos de intentarlo un rato y la ruta responde al instante
 * con el marcador de mapas, que es lo que ya tenia.
 */
const FAILS_TO_OPEN = 3;
const COOLDOWN_MS = 5 * 60_000;
let consecutiveFails = 0;
let openUntil = 0;

export function isCircuitOpen() {
  return Date.now() < openUntil;
}

/**
 * @returns {Promise<null | ReturnType<typeof parseMatchHtml>>}
 *   null si no se pudo leer nada (vlr.gg caido, bloqueado o sin cobertura).
 */
export async function fetchLiveMapDetail(matchId) {
  if (isCircuitOpen()) return null;

  try {
    const res = await client.get(`https://www.vlr.gg/${matchId}`);
    consecutiveFails = 0;
    return parseMatchHtml(res.data);
  } catch {
    consecutiveFails += 1;
    if (consecutiveFails >= FAILS_TO_OPEN) {
      openUntil = Date.now() + COOLDOWN_MS;
      consecutiveFails = 0;
    }
    return null;
  }
}
