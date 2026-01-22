import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import axios from 'axios';
import https from 'https';
import crypto from 'crypto';

dotenv.config({ path: '.env.local' });

// Configuración de red (Fix SSL)
const httpsAgent = new https.Agent({
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    rejectUnauthorized: false
});

const axiosClient = axios.create({
    httpsAgent: httpsAgent,
    headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
    }
});

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Fuentes
const API_RESULTS = 'https://vlr.orlandomm.net/api/v1/results'; 
const API_UPCOMING = 'https://vlr.orlandomm.net/api/v1/matches';
const MAX_MATCHES = 60; 
const DELAY_MS = 2000; 

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const clean = (s) => s ? s.replace(/[\n\t\r]/g, ' ').replace(/\s+/g, ' ').trim() : '';
const extractInt = (str) => {
    const match = str?.match(/(\d+)/);
    return match ? parseInt(match[0]) : 0;
};

// Obtener IDs
async function obtenerIdsRecientes() {
    console.log("📡 Obteniendo lista de partidos...");
    try {
        const [p1, p2] = await Promise.all([
            axios.get(API_RESULTS),
            axios.get(API_UPCOMING)
        ]);
        const all = [...(p1.data.data || []), ...(p2.data.data || [])];
        const unique = [...new Map(all.map(item => [item.id, item])).values()];
        return unique.slice(0, MAX_MATCHES).map(m => m.id);
    } catch (e) { return []; }
}

