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

const cleanText = (txt) => txt ? txt.replace(/[\n\t\r]/g, ' ').replace(/\s+/g, ' ').trim() : '';

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
        const teamA = cleanText($('.match-header-link-name').eq(0).text());
        const teamB = cleanText($('.match-header-link-name').eq(1).text());
        
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
                let rawText = cleanText($(el).text());
                // Limpieza "1 Haven" -> "Haven"
                let cleanName = rawText.replace(/^\d+\s+/, '').trim(); 
                
                // Extraer score del mapa si existe "Ascent 13-9"
                let scoreMapA = 0, scoreMapB = 0;
                const scoreExtract = cleanName.match(/(\d+)[:\-\s]+(\d+)/);
                let nameOnly = cleanName;

                if (scoreExtract) {
                    nameOnly = cleanName.replace(scoreExtract[0], '').trim();
                    scoreMapA = parseInt(scoreExtract[1]);
                    scoreMapB = parseInt(scoreExtract[2]);
                }

                if (nameOnly.toLowerCase().includes('all') || nameOnly.toLowerCase().includes('overview')) {
                    nameOnly = 'All Maps';
                    scoreMapA = scoreA; scoreMapB = scoreB;
                }

                mapTabs.push({ id, cleanName: nameOnly, score_a: scoreMapA, score_b: scoreMapB });
            });
        } 

        // Fallback Bo1 (Si no hay pestañas)
        if (mapTabs.length === 0) {
            console.log("   ⚡ Bo1 sin pestañas detectado.");
            const noteText = $('.match-header-note, .match-header-event-series').text();
            const mapMatch = noteText.match(/(?:Map|Decider)[:\s]+([a-zA-Z0-9\s]+)/i);
            let mapName = mapMatch ? mapMatch[1].split(/,|\n/)[0].trim() : 'Unknown';
            
            mapTabs.push({ id: 'all', cleanName: mapName, score_a: scoreA, score_b: scoreB });
        }

        console.log(`   📂 Mapas: ${mapTabs.map(m=>m.cleanName).join(', ')}`);

        // --- 3. EXTRAER JUGADORES (CORRECCIÓN CRÍTICA DE COLUMNAS) ---
        const allStats = [];
        const mapsInfo = [];
        const processedMaps = new Set();

        for (const map of mapTabs) {
            if (processedMaps.has(map.cleanName)) continue;
            processedMaps.add(map.cleanName);

            let table = $(`.vm-stats-game[data-game-id="${map.id}"] table`);
            if (table.length === 0 && map.id === 'all') table = $('.vm-stats-game table').first();
            
            if (table.length === 0) continue;

            // Guardar Map Info
            if (map.cleanName !== 'All Maps') {
                mapsInfo.push({
                    match_id: matchId, map_name: map.cleanName, score_a: map.score_a, score_b: map.score_b
                });
            }

            // --- DETECCIÓN DE COLUMNAS MEJORADA ---
            const headers = [];
            table.find('thead tr').last().find('th, td').each((i, el) => {
                // Limpiamos totalmente el texto: " D " -> "D"
                headers.push($(el).text().replace(/[\n\t\r]/g, '').trim().toUpperCase());
            });

            // Buscamos índices exactos
            let idxK = headers.indexOf('K');
            if (idxK === -1) idxK = headers.findIndex(h => h.startsWith('K') && !h.includes('KAST')); // Fallback para "Kills"

            let idxD = headers.indexOf('D');
            if (idxD === -1) idxD = headers.findIndex(h => h.startsWith('D')); // Fallback para "Deaths"
            
            let idxA = headers.indexOf('A');
            if (idxA === -1) idxA = headers.findIndex(h => h.startsWith('A')); // Fallback para "Assists"

            // Si falló la detección, usamos los índices más comunes de vlr.gg
            if (idxK === -1 || idxD === -1) {
                console.warn(`   ⚠️ Indices no encontrados en ${map.cleanName}. Usando defaults.`);
                // Estructura común: Player, Agent, Rating, ACS, K, D, A
                idxK = 4; idxD = 5; idxA = 6;
            } else {
                // console.log(`   ✅ Indices detectados: K[${idxK}] D[${idxD}] A[${idxA}]`);
            }

            // Iterar Filas
            table.find('tbody tr').each((i, row) => {
                const cols = $(row).find('td');
                const name = cleanText($(row).find('.text-of').first().text()); 
                if (!name) return; 

                // Equipo (Simple: primeros 5 vs ultimos 5)
                const team = (allStats.filter(s => s.map_name === map.cleanName).length < 5) ? teamA : teamB;
                
                let agentSrc = $(row).find('img').first().attr('src');
                if (agentSrc && !agentSrc.startsWith('http')) agentSrc = 'https://www.vlr.gg' + agentSrc;

                // Extracción Segura
                const getVal = (idx) => {
                    if (!cols.eq(idx).length) return 0;
                    // Buscamos numeros, ignorando paréntesis o slashes. "24" o "24/18" -> agarra 24
                    const txt = cols.eq(idx).text().trim();
                    const num = txt.match(/^(\d+)/); 
                    return num ? parseInt(num[1]) : 0;
                };

                const valK = getVal(idxK);
                const valD = getVal(idxD);
                const valA = getVal(idxA);

                // DEBUG: Si las muertes son 0 y las kills no, avisa
                // if (valK > 0 && valD === 0) console.log(`      ⚠️ ${name}: K=${valK} pero D=0 (Header D index: ${idxD})`);

                allStats.push({
                    match_id: matchId,
                    player_name: name,
                    team_name: team,
                    agent_img: agentSrc,
                    k: valK,
                    d: valD,
                    a: valA,
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
            else console.error("   ❌ Error Supabase:", error.message);
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