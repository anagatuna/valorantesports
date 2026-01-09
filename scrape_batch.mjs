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

        // --- 2. DETECCIÓN DE MAPAS ROBUSTA ---
        let mapTabs = [];
        
        // Estrategia A: Buscar pestañas (Bo3/Bo5)
        let navItems = $('.vm-stats-games-nav-item');
        if (navItems.length === 0) navItems = $('.js-map-switch');

        if (navItems.length > 0) {
            navItems.each((i, el) => {
                const id = $(el).attr('data-game-id');
                let rawText = cleanText($(el).text());
                
                // Ejemplo rawText: "1 Ascent 13-9"
                let cleanName = rawText.replace(/^\d+\s+/, '').trim(); // "Ascent 13-9"
                
                // Separar nombre y score
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
                    // El score de All Maps es el de la serie
                    scoreMapA = scoreA;
                    scoreMapB = scoreB;
                }

                mapTabs.push({ 
                    id, 
                    cleanName: nameOnly, 
                    score_a: scoreMapA, 
                    score_b: scoreMapB 
                });
            });
        } 
        
        // Estrategia B: Si no hay pestañas, es un Bo1
        if (mapTabs.length === 0) {
            console.log("   ⚡ Bo1 sin pestañas detectado.");
            
            // Buscar nombre del mapa en el header o vetos
            const noteText = $('.match-header-note, .match-header-event-series').text();
            const vetoText = $('.match-header-note-side').text();
            
            let mapName = 'Unknown';
            // Regex para buscar "Map: Ascent" o "Decider: Ascent"
            const mapMatch = noteText.match(/(?:Map|Decider)[:\s]+([a-zA-Z0-9\s]+)/i) || 
                             vetoText.match(/(?:Map|Decider)[:\s]+([a-zA-Z0-9\s]+)/i);

            if (mapMatch) {
                mapName = mapMatch[1].trim();
                // Limpiar basura tipo "VCT 2024" si se coló
                mapName = mapName.split(/,|\n/)[0].trim();
            }

            // En Bo1, el mapa unico tiene el score global
            mapTabs.push({ 
                id: 'all', // Usualmente 'all' funciona para la única tabla visible
                cleanName: mapName, 
                score_a: scoreA, 
                score_b: scoreB 
            });
        }

        // --- 3. EXTRAER JUGADORES (CON DETECCIÓN DE COLUMNAS) ---
        const allStats = [];
        const mapsInfo = [];
        const processedMaps = new Set();

        for (const map of mapTabs) {
            if (processedMaps.has(map.cleanName)) continue;
            processedMaps.add(map.cleanName);

            // Buscar tabla
            let table = $(`.vm-stats-game[data-game-id="${map.id}"] table`);
            if (table.length === 0 && map.id === 'all') table = $('.vm-stats-game table').first();
            
            if (table.length === 0) continue;

            // Guardar info del mapa (Scores)
            if (map.cleanName !== 'All Maps') {
                mapsInfo.push({
                    match_id: matchId,
                    map_name: map.cleanName,
                    score_a: map.score_a,
                    score_b: map.score_b
                });
            }

            // --- DETECCIÓN DINÁMICA DE COLUMNAS (CRÍTICO) ---
            const headers = table.find('thead tr').last().find('th, td');
            let idxK = -1, idxD = -1, idxA = -1;

            headers.each((i, el) => {
                const txt = $(el).text().trim(); // Case sensitive a veces ayuda, pero mejor regex
                
                // K: Puede ser "K", "Kills", pero NO "KAST" ni "FK"
                if (/^K$/i.test(txt) || /^Kills$/i.test(txt)) idxK = i;
                // D: "D", "Deaths", NO "FD"
                if (/^D$/i.test(txt) || /^Deaths$/i.test(txt)) idxD = i;
                // A: "A", "Assists"
                if (/^A$/i.test(txt) || /^Assists$/i.test(txt)) idxA = i;
            });

            // Fallback por si vlr usa iconos o texto raro
            if (idxK === -1) { 
                // Adivinanza educada basada en estructura común de vlr
                // Player(0) Agent(1) ACS(2) K(3) D(4) A(5) ...
                console.warn(`   ⚠️ Headers KDA no claros en ${map.cleanName}, usando fallback.`);
                idxK = 3; idxD = 4; idxA = 5;
                // A veces es 4,5,6 si hay Rating. Ajustar si sigue fallando.
            }

            // Extraer filas
            table.find('tbody tr').each((i, row) => {
                const cols = $(row).find('td');
                const name = cleanText($(row).find('.text-of').first().text()); 
                if (!name) return; 

                // Asignar equipo (simple: primeros 5 vs ultimos 5)
                const team = (allStats.filter(s => s.map_name === map.cleanName).length < 5) ? teamA : teamB;
                
                let agentSrc = $(row).find('img').first().attr('src');
                if (agentSrc && !agentSrc.startsWith('http')) agentSrc = 'https://www.vlr.gg' + agentSrc;

                // Helper para limpiar números complejos "24 (5)" -> 24
                const getVal = (idx) => {
                    if (idx < 0 || idx >= cols.length) return 0;
                    const raw = $(cols).eq(idx).text().trim();
                    const num = raw.match(/^(\d+)/); // Agarra numero al inicio
                    return num ? parseInt(num[1]) : 0;
                };

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

        // --- 4. GUARDAR EN SUPABASE ---
        if (allStats.length > 0) {
            // A. Match
            await supabase.from('matches').upsert({
                id: matchId, team_a: teamA, team_b: teamB, score_a: scoreA, score_b: scoreB, status: 'COMPLETED', last_update: new Date()
            });
            // B. Mapas
            await supabase.from('match_maps').delete().eq('match_id', matchId);
            if (mapsInfo.length > 0) await supabase.from('match_maps').insert(mapsInfo);
            // C. Stats
            await supabase.from('match_stats').delete().eq('match_id', matchId);
            const { error } = await supabase.from('match_stats').insert(allStats);

            if (!error) console.log(`   💾 Stats OK: ${allStats.length} filas.`);
            else console.error("   ❌ Error Supabase:", error.message);
        } else {
            console.warn("   ⚠️ No se extrajeron datos.");
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