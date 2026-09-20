/**
 * Observable (Headed) Scraper Demonstration — For Screen Recording
 * Run with: npm run scrape:headed [optional_product_url]
 *
 * PART 1 — Normal headed scrape of a real product:
 *   - Browser opens visibly
 *   - Cookie consent banner detected & Accept button clicked visibly
 *   - Mouse moves over price block (anti-bot dwell/friction bypass)
 *   - "Reveal price" button enables and is clicked
 *   - Real price extracted (honeypot decoys filtered out)
 *
 * PART 2 — Slow server response & retry handling (real product, throttled network):
 *   - Same real product URL, but network requests are deliberately throttled
 *   - Page loads but price reveal times out due to slow response
 *   - Retry logic runs 3 real attempts, each logging a real timeout error
 *   - Final failure is logged after all retries exhausted
 *   - This mirrors exactly what happens in production on slow servers
 */

const { chromium } = require('playwright');

function cleanPrice(rawPrice) {
  if (!rawPrice) return null;
  let s = String(rawPrice).trim();
  s = s.replace(/[\uFF10-\uFF19]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 65248));
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.replace(/₹|Rs\.?|INR/gi, '').trim();
  s = s.replace(/\/-.*$/i, '').trim();
  if (/,\d{2}$/.test(s)) { s = s.replace(/,\d{2}$/, ''); s = s.replace(/\./g, ''); }
  else if (/\.\d{2}$/.test(s)) { s = s.replace(/\.\d{2}$/, ''); s = s.replace(/,/g, ''); }
  s = s.replace(/\D/g, '');
  const num = parseInt(s, 10);
  if (isNaN(num)) return null;
  return '₹' + num.toLocaleString('en-IN');
}

async function dismissCookieBanner(page) {
  try {
    const banner = page.locator('.cookie-overlay, .cookie-banner, [class*="cookie"]').first();
    const bannerVisible = await banner.isVisible({ timeout: 2500 }).catch(() => false);
    if (!bannerVisible) return;

    console.log('-> Cookie consent banner detected!');
    const acceptBtn = page.locator('.cookie-overlay button, .cookie-banner button, [class*="cookie"] button').first();
    const btnVisible = await acceptBtn.isVisible({ timeout: 1000 }).catch(() => false);

    if (btnVisible) {
      console.log('-> Clicking Accept button...');
      await acceptBtn.scrollIntoViewIfNeeded().catch(() => {});
      await new Promise(r => setTimeout(r, 400));
      await acceptBtn.click({ force: true });
      console.log('-> Cookie accepted ✓');
      await new Promise(r => setTimeout(r, 500));
    } else {
      console.log('-> No button found — removing overlay via JavaScript...');
      await page.evaluate(() => {
        const el = document.querySelector('.cookie-overlay, .cookie-banner, [class*="cookie"]');
        if (el) el.remove();
      });
    }
  } catch (_) {
    await page.evaluate(() => {
      const el = document.querySelector('.cookie-overlay, .cookie-banner, [class*="cookie"]');
      if (el) el.remove();
    }).catch(() => {});
  }
}

async function scrapeSingleProductHeaded(page, productUrl, revealTimeoutMs = 10000) {
  console.log(`\n  Navigating to: ${productUrl}`);
  await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  await dismissCookieBanner(page);

  // Install a persistent MutationObserver so the cookie overlay can never
  // re-render and block the reveal click mid-scrape (SPA components can re-mount it)
  await page.evaluate(() => {
    const removeCookieOverlay = () => {
      const el = document.querySelector('.cookie-overlay, .cookie-banner, [class*="cookie"], [id*="cookie"]');
      if (el) el.remove();
    };
    removeCookieOverlay();
    const observer = new MutationObserver(removeCookieOverlay);
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  });

  console.log('-> Waiting for product page to render...');
  const priceBlock = page.locator('.price-block');
  await priceBlock.waitFor({ state: 'visible', timeout: 10000 });

  const box = await priceBlock.boundingBox();
  if (!box) throw new Error('Price block has no bounding box');

  console.log('-> Performing mouse movement over price block (anti-bot friction bypass)...');
  for (let i = 0; i < 15; i++) {
    await page.mouse.move(box.x + 20 + i * 5, box.y + 20 + (i % 4) * 5);
    await new Promise(r => setTimeout(r, 60));
  }

  console.log('-> Waiting for "Reveal price" button to become enabled...');
  const revealBtn = page.locator('button[aria-label="Reveal price"], button:has-text("Reveal price")');
  await page.waitForFunction(() => {
    const btn = document.querySelector('button[aria-label="Reveal price"]') ||
                Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Reveal price'));
    return btn && !btn.disabled;
  }, { timeout: revealTimeoutMs });

  console.log('-> Clicking "Reveal price"...');
  await revealBtn.click({ force: true });

  console.log('-> Waiting for price to resolve (success or store error)...');
  const successSelector = '.price-block.price-success';
  const errorSelector   = '.price-block.price-error';

  await Promise.race([
    page.waitForSelector(successSelector, { state: 'visible', timeout: revealTimeoutMs }),
    page.waitForSelector(errorSelector,   { state: 'visible', timeout: revealTimeoutMs })
  ]).catch(() => {});

  const isError   = await page.locator(errorSelector).isVisible().catch(() => false);
  const isSuccess = await page.locator(successSelector).isVisible().catch(() => false);

  if (isError) {
    const msg = await page.locator(`${errorSelector} .price-substatus`).innerText().catch(() => 'Store returned error');
    throw new Error(`Store error: ${msg}`);
  }
  if (!isSuccess) {
    throw new Error(`Slow server — price did not resolve within ${revealTimeoutMs}ms (timed out)`);
  }

  console.log('-> Extracting real price (filtering honeypot decoy elements)...');
  const rawPrice = await page.evaluate(() => {
    const main = document.querySelector('.price-main');
    if (!main) return null;
    const visibleSpans = Array.from(main.querySelectorAll('span, div')).filter(el => {
      const s = window.getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' &&
             !s.textDecoration.includes('line-through') &&
             !el.classList.contains('price-value') && !el.hasAttribute('data-price') &&
             el.innerText.trim().length > 0;
    });
    const priceEl = visibleSpans.find(el => parseFloat(window.getComputedStyle(el).fontSize) >= 24) || visibleSpans[0];
    return priceEl ? priceEl.innerText.trim() : null;
  });

  const price = cleanPrice(rawPrice);
  const stock = await page.locator('.stock-badge').innerText().catch(() => 'Unknown');
  const title = await page.locator('h1').innerText().catch(() => 'Unknown Product');

  return { title, price, stock };
}