async function scrapearPartido(matchId, index, total) {
    console.log(`\n[${index + 1}/${total}] 🔍 ID: ${matchId}...`);
    try {
        const url = `https://www.vlr.gg/${matchId}`;
        const response = await axiosClient.get(url);
        const $ = cheerio.load(response.data);

        // Datos básicos
        const teamA = clean($('.match-header-link-name').eq(0).text());
        const teamB = clean($('.match-header-link-name').eq(1).text());
        const getLogo = (idx) => {
            let src = $('.match-header-link').eq(idx).find('img').first().attr('src');
            if (src && src.startsWith('//')) src = 'https:' + src;
            return src || null;
        };
        const logoA = getLogo(0);
        const logoB = getLogo(1);

        // 🟢 FIX CRÍTICO DE HORA
        // Extraemos la fecha UTC del atributo oculto
        let dateStr = $('.match-header-date .moment-tz-convert').attr('data-utc-ts');
        let startDateTime = null;
        
        if (dateStr) {
            // VLR da: "2023-10-25 15:00:00"
            // JS necesita: "2023-10-25T15:00:00Z" (Con T y Z)
            const isoString = dateStr.trim().replace(" ", "T") + "Z";
            startDateTime = new Date(isoString);
            
            // Verificación de seguridad: si es fecha inválida, usar null
            if (isNaN(startDateTime.getTime())) startDateTime = null;
        }

        // Estado
        let status = 'UPCOMING';
        const note = $('.match-header-vs-note').text().toLowerCase();
        if (note.includes('final') || note.includes('completed')) status = 'COMPLETED';
        else if ($('.match-header-vs-score').hasClass('mod-live')) status = 'LIVE';

        // Score
        let scoreA = 0, scoreB = 0;
        const scoreMatch = $('.match-header-vs-score').text().trim().match(/(\d+)[:\-\s]+(\d+)/);
        if (scoreMatch) { scoreA = parseInt(scoreMatch[1]); scoreB = parseInt(scoreMatch[2]); }

        console.log(`   📅 ${startDateTime ? startDateTime.toISOString() : 'Sin Fecha'} | ${teamA} vs ${teamB} [${status}]`);

        // Guardar Equipos
        const teamsToSave = [];
        if (teamA && logoA) teamsToSave.push({ name: teamA, img: logoA, updated_at: new Date() });
        if (teamB && logoB) teamsToSave.push({ name: teamB, img: logoB, updated_at: new Date() });
        if (teamsToSave.length > 0) {
            await supabase.from('teams').upsert(teamsToSave, { onConflict: 'name' });
        }

        // Guardar Partido
        await supabase.from('matches').upsert({
            id: matchId, 
            team_a: teamA, team_b: teamB, 
            score_a: scoreA, score_b: scoreB, 
            team_a_logo: logoA, team_b_logo: logoB, 
            status: status, 
            start_datetime: startDateTime, // 👈 Fecha corregida
            last_update: new Date()
        });

        // --- 6. DETECCIÓN DE MAPAS Y STATS (Solo si hay datos) ---
        let mapTabs = [];
        let navItems = $('.vm-stats-games-nav-item');
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

            let table = $(`.vm-stats-game[data-game-id="${map.id}"] table`);
            if (table.length === 0 && map.id === 'all') {
                table = $('.vm-stats-game table').first();
            }
            
            // Si no hay tabla de stats (común en Upcoming), saltamos
            if (table.length === 0) continue;

            // ... Extracción de stats ...
            let t1_t = 0, t1_ct = 0, t2_t = 0, t2_ct = 0;
            if (map.cleanName !== 'All Maps' && map.cleanName !== 'TBD') {
                const gameContainer = $(`.vm-stats-game[data-game-id="${map.id}"]`);
                const teamsHeader = gameContainer.find('.vm-stats-game-header .team');
                if (teamsHeader.length >= 2) {
                    const row1 = $(teamsHeader[0]);
                    const row2 = $(teamsHeader[1]);
                    t1_t = extractInt(row1.find('.mod-t').text());
                    t1_ct = extractInt(row1.find('.mod-ct').text());
                    t2_t = extractInt(row2.find('.mod-t').text());
                    t2_ct = extractInt(row2.find('.mod-ct').text());
                }
                mapsInfo.push({
                    match_id: matchId, map_name: map.cleanName, 
                    score_a: map.score_a, score_b: map.score_b,
                    t1_t, t1_ct, t2_t, t2_ct
                });
            }

            // Players
            const headers = [];
            table.find('thead tr').last().find('th, td').each((i, el) => {
                let txt = clean($(el).text()).toUpperCase();
                if (!txt) txt = $(el).attr('title')?.toUpperCase() || ""; 
                headers.push(txt);
            });

            let idxK = headers.findIndex(h => (h === 'K' || h.startsWith('KILLS')) && !h.includes('KAST'));
            let idxD = -1, idxA = -1;
            if (idxK !== -1) { idxD = idxK + 1; idxA = idxK + 2; } 
            else { idxK = 4; idxD = 5; idxA = 6; }

            table.find('tbody tr').each((i, row) => {
                const cols = $(row).find('td');
                const name = clean($(row).find('.text-of').first().text()); 
                if (!name) return; 

                const team = (allStats.filter(s => s.map_name === map.cleanName).length < 5) ? teamA : teamB;
                let agentSrc = $(row).find('img').first().attr('src');
                if (agentSrc && !agentSrc.startsWith('http')) agentSrc = 'https://www.vlr.gg' + agentSrc;

                const valK = extractInt(clean(cols.eq(idxK).text()));
                const valD = extractInt(clean(cols.eq(idxD).text()));
                const valA = extractInt(clean(cols.eq(idxA).text()));

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
        } else {
            console.log(`   ℹ️ Sin stats (Probablemente partido futuro).`);
        }

    } catch (err) {
        console.error(`   ❌ Error crítico:`, err.message);
    }
}

async function runBatch() {
    const ids = await obtenerIdsRecientes();
    console.log(`🎯 Procesando ${ids.length} partidos...`);
    for (let i = 0; i < ids.length; i++) {
        await scrapearPartido(ids[i], i, ids.length);
        await sleep(DELAY_MS);
    }
    console.log("\n🏁 Fin.");
}

runBatch();