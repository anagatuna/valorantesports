import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio' 

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// --- CONFIGURACIÓN ---
const API_SOURCE = 'https://vlr.orlandomm.net/api/v1/results'; 
const MAX_MATCHES = 50; // <--- AUMENTADO A 50
const DELAY_MS = 2000;  // 2 segundos entre partidos (más rápido pero seguro)

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function obtenerIdsRecientes() {
    try {
        // Pedimos más páginas para asegurar 50 partidos
        const [p1, p2] = await Promise.all([
            fetch(`${API_SOURCE}?page=1`).then(r => r.json()),
            fetch(`${API_SOURCE}?page=2`).then(r => r.json())
        ]);
        const all = [...p1.data, ...p2.data];
        // Eliminamos duplicados y cortamos a 50
        const unique = [...new Map(all.map(item => [item.id, item])).values()];
        return unique.slice(0, MAX_MATCHES).map(m => m.id);
    } catch (e) { return []; }
}

const cleanText = (txt) => txt ? txt.replace(/[\n\t\r]/g, ' ').replace(/\s+/g, ' ').trim() : '';

async function scrapearPartido(matchId, index, total) {
    console.log(`\n[${index + 1}/${total}] 🔍 Analizando ID: ${matchId}...`);
    try {
        const url = `https://www.vlr.gg/${matchId}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123.0.0.0 Safari/537.36' }
        });

        if (!response.ok) { console.error(`Err HTTP ${response.status}`); return; }

        const html = await response.text();
        const $ = cheerio.load(html);

        // --- 1. SCORE GENERAL ---
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

        // --- 2. DETECTAR PESTAÑAS Y FILTRAR "ALL MAPS" EN BO1 ---
        let mapTabs = [];
        let navItems = $('.vm-stats-games-nav-item');
        if (navItems.length === 0) navItems = $('.js-map-switch');

        if (navItems.length > 0) {
            navItems.each((i, el) => {
                const id = $(el).attr('data-game-id');
                let rawName = cleanText($(el).text());
                let cleanName = rawName.replace(/^\d+\s+/, '').trim(); 
                
                if (cleanName.toLowerCase().includes('all') || cleanName.toLowerCase().includes('overview')) {
                    cleanName = 'All Maps';
                }
                const nameOnly = cleanName.split(/\d+[:\-]\d+/)[0].trim();
                
                mapTabs.push({ id, rawName, cleanName: nameOnly || cleanName });
            });
        } else {
            // MODO EMERGENCIA (Bo1 sin pestañas)
            console.warn("   ⚠️ Sin pestañas. Buscando nombre del mapa en notas...");
            const noteText = $('.match-header-note, .match-header-event-series').text();
            const mapMatch = noteText.match(/Map[:\s]+([a-zA-Z0-9]+)/i);
            
            // Si no encuentra nombre, usa "Map 1"
            const mapNameFound = mapMatch ? mapMatch[1].trim() : 'Map 1';
            
            // En Bo1, apuntamos a la única tabla disponible
            mapTabs.push({ id: 'all', rawName: mapNameFound, cleanName: mapNameFound });
        }

        // --- FILTRO INTELIGENTE BO1 ---
        // Si solo hay 1 mapa real detectado, NO queremos "All Maps"
        // Si hay pestañas [All Maps, Map 1], significa que es Bo1.
        // Si hay pestañas [All Maps, Map 1, Map 2], es Bo3.
        
        // Filtramos para ver cuántos mapas "jugables" hay (ignorando All Maps)
        const playableMaps = mapTabs.filter(m => m.cleanName !== 'All Maps');
        
        if (playableMaps.length === 1) {
            // ES UN BO1: Usamos solo el mapa jugable.
            // Si vlr.gg puso "All Maps" y "Ascent", nos quedamos con "Ascent".
            // Pero necesitamos asegurarnos que el ID de "Ascent" apunte a datos correctos.
            // A veces "All Maps" tiene el ID 'all' y el mapa tiene ID numérico.
            // En Bo1, ambas tablas son iguales. Preferimos quedarnos con el nombre real.
            mapTabs = playableMaps; 
            console.log(`   ⚡ Bo1 Detectado: Guardando solo "${mapTabs[0].cleanName}"`);
        } else {
            // ES BO3+: Guardamos todo (All Maps incluido para ver totales)
            console.log(`   🔥 Bo3+ Detectado: Guardando ${mapTabs.length} pestañas.`);
        }

        // --- 3. EXTRAER DATOS ---
        const allStats = [];
        const mapsInfo = [];
        const processedMaps = new Set(); 

        for (const map of mapTabs) {
            if (processedMaps.has(map.cleanName)) continue;
            processedMaps.add(map.cleanName);

            let table = $(`.vm-stats-game[data-game-id="${map.id}"] table`);
            if (table.length === 0 && map.id === 'all') table = $('.vm-stats-game table').first();
            if (table.length === 0) continue;

            // Guardar Score del mapa
            if (map.cleanName !== 'All Maps') {
                let sA = 0, sB = 0;
                const scoreExtract = map.rawName.match(/(\d+)[:\-\s]+(\d+)/);
                if (scoreExtract) {
                    sA = parseInt(scoreExtract[1]);
                    sB = parseInt(scoreExtract[2]);
                } else if (mapTabs.length === 1) {
                    sA = scoreA; sB = scoreB; // Bo1 hereda score general
                }
                mapsInfo.push({
                    match_id: matchId, map_name: map.cleanName, score_a: sA, score_b: sB
                });
            }

            // Detectar Columnas K/D/A (Más robusto)
            const headers = table.find('thead tr').last().find('th, td');
            let idxK=4, idxD=5, idxA=6; 
            headers.each((i, el) => {
                const txt = $(el).text().trim().toUpperCase();
                // K: Evitamos "KAST"
                if (txt === 'K' || (txt.includes('K') && !txt.includes('KAST'))) idxK = i;
                if (txt === 'D') idxD = i;
                if (txt === 'A') idxA = i;
            });

            table.find('tbody tr').each((i, row) => {
                const cols = $(row).find('td');
                const name = cleanText($(row).find('.text-of').first().text()); 
                if (!name) return; 

                // Lógica de equipo: Si es All Maps, vlr separa con headers, pero si no, asumimos mitad y mitad
                // Simplificación: usaremos el orden de la tabla
                const team = (allStats.filter(s => s.map_name === map.cleanName).length < 5) ? teamA : teamB;
                
                let agentSrc = $(row).find('img').first().attr('src');
                if (agentSrc && !agentSrc.startsWith('http')) agentSrc = 'https://www.vlr.gg' + agentSrc;

                // Extracción limpia de números
                const getVal = (idx) => parseInt($(cols).eq(idx).text().match(/(\d+)/)?.[0] || 0);

                allStats.push({
                    match_id: matchId,
                    player_name: name,
                    team_name: team,
                    agent_img: agentSrc,
                    k: getVal(idxK),
                    d: getVal(idxD),
                    a: getVal(idxA),
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
            else console.error("   ❌ Error Stats:", error.message);
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