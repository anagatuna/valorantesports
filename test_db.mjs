// test_db.mjs
import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio' 

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// ID de partida (EDG vs Heretics)
const MATCH_ID = '353174'; 

async function clonarBlindado() {
    console.log("🛡️ Iniciando Scraping Blindado...");

    try {
        const url = `https://www.vlr.gg/${MATCH_ID}`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
        const html = await response.text();
        const $ = cheerio.load(html);

        // --- 1. DATOS GENERALES ---
        const teamA = $('.match-header-link-name').eq(0).text().trim();
        const teamB = $('.match-header-link-name').eq(1).text().trim();
        
        // Regex para sacar números del marcador de forma segura
        const scoreRaw = $('.match-header-vs-score').text();
        const scoreNumbers = scoreRaw.match(/(\d+)/g); 
        const scoreA = scoreNumbers ? parseInt(scoreNumbers[0]) : 0;
        const scoreB = scoreNumbers ? parseInt(scoreNumbers[1]) : 0;

        console.log(`✅ MATCH: ${teamA} [${scoreA}-${scoreB}] ${teamB}`);

        // --- 2. EXTRAER JUGADORES (Estrategia agresiva) ---
        const playersData = [];
        
        // En lugar de buscar una tabla específica, buscamos TODAS las filas que tengan clase 'mod-player'
        // Esto es mucho más seguro porque vlr usa esta clase en casi todas sus tablas
        // Filtramos para asegurarnos de que estamos en la tabla de "Overview" (la que tiene K/D/A)
        
        // Buscamos la tabla que contiene encabezados de stats
        const allTables = $('table.wf-table');
        let targetTable = null;

        allTables.each((i, table) => {
            // Buscamos la tabla que tenga "K" y "D" y "A" en sus cabeceras
            const headers = $(table).text();
            if (headers.includes('K') && headers.includes('D') && headers.includes('A') && !targetTable) {
                targetTable = $(table);
            }
        });

        if (!targetTable) throw new Error("No pude encontrar la tabla de estadísticas en el HTML.");

        // Ahora iteramos sobre las filas de ESA tabla
        targetTable.find('tbody tr').each((i, row) => {
            // Nombre
            const name = $(row).find('.text-of').text().trim();
            
            // Si no hay nombre, saltamos (es una fila vacía o de separador)
            if (!name) return;

            // Equipo (Lógica simple: primeros 5 son equipo A)
            // Nota: En un script final, deberíamos leer el nombre del equipo de la cabecera, pero esto funciona el 99% de veces.
            const team = playersData.length < 5 ? teamA : teamB; 

            // Agente
            let agentSrc = $(row).find('img').first().attr('src'); // Primera imagen de la fila suele ser el agente
            if (agentSrc && !agentSrc.startsWith('http')) agentSrc = 'https://www.vlr.gg' + agentSrc;

            // Stats - Buscamos todas las celdas numéricas (mod-stat)
            const stats = $(row).find('td.mod-stat');
            
            // En la tabla overview, K es el indice 2, D es 3, A es 4 usualmente.
            // A veces hay columnas ocultas. Vamos a asegurar con limpieza.
            const k = $(stats).eq(2).text().replace(/\D/g, ''); // Solo números
            const d = $(stats).eq(3).text().replace(/\D/g, '');
            const a = $(stats).eq(4).text().replace(/\D/g, '');

            playersData.push({
                match_id: MATCH_ID,
                player_name: name,
                team_name: team,
                agent_img: agentSrc || 'N/A',
                k: parseInt(k) || 0,
                d: parseInt(d) || 0,
                a: parseInt(a) || 0
            });
        });

        console.log(`📊 Jugadores encontrados: ${playersData.length}`);

        // --- 3. GUARDADO SEGURO (Safety Check) ---
        
        if (playersData.length === 0) {
            console.error("⚠️ ALERTA: No encontré jugadores. ABORTANDO OPERACIÓN para no borrar datos.");
            // Aquí terminamos la función sin tocar la base de datos
            return; 
        }

        if (playersData.length < 10) {
            console.warn("⚠️ ALERTA: Encontré menos de 10 jugadores. Algo podría estar mal, pero guardaré.");
        }

        // Si llegamos aquí, es seguro guardar
        console.log("💾 Datos válidos. Guardando en Supabase...");

        // 1. Match
        await supabase.from('matches').upsert({
            id: MATCH_ID,
            team_a: teamA,
            team_b: teamB,
            score_a: scoreA,
            score_b: scoreB,
            status: 'COMPLETED',
            last_update: new Date()
        });

        // 2. Stats (Solo borramos si tenemos los nuevos listos)
        await supabase.from('match_stats').delete().eq('match_id', MATCH_ID);
        const { error } = await supabase.from('match_stats').insert(playersData);

        if (error) console.error("❌ Error Supabase:", error.message);
        else console.log("🎉 ¡ÉXITO TOTAL! Base de datos actualizada y segura.");

    } catch (err) {
        console.error("❌ Error Crítico:", err.message);
        process.exit(1);
    }
}

clonarBlindado();