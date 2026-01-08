// test_db.mjs
import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio' 

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Usaremos la final del Champions (EDG vs Heretics) que tiene muchos datos
const MATCH_ID = '353174'; 

async function clonarCompleto() {
    console.log("🔥 Iniciando Scraping PRO (Score + Stats)...");

    try {
        const url = `https://www.vlr.gg/${MATCH_ID}`;
        
        // Headers para parecer un humano real
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
        const html = await response.text();
        const $ = cheerio.load(html);

        // --- 1. DATOS GENERALES ---
        // Usamos selectores más específicos para evitar errores
        const teamA = $('.match-header-link-name').eq(0).text().trim();
        const teamB = $('.match-header-link-name').eq(1).text().trim();
        
        // Limpieza del marcador (para evitar el NULL)
        const scoreText = $('.match-header-vs-score').text().replace(/\s/g, '').trim(); // Quitamos espacios extra
        const scores = scoreText.split(':');
        
        // Si no encuentra números, ponemos 0 para que no rompa la DB
        const scoreA = scores[0] ? parseInt(scores[0]) : 0;
        const scoreB = scores[1] ? parseInt(scores[1]) : 0;

        console.log(`✅ PARTIDA: ${teamA} [${scoreA}-${scoreB}] ${teamB}`);

        // --- 2. EXTRAER JUGADORES (Kills + Agentes) ---
        const playersData = [];
        
        // Buscamos la tabla "Overview"
        const statsTable = $('.vm-stats-game[data-game-id="all"] table');

        statsTable.find('tbody tr').each((i, row) => {
            const name = $(row).find('.text-of').text().trim();
            // Los primeros 5 jugadores son del equipo A, los siguientes 5 del B
            const team = i < 5 ? teamA : teamB; 

            // Buscar imagen del agente
            let agentSrc = $(row).find('td.mod-agents img').attr('src');
            if (agentSrc && !agentSrc.startsWith('http')) agentSrc = 'https://www.vlr.gg' + agentSrc;

            // Stats (K/D/A están en posiciones fijas)
            // K=columna 4, D=columna 5, A=columna 6 (aprox, usamos indices de mod-stat)
            const k = $(row).find('td.mod-stat').eq(2).text().trim(); 
            const d = $(row).find('td.mod-stat').eq(3).text().trim(); 
            const a = $(row).find('td.mod-stat').eq(4).text().trim(); 

            if (name) {
                playersData.push({
                    match_id: MATCH_ID,
                    player_name: name,
                    team_name: team,
                    agent_img: agentSrc || 'N/A',
                    k: parseInt(k) || 0,
                    d: parseInt(d) || 0,
                    a: parseInt(a) || 0
                });
            }
        });

        console.log(`📊 Jugadores encontrados: ${playersData.length}`);

        // --- 3. GUARDAR EN SUPABASE ---
        
        // A. Guardar/Actualizar la Partida
        await supabase.from('matches').upsert({
            id: MATCH_ID,
            team_a: teamA,
            team_b: teamB,
            score_a: scoreA,
            score_b: scoreB,
            status: 'COMPLETED',
            last_update: new Date()
        });

        // B. Guardar Stats (Borrar viejos -> Insertar nuevos)
        // Esto evita que se dupliquen si corres el script 2 veces
        await supabase.from('match_stats').delete().eq('match_id', MATCH_ID);
        
        const { error } = await supabase.from('match_stats').insert(playersData);

        if (error) console.error("❌ Error guardando stats:", error.message);
        else console.log("🎉 ¡ÉXITO! Stats completas guardadas en Supabase.");

    } catch (err) {
        console.error("❌ Fallo crítico:", err.message);
        process.exit(1);
    }
}

clonarCompleto();