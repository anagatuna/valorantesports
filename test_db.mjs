// test_db.mjs
import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio' 

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Tu ID actual (Fnatic vs Liquid)
const MATCH_ID = '353174'; // NOTA: Si estás probando con Fnatic vs Liquid, asegúrate que este ID sea el correcto (421527) o el que estés usando.

async function clonarDiagnostico() {
    console.log("🕵️ Iniciando Diagnóstico DETECTIVE...");

    try {
        // Vamos a usar la URL que te estaba dando el error
        // Si antes te salía Fnatic vs Liquid, es porque estabas scrapeando esa URL. 
        // Voy a intentar leer el ID de la variable, pero si lo cambiaste manualmente, asegúrate de que coincida.
        const url = `https://www.vlr.gg/${MATCH_ID}`; 
        console.log(`🌐 Analizando URL: ${url}`);

        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36' }
        });

        const html = await response.text();
        const $ = cheerio.load(html);

        // --- EXTRACCIÓN SIMPLE PARA VER QUÉ PASA ---
        const table = $('.vm-stats-game[data-game-id="all"] table');
        const rows = table.find('tbody tr');
        const firstRow = rows.first(); // Solo miramos la primera fila (Derke/Alfajer/etc)
        const cols = firstRow.find('td');

        // Vamos a imprimir EL TEXTO EXACTO de cada columna para ver dónde se esconde el 421527
        console.log("------------------------------------------------");
        console.log("🧐 INSPECCIÓN DE LA PRIMERA FILA (Buscando el número 421527):");
        
        cols.each((i, el) => {
            const textoLimpio = $(el).text().replace(/\s+/g, ' ').trim(); // Quitamos espacios raros
            console.log(`Columna ${i}: [${textoLimpio}]`);
        });

        // Simulamos la extracción de Kills (normalmente columna 4 o 5)
        // Intenta adivinar dónde cae el error
        const k_col4 = $(cols).eq(4).text().replace(/\D/g, '');
        const k_col5 = $(cols).eq(5).text().replace(/\D/g, '');
        
        console.log(`\n¿Qué guardaría el scraper actual?`);
        console.log(`Si K es Col 4: ${k_col4} (Parsed: ${parseInt(k_col4)})`);
        console.log(`Si K es Col 5: ${k_col5} (Parsed: ${parseInt(k_col5)})`);
        console.log("------------------------------------------------");

        // NO GUARDAMOS NADA para no causar error, solo queremos ver el log.
        console.log("✅ Diagnóstico finalizado. No se tocó la base de datos.");

    } catch (err) {
        console.error("❌ ERROR:", err.message);
    }
}

clonarDiagnostico();