// Ensure Playwright looks in node_modules for the browser binary (persisted on cloud hosts like Render)
process.env.PLAYWRIGHT_BROWSERS_PATH = '0';

const { chromium } = require('playwright');
const supabase = require('../config/supabase');

const HEADLESS = process.env.HEADLESS !== 'false';

// Cache catalog items in memory so search is instantaneous
let catalogCache = null;
let catalogCacheTime = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

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
 * Uses lightweight HTTP fetching (fetches 1000 items in ~400ms) with in-memory caching.
 */
async function searchProducts(query = '') {
  const now = Date.now();
  if (!catalogCache || now - catalogCacheTime > CACHE_TTL_MS) {
    try {
      const pageNumbers = Array.from({ length: 17 }, (_, i) => i + 1);
      const responses = await Promise.all(
        pageNumbers.map(page =>
          fetch(`https://demo.inelabteamdev.com/api/catalog?page=${page}&pageSize=60`)
            .then(res => {
              if (!res.ok) throw new Error(`Catalog API responded with ${res.status}`);
              return res.json();
            })
        )
      );

      catalogCache = responses.flatMap(r => r.items || []).map(item => ({
        id: item.id,
        name: item.name,
        brand: item.brand,
        category: item.category,
        sku: item.sku,
        description: item.description,
        url: `https://demo.inelabteamdev.com/product/${item.id}`
      }));
      catalogCacheTime = now;
    } catch (err) {
      console.error('Failed to refresh catalog cache:', err.message);
      if (!catalogCache) catalogCache = [];
    }
  }

  const q = query.trim().toLowerCase();
  if (!q) {
    return catalogCache.slice(0, 30);
  }

  return catalogCache.filter(item =>
    item.name.toLowerCase().includes(q) ||
    item.brand.toLowerCase().includes(q) ||
    item.sku.toLowerCase().includes(q) ||
    item.category.toLowerCase().includes(q)
  ).slice(0, 50);
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

    // Ensure product details card is loaded
    await page.waitForSelector('.detail-card, .price-block', { state: 'visible', timeout: 15000 });

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

    // Click Reveal price
    await revealBtn.click();

    // Wait for the state to transition to .price-success OR .price-error
    const successSelector = '.price-block.price-success';
    const errorSelector = '.price-block.price-error';

    await Promise.race([
      page.waitForSelector(successSelector, { state: 'visible', timeout: 20000 }),
      page.waitForSelector(errorSelector, { state: 'visible', timeout: 20000 })
    ]);

    // Check if the store threw an intentional error
    const isError = await page.locator(errorSelector).isVisible();
    if (isError) {
      const errorMsg = await page.locator(`${errorSelector} .price-substatus`).innerText();
      throw new Error(`Store error: ${errorMsg || 'Failed to reveal price'}`);
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
