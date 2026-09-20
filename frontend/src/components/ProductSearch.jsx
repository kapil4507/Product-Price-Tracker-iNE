import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Loader2, CheckCircle2, AlertCircle, Link2 } from 'lucide-react';
import axios from 'axios';

export default function ProductSearch({ onProductAdded, trackedUrls = [] }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/search?q=${encodeURIComponent(query.trim())}`);
        setResults(res.data || []);
        setIsOpen(true);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddProduct = async (product) => {
    setAddingId(product.id || product.url);
    setStatusMessage(null);
    try {
      const res = await axios.post('/api/products', {
        name: product.name,
        url: product.url
      });
      setStatusMessage({ type: 'success', text: `Added "${product.name}" to tracking!` });
      setQuery('');
      setIsOpen(false);
      if (onProductAdded) onProductAdded(res.data);
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Failed to track product';
      setStatusMessage({ type: 'error', text: errMsg });
    } finally {
      setAddingId(null);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  // Allow direct URL submit if user pasted a link
  const handleDirectUrlSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (query.startsWith('https://demo.inelabteamdev.com')) {
      // Extract SKU or name from query
      const nameGuess = `Product (${query.split('/').pop() || 'Tracked'})`;
      await handleAddProduct({ name: nameGuess, url: query.trim() });
    }
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <form onSubmit={handleDirectUrlSubmit} className="relative">
        <div className="relative flex items-center">
          <Search className="w-5 h-5 absolute left-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.trim() && setIsOpen(true)}
            placeholder="Search mock store products by name, brand, or SKU (e.g. 'Kettle', 'Watch', 'Ironwood')..."
            className="w-full pl-11 pr-24 py-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm shadow-inner"
          />
          <div className="absolute right-2.5 flex items-center gap-2">
            {loading ? (
              <Loader2 className="w-5 h-5 text-indigo-400 animate-spin mr-1" />
            ) : query.startsWith('https://demo.inelabteamdev.com') ? (
              <button
                type="submit"
                disabled={addingId !== null}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1 transition-all"
              >
                <Link2 className="w-3.5 h-3.5" /> Add URL
              </button>
            ) : null}
          </div>
        </div>
      </form>

      {/* Status banner */}
      {statusMessage && (
        <div
          className={`mt-2.5 px-3.5 py-2 rounded-lg text-xs flex items-center gap-2 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Search dropdown results */}
      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl shadow-black/60 max-h-96 overflow-y-auto z-50 divide-y divide-slate-800/60">
          <div className="px-4 py-2 bg-slate-950/50 text-[11px] font-medium text-slate-400 flex justify-between items-center">
            <span>Found {results.length} products in mock store</span>
            <span>Click to track</span>
          </div>
          {results.map((product) => {
            const isTracked = trackedUrls.includes(product.url);
            const isAdding = addingId === product.id;

            return (
              <div
                key={product.id}
                className="p-3.5 hover:bg-slate-800/50 transition-colors flex items-center justify-between gap-4 group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors truncate">
                      {product.name}
                    </h4>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                      {product.sku}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950/60 text-indigo-400 border border-indigo-800/40">
                      {product.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {product.brand} · {product.description}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleAddProduct(product)}
                  disabled={isTracked || isAdding}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-all ${
                    isTracked
                      ? 'bg-slate-800/50 text-slate-500 border border-slate-800 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30'
                  }`}
                >
                  {isAdding ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isTracked ? (
                    'Tracked'
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" /> Track
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
