import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Navbar from './components/Navbar';
import ProductSearch from './components/ProductSearch';
import ProductList from './components/ProductList';
import ProductDetailsModal from './components/ProductDetailsModal';
import { Layers, ShieldCheck, Clock, Zap } from 'lucide-react';

export default function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [scrapingId, setScrapingId] = useState(null);

  const fetchProducts = async () => {
    try {
      const res = await axios.get('/api/products');
      const data = res.data || [];
      setProducts(data);
      setSelectedProduct((prev) => {
        if (!prev) return null;
        return data.find((p) => p.id === prev.id) || prev;
      });
    } catch (err) {
      console.error('Failed to load tracked products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    // Auto refresh every 10 seconds to catch scrape updates
    const timer = setInterval(fetchProducts, 10000);
    return () => clearInterval(timer);
  }, []);

  const handleProductAdded = (newProduct) => {
    fetchProducts();
    setSelectedProduct(newProduct);
  };

  const handleProductDeleted = (deletedId) => {
    setProducts((prev) => prev.filter((p) => p.id !== deletedId));
    if (selectedProduct?.id === deletedId) {
      setSelectedProduct(null);
    }
  };

  const handleManualScrape = async (product) => {
    setScrapingId(product.id);
    try {
      await axios.post(`/api/products/${product.id}/scrape`);
      setTimeout(fetchProducts, 3000);
      setTimeout(() => {
        fetchProducts();
        setScrapingId(null);
      }, 7000);
    } catch (err) {
      console.error('Scrape failed:', err);
      setScrapingId(null);
    }
  };

  const trackedUrls = products.map((p) => p.url);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200">
      <Navbar onRefresh={fetchProducts} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero & Search Section */}
        <section className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

          <div className="max-w-2xl space-y-3 relative z-10 mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Zap className="w-3.5 h-3.5" /> High-Resilience Scraper Engine
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Track mock store prices in real-time
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Search by partial or full product name from INE's mock catalog or paste a direct product link to begin tracking price history and stock status.
            </p>
          </div>

          <div className="relative z-20">
            <ProductSearch
              onProductAdded={handleProductAdded}
              trackedUrls={trackedUrls}
            />
          </div>

          {/* Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 mt-6 border-t border-slate-800/80 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Anti-bot dwell & hover friction bypass</span>
            </div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>Honeypot & decoy price filtering</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Automatic 3x retry with honest logging</span>
            </div>
          </div>
        </section>

        {/* Dashboard Grid Header */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h3 className="text-lg font-bold text-slate-100">Tracked Products</h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700/60">
                {products.length}
              </span>
            </div>
            <span className="text-xs text-slate-500">
              Auto-refreshes · Click any product for charts & logs
            </span>
          </div>

          {/* Product Cards */}
          <ProductList
            products={products}
            loading={loading}
            onSelectProduct={setSelectedProduct}
            onManualScrape={handleManualScrape}
            scrapingId={scrapingId}
          />
        </section>
      </main>

      {/* Details Modal */}
      {selectedProduct && (
        <ProductDetailsModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onProductDeleted={handleProductDeleted}
          onProductUpdated={fetchProducts}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500 bg-slate-950">
        <p>Product Price Tracker · Built for iNE Internship Assignment · Deploys to Vercel & Render</p>
      </footer>
    </div>
  );
}
