// test_db.mjs
import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio' 

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// ID de la partida (Puedes cambiar esto por la que quieras probar)
const MATCH_ID = '353174'; 

async function clonarReparado() {
    console.log("🚑 Iniciando Script de Reparación (Score y Deaths)...");

    try {
        const url = `https://www.vlr.gg/${MATCH_ID}`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
        const html = await response.text();
        const $ = cheerio.load(html);

        // --- 1. ARREGLO DEL SCORE (NULL) ---
        const teamA = $('.match-header-link-name').eq(0).text().trim();
        const teamB = $('.match-header-link-name').eq(1).text().trim();
        
        // TRUCO: En lugar de split(':'), buscamos cualquier número que aparezca en el texto
        const scoreRaw = $('.match-header-vs-score').text();
        const scoreNumbers = scoreRaw.match(/(\d+)/g); // Esto devuelve un array ej: ["3", "2"]

        // Si encontró números, los usamos. Si no, 0.
        const scoreA = scoreNumbers ? parseInt(scoreNumbers[0]) : 0;
        const scoreB = scoreNumbers ? parseInt(scoreNumbers[1]) : 0;

        console.log(`✅ MARCADOR DETECTADO: ${teamA} [${scoreA}-${scoreB}] ${teamB}`);

        // --- 2. ARREGLO DE LAS DEATHS (0) ---
        const playersData = [];
        const statsTable = $('.vm-stats-game[data-game-id="all"] table');

        statsTable.find('tbody tr').each((i, row) => {
            const name = $(row).find('.text-of').text().trim();
            const team = i < 5 ? teamA : teamB; 

            // Imagen del agente
            let agentSrc = $(row).find('td.mod-agents img').attr('src');
            if (agentSrc && !agentSrc.startsWith('http')) agentSrc = 'https://www.vlr.gg' + agentSrc;

            // --- AQUÍ ESTABA EL ERROR DE LAS DEATHS ---
            // VLR tiene muchas columnas. Vamos a contar todas las celdas (td)
            // Estructura usual: [0]Nombre [1]Agente [2]Rating [3]ACS [4]Kills [5]Deaths [6]Assists
            
            const cols = $(row).find('td'); // Obtenemos todas las celdas de la fila
            
            // Usamos índices directos que son más seguros
            const k = $(cols).eq(4).text().trim(); // Columna 5
            const d = $(cols).eq(5).text().trim(); // Columna 6 (Deaths)
            const a = $(cols).eq(6).text().trim(); // Columna 7
            
            // Verificamos si son números (a veces tienen parentesis), limpiamos
            const cleanNum = (str) => parseInt(str.replace(/\D/g, '')) || 0;

            if (name) {
                playersData.push({
                    match_id: MATCH_ID,
                    player_name: name,
                    team_name: team,
                    agent_img: agentSrc || 'N/A',
                    k: cleanNum(k),
                    d: cleanNum(d), // Ahora debería leer el número correcto
                    a: cleanNum(a)
                });
            }
        });

        console.log(`📊 Jugadores procesados: ${playersData.length}`);

        // --- 3. GUARDAR ---
        
        // Guardamos Match con el Score corregido
        await supabase.from('matches').upsert({
            id: MATCH_ID,
            team_a: teamA,
            team_b: teamB,
            score_a: scoreA,
            score_b: scoreB,
            status: 'COMPLETED',
            last_update: new Date()
        });

        // Borramos stats viejos (los que tenían 0 deaths) e insertamos los nuevos
        await supabase.from('match_stats').delete().eq('match_id', MATCH_ID);
        
        const { error } = await supabase.from('match_stats').insert(playersData);

        if (error) console.error("❌ Error Supabase:", error.message);
        else console.log("🎉 ¡DATOS CORREGIDOS! Revisa Supabase ahora.");

    } catch (err) {
        console.error("❌ Fallo:", err.message);
        process.exit(1);
    }
}

clonarReparado();