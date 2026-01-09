import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio' 

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// --- CONFIGURACIÓN ---
const API_SOURCE = 'https://vlr.orlandomm.net/api/v1/results'; // Fuente de IDs
const DELAY_MS = 5000; // 5 segundos de espera entre partidos (ANTI-BAN)
const MAX_MATCHES = 10; // Límite para probar (puedes subirlo luego)

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function obtenerIdsRecientes() {
    console.log("📋 Obteniendo lista de partidos recientes...");
    try {
        const res = await fetch(API_SOURCE);
        if (!res.ok) throw new Error("Fallo al obtener lista de IDs");
        const json = await res.json();
        // La API devuelve { data: [ ... ] }
        return json.data.slice(0, MAX_MATCHES).map(m => m.id);
    } catch (e) {
        console.error("❌ Error obteniendo lista:", e.message);
        return [];
    }
}

async function scrapearPartido(matchId) {
    console.log(`\nStarting match: ${matchId}...`);
    try {
        const url = `https://www.vlr.gg/${matchId}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
        });

        if (!response.ok) {
            console.error(`Skipping ${matchId}: Error ${response.status}`);
            return;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // 1. DATOS GENERALES
        const teamA = $('.match-header-link-name').eq(0).text().trim();
        const teamB = $('.match-header-link-name').eq(1).text().trim();
        const scoreRaw = $('.match-header-vs-score').text();
        const scoreNumbers = scoreRaw.match(/(\d+)/g); 
        const scoreA = scoreNumbers ? parseInt(scoreNumbers[0]) : 0;
        const scoreB = scoreNumbers ? parseInt(scoreNumbers[1]) : 0;

        console.log(`   ✅ ${teamA} [${scoreA}-${scoreB}] ${teamB}`);

        // 2. DETECTAR COLUMNAS
        const table = $('.vm-stats-game[data-game-id="all"] table');
        if (table.length === 0) {
             console.warn("   ⚠️ No stats table found.");
             return;
        }

        const headers = table.find('thead tr').last().find('th, td');
        let idxK = -1, idxD = -1, idxA = -1;

        headers.each((i, el) => {
            const txt = $(el).text().trim().toUpperCase();
            if (txt === 'K' || txt.includes('KILLS')) idxK = i;
            if (txt === 'D' || txt.includes('DEATHS')) idxD = i;
            if (txt === 'A' || txt.includes('ASSISTS')) idxA = i;
        });

        if (idxK === -1) { idxK=4; idxD=5; idxA=6; }

        // 3. EXTRAER JUGADORES
        const playersData = [];
        table.find('tbody tr').each((i, row) => {
            const cols = $(row).find('td');
            const name = $(row).find('.text-of').text().trim();
            if (!name) return; 

            const team = playersData.length < 5 ? teamA : teamB; 
            let agentSrc = $(row).find('img').first().attr('src');
            if (agentSrc && !agentSrc.startsWith('http')) agentSrc = 'https://www.vlr.gg' + agentSrc;

            const textK = $(cols).eq(idxK).text().trim();
            const textD = $(cols).eq(idxD).text().trim();
            const textA = $(cols).eq(idxA).text().trim();

            const cleanK = parseInt(textK.match(/(\d+)/)?.[0] || 0);
            const cleanD = parseInt(textD.match(/(\d+)/)?.[0] || 0);
            const cleanA = parseInt(textA.match(/(\d+)/)?.[0] || 0);

            playersData.push({
                match_id: matchId,
                player_name: name,
                team_name: team,
                agent_img: agentSrc || 'N/A',
                k: cleanK,
                d: cleanD,
                a: cleanA
            });
        });

        // 4. GUARDAR
        if (playersData.length > 0) {
            await supabase.from('matches').upsert({
                id: matchId, team_a: teamA, team_b: teamB, score_a: scoreA, score_b: scoreB, status: 'COMPLETED', last_update: new Date()
            });

            await supabase.from('match_stats').delete().eq('match_id', matchId);
            const { error } = await supabase.from('match_stats').insert(playersData);

            if (error) console.error("   ❌ Error DB:", error.message);
            else console.log("   💾 Saved to Supabase.");
        }

    } catch (err) {
        console.error(`   ❌ Error crítico en ${matchId}:`, err.message);
    }
}

async function runBatch() {
    const ids = await obtenerIdsRecientes();
    console.log(`\n🎯 Se encontraron ${ids.length} partidos para procesar.`);

    for (const id of ids) {
        await scrapearPartido(id);
        console.log(`   💤 Esperando ${DELAY_MS/1000}s...`);
        await sleep(DELAY_MS); // Pausa obligatoria
    }
    
    console.log("\n🏁 ¡Proceso masivo terminado!");
}

runBatch();