// test_db.mjs
import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio' 

// --- AQUI EL CAMBIO IMPORTANTE ---
// Ya no escribimos las claves, las leemos del "ambiente" del servidor
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Error: Faltan las variables de entorno (Keys)");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey)
const MATCH_ID = '353174'; 

async function clonarNube() {
    console.log("☁️ Iniciando ejecución desde la Nube...");

    try {
        const url = `https://www.vlr.gg/${MATCH_ID}`;
        console.log(`🌐 Intentando acceder a: ${url}`);

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) throw new Error(`Bloqueo o Error HTTP: ${response.status}`);
        
        const html = await response.text();
        const $ = cheerio.load(html);

        // Extracción (Igual que antes)
        const teamA = $('.match-header-link-name').eq(0).text().trim();
        const teamB = $('.match-header-link-name').eq(1).text().trim();
        const scoreText = $('.match-header-vs-score').text().trim(); 
        const scores = scoreText.split(':');
        
        let scoreA = parseInt(scores[0]);
        let scoreB = parseInt(scores[1]);
        
        // Estado
        let status = 'UPCOMING';
        const note = $('.match-header-vs-note').text().toLowerCase();
        if (note.includes('final') || note.includes('finished')) status = 'COMPLETED';
        if (note.includes('live')) status = 'LIVE';

        console.log(`✅ DATOS OBTENIDOS: ${teamA} [${scoreA}-${scoreB}] ${teamB}`);

        const { error } = await supabase
            .from('matches')
            .upsert({
                id: MATCH_ID,
                team_a: teamA,
                team_b: teamB,
                score_a: scoreA,
                score_b: scoreB,
                status: status,
                last_update: new Date()
            });

        if (error) console.error("❌ Error Supabase:", error.message);
        else console.log("🎉 ¡ÉXITO! Datos enviados a Supabase desde la nube.");

    } catch (err) {
        console.error("❌ Fallo crítico:", err.message);
        process.exit(1); // Importante para que GitHub sepa que falló
    }
}

clonarNube();