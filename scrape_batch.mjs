import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio' 

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// --- CONFIGURACIÓN ---
const API_SOURCE = 'https://vlr.orlandomm.net/api/v1/results'; 
const MAX_MATCHES = 50; 
const DELAY_MS = 2000; 

// Lista maestra de mapas para búsqueda por fuerza bruta
const KNOWN_MAPS = [
    "Abyss", "Ascent", "Bind", "Breeze", "Fracture", "Haven", 
    "Icebox", "Lotus", "Pearl", "Split", "Sunset", "Corrode", "Drift", "Kasbah", "Piazza"
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Limpia texto agresivamente
const clean = (s) => s ? s.replace(/[\n\t\r]/g, ' ').replace(/\s+/g, ' ').trim() : '';

// Helper CRÍTICO: Extrae un número seguro de una celda sucia
// Evita el error "241014" separando por cualquier cosa que no sea dígito
const extractNumber = (str) => {
    if (!str) return 0;
    // Ejemplo entrada: "24 / 18 / 11" o "24\n18"
    // Reemplazamos todo lo que no sea número o guión por espacio
    const cleaned = str.replace(/[^\d-]/g, ' ').trim();
    const parts = cleaned.split(/\s+/);
    // Retornamos la primera parte numérica encontrada
    return parseInt(parts[0]) || 0;
};

async function obtenerIdsRecientes() {
    try {
        const [p1, p2] = await Promise.all([
            fetch(`${API_SOURCE}?page=1`).then(r => r.json()),
            fetch(`${API_SOURCE}?page=2`).then(r => r.json())
        ]);
        const all = [...p1.data, ...p2.data];
        // Deduplicar
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

        // --- 1. DATOS DE LA PARTIDA ---
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

        // --- 2. MAPAS: ESTRATEGIA FUERZA BRUTA ---
        // Buscamos TODOS los contenedores que podrían ser un mapa
        let mapContainers = [];
        
        // A. Pestañas normales (Bo3)
        $('.vm-stats-games-nav-item').each((i, el) => {
            const id = $(el).attr('data-game-id');
            const txt = clean($(el).text());
            let cleanName = txt.replace(/^\d+/, '').trim(); // Quitar numero inicial
            
            // Score del mapa
            let sA = 0, sB = 0;
            const scoreEx = cleanName.match(/(\d+)[:\-\s]+(\d+)/);
            if (scoreEx) {
                sA = parseInt(scoreEx[1]); sB = parseInt(scoreEx[2]);
                cleanName = cleanName.replace(scoreEx[0], '').trim();
            }

            if (cleanName.toLowerCase().includes('all') || cleanName.toLowerCase().includes('overview')) {
                cleanName = 'All Maps';
                sA = scoreA; sB = scoreB;
            }

            mapContainers.push({ id, name: cleanName, score_a: sA, score_b: sB });
        });

        // B. Si NO hay pestañas (Bo1), detectamos el mapa leyendo el HTML entero
        if (mapContainers.length === 0) {
            console.log("   ⚡ Modo Bo1 activado.");
            const pageText = $('body').text(); // Texto plano de toda la página
            const headerText = $('.match-header-note, .match-header-event-series').text();
            
            let detectedMap = "Unknown";
            
            // Buscamos qué mapa de nuestra lista maestra aparece en el header
            for (const m of KNOWN_MAPS) {
                // Regex: Que la palabra mapa esté sola (evita confundir substring)
                const regex = new RegExp(`\\b${m}\\b`, 'i');
                if (regex.test(headerText)) {
                    detectedMap = m;
                    break;
                }
            }
            
            console.log(`   🎯 Mapa encontrado: ${detectedMap}`);
            // En Bo1, la tabla 'all' es el mapa único
            mapContainers.push({ id: 'all', name: detectedMap, score_a: scoreA, score_b: scoreB });
        }

        console.log(`   📂 Estructura: ${mapContainers.map(m=>m.name).join(', ')}`);

        // --- 3. EXTRAER DATOS (SOLUCIÓN KDA) ---
        const allStats = [];
        const mapsInfo = [];
        const processed = new Set();

        for (const map of mapContainers) {
            if (processed.has(map.name)) continue;
            processed.add(map.name);

            // Buscar la tabla correcta
            let table = $(`.vm-stats-game[data-game-id="${map.id}"] table`);
            // Fallback: Si es Bo1 y falló el ID, agarra la primera tabla grande
            if (table.length === 0 && mapContainers.length === 1) {
                table = $('.vm-stats-game table').first();
            }
            if (table.length === 0) continue;

            // Guardar info del mapa (Scores)
            if (map.name !== 'All Maps') {
                mapsInfo.push({ 
                    match_id: matchId, map_name: map.name, score_a: map.score_a, score_b: map.score_b 
                });
            }

            // --- DETECTAR INDICES DE COLUMNAS (REGEX EXACTO) ---
            const headers = [];
            table.find('thead tr').last().find('th, td').each((i, el) => {
                let h = clean($(el).text()).toUpperCase();
                if (!h) h = $(el).find('.mod-icon').length > 0 ? "ICON" : ""; // A veces usan iconos
                if (!h) h = $(el).attr('title')?.toUpperCase() || "";
                headers.push(h);
            });

            // Buscamos índices
            let idxK = headers.indexOf('K');
            let idxD = headers.indexOf('D');
            let idxA = headers.indexOf('A');

            // Fallback visual (Si dice "KILLS" o tiene el título)
            if (idxK === -1) idxK = headers.findIndex(h => h.includes('K') && !h.includes('KAST'));
            if (idxD === -1) idxD = headers.findIndex(h => h.includes('D'));
            if (idxA === -1) idxA = headers.findIndex(h => h.includes('A'));

            // ULTIMO RECURSO: Posición fija basada en tamaño de tabla
            if (idxK === -1 || idxD === -1) {
                // Si la tabla es ancha, K suele ser 4. Si es corta, 2.
                idxK = headers.length > 6 ? 4 : 2;
                idxD = idxK + 1;
                idxA = idxK + 2;
                console.warn(`      ⚠️ Headers KDA perdidos en ${map.name}. Usando K=${idxK}`);
            }

            // Extraer filas
            table.find('tbody tr').each((i, row) => {
                const cols = $(row).find('td');
                // Nombre jugador: buscamos dentro de div text-of
                let name = clean($(row).find('.text-of').first().text());
                // Fallback nombre: texto directo de la celda
                if (!name) name = clean($(cols).eq(0).text());
                
                if (!name) return;

                const team = (allStats.filter(s => s.map_name === map.name).length < 5) ? teamA : teamB;
                
                let agentSrc = $(row).find('img').first().attr('src');
                if (agentSrc && !agentSrc.startsWith('http')) agentSrc = 'https://www.vlr.gg' + agentSrc;

                // USAMOS extractNumber AQUÍ PARA EVITAR EL ERROR DE DATABASE
                const valK = extractNumber(cols.eq(idxK).text());
                const valD = extractNumber(cols.eq(idxD).text());
                const valA = extractNumber(cols.eq(idxA).text());

                allStats.push({
                    match_id: matchId,
                    player_name: name,
                    team_name: team,
                    agent_img: agentSrc,
                    k: valK, d: valD, a: valA,
                    map_name: map.name
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

            if (!error) console.log(`   💾 Guardado: ${allStats.length} registros.`);
            else console.error(`   ❌ Error DB: ${error.message}`);
        } else {
            console.warn("   ⚠️ No se encontraron datos para guardar.");
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