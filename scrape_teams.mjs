const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client'); // Si usas Prisma

const prisma = new PrismaClient();

// --- CONFIGURACIÓN ---
const TARGET_URL = 'https://vlr.gg/teams'; 
// Ajusta estos selectores según la web real
const SELECTORS = {
    container: '.rank-item', 
    name: '.ge-text', 
    logo: 'img' 
};

// Carpeta donde se guardarán (dentro de tu proyecto Next.js)
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const TEAMS_DIR = '/teams'; // Ruta relativa para la DB
const SAVE_PATH = path.join(PUBLIC_DIR, TEAMS_DIR);

// --- UTILIDADES ---

// Normaliza nombres para usar como nombre de archivo (ej: "KRÜ Esports" -> "kru-esports")
function getSafeFilename(name) {
    return name.toLowerCase()
        .replace(/[áàäâ]/g, 'a')
        .replace(/[éèëê]/g, 'e')
        .replace(/[íìïî]/g, 'i')
        .replace(/[óòöô]/g, 'o')
        .replace(/[úùüû]/g, 'u')
        .replace(/ñ/g, 'n')
        .replace(/[^a-z0-9]/g, '-') // Reemplaza símbolos por guiones
        .replace(/-+/g, '-')        // Elimina guiones dobles
        .replace(/^-|-$/g, '');     // Elimina guiones al inicio/final
}

// Función para descargar imagen
async function downloadImage(url, filename) {
    try {
        const filePath = path.join(SAVE_PATH, filename);
        
        // Si ya existe, nos la saltamos (opcional: quitar este if para forzar actualización)
        if (fs.existsSync(filePath)) {
            // console.log(`⏩ Imagen ya existe: ${filename}`);
            return true;
        }

        const response = await axios({
            url,
            method: 'GET',
            responseType: 'arraybuffer' // Importante para imágenes
        });

        fs.writeFileSync(filePath, response.data);
        console.log(`⬇️  Descargada: ${filename}`);
        return true;
    } catch (e) {
        console.error(`❌ Error descargando ${url}:`, e.message);
        return false;
    }
}

// --- MAIN ---

async function main() {
    // Asegurar que la carpeta existe
    if (!fs.existsSync(SAVE_PATH)) {
        fs.mkdirSync(SAVE_PATH, { recursive: true });
    }

    console.log(`🔍 Scrapeando ${TARGET_URL}...`);
    
    try {
        const { data } = await axios.get(TARGET_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(data);
        const teams = [];

        // 1. EXTRAER DATOS
        $(SELECTORS.container).each((i, el) => {
            const name = $(el).find(SELECTORS.name).text().trim();
            let rawUrl = $(el).find(SELECTORS.logo).attr('src');

            if (name && rawUrl) {
                // Arreglar URLs relativas
                if (rawUrl.startsWith('//')) rawUrl = 'https:' + rawUrl;
                else if (rawUrl.startsWith('/')) rawUrl = 'https://vlr.gg' + rawUrl;
                
                teams.push({ name, rawUrl });
            }
        });

        console.log(`✅ Encontrados ${teams.length} equipos. Iniciando descarga...`);

        // 2. PROCESAR Y GUARDAR
        for (const team of teams) {
            // Generar nombre de archivo: "leviatan.png"
            const ext = path.extname(team.rawUrl) || '.png';
            const fileName = `${getSafeFilename(team.name)}${ext}`;
            
            // Intentar descarga
            const success = await downloadImage(team.rawUrl, fileName);

            if (success) {
                // Ruta que guardaremos en la DB (ej: "/teams/leviatan.png")
                const dbPath = `${TEAMS_DIR}/${fileName}`;

                // Guardar en DB
                await prisma.team.upsert({
                    where: { name: team.name },
                    update: { logoDb: dbPath }, // Actualizamos con la ruta local
                    create: {
                        name: team.name,
                        logoDb: dbPath
                    }
                });
            }
        }

        console.log('✨ Proceso finalizado.');

    } catch (error) {
        console.error('Fatal Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();