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

// Helper: Limpia saltos de línea y espacios dobles
const clean = (s) => s ? s.replace(/[\n\t\r]/g, ' ').replace(/\s+/g, ' ').trim() : '';

// Helper: Extrae solo el primer número de un texto (ej: "24/10" -> 24)
const extractInt = (str) => {
    if (!str) return 0;
    const match = str.match(/^(-?\d+)/); // Busca número al inicio (soporta negativos para +/-)
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

        // --- 2. DETECCIÓN DE MAPAS (BO3 vs BO1) ---
        let mapTabs = [];
        let navItems = $('.vm-stats-games-nav-item');
        if (navItems.length === 0) navItems = $('.js-map-switch');

        if (navItems.length > 0) {
            // CASO 1: HAY PESTAÑAS (Bo3/Bo5)
            navItems.each((i, el) => {
                const id = $(el).attr('data-game-id');
                let rawText = clean($(el).text()); // Ej: "1 Ascent 13-9"
                let cleanName = rawText.replace(/^\d+\s+/, '').trim(); // "Ascent 13-9"
                
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
        
        // CASO 2: NO HAY PESTAÑAS (Bo1)
        if (mapTabs.length === 0) {
            console.log("   ⚡ Bo1 sin pestañas. Buscando nombre del mapa...");
            
            let detectedMap = "Unknown";
            const fullHeader = $('.match-header-note, .match-header-event-series').text();
            const vetoText = $('.match-header-note-side').text();

            // Lista de mapas conocidos para buscar con "includes" (más fiable que regex a veces)
            const knownMaps = ["Ascent", "Bind", "Breeze", "Fracture", "Haven", "Icebox", "Lotus", "Pearl", "Split", "Sunset", "Abyss"];
            
            // 1. Buscar en Veto ("Map: Ascent" o "Decider: Ascent")
            const vetoMatch = vetoText.match(/(?:decider|map)[:\s]+([a-zA-Z0-9]+)/i);
            if (vetoMatch) detectedMap = vetoMatch[1];

            // 2. Buscar en Header
            if (detectedMap === "Unknown") {
                const headerMatch = fullHeader.match(/Map[:\s]+([a-zA-Z0-9]+)/i);
                if (headerMatch) detectedMap = headerMatch[1];
            }

            // 3. Fuerza bruta: ¿Aparece algún nombre de mapa en el texto del header?
            if (detectedMap === "Unknown") {
                for (const m of knownMaps) {
                    if (fullHeader.includes(m) || vetoText.includes(m)) {
                        detectedMap = m;
                        break;
                    }
                }
            }

            // En Bo1, el mapa tiene el score global
            mapTabs.push({ id: 'all', cleanName: detectedMap, score_a: scoreA, score_b: scoreB });
        }

        console.log(`   📂 Tabs detectados: ${mapTabs.map(m=>m.cleanName).join(', ')}`);

        // --- 3. EXTRAER JUGADORES ---
        const allStats = [];
        const processedMaps = new Set();
        const mapsInfo = [];

        for (const map of mapTabs) {
            if (processedMaps.has(map.cleanName)) continue;
            processedMaps.add(map.cleanName);

            // Buscar tabla
            let table = $(`.vm-stats-game[data-game-id="${map.id}"] table`);
            // Fallback para Bo1: la primera tabla que encuentre
            if (table.length === 0 && map.id === 'all') table = $('.vm-stats-game table').first();
            
            if (table.length === 0) continue;

            // Guardar Info Mapa (excepto All Maps)
            if (map.cleanName !== 'All Maps') {
                mapsInfo.push({ match_id: matchId, map_name: map.cleanName, score_a: map.score_a, score_b: map.score_b });
            }

            // --- DETECCIÓN DE COLUMNAS ---
            const headers = [];
            table.find('thead tr').last().find('th, td').each((i, el) => {
                let txt = clean($(el).text());
                if (!txt) txt = $(el).attr('title') || ""; 
                headers.push(txt.toUpperCase());
            });

            // Buscamos K, D, A
            let idxK = headers.indexOf('K');
            let idxD = headers.indexOf('D');
            let idxA = headers.indexOf('A');
            
            // Fallbacks de nombre (Kills, Deaths...)
            if (idxK === -1) idxK = headers.findIndex(h => h.startsWith('K') && !h.includes('KAST'));
            if (idxD === -1) idxD = headers.findIndex(h => h.startsWith('D'));
            if (idxA === -1) idxA = headers.findIndex(h => h.startsWith('A'));

            // DEBUG: Ver qué columnas encontró
            // console.log(`      [DEBUG] Headers en ${map.cleanName}:`, headers);

            // Si falla la detección, usamos la lógica de VLR estándar
            if (idxK === -1 || idxD === -1) {
                console.warn(`      ⚠️ Columnas no encontradas. Usando posición fija.`);
                // VLR Standard: Player(0), Team(1), R(2), ACS(3), K(4), D(5), A(6) -> Total 7+ cols
                // VLR Compact: Player(0), Team(1), ACS(2), K(3), D(4), A(5) -> Total ~6 cols
                if (headers.length >= 7) { idxK = 4; idxD = 5; idxA = 6; }
                else { idxK = 3; idxD = 4; idxA = 5; }
            }

            // Iterar filas
            table.find('tbody tr').each((i, row) => {
                const cols = $(row).find('td');
                const name = clean($(row).find('.text-of').first().text()); 
                if (!name) return; 

                // Equipo: asumimos orden (Team A primero, luego Team B)
                // O mejor: detectamos cambios en el HTML si es posible, pero por ahora esto funciona al 90%
                const team = (allStats.filter(s => s.map_name === map.cleanName).length < 5) ? teamA : teamB;
                
                let agentSrc = $(row).find('img').first().attr('src');
                if (agentSrc && !agentSrc.startsWith('http')) agentSrc = 'https://www.vlr.gg' + agentSrc;

                // --- EXTRACCIÓN SEGURA DE NÚMEROS ---
                // Aquí evitamos el error "241014". Leemos el texto y sacamos solo el primer número.
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
            
            if (!error) console.log(`   💾 Guardado OK (${allStats.length} registros).`);
            else console.error(`   ❌ Error DB Stats: ${error.message}`);
        } else {
            console.warn("   ⚠️ No se encontraron jugadores.");
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