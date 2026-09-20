const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { resilientScrape, searchProducts } = require('../services/scraper');

// GET /api/search?q=...
// Search INE's hosted mock store catalog
router.get('/search', async (req, res) => {
  const query = req.query.q || '';
  try {
    const results = await searchProducts(query);
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/products
// List all tracked products along with their most recent price and stock
router.get('/products', async (req, res) => {
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select(`
        *,
        price_history (
          price,
          stock_status,
          scraped_at
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Attach latest price entry to each product
    const formatted = products.map(prod => {
      const history = prod.price_history || [];
      history.sort((a, b) => new Date(b.scraped_at) - new Date(a.scraped_at));
      const latest = history[0] || null;
      return {
        id: prod.id,
        name: prod.name,
        url: prod.url,
        created_at: prod.created_at,
        current_price: latest ? latest.price : null,
        current_stock: latest ? latest.stock_status : 'Not scraped yet',
        last_scraped_at: latest ? latest.scraped_at : null
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/products
// Add a new product to track & trigger initial scrape
router.post('/products', async (req, res) => {
  const { name, url } = req.body;
  if (!name || !url) {
    return res.status(400).json({ error: 'Both name and url are required' });
  }

  // Ensure URL is restricted to the target domain
  if (!url.startsWith('https://demo.inelabteamdev.com')) {
    return res.status(400).json({ error: 'Only products from https://demo.inelabteamdev.com are supported' });
  }

  try {
    // Check if product already exists
    const { data: existing } = await supabase
      .from('products')
      .select('*')
      .eq('url', url)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: 'This product is already being tracked', product: existing });
    }

    const { data: newProduct, error } = await supabase
      .from('products')
      .insert({ name, url })
      .select()
      .single();

    if (error) throw error;

    // Immediately trigger an initial scrape in the background
    resilientScrape(newProduct.id, newProduct.url).catch(err => {
      console.error(`Initial scrape failed for ${newProduct.name}:`, err.message);
    });

    res.status(201).json(newProduct);
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/products/:id/history
// Get price & stock history for charts
router.get('/products/:id/history', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('price_history')
      .select('*')
      .eq('product_id', id)
      .order('scraped_at', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/products/:id/logs
// Get scrape attempt logs
router.get('/products/:id/logs', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('scrape_logs')
      .select('*')
      .eq('product_id', id)
      .order('attempted_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/products/:id/scrape
// Trigger manual immediate scrape for a single product
router.post('/products/:id/scrape', async (req, res) => {
  const { id } = req.params;
  try {
    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: `Scrape started for ${product.name}` });

    // Run in background
    resilientScrape(product.id, product.url);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/products/:id
// Remove a tracked product
router.delete('/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Product removed from tracking' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/cron/scrape
// Trigger endpoint for cron-job.org to run every 2 hours
router.get('/cron/scrape', async (req, res) => {
  res.json({ message: 'Scrape job scheduled and running in background' });

  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('*');

    if (error) throw error;

    console.log(`[Cron] Starting scheduled scrape for ${products.length} products...`);
    for (const product of products) {
      console.log(`[Cron] Scraping product: ${product.name}`);
      await resilientScrape(product.id, product.url);
    }
    console.log('[Cron] All products processed.');
  } catch (err) {
    console.error('[Cron] Error during scheduled scrape job:', err.message);
  }
});

module.exports = router;
