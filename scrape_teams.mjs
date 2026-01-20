import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Configurar plugin Stealth para evadir bloqueos
puppeteer.use(StealthPlugin());

// Cargar variables (Local o CI)
dotenv.config({ path: '.env.local' });

// 1. CONFIGURACIÓN DE SUPABASE (Compatible con tu YAML)
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Faltan credenciales de Supabase (SUPABASE_URL o SUPABASE_KEY).');
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const TARGET_URL = 'https://vlr.gg/rankings/na'; 

async function main() {
    console.log(`🚀 Iniciando Scrape de Equipos en ${TARGET_URL}...`);

    // 2. LANZAMIENTO DEL NAVEGADOR (Modo CI/Headless)
    const browser = await puppeteer.launch({
        headless: "new", // IMPORTANTE: "new" para GitHub Actions (sin ventana)
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    });

    try {
        const page = await browser.newPage();
        
        // Bloquear carga de recursos innecesarios (CSS, Fuentes, Imágenes) para ir rápido
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Esperar selector
        try {
            await page.waitForSelector('tr', { timeout: 15000 });
        } catch (e) {
            console.log("⚠️ Timeout esperando tabla. Intentando leer igual...");
        }

        // 3. EXTRACCIÓN DE DATOS
        const teamsFound = await page.evaluate(() => {
            const rows = document.querySelectorAll('tr');
            const data = [];
            
            rows.forEach(row => {
                const nameEl = row.querySelector('.ge-text');
                const imgEl = row.querySelector('img');
                
                if (nameEl && imgEl) {
                    const name = nameEl.innerText.trim();
                    let rawUrl = imgEl.src;
                    
                    if (name && rawUrl) {
                        // Limpieza básica de URL
                        if (rawUrl.startsWith('//')) rawUrl = 'https:' + rawUrl;
                        if (!rawUrl.includes('mod_vlr')) { 
                            data.push({ name, rawUrl });
                        }
                    }
                }
            });
            return data;
        });

        console.log(`✅ Equipos encontrados: ${teamsFound.length}`);
        await browser.close();

        if (teamsFound.length === 0) {
            console.log("❌ No se encontraron equipos. Posible bloqueo de Cloudflare.");
            process.exit(0);
        }

        // 4. GUARDADO EN BASE DE DATOS
        console.log(`💾 Guardando en Supabase...`);

        for (const team of teamsFound) {
            // NOTA: En GitHub Actions no descargamos la imagen al disco porque se borra.
            // Guardamos la URL remota (rawUrl) directamente en la BD.
            
            const { error } = await supabase
                .from('teams')
                .upsert({ 
                    name: team.name, 
                    logoDb: team.rawUrl // Guardamos la URL de VLR directo
                }, { onConflict: 'name' });

            if (error) console.error(`❌ Error Supabase (${team.name}):`, error.message);
        }

        console.log('✨ Base de datos actualizada correctamente.');

    } catch (error) {
        console.error('❌ Error fatal:', error);
        await browser.close();
        process.exit(1);
    }
}

main();