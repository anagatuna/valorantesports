import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio' 

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

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

async function scrapearPartido(matchId) {
    console.log(`\nStarting match: ${matchId}...`);
    try {
        const url = `https://www.vlr.gg/${matchId}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36' }
        });

        if (!response.ok) return;
        const html = await response.text();
        const $ = cheerio.load(html);

        // --- 1. DATOS GENERALES ---
        const teamA = $('.match-header-link-name').eq(0).text().trim();
        const teamB = $('.match-header-link-name').eq(1).text().trim();

        // Score de la serie (los números grandes/coloreados en el header)
        let scoreA = parseInt($('.match-header-score.mod-1').first().text().replace(/\D/g, '')) || 0;
        let scoreB = parseInt($('.match-header-score.mod-2').first().text().replace(/\D/g, '')) || 0;

        // Plan B: Contar mapas si el score está vacío
        if (scoreA === 0 && scoreB === 0) {
             scoreA = $('.match-header-link.mod-1 .wf-score-point.mod-win').length;
             scoreB = $('.match-header-link.mod-2 .wf-score-point.mod-win').length;
        }

        console.log(`   ✅ MATCH: ${teamA} [${scoreA}-${scoreB}] ${teamB}`);

        // --- 2. DETECTAR MAPAS Y RONDAS ---
        const mapsData = [];
        // Buscamos los tabs de mapas (omitimos el primero que suele ser "All Maps")
        $('.vm-stats-games-nav-item').each((i, el) => {
            const mapName = $(el).find('div').text().trim().replace(/[\n\t]/g, '');
            const scoreText = $(el).find('.vm-stats-games-nav-item-score').text().trim(); // ej: "13-9"
            
            // Ignoramos "All Maps" o tabs vacíos
            if (mapName.toLowerCase().includes('all') || !scoreText) return;

            const scores = scoreText.split(/[-–:]/).map(s => parseInt(s.trim()));
            
            if (scores.length >= 2) {
                mapsData.push({
                    match_id: matchId,
                    map_name: mapName,
                    score_a: scores[0], // Asumimos orden Team A - Team B
                    score_b: scores[1]
                });
            }
        });
        console.log(`   🗺️ Mapas encontrados: ${mapsData.length}`);

        // --- 3. JUGADORES (STATS) ---
        const table = $('.vm-stats-game[data-game-id="all"] table');
        const playersData = [];
        
        if (table.length > 0) {
            // Detección columnas
            const headers = table.find('thead tr').last().find('th, td');
            let idxK=4, idxD=5, idxA=6; // Default
            headers.each((i, el) => {
                const txt = $(el).text().trim().toUpperCase();
                if (txt.includes('K') && !txt.includes('KAST')) idxK = i;
                if (txt.includes('D') && txt.length < 3) idxD = i;
                if (txt.includes('A') && txt.length < 3) idxA = i;
            });

            table.find('tbody tr').each((i, row) => {
                const cols = $(row).find('td');
                const name = $(row).find('.text-of').text().trim();
                if (!name) return; 

                const team = playersData.length < 5 ? teamA : teamB; 
                let agentSrc = $(row).find('img').first().attr('src');
                if (agentSrc && !agentSrc.startsWith('http')) agentSrc = 'https://www.vlr.gg' + agentSrc;
                
                // Nombre del agente (extraído del título de la imagen o alt)
                let agentName = $(row).find('img').first().attr('title') || 'agent';

                const k = parseInt($(cols).eq(idxK).text().match(/(\d+)/)?.[0] || 0);
                const d = parseInt($(cols).eq(idxD).text().match(/(\d+)/)?.[0] || 0);
                const a = parseInt($(cols).eq(idxA).text().match(/(\d+)/)?.[0] || 0);

                playersData.push({
                    match_id: matchId,
                    player_name: name,
                    team_name: team,
                    // Guardamos el nombre en la URL para extraerlo luego si es necesario
                    agent_img: agentSrc, 
                    k, d, a
                });
            });
        }

        // --- 4. GUARDAR TODO ---
        // A. Match
        await supabase.from('matches').upsert({
            id: matchId, team_a: teamA, team_b: teamB, score_a: scoreA, score_b: scoreB, status: 'COMPLETED', last_update: new Date()
        });

        // B. Maps (Borrar viejos -> Insertar nuevos)
        if (mapsData.length > 0) {
            await supabase.from('match_maps').delete().eq('match_id', matchId);
            await supabase.from('match_maps').insert(mapsData);
        }

        // C. Stats
        if (playersData.length > 0) {
            await supabase.from('match_stats').delete().eq('match_id', matchId);
            await supabase.from('match_stats').insert(playersData);
        }
        console.log("   💾 Datos guardados en Supabase.");

    } catch (err) {
        console.error(`   ❌ Error en ${matchId}:`, err.message);
    }
}

async function runBatch() {
    const ids = await obtenerIdsRecientes();
    console.log(`🎯 Procesando ${ids.length} partidos...`);
    for (const id of ids) {
        await scrapearPartido(id);
        await sleep(DELAY_MS);
    }
}

runBatch();