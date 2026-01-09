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

// Función auxiliar para limpiar texto sucio (saltos de linea, espacios dobles)
const cleanText = (txt) => txt ? txt.replace(/[\n\t\r]/g, ' ').replace(/\s+/g, ' ').trim() : '';

async function scrapearPartido(matchId) {
    console.log(`\n🔍 Analizando partido: ${matchId}...`);
    try {
        const url = `https://www.vlr.gg/${matchId}`;
        const response = await fetch(url, {
            // User-Agent actualizado para evitar bloqueos
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123.0.0.0 Safari/537.36' }
        });

        if (!response.ok) {
            console.error(`   ❌ Error HTTP ${response.status}`);
            return;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // --- 1. DATOS GENERALES (FUERZA BRUTA) ---
        // Limpiamos los nombres (quita los saltos de linea feos)
        const teamA = cleanText($('.match-header-link-name').eq(0).text());
        const teamB = cleanText($('.match-header-link-name').eq(1).text());

        // BÚSQUEDA DE SCORE:
        // Estrategia 1: Buscar en el contenedor central completo y sacar números
        const headerScoreText = $('.match-header-vs-score').text();
        const scoreMatch = headerScoreText.match(/(\d+)/g); // Busca todos los grupos de números
        
        let scoreA = 0;
        let scoreB = 0;

        if (scoreMatch && scoreMatch.length >= 2) {
            // Si encontró números en el centro (ej: "2 : 1")
            scoreA = parseInt(scoreMatch[0]);
            scoreB = parseInt(scoreMatch[1]);
        } else {
            // Estrategia 2: Contar mapas ganados (puntitos verdes)
            console.log("   ⚠️ Score numérico no claro, contando mapas ganados...");
            scoreA = $('.match-header-link.mod-1 .wf-score-point.mod-win').length;
            scoreB = $('.match-header-link.mod-2 .wf-score-point.mod-win').length;
        }

        console.log(`   ✅ MATCH: ${teamA} [${scoreA}-${scoreB}] ${teamB}`);

        // --- 2. DETECTAR MAPAS (SELECTOR MEJORADO) ---
        const mapsData = [];
        
        // Buscamos el contenedor de navegación de stats
        const mapTabs = $('.vm-stats-games-nav-item');
        
        if (mapTabs.length === 0) {
             console.warn("   ⚠️ No encontré pestañas de mapas. ¿Cambió el HTML?");
        }

        mapTabs.each((i, el) => {
            // El texto suele ser "MapName 13-9" o "All Maps"
            const rawText = cleanText($(el).text()); 
            
            // Ignoramos la pestaña "All Maps"
            if (rawText.toLowerCase().includes('all')) return;

            // Extraemos nombre y números
            // Ej: "Ascent 13-5" -> match con letras y luego números
            const mapNameMatch = rawText.match(/^([a-zA-Z0-9\s]+)/);
            const scoreMatch = rawText.match(/(\d+)[:\-\s]+(\d+)/);

            if (mapNameMatch && scoreMatch) {
                const mapName = mapNameMatch[1].trim();
                const s1 = parseInt(scoreMatch[1]);
                const s2 = parseInt(scoreMatch[2]);

                mapsData.push({
                    match_id: matchId,
                    map_name: mapName,
                    score_a: s1,
                    score_b: s2
                });
            }
        });

        console.log(`   🗺️ Mapas extraídos: ${mapsData.length} (${mapsData.map(m => m.map_name).join(', ')})`);

        // --- 3. JUGADORES ---
        const table = $('.vm-stats-game[data-game-id="all"] table');
        const playersData = [];
        
        if (table.length > 0) {
            const headers = table.find('thead tr').last().find('th, td');
            let idxK=4, idxD=5, idxA=6; 
            
            // Escaneo dinámico de columnas
            headers.each((i, el) => {
                const txt = $(el).text().trim().toUpperCase();
                if (txt.includes('K') && !txt.includes('KAST')) idxK = i;
                if (txt === 'D') idxD = i;
                if (txt === 'A') idxA = i;
            });

            table.find('tbody tr').each((i, row) => {
                const cols = $(row).find('td');
                const name = cleanText($(row).find('.text-of').first().text()); // Nombre limpio
                if (!name) return; 

                const team = playersData.length < 5 ? teamA : teamB; 
                let agentSrc = $(row).find('img').first().attr('src');
                if (agentSrc && !agentSrc.startsWith('http')) agentSrc = 'https://www.vlr.gg' + agentSrc;

                // Regex para extraer SOLO el número (ignora espacios o paréntesis)
                const getStat = (idx) => parseInt($(cols).eq(idx).text().match(/(\d+)/)?.[0] || 0);

                playersData.push({
                    match_id: matchId,
                    player_name: name,
                    team_name: team,
                    agent_img: agentSrc,
                    k: getStat(idxK),
                    d: getStat(idxD),
                    a: getStat(idxA)
                });
            });
        }

        // --- 4. GUARDAR EN SUPABASE ---
        if (playersData.length > 0) {
            // A. Match
            await supabase.from('matches').upsert({
                id: matchId, 
                team_a: teamA, 
                team_b: teamB, 
                score_a: scoreA, 
                score_b: scoreB, 
                status: 'COMPLETED', 
                last_update: new Date()
            });

            // B. Maps
            if (mapsData.length > 0) {
                await supabase.from('match_maps').delete().eq('match_id', matchId);
                const { error: errMap } = await supabase.from('match_maps').insert(mapsData);
                if (errMap) console.error("Error guardando mapas:", errMap.message);
            }

            // C. Stats
            await supabase.from('match_stats').delete().eq('match_id', matchId);
            const { error: errStat } = await supabase.from('match_stats').insert(playersData);
            
            if (!errStat) console.log("   💾 ¡Guardado exitoso!");
            else console.error("Error guardando stats:", errStat.message);
        } else {
            console.log("   ⚠️ No se encontraron jugadores, saltando guardado.");
        }

    } catch (err) {
        console.error(`   ❌ Error crítico en ${matchId}:`, err.message);
    }
}

async function runBatch() {
    const ids = await obtenerIdsRecientes();
    console.log(`🎯 Procesando los últimos ${ids.length} partidos...`);
    for (const id of ids) {
        await scrapearPartido(id);
        // Espera pequeña para no saturar
        await sleep(DELAY_MS);
    }
    console.log("\n🏁 Proceso finalizado.");
}

runBatch();