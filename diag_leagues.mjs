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

async function diag() {
    console.log('Diagnosticando: https://www.vlr.gg/events');
    const { data } = await axiosClient.get('https://www.vlr.gg/events');
    const $ = cheerio.load(data);

    console.log('\n=== TABS DE TIER/LIGA ===');
    console.log('\n1. Elementos con texto que parecen tiers:');
    const possibleTiers = new Set();
    $('*').each((i, el) => {
        const text = $(el).text().trim().toUpperCase();
        if (['VCT', 'VCL', 'T3', 'GC', 'CG', 'OFF'].includes(text)) {
            const cls = $(el).attr('class');
            const tag = $(el).prop('tagName');
            console.log(`   ${tag}.${cls} → "${text}"`);
            possibleTiers.add(text);
        }
    });

    console.log('\n2. HTML de los tabs (primeros 2000 chars):');
    const tabsSection = $('[class*="tab"], [class*="filter"], [class*="league"], button, [role="tab"]').first().parent().html();
    if (tabsSection) {
        console.log(tabsSection.slice(0, 2000));
    }

    console.log('\n3. Clases únicas que mencionen "tier", "league", "filter", "tab":');
    const classSet = new Set();
    $.find('[class*="tier"], [class*="league"], [class*="filter"], [class*="tab"]').each((i, el) => {
        const cls = $(el).attr('class');
        if (cls) cls.split(/\s+/).forEach(c => classSet.add(c));
    });
    console.log('   ', [...classSet].sort().join('\n    '));

    console.log('\n4. Botones/elementos clickeables:');
    $('button, [role="button"], a[href*="league"], a[href*="tier"]').slice(0, 10).each((i, el) => {
        const text = $(el).text().trim();
        const href = $(el).attr('href');
        const cls = $(el).attr('class');
        if (text || href) console.log(`   ${$(el).prop('tagName')} | "${text}" | ${href || '—'} | ${cls || '—'}`);
    });

    console.log('\n5. Regiones encontradas:');
    const possibleRegions = new Set();
    $('*').each((i, el) => {
        const text = $(el).text().trim().toUpperCase();
        if (['AMER', 'EMEA', 'PAC', 'CN', 'AMERICAS', 'PACIFIC'].includes(text)) {
            console.log(`   "${text}"`);
            possibleRegions.add(text);
        }
    });
}

diag().catch(e => console.error('ERROR:', e.message));
