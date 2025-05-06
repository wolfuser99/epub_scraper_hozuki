import fs from 'fs';
import path from 'path';
import Epub from 'epub-gen';
import puppeteer, { Browser, Page } from 'puppeteer';
import dotenv from 'dotenv';

dotenv.config();

const email = process.env.EMAIL || '';
const password = process.env.PASSWORD || '';

if (!email || !password) {
  console.error('Error: Las credenciales de inicio de sesión no están configuradas.');
  process.exit(1);
}

const loginUrl = 'https://ralevon.fyi/login';
const bUrl = 'https://ralevon.fyi/book/FnQRiP5O1X4jkcz3';

// Asegurar que la carpeta epubs/ exista
const epubDir = path.resolve('./epubs');
if (!fs.existsSync(epubDir)) {
  fs.mkdirSync(epubDir);
  console.log('Carpeta epubs/ creada.');
}

// Configuración global de Puppeteer
const puppeteerOptions = {
  headless: true,
  timeout: 60000 // Aumentar el tiempo de espera predeterminado
};

async function createVol(link: string, page: Page, volumeIndex: number) {
  try {
    await page.goto(link, { waitUntil: 'domcontentloaded' });

    const title = await page.$eval('#main-content > section.position-relative.bg-primary-subtle > div > div > div > h1', el => el.textContent?.trim() || 'Sin título');
    console.log(`Procesando volumen ${volumeIndex}: ${title}`);

    const cover = await page.$eval('img.img-fluid.rounded.border', el => el.src);

    const episodeLinks = await page.$$eval('a.fs-6', elements => elements.map(el => ({
      link: el.href,
      name: el.textContent?.trim() || 'Sin nombre'
    })));

    console.log(`Episodios encontrados: ${episodeLinks.length}`);

    const content = [];

    for (const [index, episode] of episodeLinks.entries()) {
      try {
        console.log(`Procesando episodio ${index + 1} de ${episodeLinks.length}: ${episode.name}`);
        await page.goto(episode.link, { waitUntil: 'domcontentloaded' });

        await page.waitForSelector('#readerBox');

        const data = await page.$eval('#readerBox', el => el.outerHTML);

        content.push({
          title: episode.name,
          data
        });
      } catch (err) {
        console.error(`Error al procesar el episodio ${index + 1} (${episode.name}):`, err);
      }
    }

    const options = {
      title: `${volumeIndex}. ${title}`,
      cover,
      author: 'Miya Kazuki - You Shiina',
      content
    };

    await new Epub(options, `./epubs/${options.title}.epub`).promise;
    console.log(`EPUB creado exitosamente: ${title}.epub`);
  } catch (err) {
    console.error(`Error al procesar el volumen en ${link}:`, err);
  }
}

async function login() {
  const browser = await puppeteer.launch(puppeteerOptions);

  try {
    const page = await browser.newPage();

    console.log('Navegando a la página de inicio de sesión...');
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('#username');

    console.log('Ingresando credenciales...');
    await page.type('#username', email);
    await page.type('input[type="password"]', password);
    await page.click('button[type="submit"]');

    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    console.log('Inicio de sesión exitoso. Navegando a la página del libro...');
    await page.goto(bUrl, { waitUntil: 'domcontentloaded' });

    const links_lectura = await page.$$eval('a.nav-link.active.rounded-1[href^="/volume/"]', elements => elements.map(el => el.href));
    const unique_links = [...new Set(links_lectura)];

    console.log(`Volúmenes encontrados: ${unique_links.length}`);

    for (const [index, link] of unique_links.entries()) {
      const volumeIndex = index + 1;
      console.log(`Procesando volumen ${volumeIndex}/${unique_links.length}: ${link}`);
      await createVol(link, page, volumeIndex);
    }
  } catch (error) {
    console.error('Error durante el proceso de inicio de sesión o navegación:', error);
  } finally {
    console.log('Cerrando el navegador...');
    await browser.close();
  }
}

// Manejo de errores global
process.on('uncaughtException', (err) => {
  console.error('Excepción no controlada:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promesa no manejada:', promise, 'Razón:', reason);
  process.exit(1);
});

login();

