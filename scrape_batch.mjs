import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio' 

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// --- CONFIGURACIÓN ---
const API_SOURCE = 'https://vlr.orlandomm.net/api/v1/results'; 
const MAX_MATCHES = 50; 
const DELAY_MS = 2000; 

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const clean = (s) => s ? s.replace(/[\n\t\r]/g, ' ').replace(/\s+/g, ' ').trim() : '';
const extractInt = (str) => {
    if (!str) return 0;
    const match = str.match(/^(-?\d+)/);
    return match ? parseInt(match[1]) : 0;
};

async function obtenerIdsRecientes() {
    try {
        const [p1, p2] = await Promise.all([
            fetch(`${API_SOURCE}?page=1`).then(r => r.json()),
            fetch(`${API_SOURCE}?page=2`).then(r => r.json())
        ]);
        const all = [...p1.data, ...p2.data];
        const unique = [...new Map(all.map(item => [item.id, item])).values()];
        return unique.slice(0, MAX_MATCHES).map(m => m.id);
    } catch (e) { return []; }
}

async function scrapearPartido(matchId, index, total) {
    console.log(`\n[${index + 1}/${total}] 🔍 ID: ${matchId}...`);
    try {
        const url = `https://www.vlr.gg/${matchId}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123.0.0.0 Safari/537.36' }
        });

        if (!response.ok) { console.error(`Err HTTP ${response.status}`); return; }

        const html = await response.text();
        const $ = cheerio.load(html);

        // --- 1. DATOS GENERALES ---
        const teamA = clean($('.match-header-link-name').eq(0).text());
        const teamB = clean($('.match-header-link-name').eq(1).text());
        
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

        console.log(`   ✅ MATCH: ${teamA} [${scoreA}-${scoreB}] ${teamB}`);

        // --- 2. DETECCIÓN DE MAPAS ---
        let mapTabs = [];
        let navItems = $('.vm-stats-games-nav-item');
        if (navItems.length === 0) navItems = $('.js-map-switch');

        if (navItems.length > 0) {
            navItems.each((i, el) => {
                const id = $(el).attr('data-game-id');
                let cleanName = clean($(el).text()).replace(/^\d+\s+/, '').trim(); 
                
                // Score del mapa desde el tab (ej: "Ascent 13-9")
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
        
        // Bo1 Fallback
        if (mapTabs.length === 0) {
            console.log("   ⚡ Bo1 detectado.");
            const fullText = $('body').text();
            const mapsList = ["Ascent", "Bind", "Breeze", "Fracture", "Haven", "Icebox", "Lotus", "Pearl", "Split", "Sunset", "Abyss"];
            let detectedMap = "Unknown";
            for (const m of mapsList) {
                if (fullText.includes(`Map: ${m}`) || fullText.includes(`Decider: ${m}`)) {
                    detectedMap = m; break;
                }
            }
            mapTabs.push({ id: 'all', cleanName: detectedMap, score_a: scoreA, score_b: scoreB });
        }

        console.log(`   📂 Mapas: ${mapTabs.map(m=>m.cleanName).join(', ')}`);

        // --- 3. EXTRAER JUGADORES Y RONDAS ---
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

            // --- EXTRACCIÓN DE RONDAS (ATK/DEF) ---
            // Buscamos dentro del contenedor del juego específico
            let t1_t = 0, t1_ct = 0, t2_t = 0, t2_ct = 0;
            
            if (map.cleanName !== 'All Maps') {
                // VLR estructura: .vm-stats-game-header -> .team -> .team-score -> span.mod-t / span.mod-ct
                // El primer equipo en el header suele corresponder a Team A
                const teamsHeader = gameContainer.find('.vm-stats-game-header .team');
                
                if (teamsHeader.length >= 2) {
                    // Team 1 (A)
                    const row1 = $(teamsHeader[0]);
                    t1_t = extractInt(row1.find('.mod-t').text());
                    t1_ct = extractInt(row1.find('.mod-ct').text());
                    
                    // Team 2 (B)
                    const row2 = $(teamsHeader[1]);
                    t2_t = extractInt(row2.find('.mod-t').text());
                    t2_ct = extractInt(row2.find('.mod-ct').text());
                }
                
                mapsInfo.push({
                    match_id: matchId, 
                    map_name: map.cleanName, 
                    score_a: map.score_a, 
                    score_b: map.score_b,
                    t1_t, t1_ct, t2_t, t2_ct
                });
            }

            // --- COLUMNAS KDA ---
            const headers = [];
            table.find('thead tr').last().find('th, td').each((i, el) => {
                let txt = clean($(el).text()).toUpperCase();
                if (!txt) txt = $(el).attr('title')?.toUpperCase() || ""; 
                headers.push(txt);
            });

            let idxK = headers.indexOf('K');
            let idxD = headers.indexOf('D');
            let idxA = headers.indexOf('A');
            
            if (idxK === -1) idxK = headers.findIndex(h => h.startsWith('K') && !h.includes('KAST'));
            if (idxD === -1) idxD = headers.findIndex(h => h.startsWith('D'));
            if (idxA === -1) idxA = headers.findIndex(h => h.startsWith('A'));

            if (idxK === -1 || idxD === -1) {
                if (headers.length >= 7) { idxK = 4; idxD = 5; idxA = 6; }
                else { idxK = 3; idxD = 4; idxA = 5; }
            }

            // --- FILAS DE JUGADORES ---
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
                id: matchId, team_a: teamA, team_b: teamB, score_a: scoreA, score_b: scoreB, status: 'COMPLETED', last_update: new Date()
            });
            await supabase.from('match_maps').delete().eq('match_id', matchId);
            if (mapsInfo.length > 0) await supabase.from('match_maps').insert(mapsInfo);
            await supabase.from('match_stats').delete().eq('match_id', matchId);
            const { error } = await supabase.from('match_stats').insert(allStats);
            
            if (!error) console.log(`   💾 Stats guardados.`);
            else console.error(`   ❌ Error DB: ${error.message}`);
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