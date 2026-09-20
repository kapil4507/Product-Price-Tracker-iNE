const { chromium } = require('playwright');
const supabase = require('../config/supabase');

const HEADLESS = process.env.HEADLESS !== 'false';

// In-memory catalog keyed by product ID to eliminate duplicates and accumulate products
const catalogMap = new Map();
let lastCatalogFetch = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Normalizes price strings by removing decoy formatting:
 * - Converts fullwidth unicode digits (０-９) to ASCII digits (0-9)
 * - Removes zero-width spaces (\u200B-\u200D\uFEFF)
 * - Removes non-breaking spaces (\u00A0)
 * - Removes trailing tax notes like "/- (incl. of all taxes)"
 */
function cleanPrice(rawPrice) {
  if (!rawPrice) return null;
  let s = String(rawPrice).trim();
  // Convert fullwidth unicode digits (０-９) to ASCII digits (0-9)
  s = s.replace(/[\uFF10-\uFF19]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 65248));
  // Remove zero-width characters and spaces
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.replace(/₹|Rs\.?|INR/gi, '').trim();
  s = s.replace(/\/-.*$/i, '').trim();
  
  // Handle European comma decimals (e.g. 3.383,00) or standard dot decimals (e.g. 17,331.00)
  if (/,\d{2}$/.test(s)) {
    s = s.replace(/,\d{2}$/, '');
    s = s.replace(/\./g, '');
  } else if (/\.\d{2}$/.test(s)) {
    s = s.replace(/\.\d{2}$/, '');
    s = s.replace(/,/g, '');
  }
  
  // Keep only digits
  s = s.replace(/\D/g, '');
  const num = parseInt(s, 10);
  if (isNaN(num)) return null;
  return '₹' + num.toLocaleString('en-IN');
}

/**
 * Fast search against INE demo store catalog.
 * Fetches catalog pages, deduplicates by ID, and sorts results deterministically.
 */
async function searchProducts(query = '') {
  const now = Date.now();
  if (catalogMap.size < 500 || now - lastCatalogFetch > CACHE_TTL_MS) {
    try {
      const pageNumbers = Array.from({ length: 17 }, (_, i) => i + 1);
      const responses = await Promise.allSettled(
        pageNumbers.map(page =>
          fetch(`https://demo.inelabteamdev.com/api/catalog?page=${page}&pageSize=60`)
            .then(res => {
              if (!res.ok) throw new Error(`Status ${res.status}`);
              return res.json();
            })
        )
      );

      for (const res of responses) {
        if (res.status === 'fulfilled' && res.value?.items) {
          for (const item of res.value.items) {
            if (item && item.id && !catalogMap.has(item.id)) {
              catalogMap.set(item.id, {
                id: item.id,
                name: item.name,
                brand: item.brand,
                category: item.category,
                sku: item.sku,
                description: item.description,
                url: `https://demo.inelabteamdev.com/product/${item.id}`
              });
            }
          }
        }
      }
      lastCatalogFetch = now;
    } catch (err) {
      console.error('Failed to refresh catalog:', err.message);
    }
  }

  const allItems = Array.from(catalogMap.values());
  const q = query.trim().toLowerCase();

  if (!q) {
    return allItems
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 30);
  }

  // Filter and rank: items with query in name come first, then brand/sku/category
  const matches = allItems.filter(item =>
    item.name.toLowerCase().includes(q) ||
    item.brand.toLowerCase().includes(q) ||
    item.sku.toLowerCase().includes(q) ||
    item.category.toLowerCase().includes(q)
  );

  matches.sort((a, b) => {
    const aNameMatch = a.name.toLowerCase().includes(q);
    const bNameMatch = b.name.toLowerCase().includes(q);
    if (aNameMatch && !bNameMatch) return -1;
    if (!aNameMatch && bNameMatch) return 1;
    return a.name.localeCompare(b.name);
  });

  return matches.slice(0, 40);
}

/**
 * Core Playwright scraper for a single product page.
 * Handles the anti-bot mouse friction, reveals the price, avoids honeypots, and extracts stock.
 */
