import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import axios from 'axios';
import https from 'https';
import crypto from 'crypto';

// 1. Cargar variables de entorno
dotenv.config({ path: '.env.local' });

// 🔴 FIX SSL: Agente para evitar el error "fetch failed" / "EPROTO"
const httpsAgent = new https.Agent({
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    rejectUnauthorized: false
});

// Configuración de Axios para parecer un navegador real
const axiosClient = axios.create({
    httpsAgent: httpsAgent,
    headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
    }
});

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERROR CRÍTICO: Faltan credenciales de Supabase.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- CONFIGURACIÓN ---
const API_SOURCE = 'https://vlr.orlandomm.net/api/v1/results'; 
const MAX_MATCHES = 50; 
const DELAY_MS = 2000; 

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const clean = (s) => s ? s.replace(/[\n\t\r]/g, ' ').replace(/\s+/g, ' ').trim() : '';

const extractInt = (str) => {
    if (!str) return 0;
    const match = str.match(/(\d+)/);
    return match ? parseInt(match[0]) : 0;
};

async function obtenerIdsRecientes() {
    try {
        // Usamos axios también aquí por consistencia
        const [p1, p2] = await Promise.all([
            axios.get(`${API_SOURCE}?page=1`),
            axios.get(`${API_SOURCE}?page=2`)
        ]);
        const all = [...p1.data.data, ...p2.data.data];
        const unique = [...new Map(all.map(item => [item.id, item])).values()];
        return unique.slice(0, MAX_MATCHES).map(m => m.id);
    } catch (e) { 
        console.error("Error obteniendo IDs:", e.message);
        return []; 
    }
}

async function scrapearPartido(matchId, index, total) {
    console.log(`\n[${index + 1}/${total}] 🔍 ID: ${matchId}...`);
    try {
        const url = `https://www.vlr.gg/${matchId}`;
        
        // 🟢 CAMBIO: Usamos axiosClient en lugar de fetch
        const response = await axiosClient.get(url);
        const html = response.data;
        const $ = cheerio.load(html);

        // --- 1. DATOS GENERALES Y LOGOS ---
        const teamA = clean($('.match-header-link-name').eq(0).text());
        const teamB = clean($('.match-header-link-name').eq(1).text());
        
        const getLogo = (idx) => {
            const linkBlock = $('.match-header-link').eq(idx);
            let src = linkBlock.find('img').first().attr('src');
            if (src && src.startsWith('//')) src = 'https:' + src;
            return src || null;
        };

        const logoA = getLogo(0);
        const logoB = getLogo(1);

        console.log(`   🕵️ DEBUG: ${teamA} (Logo: ${logoA ? '✅' : '❌'}) vs ${teamB} (Logo: ${logoB ? '✅' : '❌'})`);

        // --- GUARDAR EQUIPOS ---
        const teamsToSave = [];
        if (teamA && logoA) teamsToSave.push({ name: teamA, img: logoA, updated_at: new Date() });
        if (teamB && logoB) teamsToSave.push({ name: teamB, img: logoB, updated_at: new Date() });

        if (teamsToSave.length > 0) {
            const { error: teamErr } = await supabase
                .from('teams')
                .upsert(teamsToSave, { onConflict: 'name' }); 
            if (teamErr) console.error("   ⚠️ Error guardando teams:", teamErr.message);
        }

        // Score
        let scoreA = 0, scoreB = 0;
        const headerScoreText = $('.match-header-vs-score').text().trim(); 
        const scoreMatch = headerScoreText.match(/(\d+)[:\-\s]+(\d+)/);
        
        if (scoreMatch) {
            scoreA = parseInt(scoreMatch[1]);
            scoreB = parseInt(scoreMatch[2]);
        } else {
            scoreA = $('.match-header-link.mod-1 .wf-score-point.mod-win').length;
            scoreB = $('.match-header-link.mod-2 .wf-score-point.mod-win').length;
        }

        console.log(`   ✅ MATCH: ${teamA} vs ${teamB}`);

        // --- 2. DETECCIÓN DE MAPAS ---
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
        } 
        
        if (mapTabs.length === 0) {
            const fullText = $('body').text();
            const mapsList = ["Ascent", "Bind", "Breeze", "Fracture", "Haven", "Icebox", "Lotus", "Pearl", "Split", "Sunset", "Abyss", "Showdown"];
            let detectedMap = "Unknown";
            
            const headerMatch = fullText.match(/(?:Map|Decider)[:\s]+([a-zA-Z0-9]+)/i);
            if (headerMatch) {
                detectedMap = headerMatch[1];
            } else {
                for (const m of mapsList) {
                    if ($('.match-header-note').text().includes(m) || $('.match-header-event-series').text().includes(m)) detectedMap = m;
                }
            }
            mapTabs.push({ id: 'all', cleanName: detectedMap, score_a: scoreA, score_b: scoreB });
        }

        console.log(`   📂 Mapas: ${mapTabs.map(m=>m.cleanName).join(', ')}`);

        // --- 3. EXTRAER DATOS ---
        const allStats = [];
        const mapsInfo = [];
        const processedMaps = new Set();

        for (const map of mapTabs) {
            if (processedMaps.has(map.cleanName)) continue;
            processedMaps.add(map.cleanName);

            let table = $(`.vm-stats-game[data-game-id="${map.id}"] table`);
            let gameContainer = $(`.vm-stats-game[data-game-id="${map.id}"]`);
            
            if (table.length === 0 && map.id === 'all') {
                table = $('.vm-stats-game table').first();
                gameContainer = $('.vm-stats-game').first();
            }
            if (table.length === 0) continue;

            // Rondas
            let t1_t = 0, t1_ct = 0, t2_t = 0, t2_ct = 0;
            if (map.cleanName !== 'All Maps') {
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

            // Columnas
            const headers = [];
            table.find('thead tr').last().find('th, td').each((i, el) => {
                let txt = clean($(el).text()).toUpperCase();
                if (!txt) txt = $(el).attr('title')?.toUpperCase() || ""; 
                headers.push(txt);
            });

            let idxK = headers.findIndex(h => (h === 'K' || h.startsWith('KILLS')) && !h.includes('KAST'));
            let idxD = -1, idxA = -1;
            if (idxK !== -1) {
                idxD = idxK + 1;
                idxA = idxK + 2;
            } else {
                idxK = 4; idxD = 5; idxA = 6; 
            }

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

        // --- 4. GUARDAR ---
        if (allStats.length > 0) {
            await supabase.from('matches').upsert({
                id: matchId, 
                team_a: teamA, 
                team_b: teamB, 
                score_a: scoreA, 
                score_b: scoreB, 
                team_a_logo: logoA, 
                team_b_logo: logoB, 
                status: 'COMPLETED', 
                last_update: new Date()
            });
            await supabase.from('match_maps').delete().eq('match_id', matchId);
            if (mapsInfo.length > 0) await supabase.from('match_maps').insert(mapsInfo);
            await supabase.from('match_stats').delete().eq('match_id', matchId);
            const { error } = await supabase.from('match_stats').insert(allStats);
            
            if (!error) console.log(`   💾 Stats guardados (${allStats.length}).`);
            else console.error(`   ❌ Error DB Stats: ${error.message}`);
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