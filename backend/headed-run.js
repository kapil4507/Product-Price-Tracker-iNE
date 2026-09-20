/**
 * Script for Observable (Headed) Scraper Demonstration
 * Run with: npm run scrape:headed [optional_product_url]
 * 
 * Demonstrates:
 * - Headed browser launch so you can observe the browser interaction
 * - Mouse movement across the price container to satisfy anti-bot dwell/movement friction
 * - Reveal price button enablement and click
 * - Extraction of the live price (avoiding decoy/honeypot elements) and stock status
 * - Error/retry handling
 */

const { chromium } = require('playwright');

function cleanPrice(rawPrice) {
  if (!rawPrice) return null;
  let s = String(rawPrice).trim();
  s = s.replace(/[\uFF10-\uFF19]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 65248));
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.replace(/₹|Rs\.?|INR/gi, '').trim();
  s = s.replace(/\/-.*$/i, '').trim();
  
  if (/,\d{2}$/.test(s)) {
    s = s.replace(/,\d{2}$/, '');
    s = s.replace(/\./g, '');
  } else if (/\.\d{2}$/.test(s)) {
    s = s.replace(/\.\d{2}$/, '');
    s = s.replace(/,/g, '');
  }
  
  s = s.replace(/\D/g, '');
  const num = parseInt(s, 10);
  if (isNaN(num)) return null;
  return '₹' + num.toLocaleString('en-IN');
}

(async () => {
  const targetUrl = process.argv[2] || 'https://demo.inelabteamdev.com/product/1';
  console.log('========================================================');
  console.log('  OBSERVABLE HEADED SCRAPER DEMO');
  console.log('  Target:', targetUrl);
  console.log('========================================================\n');

  console.log('1. Launching Chromium in HEADED mode (slowMo: 100ms)...');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 100
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 }
  });

  try {
    console.log(`2. Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    console.log('3. Locating product price block...');
    const priceBlock = page.locator('.price-block');
    await priceBlock.waitFor({ state: 'visible', timeout: 15000 });

    const box = await priceBlock.boundingBox();
    if (!box) throw new Error('Could not compute bounding box of price block');

    console.log('4. Performing human mouse movement over price block (satisfying minMoves and dwell requirement)...');
    for (let i = 0; i < 15; i++) {
      await page.mouse.move(box.x + 20 + i * 5, box.y + 20 + (i % 4) * 5);
      await new Promise(r => setTimeout(r, 60));
    }

    console.log('5. Waiting for Reveal price button to become enabled...');
    const revealBtn = page.locator('button[aria-label="Reveal price"], button:has-text("Reveal price")');
    await page.waitForFunction(() => {
      const btn = document.querySelector('button[aria-label="Reveal price"]') ||
                  Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Reveal price'));
      return btn && !btn.disabled;
    }, { timeout: 8000 });

    console.log('6. Clicking Reveal price button...');
    await revealBtn.click();

    console.log('7. Waiting for price resolution (success or error)...');
    const successSelector = '.price-block.price-success';
    const errorSelector = '.price-block.price-error';

    await Promise.race([
      page.waitForSelector(successSelector, { state: 'visible', timeout: 20000 }),
      page.waitForSelector(errorSelector, { state: 'visible', timeout: 20000 })
    ]);

    if (await page.locator(errorSelector).isVisible()) {
      const msg = await page.locator(`${errorSelector} .price-substatus`).innerText();
      console.error('❌ Store returned error:', msg);
      return;
    }

    console.log('8. Extracting price (filtering out honeypot decoys) & stock status...');
    const rawPrice = await page.evaluate(() => {
      const main = document.querySelector('.price-main');
      if (!main) return null;

      const visibleSpans = Array.from(main.querySelectorAll('span, div')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' &&
               style.visibility !== 'hidden' &&
               style.opacity !== '0' &&
               !style.textDecoration.includes('line-through') &&
               !el.classList.contains('price-value') &&
               !el.hasAttribute('data-price') &&
               el.innerText.trim().length > 0;
      });

      const priceEl = visibleSpans.find(el => {
        const fs = parseFloat(window.getComputedStyle(el).fontSize);
        return fs >= 24;
      }) || visibleSpans[0];

      return priceEl ? priceEl.innerText.trim() : null;
    });

    const price = cleanPrice(rawPrice);
    const stockBadge = page.locator('.stock-badge');
    const stock = (await stockBadge.innerText()).trim();
    const title = (await page.locator('h1').innerText()).trim();

    console.log('\n---------------- SCRAPE SUCCESS ----------------');
    console.log('Product:     ', title);
    console.log('Live Price:  ', price);
    console.log('Stock Status:', stock);
    console.log('------------------------------------------------\n');

    console.log('Keeping browser open for 5 seconds for observation...');
    await new Promise(r => setTimeout(r, 5000));
  } catch (err) {
    console.error('❌ Scraper failed with error:', err.message);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
})();
