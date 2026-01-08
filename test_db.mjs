// test_db.mjs
import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio' 

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Tu ID actual (parece ser Fnatic vs Liquid)
const MATCH_ID = '353174'; 

async function clonarInteligente() {
    console.log("🧠 Iniciando Escáner Inteligente...");

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
        
        // Marcador seguro
        const scoreRaw = $('.match-header-vs-score').text();
        const scoreNumbers = scoreRaw.match(/(\d+)/g); 
        const scoreA = scoreNumbers ? parseInt(scoreNumbers[0]) : 0;
        const scoreB = scoreNumbers ? parseInt(scoreNumbers[1]) : 0;

        console.log(`✅ MATCH ENCONTRADO: ${teamA} [${scoreA}-${scoreB}] ${teamB}`);

        // --- 2. LOCALIZAR TABLA Y COLUMNAS ---
        
        // Paso A: Ir directo a la tabla "All Maps" (Overview)
        const table = $('.vm-stats-game[data-game-id="all"] table');
        
        if (table.length === 0) {
            // Plan B: Si no hay ID "all", busca la primera tabla grande
            console.log("⚠️ No encontré tabla 'all', buscando la primera tabla wf-table...");
            if ($('.wf-table').length === 0) throw new Error("No hay tablas en el HTML. ¿Bloqueo de Cloudflare?");
        }

        // Paso B: Mapear Columnas (Detectar dónde están K, D, A)
        // Buscamos en el <thead> todas las celdas
        const headers = table.find('thead tr').last().find('th, td'); // A veces usan th, a veces td
        
        let idxK = -1, idxD = -1, idxA = -1;

        headers.each((i, el) => {
            const txt = $(el).text().trim().toUpperCase(); // Convertimos a mayúsculas para comparar
            // VLR a veces usa "K" o "Kills"
            if (txt === 'K' || txt.includes('Kills')) idxK = i;
            if (txt === 'D' || txt.includes('Deaths')) idxD = i;
            if (txt === 'A' || txt.includes('Assists')) idxA = i;
        });

        console.log(`📍 Mapa de columnas detectado -> K:${idxK}, D:${idxD}, A:${idxA}`);

        if (idxK === -1 || idxD === -1) {
            // Si falló la detección automática, usamos los valores por defecto de VLR (Riesgoso pero necesario)
            console.warn("⚠️ No detecté columnas por nombre. Usando posiciones por defecto (4, 5, 6).");
            idxK = 4; idxD = 5; idxA = 6;
        }

        // --- 3. EXTRAER JUGADORES ---
        const playersData = [];
        const rows = table.find('tbody tr');

        rows.each((i, row) => {
            const cols = $(row).find('td');
            const name = $(row).find('.text-of').text().trim();
            
            if (!name) return; // Fila vacía

            const team = playersData.length < 5 ? teamA : teamB; 
            
            let agentSrc = $(row).find('img').first().attr('src');
            if (agentSrc && !agentSrc.startsWith('http')) agentSrc = 'https://www.vlr.gg' + agentSrc;

            // Usamos los índices que detectamos arriba
            const k = $(cols).eq(idxK).text().replace(/\D/g, '');
            const d = $(cols).eq(idxD).text().replace(/\D/g, '');
            const a = $(cols).eq(idxA).text().replace(/\D/g, '');

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

        console.log(`📊 Jugadores extraídos: ${playersData.length}`);

        // --- 4. GUARDADO BLINDADO ---
        if (playersData.length === 0) {
            throw new Error("❌ Cero jugadores encontrados. Cancelando guardado.");
        }

        console.log("💾 Guardando en Supabase...");

        await supabase.from('matches').upsert({
            id: MATCH_ID,
            team_a: teamA,
            team_b: teamB,
            score_a: scoreA,
            score_b: scoreB,
            status: 'COMPLETED',
            last_update: new Date()
        });

        await supabase.from('match_stats').delete().eq('match_id', MATCH_ID);
        const { error } = await supabase.from('match_stats').insert(playersData);

        if (error) console.error("❌ Error Supabase:", error.message);
        else console.log("🎉 ¡ÉXITO! Base de datos actualizada correctamente.");

    } catch (err) {
        console.error("❌ ERROR FINAL:", err.message);
        process.exit(1);
    }
}

clonarInteligente();