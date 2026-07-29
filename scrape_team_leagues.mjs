import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import axios from 'axios';
import https from 'https';
import crypto from 'crypto';

dotenv.config({ path: '.env.local' });

// --- CONFIGURACIÓN DE RED ---
const httpsAgent = new https.Agent({
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    rejectUnauthorized: false
});

const axiosClient = axios.create({
    httpsAgent: httpsAgent,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Connection': 'keep-alive'
    }
});

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const clean = (s) => s ? s.replace(/[\n\t\r]/g, ' ').replace(/\s+/g, ' ').trim() : '';

// Mapa de abreviaturas VLR.gg a nombres de tier
const TIER_MAP = {
    'vct': 'VCT',
    'vcl': 'VCL',
    't3': 'T3',
    'gc': 'GC',
    'cg': 'CG',
    'off': 'Off'
};

// Regiones disponibles en VLR.gg
const REGIONS = ['AMER', 'EMEA', 'PAC', 'CN'];

async function crearTablaTeamLeagues() {
    console.log("📋 Verificando tabla team_leagues...");

    // Intentamos crear la tabla si no existe
    // (Supabase RLS permite upsert pero no CREATE si el usuario no tiene permisos)
    // Así que simplemente intentamos insertar y si falla, lo ignoramos

    try {
        await supabase.from('team_leagues').select('*').limit(1);
        console.log("   ✅ Tabla team_leagues existe.");
    } catch (e) {
        console.log("   ⚠️ Tabla team_leagues no existe. Asegúrate de crearla en Supabase con:");
        console.log("      - team_name (text)");
        console.log("      - region (text)");
        console.log("      - tier (text)");
        console.log("      - tournament_name (text)");
        console.log("      - updated_at (timestamp)");
        return false;
    }

    return true;
}

async function extraerLigas() {
    console.log("\n📡 Escaneando ligas de vlr.gg...");
    try {
        const { data } = await axiosClient.get('https://www.vlr.gg/events');
        const $ = cheerio.load(data);

        const ligas = [];

        // Buscamos los tabs de TIER (VCT, VCL, T3, etc.)
        $('[class*="tier"]').each((i, el) => {
            const text = clean($(el).text()).toUpperCase();
            if (text && TIER_MAP[text.toLowerCase()]) {
                if (!ligas.find(l => l.tier === text)) {
                    ligas.push({ tier: TIER_MAP[text.toLowerCase()], abbr: text.toLowerCase() });
                }
            }
        });

        console.log(`   ✅ Encontrados ${ligas.length} tiers: ${ligas.map(l => l.tier).join(', ')}`);
        return ligas;
    } catch (e) {
        console.error(`❌ Error escaneando ligas:`, e.message);
        return [];
    }
}

async function extraerEquiposDeLiga(tier, region) {
    console.log(`   🔍 ${tier} - ${region}...`);
    try {
        // URL para filtrar por tier y región
        // VLR.gg estructura: /events?league=VCT&region=AMER (ejemplo)
        const url = `https://www.vlr.gg/events?league=${tier.toUpperCase()}&region=${region}`;
        const { data } = await axiosClient.get(url);
        const $ = cheerio.load(data);

        const equipos = [];

        // Cada evento tiene equipos. Buscamos enlaces a equipos dentro de eventos
        $('a[href*="/team/"]').each((i, el) => {
            const name = clean($(el).text());
            // Filtrar: debe tener nombre válido y no ser repetido
            if (name && name.length > 1 && name.length < 100 && !equipos.includes(name)) {
                equipos.push(name);
            }
        });

        console.log(`      → ${equipos.length} equipos en ${tier} ${region}`);
        return equipos;
    } catch (e) {
        console.error(`      ❌ Error:`, e.message);
        return [];
    }
}

async function runBatch() {
    // Verificar/crear tabla
    const tableExists = await crearTablaTeamLeagues();
    if (!tableExists) {
        console.log("\n❌ No se puede continuar sin la tabla team_leagues.");
        return;
    }

    // 1. Extraer ligas
    const ligas = await extraerLigas();
    if (ligas.length === 0) {
        console.log("❌ No se encontraron ligas.");
        return;
    }

    // 2. Para cada liga y región, extraer equipos
    const relacionesTeamLiga = [];

    for (const tier of ligas) {
        console.log(`\n⚙️ Procesando ${tier.tier}...`);

        for (const region of REGIONS) {
            const equipos = await extraerEquiposDeliga(tier.tier, region);

            equipos.forEach(nombreEquipo => {
                relacionesTeamLiga.push({
                    team_name: nombreEquipo,
                    region: region,
                    tier: tier.tier,
                    tournament_name: `${tier.tier} ${region}`,
                    updated_at: new Date()
                });
            });

            // Delay responsable entre requests
            await sleep(3000 + Math.random() * 2000);
        }
    }

    // 3. Guardar en Supabase
    console.log(`\n💾 Guardando ${relacionesTeamLiga.length} relaciones equipo-liga...`);

    if (relacionesTeamLiga.length > 0) {
        // Limpiar tabla antes de insertar (para evitar duplicados)
        await supabase.from('team_leagues').delete().neq('team_name', '');

        const { error } = await supabase.from('team_leagues').insert(relacionesTeamLiga);

        if (error) {
            console.error(`❌ Error guardando:`, error.message);
        } else {
            console.log(`✅ ${relacionesTeamLiga.length} relaciones guardadas!`);
        }
    }

    console.log("\n🏁 Fin.");
}

runBatch().catch(e => console.error("Error crítico:", e.message));
