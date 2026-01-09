import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio' 

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// --- CONFIGURACIÓN ---
const API_SOURCE = 'https://vlr.orlandomm.net/api/v1/results'; 
const DELAY_MS = 5000; 
const MAX_MATCHES = 10; 

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function obtenerIdsRecientes() {
    try {
        const res = await fetch(API_SOURCE);
        if (!res.ok) throw new Error("Fallo API");
        const json = await res.json();
        return json.data.slice(0, MAX_MATCHES).map(m => m.id);
    } catch (e) { return []; }
}

const cleanText = (txt) => txt ? txt.replace(/[\n\t\r]/g, ' ').replace(/\s+/g, ' ').trim() : '';

async function scrapearPartido(matchId) {
    console.log(`\n🔍 Analizando ID: ${matchId}...`);
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
        
        // Intento 1: Score Header
        const headerScoreText = $('.match-header-vs-score').text().trim(); 
        const scoreMatch = headerScoreText.match(/(\d+)[:\-\s]+(\d+)/);
        if (scoreMatch) {
            scoreA = parseInt(scoreMatch[1]);
            scoreB = parseInt(scoreMatch[2]);
        } else {
            // Intento 2: Contar mapas ganados
            scoreA = $('.match-header-link.mod-1 .wf-score-point.mod-win').length;
            scoreB = $('.match-header-link.mod-2 .wf-score-point.mod-win').length;
        }

        console.log(`   ✅ MATCH: ${teamA} [${scoreA}-${scoreB}] ${teamB}`);

        // --- 2. DETECTAR PESTAÑAS (ESTRATEGIA BLINDADA) ---
        const mapTabs = [];
        
        // Estrategia A: Selector Clásico
        let navItems = $('.vm-stats-games-nav-item');
        
        // Estrategia B: Selector Funcional (Si A falla)
        if (navItems.length === 0) {
            navItems = $('.js-map-switch');
        }

        if (navItems.length > 0) {
            navItems.each((i, el) => {
                const id = $(el).attr('data-game-id');
                let nameRaw = cleanText($(el).text());
                
                // Limpieza de nombre
                let cleanName = nameRaw.replace(/^\d+\s+/, '').trim(); 
                if (cleanName.toLowerCase().includes('all') || cleanName.toLowerCase().includes('overview')) {
                    cleanName = 'All Maps';
                }
                
                // Quitar score del nombre (ej "Haven 13-5" -> "Haven")
                const nameOnly = cleanName.split(/\d+[:\-]\d+/)[0].trim();

                mapTabs.push({
                    id: id,
                    rawName: cleanName,
                    cleanName: nameOnly || cleanName
                });
            });
            console.log(`   📂 Pestañas encontradas: ${mapTabs.length} (${mapTabs.map(m=>m.cleanName).join(', ')})`);
        } else {
            // ESTRATEGIA C: EMERGENCIA (No hay pestañas)
            // Asumimos que es un Bo1 y buscamos la única tabla visible o "all"
            console.warn("   ⚠️ No se encontraron pestañas. Activando modo emergencia.");
            mapTabs.push({
                id: 'all',
                rawName: 'All Maps',
                cleanName: 'All Maps'
            });
        }

        // --- 3. RECORRER CADA MAPA ---
        const allStats = [];
        const mapsInfo = [];

        for (const map of mapTabs) {
            // Buscamos la tabla que corresponde a ESTE mapa
            let table = $(`.vm-stats-game[data-game-id="${map.id}"] table`);
            
            // Si falló el selector por ID, y solo hay 1 mapa en nuestra lista, agarramos la primera tabla visible
            if (table.length === 0 && mapTabs.length === 1) {
                table = $('.vm-stats-game table').first();
            }

            if (table.length === 0) continue;

            // Extraer Score del mapa para match_maps (Solo si no es All Maps)
            const scoreExtract = map.rawName.match(/(\d+)[:\-\s]+(\d+)/);
            if (scoreExtract && map.cleanName !== 'All Maps') {
                mapsInfo.push({
                    match_id: matchId,
                    map_name: map.cleanName,
                    score_a: parseInt(scoreExtract[1]),
                    score_b: parseInt(scoreExtract[2])
                });
            }

            // Detectar columnas (K/D/A)
            const headers = table.find('thead tr').last().find('th, td');
            let idxK=4, idxD=5, idxA=6; 
            headers.each((i, el) => {
                const txt = $(el).text().trim().toUpperCase();
                if (txt === 'K' || (txt.includes('K') && !txt.includes('KAST'))) idxK = i;
                if (txt === 'D') idxD = i;
                if (txt === 'A') idxA = i;
            });

            // Extraer jugadores
            table.find('tbody tr').each((i, row) => {
                const cols = $(row).find('td');
                const name = cleanText($(row).find('.text-of').first().text()); 
                if (!name) return; 

                const team = (allStats.filter(s => s.map_name === map.cleanName).length < 5) ? teamA : teamB;
                
                let agentSrc = $(row).find('img').first().attr('src');
                if (agentSrc && !agentSrc.startsWith('http')) agentSrc = 'https://www.vlr.gg' + agentSrc;

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

            if (!error) console.log(`   💾 Stats guardados: ${allStats.length} registros.`);
            else console.error("   ❌ Error Stats:", error.message);
        } else {
            console.warn("   ⚠️ No se pudieron extraer jugadores de ninguna tabla.");
        }

    } catch (err) {
        console.error(`   ❌ Error crítico:`, err.message);
    }
}

async function runBatch() {
    const ids = await obtenerIdsRecientes();
    console.log(`🎯 Procesando ${ids.length} partidos...`);
    for (const id of ids) {
        await scrapearPartido(id);
        await sleep(DELAY_MS);
    }
    console.log("\n🏁 Fin.");
}

runBatch();