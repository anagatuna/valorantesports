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

// Mapeo de regiones en VLR.gg
const REGION_MAP = {
    'north america': 'AMERICAS',
    'latin america': 'AMERICAS',
    'brazil': 'AMERICAS',
    'europe': 'EMEA',
    'middle east': 'EMEA',
    'africa': 'EMEA',
    'pacific': 'PACIFIC',
    'korea': 'PACIFIC',
    'japan': 'PACIFIC',
    'southeast asia': 'PACIFIC',
    'china': 'CN',
    'americas': 'AMERICAS',
    'emea': 'EMEA'
};

function normalizeRegion(regionStr) {
    if (!regionStr) return 'UNKNOWN';
    const lower = regionStr.toLowerCase().trim();
    return REGION_MAP[lower] || 'UNKNOWN';
}

async function extraerEquipos() {
    console.log("📡 Escaneando equipos de vlr.gg...");
    try {
        const { data } = await axiosClient.get('https://www.vlr.gg/teams');
        const $ = cheerio.load(data);

        const equipos = [];

        // VLR.gg lista equipos en una grid/tabla. Buscamos enlaces que apunten a equipos.
        $('a[href*="/team/"]').each((i, el) => {
            const href = $(el).attr('href');
            const name = clean($(el).text());

            // Filtrar solo si tiene nombre y es un enlace a equipo válido
            if (name && href && href.startsWith('/team/')) {
                // Buscar logo (img cerca del enlace)
                let logoSrc = $(el).find('img').first().attr('src');
                if (logoSrc && logoSrc.startsWith('//')) logoSrc = 'https:' + logoSrc;

                equipos.push({
                    href,
                    name,
                    logo: logoSrc || null
                });
            }
        });

        // Eliminar duplicados por href
        const unique = {};
        equipos.forEach(e => {
            if (!unique[e.href]) unique[e.href] = e;
        });

        const equiposUnicos = Object.values(unique);
        console.log(`   ✅ Encontrados ${equiposUnicos.length} equipos únicos.`);

        return equiposUnicos;
    } catch (e) {
        console.error(`❌ Error escaneando equipos:`, e.message);
        return [];
    }
}

async function extraerDetallesEquipo(href, index, total) {
    console.log(`\n[${index + 1}/${total}] 🔍 ${href}...`);
    try {
        const url = `https://www.vlr.gg${href}`;
        const { data } = await axiosClient.get(url);
        const $ = cheerio.load(data);

        // Nombre del equipo
        const name = clean($('h1').first().text()) || clean($('.team-name').text());

        // Logo
        let logo = $('img.team-logo, img.team-image').first().attr('src');
        if (logo && logo.startsWith('//')) logo = 'https:' + logo;

        // Región: buscamos en texto o atributos
        let region = 'UNKNOWN';
        const regionText = clean($('[class*="region"], [class*="country"], .team-region').text());
        if (regionText) {
            region = normalizeRegion(regionText);
        }

        // Tier: puede estar en clase CSS o en texto
        let tier = 'UNKNOWN';
        const tierText = clean($('[class*="tier"], .team-tier').text().toLowerCase());
        if (tierText.includes('tier 1') || tierText.includes('tier1')) tier = 'TIER1';
        else if (tierText.includes('tier 2') || tierText.includes('tier2')) tier = 'TIER2';
        else if (tierText.includes('tier 3') || tierText.includes('tier3')) tier = 'TIER3';

        // Roster: buscar jugadores en la página
        const players = [];
        $('[class*="player"], .roster-player, .team-player').each((_, el) => {
            const playerName = clean($(el).text());
            if (playerName && playerName.length > 1 && playerName.length < 50) {
                players.push(playerName);
            }
        });

        // Si no encontramos roster de esa forma, intentar con otra estructura
        if (players.length === 0) {
            $('a[href*="/player/"]').each((_, el) => {
                const playerName = clean($(el).text());
                if (playerName && !players.includes(playerName)) {
                    players.push(playerName);
                }
            });
        }

        const roster = players.length > 0 ? JSON.stringify(players.slice(0, 10)) : '[]'; // Max 10 jugadores

        console.log(`   📌 ${name} | ${region} | ${tier} | ${players.length} jugadores`);

        return {
            name,
            logo,
            region,
            tier,
            roster,
            href,
            updated_at: new Date()
        };
    } catch (e) {
        console.error(`   ❌ Error:`, e.message);
        return null;
    }
}

async function runBatch() {
    // 1. Extraer lista de equipos
    const equiposBasicos = await extraerEquipos();

    if (equiposBasicos.length === 0) {
        console.log("❌ No se encontraron equipos.");
        return;
    }

    // 2. Procesar cada equipo con delay responsable
    const equiposCompletos = [];
    for (let i = 0; i < equiposBasicos.length; i++) {
        const detalles = await extraerDetallesEquipo(equiposBasicos[i].href, i, equiposBasicos.length);
        if (detalles) {
            // Fusionar info básica con detalles
            equiposCompletos.push({
                ...equiposBasicos[i],
                ...detalles
            });
        }

        // Delay responsable: 4-6 segundos entre requests
        const delay = 4000 + Math.random() * 2000;
        await sleep(delay);
    }

    console.log(`\n💾 Guardando ${equiposCompletos.length} equipos en Supabase...`);

    // 3. Guardar en Supabase (upsert por nombre para evitar duplicados)
    if (equiposCompletos.length > 0) {
        const { error } = await supabase.from('teams').upsert(
            equiposCompletos.map(e => ({
                name: e.name,
                img: e.logo,
                region: e.region,
                tier: e.tier,
                roster: e.roster,
                updated_at: e.updated_at
            })),
            { onConflict: 'name' }
        );

        if (error) {
            console.error(`❌ Error guardando:`, error.message);
        } else {
            console.log(`✅ ${equiposCompletos.length} equipos guardados!`);
        }
    }

    console.log("\n🏁 Fin.");
}

runBatch().catch(e => console.error("Error crítico:", e.message));
