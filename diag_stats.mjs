import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import axios from 'axios';
import https from 'https';
import crypto from 'crypto';

dotenv.config({ path: '.env.local' });

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

// Usa un match COMPLETED reciente (ajusta el ID si hace falta)
const MATCH_ID = process.argv[2] || '716584';

async function main() {
    const url = `https://www.vlr.gg/${MATCH_ID}`;
    console.log(`Fetching ${url}...`);
    const { data } = await axiosClient.get(url);
    const $ = cheerio.load(data);

    const game = $('.vm-stats-game').first();
    console.log('\n=== Clases unicas DENTRO de .vm-stats-game (primero) ===');
    const classSet = new Set();
    game.find('*').each((i, el) => {
        const cls = $(el).attr('class');
        if (cls) cls.split(/\s+/).forEach(c => classSet.add(c));
    });
    console.log([...classSet].sort().join('\n'));

    console.log('\n=== data-game-id de cada .vm-stats-game ===');
    $('.vm-stats-game').each((i, el) => {
        console.log(i, '->', $(el).attr('data-game-id'));
    });

    console.log('\n=== HTML crudo (primeros 4000 chars) de .vm-stats-game[data-game-id="all"] (o el primero) ===');
    let target = $('.vm-stats-game[data-game-id="all"]');
    if (target.length === 0) target = game;
    console.log(target.html()?.slice(0, 4000));

    console.log('\n=== .js-map-switch: texto + atributos ===');
    $('.js-map-switch').each((i, el) => {
        console.log(i, JSON.stringify($(el).attr()), '|', $(el).text().replace(/\s+/g, ' ').trim());
    });
}

main().catch(e => console.error('ERROR:', e.message));
