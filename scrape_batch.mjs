import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio' 

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

const API_SOURCE = 'https://vlr.orlandomm.net/api/v1/results'; 
const MAX_MATCHES = 50; 
const DELAY_MS = 2000; 

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper de limpieza agresiva
const clean = (s) => s ? s.replace(/[\n\t\r]/g, '').replace(/\s+/g, ' ').trim() : '';

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

        // --- 2. DETECTAR PESTAÑAS (MAPAS) ---
        let mapTabs = [];
        let navItems = $('.vm-stats-games-nav-item');
        if (navItems.length === 0) navItems = $('.js-map-switch');

        if (navItems.length > 0) {
            navItems.each((i, el) => {
                const id = $(el).attr('data-game-id');
                let rawText = clean($(el).text()); // "1 Ascent 13-9"
                
                // Limpieza nombre
                let cleanName = rawText.replace(/^\d+/, '').trim(); // "Ascent 13-9"
                
                // Extraer score del mapa
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

        // --- MODO EMERGENCIA (Bo1 sin pestañas) ---
        if (mapTabs.length === 0) {
            console.log("   ⚡ Bo1 sin pestañas. Buscando nombre...");
            
            // 1. Buscar en el header "Map: Ascent"
            const fullText = $('body').text(); // Texto crudo por si acaso
            const headerNote = $('.match-header-note').text() + $('.match-header-event-series').text();
            
            // Regex agresivo para encontrar el mapa
            // Lista de mapas comunes para buscar si el regex falla
            const mapsList = ["Ascent", "Bind", "Breeze", "Fracture", "Haven", "Icebox", "Lotus", "Pearl", "Split", "Sunset", "Abyss"];
            let detectedMap = "Unknown";

            // Intento 1: Regex Header
            const matchHeader = headerNote.match(/(?:Map|Decider)[:\s]+([a-zA-Z0-9]+)/i);
            if (matchHeader) detectedMap = matchHeader[1];

            // Intento 2: Buscar en la caja de vetos
            if (detectedMap === "Unknown") {
                const vetoBox = $('.match-header-note-side').text();
                const matchVeto = vetoBox.match(/(?:Map|Decider)[:\s]+([a-zA-Z0-9]+)/i);
                if (matchVeto) detectedMap = matchVeto[1];
            }

            // Intento 3: Fuerza bruta (buscar nombres de mapas conocidos en el header)
            if (detectedMap === "Unknown") {
                for (const m of mapsList) {
                    if (headerNote.includes(m) || $('.match-header-super').text().includes(m)) {
                        detectedMap = m;
                        break;
                    }
                }
            }
            
            console.log(`   🎯 Mapa detectado (Bo1): ${detectedMap}`);
            mapTabs.push({ id: 'all', cleanName: detectedMap, score_a: scoreA, score_b: scoreB });
        }

        console.log(`   📂 Tabs: ${mapTabs.map(m=>m.cleanName).join(', ')}`);

        // --- 3. EXTRAER JUGADORES (CORRECCIÓN COLUMNAS) ---
        const allStats = [];
        const processedMaps = new Set();
        const mapsInfo = [];

        for (const map of mapTabs) {
            if (processedMaps.has(map.cleanName)) continue;
            processedMaps.add(map.cleanName);

            // Buscar tabla
            let table = $(`.vm-stats-game[data-game-id="${map.id}"] table`);
            if (table.length === 0 && map.id === 'all') table = $('.vm-stats-game table').first();
            if (table.length === 0) continue;

            // Guardar Map Info
            if (map.cleanName !== 'All Maps') {
                mapsInfo.push({ match_id: matchId, map_name: map.cleanName, score_a: map.score_a, score_b: map.score_b });
            }

            // --- ESCANEO DE COLUMNAS (DEBUG) ---
            const headers = [];
            table.find('thead tr').last().find('th, td').each((i, el) => {
                // Vlr a veces usa title="Assists" en vez de texto
                let txt = clean($(el).text());
                if (!txt) txt = $(el).attr('title') || ""; 
                headers.push(txt.toUpperCase());
            });

            // Encontrar indices exactos
            let idxK = headers.indexOf('K');
            let idxD = headers.indexOf('D');
            let idxA = headers.indexOf('A');

            // Si no encuentra "K", busca "KILLS" o palabras que empiecen con K (evitando KAST)
            if (idxK === -1) idxK = headers.findIndex(h => h.startsWith('K') && !h.includes('KAST'));
            if (idxD === -1) idxD = headers.findIndex(h => h.startsWith('D'));
            if (idxA === -1) idxA = headers.findIndex(h => h.startsWith('A'));

            // LOG DE DEPURACIÓN (Mira esto en la consola)
            // console.log(`      📊 Columnas en ${map.cleanName}:`, headers);
            // console.log(`         Indices -> K:${idxK} D:${idxD} A:${idxA}`);

            if (idxK === -1 || idxD === -1) {
                // Fallback extremo: VLR suele ser [Player, Team, R, ACS, K, D, A]
                // Si la tabla tiene muchas columnas, K suele ser 4 o 5
                console.warn(`      ⚠️ No encontré headers KDA. Usando posición forzada.`);
                const count = headers.length;
                if (count > 6) { idxK = 4; idxD = 5; idxA = 6; } // Estándar
                else { idxK = 2; idxD = 3; idxA = 4; } // Tabla compacta
            }

            // Iterar filas
            table.find('tbody tr').each((i, row) => {
                const cols = $(row).find('td');
                const name = clean($(row).find('.text-of').first().text()); 
                if (!name) return; 

                const team = (allStats.filter(s => s.map_name === map.cleanName).length < 5) ? teamA : teamB;
                
                let agentSrc = $(row).find('img').first().attr('src');
                if (agentSrc && !agentSrc.startsWith('http')) agentSrc = 'https://www.vlr.gg' + agentSrc;

                const getVal = (idx) => {
                    if (idx < 0) return 0;
                    const txt = clean(cols.eq(idx).text());
                    const num = txt.match(/^(\d+)/); 
                    return num ? parseInt(num[1]) : 0;
                };

                const valK = getVal(idxK);
                const valD = getVal(idxD);
                const valA = getVal(idxA);

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