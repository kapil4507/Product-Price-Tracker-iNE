import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Navbar from './components/Navbar';
import ProductSearch from './components/ProductSearch';
import ProductList from './components/ProductList';
import ProductDetailsModal from './components/ProductDetailsModal';

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
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col antialiased">
      <Navbar onRefresh={fetchProducts} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Search / Add section */}
        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-white">Track Products</h2>
            <p className="text-sm text-neutral-400 mt-1">
              Search the mock store catalog or paste a product link to monitor price and stock changes.
            </p>
          </div>

          <ProductSearch
            onProductAdded={handleProductAdded}
            trackedUrls={trackedUrls}
          />
        </section>

        {/* Tracked Products Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-white">Tracked Products</h3>
              <span className="text-xs px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-400 border border-neutral-700">
                {products.length}
              </span>
            </div>
            <span className="text-xs text-neutral-500">
              Auto-refreshes every 10s
            </span>
          </div>

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

      <footer className="border-t border-neutral-850 py-5 text-center text-xs text-neutral-500 bg-neutral-950">
        <p>Price Tracker · iNE Assignment</p>
      </footer>
    </div>
  );
}