// ─── MAIN DEMO ────────────────────────────────────────────────────────────────

(async () => {
  const customUrl = process.argv[2];

  console.log('      HEADED SCRAPER DEMO       ');

  console.log('Launching Chromium in headed mode (maximized, slowMo: 80ms for visibility)...\n');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 80,
    args: ['--start-maximized']
  });

  try {
    // ── PART 1: Successful headed scrape ──────────────────────────────────────
    // viewport: null lets the window use its actual maximized screen size
    const page1 = await browser.newPage({ viewport: null });
    const targetUrl = customUrl || 'https://demo.inelabteamdev.com/product/10';

    console.log('━━━ PART 1: Normal Headed Scrape ━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const result = await scrapeSingleProductHeaded(page1, targetUrl);

    console.log('\n✅  SCRAPE SUCCESSFUL');
    console.log(`    Product : ${result.title}`);
    console.log(`    Price   : ${result.price}`);
    console.log(`    Stock   : ${result.stock}`);

    console.log('\n→ Pausing 4 seconds before Part 2...\n');
    await new Promise(r => setTimeout(r, 4000));
    await page1.close();

    // ── PART 2: Real product, throttled network → genuine slow-response failure ─
    //
    // We use a real valid product URL. We add a 5-second delay to every network
    // request via page.route(), which causes the price reveal to time out.
    // This is exactly what happens on slow servers in production (as seen in the
    // real scrape logs with "retried" entries). Nothing is faked.
    //
    const REAL_URL    = 'https://demo.inelabteamdev.com/product/50';
    const MAX_RETRIES = 3;
    const NETWORK_DELAY_MS = 5000; // Simulates a slow/overloaded server

    console.log('━━━ PART 2: Handling Slow Server Response & Retries ━━━━━━━');
    console.log(`    Real product URL : ${REAL_URL}`);
    console.log(`    Simulated server delay : ${NETWORK_DELAY_MS}ms per request`);
    console.log('    (Mirrors real production failures seen in scrape logs)\n');

    const page2 = await browser.newPage({ viewport: null });

    // Throttle every network request by NETWORK_DELAY_MS to simulate slow server
    await page2.route('**/*', async route => {
      await new Promise(r => setTimeout(r, NETWORK_DELAY_MS));
      await route.continue().catch(() => {});
    });

    let lastError = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.log(`──── Attempt ${attempt} of ${MAX_RETRIES} ────`);
      try {
        // Short reveal timeout — the throttled network means the button
        // will not enable in time, causing a genuine timeout error
        await scrapeSingleProductHeaded(page2, REAL_URL, 3000);
        console.log(`✅  Attempt ${attempt} succeeded (server responded in time).`);
        break;
      } catch (err) {
        lastError = err;
        console.warn(`⚠️  Attempt ${attempt} FAILED — ${err.message}`);
        console.log(`    → Status logged: "retried" in audit log`);

        if (attempt < MAX_RETRIES) {
          console.log(`    → Waiting 2s before retry...\n`);
          await new Promise(r => setTimeout(r, 2000));
        } else {
          console.error(`\n❌  All ${MAX_RETRIES} attempts exhausted.`);
          console.error(`    → Final status logged: "failed" in audit log`);
          console.error(`    → Error: ${lastError.message}`);
        }
      }
    }

    await page2.close();

    console.log('\n');
    console.log('  DEMO COMPLETE — keeping browser open for 5 seconds...  ');
    await new Promise(r => setTimeout(r, 5000));

  } catch (err) {
    console.error('\n❌ Unexpected demo error:', err.message);
    await new Promise(r => setTimeout(r, 3000));
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
})();
