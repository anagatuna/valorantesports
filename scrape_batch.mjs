import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import axios from 'axios';
import https from 'https';
import crypto from 'crypto';

dotenv.config({ path: '.env.local' });

// --- CONFIGURACIÓN DE RED ---
const httpsAgent = new https.Agent({
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    rejectUnauthorized: false
});

const axiosClient = axios.create({
    httpsAgent: httpsAgent,
    headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Connection': 'keep-alive'
    }
});

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// --- CONFIGURACIÓN ---
const URL_UPCOMING = 'https://www.vlr.gg/matches'; 
const URL_RESULTS = 'https://www.vlr.gg/matches/results';
const MAX_MATCHES = 60; 
const DELAY_MS = 2000; 

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const clean = (s) => s ? s.replace(/[\n\t\r]/g, ' ').replace(/\s+/g, ' ').trim() : '';

// 🟢 FIX: Agregamos de nuevo la función que faltaba
const extractInt = (str) => {
    if (!str) return 0;
    const match = str.match(/(\d+)/);
    return match ? parseInt(match[0]) : 0;
};

// --- 1. OBTENER IDs DIRECTAMENTE DE VLR.GG ---
async function extraerIdsDePagina(url) {
    try {
        const { data } = await axiosClient.get(url);
        const $ = cheerio.load(data);
        const ids = [];

        // Buscamos todos los enlaces que parecen partidos
        $('a[href]').each((i, el) => {
            const href = $(el).attr('href');
            // Formato típico: /12345/team-a-vs-team-b
            const match = href.match(/^\/(\d+)\//);
            if (match && $(el).find('.match-item-vs').length > 0) { 
                ids.push(match[1]); // Guardamos solo el ID numérico
            }
        });
        return ids;
    } catch (e) {
        console.error(`❌ Error leyendo lista de ${url}:`, e.message);
        return [];
    }
}

async function obtenerIdsRecientes() {
    console.log("📡 Escaneando vlr.gg (Upcoming + Results)...");
    
    // Obtenemos ambas listas en paralelo
    const [upcomingIds, resultsIds] = await Promise.all([
        extraerIdsDePagina(URL_UPCOMING),
        extraerIdsDePagina(URL_RESULTS)
    ]);

    const all = [...upcomingIds, ...resultsIds];
    // Eliminar duplicados
    const unique = [...new Set(all)];
    
    console.log(`   ✅ Encontrados: ${upcomingIds.length} próximos, ${resultsIds.length} resultados.`);
    return unique.slice(0, MAX_MATCHES);
}

// --- 2. SCRAPING INDIVIDUAL ---
async function scrapearPartido(matchId, index, total) {
    console.log(`\n[${index + 1}/${total}] 🔍 ID: ${matchId}...`);
    try {
        const url = `https://www.vlr.gg/${matchId}`;
        const response = await axiosClient.get(url);
        const $ = cheerio.load(response.data);

        // Datos Generales
        const teamA = clean($('.match-header-link-name').eq(0).text());
        const teamB = clean($('.match-header-link-name').eq(1).text());
        const getLogo = (idx) => {
            let src = $('.match-header-link').eq(idx).find('img').first().attr('src');
            if (src && src.startsWith('//')) src = 'https:' + src;
            return src || null;
        };
        const logoA = getLogo(0);
        const logoB = getLogo(1);

        // FECHA UTC
        let dateStr = $('.match-header-date .moment-tz-convert').attr('data-utc-ts');
        let startDateTime = null;
        if (dateStr) {
            // VLR nos da: "2026-01-23 13:25:00" (que en realidad es hora New York)
            const isoString = dateStr.trim().replace(" ", "T") + "-05:00"; // Reemplazamos espacio por T y agregamos el offset de New York (-05:00)
            startDateTime = new Date(isoString);
        }

        // SCORE
        let scoreA = 0, scoreB = 0;
        const scoreMatch = $('.match-header-vs-score').text().trim().match(/(\d+)[:\-\s]+(\d+)/);
        if (scoreMatch) { scoreA = parseInt(scoreMatch[1]); scoreB = parseInt(scoreMatch[2]); }

        // ESTADO
        let status = 'UPCOMING';
        const note = clean($('.match-header-vs-note').text()).toLowerCase();
        if (note.includes('final') || note.includes('completed')) status = 'COMPLETED';
        else if (note.includes('live') || $('.match-header-vs-score').hasClass('mod-live')) status = 'LIVE';

        // FALLBACK: si vlr.gg cambió las clases/textos de arriba, nos apoyamos en
        // hora de inicio + score parcial para no dejar un partido en curso como "UPCOMING".
        if (status === 'UPCOMING' && startDateTime && startDateTime.getTime() <= Date.now() && (scoreA > 0 || scoreB > 0)) {
            status = 'LIVE';
        }

        console.log(`   📅 ${startDateTime ? startDateTime.toISOString() : '???'} | ${teamA} vs ${teamB} [${status}]`);

        // GUARDAR EN SUPABASE
        const teamsToSave = [];
        if (teamA && logoA) teamsToSave.push({ name: teamA, img: logoA, updated_at: new Date() });
        if (teamB && logoB) teamsToSave.push({ name: teamB, img: logoB, updated_at: new Date() });

        if (teamsToSave.length > 0) {
            await supabase.from('teams').upsert(teamsToSave, { onConflict: 'name' });
        }

        await supabase.from('matches').upsert({
            id: matchId, 
            team_a: teamA, team_b: teamB, 
            score_a: scoreA, score_b: scoreB, 
            team_a_logo: logoA, team_b_logo: logoB, 
            status: status, 
            start_datetime: startDateTime,
            last_update: new Date()
        });

        // --- 6. DETECCIÓN DE MAPAS Y STATS (Solo si hay datos) ---
        // OJO: vlr.gg renombró esta clase (ya no lleva guion entre "games" y "nav").
        let mapTabs = [];
        let navItems = $('.vm-stats-gamesnav-item');
        if (navItems.length === 0) navItems = $('.vm-stats-games-nav-item');
        if (navItems.length === 0) navItems = $('.js-map-switch');

        if (navItems.length > 0) {
            navItems.each((i, el) => {
                const id = $(el).attr('data-game-id');
                let cleanName = clean($(el).text()).replace(/^\d+\s+/, '').trim(); 
                let sA = 0, sB = 0;
                const sc = cleanName.match(/(\d+)[:\-\s]+(\d+)/);
                let nameOnly = cleanName;
                if (sc) {
                    nameOnly = cleanName.replace(sc[0], '').trim();
                    sA = parseInt(sc[1]);
                    sB = parseInt(sc[2]);
                }
                if (nameOnly.toLowerCase().includes('all') || nameOnly.toLowerCase().includes('overview')) {
                    nameOnly = 'All Maps';
                    sA = scoreA; sB = scoreB;
                }
                mapTabs.push({ id, cleanName: nameOnly, score_a: sA, score_b: sB });
            });
        } else {
             // Si no hay tabs (partido futuro), agregamos un placeholder
             mapTabs.push({ id: 'all', cleanName: 'TBD', score_a: 0, score_b: 0 });
        }

        const allStats = [];
        const mapsInfo = [];
        const processedMaps = new Set();

        for (const map of mapTabs) {
            if (processedMaps.has(map.cleanName)) continue;
            processedMaps.add(map.cleanName);

            // vlr.gg ya no usa <table>: los stats son un grid de divs (.ovw-row/.ovw-cell).
            const gameContainer = $(`.vm-stats-game[data-game-id="${map.id}"]`);
            const rows = gameContainer.find('.ovw-row').not('.mod-head');

            // Sin filas de jugadores (común en Upcoming o si el mapa no se jugó), saltamos
            if (rows.length === 0) continue;

            let t1_t = 0, t1_ct = 0, t2_t = 0, t2_ct = 0;
            if (map.cleanName !== 'All Maps' && map.cleanName !== 'TBD') {
                const teamsHeader = gameContainer.find('.vm-stats-game-header .team');
                let sA = map.score_a, sB = map.score_b;
                if (teamsHeader.length >= 2) {
                    const row1 = $(teamsHeader[0]);
                    const row2 = $(teamsHeader[1]);
                    t1_t = extractInt(row1.find('.mod-t').text());
                    t1_ct = extractInt(row1.find('.mod-ct').text());
                    t2_t = extractInt(row2.find('.mod-t').text());
                    t2_ct = extractInt(row2.find('.mod-ct').text());
                    const s1 = extractInt(row1.find('.score').first().text());
                    const s2 = extractInt(row2.find('.score').first().text());
                    if (s1 || s2) { sA = s1; sB = s2; }
                }
                mapsInfo.push({
                    match_id: matchId, map_name: map.cleanName,
                    score_a: sA, score_b: sB,
                    t1_t, t1_ct, t2_t, t2_ct
                });
            }

            // Players
            rows.each((i, row) => {
                const $row = $(row);
                const name = clean($row.find('.text-of').first().text());
                if (!name) return;

                const team = (allStats.filter(s => s.map_name === map.cleanName).length < 5) ? teamA : teamB;
                // En "All Maps" un jugador puede mostrar 2 agentes (uno por mapa jugado).
                // Guardamos ambos separados por "||"; el 1ro es el principal.
                const agentImgs = [];
                $row.find('.ovw-agents img').each((_, img) => {
                    let src = $(img).attr('src');
                    if (src && !src.startsWith('http')) src = 'https://www.vlr.gg' + src;
                    if (src) agentImgs.push(src);
                });
                const agentSrc = agentImgs.join('||');

                const statBoth = (col) => extractInt(clean($row.find(`.ovw-kda-stat[data-col="${col}"] .mod-both`).first().text()));
                const valK = statBoth('kills');
                const valD = statBoth('deaths');
                const valA = statBoth('assists');

                allStats.push({
                    match_id: matchId,
                    player_name: name,
                    team_name: team,
                    agent_img: agentSrc,
                    k: valK, d: valD, a: valA,
                    map_name: map.cleanName
                });
            });
        }

        // --- 7. GUARDAR STATS (Solo si existen) ---
        if (allStats.length > 0) {
            await supabase.from('match_maps').delete().eq('match_id', matchId);
            if (mapsInfo.length > 0) await supabase.from('match_maps').insert(mapsInfo);
            await supabase.from('match_stats').delete().eq('match_id', matchId);
            const { error } = await supabase.from('match_stats').insert(allStats);

            if (!error) console.log(`   💾 Stats guardados (${allStats.length}).`);
            else console.error(`   ❌ Error DB Stats: ${error.message}`);
        } else if (status === 'UPCOMING') {
            console.log(`   ℹ️ Sin stats (partido futuro, es normal).`);
        } else {
            // El partido ya empezó/terminó pero no encontramos tabla de stats:
            // probablemente vlr.gg cambió el HTML. Volcamos pistas para diagnosticar.
            console.log(`   ⚠️ Sin stats para un partido ${status} (inesperado). DIAG:`);
            console.log(`      .vm-stats-gamesnav-item: ${$('.vm-stats-gamesnav-item').length}`);
            console.log(`      .js-map-switch: ${$('.js-map-switch').length}`);
            console.log(`      .vm-stats-game: ${$('.vm-stats-game').length}`);
            console.log(`      .ovw-row (total): ${$('.ovw-row').length}`);
            console.log(`      [class*="stats"] (total): ${$('[class*="stats"]').length}`);
            console.log(`      [class*="mod-live"] (total): ${$('[class*="mod-live"]').length}`);
        }

    } catch (err) {
        console.error(`   ❌ Error crítico:`, err.message);
    }
}

// --- 3. LIMPIEZA DE ZOMBIES ---
// Partidos que quedaron marcados UPCOMING pero ya pasaron hace rato y vlr.gg
// dejó de listarlos (por eso este scraper nunca los vuelve a tocar).
async function limpiarZombies() {
    const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
        .from('matches')
        .update({ status: 'COMPLETED' })
        .eq('status', 'UPCOMING')
        .lt('start_datetime', cutoff)
        .select('id');

    if (error) console.error('❌ Error limpiando zombies:', error.message);
    else console.log(`🧟 Zombies limpiados: ${data?.length || 0}`);
}

async function runBatch() {
    const ids = await obtenerIdsRecientes();
    console.log(`🎯 Procesando ${ids.length} partidos...`);
    for (let i = 0; i < ids.length; i++) {
        await scrapearPartido(ids[i], i, ids.length);
        await sleep(DELAY_MS);
    }
    await limpiarZombies();
    console.log("\n🏁 Fin.");
}

runBatch();