async function scrapeProduct(productUrl) {
  let browser = null;
  try {
    browser = await chromium.launch({
      headless: HEADLESS,
      args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    console.log(`[Scraper] Navigating to ${productUrl}...`);
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Install a persistent MutationObserver to suppress cookie overlays.
    // The overlay is a SPA component that can re-render at any time (after navigation,
    // after mouse events, etc). One-shot removal is not enough — this watches the DOM
    // continuously and removes any cookie overlay the instant it re-appears.
    await page.evaluate(() => {
      const removeCookieOverlay = () => {
        const el = document.querySelector('.cookie-overlay, .cookie-banner, [class*="cookie"], [id*="cookie"]');
        if (el) el.remove();
      };
      removeCookieOverlay(); // Remove immediately if already present
      const observer = new MutationObserver(removeCookieOverlay);
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    });

    const priceBlock = page.locator('.price-block');
    await priceBlock.waitFor({ state: 'visible', timeout: 10000 });

    const box = await priceBlock.boundingBox();
    if (!box) {
      throw new Error('Price block container has no visible bounding box');
    }

    // Simulate natural mouse movements to satisfy the minMoves: 8 and minDwellMs: 600 requirement
    for (let i = 0; i < 14; i++) {
      await page.mouse.move(box.x + 15 + i * 4, box.y + 15 + (i % 4) * 4);
      await new Promise(res => setTimeout(res, 60)); // ~840ms total dwell
    }

    const revealBtn = page.locator('button[aria-label="Reveal price"], button:has-text("Reveal price")');
    await revealBtn.waitFor({ state: 'visible', timeout: 5000 });

    // Wait until the Reveal price button becomes enabled (disabled attribute removed)
    await page.waitForFunction(() => {
      const btn = document.querySelector('button[aria-label="Reveal price"]') ||
                  Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Reveal price'));
      return btn && !btn.disabled;
    }, { timeout: 6000 });

    // Click Reveal price (MutationObserver above ensures overlay never blocks this)
    await revealBtn.click({ force: true });


    // Wait for the state to transition to .price-success OR .price-error
    const successSelector = '.price-block.price-success';
    const errorSelector = '.price-block.price-error';

    await Promise.race([
      page.waitForSelector(successSelector, { state: 'visible', timeout: 20000 }),
      page.waitForSelector(errorSelector, { state: 'visible', timeout: 20000 })
    ]).catch(() => {});

    // Check if the store threw an intentional error
    const isError = await page.locator(errorSelector).isVisible().catch(() => false);
    if (isError) {
      const errorMsg = await page.locator(`${errorSelector} .price-substatus`).innerText().catch(() => 'Failed to reveal price');
      throw new Error(`Store error: ${errorMsg}`);
    }

    // Extract real price: avoid hidden decoy spans (.price-value and .amount[data-price="true"])
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

      // Target the prominent price element (styled with large font size)
      const priceEl = visibleSpans.find(el => {
        const fs = parseFloat(window.getComputedStyle(el).fontSize);
        return fs >= 24;
      }) || visibleSpans[0];

      return priceEl ? priceEl.innerText.trim() : null;
    });

    if (!rawPrice) {
      throw new Error('Price element was visible but no valid price text could be extracted');
    }

    const price = cleanPrice(rawPrice);

    // Extract stock status
    let stockStatus = 'Unknown';
    const stockBadge = page.locator('.stock-badge');
    if (await stockBadge.isVisible({ timeout: 3000 })) {
      stockStatus = (await stockBadge.innerText()).trim();
    }

    // Extract product name
    let name = '';
    const titleEl = page.locator('h1, .detail-info h1');
    if (await titleEl.isVisible({ timeout: 2000 })) {
      name = (await titleEl.innerText()).trim();
    }

    await browser.close();

    return { price, stock_status: stockStatus, name };
  } catch (error) {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    throw error;
  }
}

/**
 * Resilient Scraper Wrapper:
 * - Tries up to 3 times
 * - Logs 'retried' status on interim errors
 * - Logs 'failed' status on complete failure
 * - Logs 'success' status and saves to price_history only on successful extract
 * - Never stores empty or incorrect data into price_history
 */
async function resilientScrape(productId, productUrl) {
  const maxAttempts = 3;
  let attempts = 0;
  let lastError = null;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      console.log(`[Scraper] Attempt ${attempts}/${maxAttempts} for product ${productId} (${productUrl})`);
      const data = await scrapeProduct(productUrl);

      if (!data || !data.price) {
        throw new Error('Empty or invalid price returned from extractor');
      }

      // Persist to price_history
      const { error: histError } = await supabase
        .from('price_history')
        .insert({
          product_id: productId,
          price: data.price,
          stock_status: data.stock_status
        });

      if (histError) throw histError;

      // Log success
      await supabase
        .from('scrape_logs')
        .insert({
          product_id: productId,
          status: 'success'
        });

      console.log(`[Scraper] Successfully scraped ${productUrl} on attempt ${attempts}: ${data.price} (${data.stock_status})`);
      return data;
    } catch (error) {
      lastError = error;
      console.warn(`[Scraper] Attempt ${attempts} failed for ${productUrl}: ${error.message}`);

      if (attempts < maxAttempts) {
        // Record retry attempt in scrape_logs
        await supabase
          .from('scrape_logs')
          .insert({
            product_id: productId,
            status: 'retried',
            error_message: error.message
          });

        // Wait 2-3 seconds with jitter before retrying
        const delay = 2000 + Math.floor(Math.random() * 1000);
        console.log(`[Scraper] Waiting ${delay}ms before retry...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // Record permanent failure in scrape_logs
  console.error(`[Scraper] All ${maxAttempts} attempts failed for ${productUrl}`);
  await supabase
    .from('scrape_logs')
    .insert({
      product_id: productId,
      status: 'failed',
      error_message: lastError ? lastError.message : 'Unknown scraper error'
    });

  return null;
}

module.exports = {
  scrapeProduct,
  resilientScrape,
  searchProducts
};
