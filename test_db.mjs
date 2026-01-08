// test_db.mjs
import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio' 

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Tu ID actual (Fnatic vs Liquid)
const MATCH_ID = '353174'; 

async function clonarDefinitivo() {
    console.log("🚀 Iniciando Scraping FINAL (Con corrección de Kills duplicadas)...");

    try {
        const url = `https://www.vlr.gg/${MATCH_ID}`;
        
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36' }
        });

        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
        const html = await response.text();
        const $ = cheerio.load(html);

        // --- 1. DATOS GENERALES ---
        const teamA = $('.match-header-link-name').eq(0).text().trim();
        const teamB = $('.match-header-link-name').eq(1).text().trim();
        
        const scoreRaw = $('.match-header-vs-score').text();
        const scoreNumbers = scoreRaw.match(/(\d+)/g); 
        const scoreA = scoreNumbers ? parseInt(scoreNumbers[0]) : 0;
        const scoreB = scoreNumbers ? parseInt(scoreNumbers[1]) : 0;

        console.log(`✅ MATCH: ${teamA} [${scoreA}-${scoreB}] ${teamB}`);

        // --- 2. DETECTAR COLUMNAS ---
        // (Igual que antes, funciona bien)
        const table = $('.vm-stats-game[data-game-id="all"] table');
        if (table.length === 0) throw new Error("No se encontró la tabla de stats.");

        const headers = table.find('thead tr').last().find('th, td');
        let idxK = -1, idxD = -1, idxA = -1;

        headers.each((i, el) => {
            const txt = $(el).text().trim().toUpperCase();
            if (txt === 'K' || txt.includes('KILLS')) idxK = i;
            if (txt === 'D' || txt.includes('DEATHS')) idxD = i;
            if (txt === 'A' || txt.includes('ASSISTS')) idxA = i;
        });

        // Fallback por si acaso
        if (idxK === -1) { idxK=4; idxD=5; idxA=6; }
        
        console.log(`📍 Columnas usadas -> K:${idxK}, D:${idxD}, A:${idxA}`);

        // --- 3. EXTRAER JUGADORES (LA CORRECCIÓN MÁGICA) ---
        const playersData = [];
        
        table.find('tbody tr').each((i, row) => {
            const cols = $(row).find('td');
            const name = $(row).find('.text-of').text().trim();
            
            if (!name) return; 

            const team = playersData.length < 5 ? teamA : teamB; 
            
            let agentSrc = $(row).find('img').first().attr('src');
            if (agentSrc && !agentSrc.startsWith('http')) agentSrc = 'https://www.vlr.gg' + agentSrc;

            // --- AQUÍ ESTÁ EL ARREGLO ---
            // Leemos el texto completo (ej: "42 15 27")
            const textK = $(cols).eq(idxK).text().trim();
            const textD = $(cols).eq(idxD).text().trim();
            const textA = $(cols).eq(idxA).text().trim();

            // Usamos Regex para tomar solo el PRIMER número que encuentre
            // match(/(\d+)/) devuelve un array, tomamos el índice [0]
            const cleanK = parseInt(textK.match(/(\d+)/)?.[0] || 0);
            const cleanD = parseInt(textD.match(/(\d+)/)?.[0] || 0);
            const cleanA = parseInt(textA.match(/(\d+)/)?.[0] || 0);

            playersData.push({
                match_id: MATCH_ID,
                player_name: name,
                team_name: team,
                agent_img: agentSrc || 'N/A',
                k: cleanK, // Ahora será 42, no 421527
                d: cleanD,
                a: cleanA
            });
        });

        console.log(`📊 Jugadores listos: ${playersData.length}`);
        
        // Verificación visual en el log para que estés tranquilo
        if (playersData.length > 0) {
            console.log(`🧐 Ejemplo Jugador 1 (${playersData[0].player_name}): K=${playersData[0].k}, D=${playersData[0].d}, A=${playersData[0].a}`);
        }

        // --- 4. GUARDAR ---
        console.log("💾 Guardando en Supabase...");

        await supabase.from('matches').upsert({
            id: MATCH_ID, team_a: teamA, team_b: teamB, score_a: scoreA, score_b: scoreB, status: 'COMPLETED', last_update: new Date()
        });

        await supabase.from('match_stats').delete().eq('match_id', MATCH_ID);
        const { error } = await supabase.from('match_stats').insert(playersData);

        if (error) console.error("❌ Error Supabase:", error.message);
        else console.log("🎉 ¡ÉXITO TOTAL! Kills corregidas y datos guardados.");

    } catch (err) {
        console.error("❌ ERROR:", err.message);
        process.exit(1);
    }
}

clonarDefinitivo();