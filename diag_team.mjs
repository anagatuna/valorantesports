import * as cheerio from 'cheerio';
import axios from 'axios';
import https from 'https';
import crypto from 'crypto';

const httpsAgent = new https.Agent({
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    rejectUnauthorized: false
});

const axiosClient = axios.create({
    httpsAgent: httpsAgent,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    }
});

// Equipos de ejemplo para diagnosticar: uno de EMEA, uno de AMERICAS
const TEAMS = [
    '/team/2059/team-vitality',  // Team Vitality (EMEA)
    '/team/120/100-thieves'      // 100 Thieves (AMERICAS)
];

async function diag(href) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`DIAGNOSTICANDO: https://www.vlr.gg${href}`);
    console.log('='.repeat(70));

    try {
        const { data } = await axiosClient.get(`https://www.vlr.gg${href}`);
        const $ = cheerio.load(data);

        // 1. Título/nombre
        console.log('\n1. NOMBRE DEL EQUIPO:');
        console.log('   h1:', $('h1').first().text().trim().slice(0, 50));
        console.log('   .team-name:', $('.team-name').text().trim().slice(0, 50));
        console.log('   [class*="name"]:', $('[class*="name"]').first().text().trim().slice(0, 50));

        // 2. Región
        console.log('\n2. REGIÓN:');
        console.log('   [class*="region"]:', $('[class*="region"]').text().trim().slice(0, 100));
        console.log('   [class*="country"]:', $('[class*="country"]').text().trim().slice(0, 100));
        console.log('   .location:', $('.location').text().trim().slice(0, 100));
        console.log('   Text con "EMEA", "AMERICAS", etc:');
        const bodyText = $.text();
        const regionMatches = bodyText.match(/(EMEA|AMERICAS|PACIFIC|CHINA|Americas|Emea|Europe|North America|Brazil|Korea|Japan|Southeast Asia)/gi);
        if (regionMatches) console.log('     -', regionMatches.slice(0, 5));

        // 3. Tier
        console.log('\n3. TIER:');
        console.log('   [class*="tier"]:', $('[class*="tier"]').text().trim().slice(0, 100));
        console.log('   Text con "Tier 1", "Tier 2", etc:');
        const tierMatches = bodyText.match(/(Tier\s*[123]|TIER\s*[123])/gi);
        if (tierMatches) console.log('     -', tierMatches.slice(0, 5));

        // 4. Clases CSS únicas que mencionen región, tier, location
        console.log('\n4. CLASES CSS ÚNICAS (filtradas por region/tier/location):');
        const classSet = new Set();
        $.find('*').each((i, el) => {
            const cls = $(el).attr('class');
            if (cls && (cls.includes('region') || cls.includes('tier') || cls.includes('location') || cls.includes('country'))) {
                cls.split(/\s+/).forEach(c => classSet.add(c));
            }
        });
        console.log('   ', [...classSet].sort().join(', ') || '(ninguna)');

        // 5. HTML crudo de ciertos sectores
        console.log('\n5. HTML DE ÁREA "INFORMACIÓN" (primeros 1500 chars):');
        const infoSection = $('[class*="info"], [class*="header"], [class*="details"], header').first().html();
        if (infoSection) {
            console.log('   ', infoSection.slice(0, 1500));
        } else {
            console.log('   (no encontrada)');
        }

        // 6. Roster (para validar que sí lo encontramos)
        console.log('\n6. JUGADORES ENCONTRADOS:');
        const players = [];
        $('a[href*="/player/"]').each((_, el) => {
            const name = $(el).text().trim();
            if (name && !players.includes(name)) players.push(name);
        });
        console.log('   ', players.slice(0, 5).join(', ') + (players.length > 5 ? ` (... + ${players.length - 5} más)` : ''));

    } catch (e) {
        console.error('ERROR:', e.message);
    }
}

async function run() {
    for (const team of TEAMS) {
        await diag(team);
        // Delay entre requests
        await new Promise(r => setTimeout(r, 5000));
    }
}

run().catch(e => console.error('CRITICAL:', e.message));
