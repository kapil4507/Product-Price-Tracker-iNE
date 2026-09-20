import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Loader2, CheckCircle2, AlertCircle, Link as LinkIcon } from 'lucide-react';
import axios from 'axios';

export default function ProductSearch({ onProductAdded, trackedUrls = [] }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Debounced search with race condition prevention
  useEffect(() => {
    const currentQuery = query.trim();
    if (!currentQuery) {
      setResults([]);
      setLoading(false);
      setIsOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/search?q=${encodeURIComponent(currentQuery)}`, {
          signal: controller.signal
        });
        setResults(res.data || []);
        setIsOpen(true);
      } catch (err) {
        if (!axios.isCancel(err)) {
          console.error('Search error:', err);
        }
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
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
      setStatusMessage({ type: 'success', text: `Added "${product.name}"` });
      setQuery('');
      setIsOpen(false);
      if (onProductAdded) onProductAdded(res.data);
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Failed to track product';
      setStatusMessage({ type: 'error', text: errMsg });
    } finally {
      setAddingId(null);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const handleDirectUrlSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (query.startsWith('https://demo.inelabteamdev.com')) {
      const nameGuess = `Product (${query.split('/').pop() || 'Tracked'})`;
      await handleAddProduct({ name: nameGuess, url: query.trim() });
    }
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <form onSubmit={handleDirectUrlSubmit} className="relative">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 absolute left-3.5 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.trim() && setIsOpen(true)}
            placeholder="Search products by name or paste URL (e.g. 'Kettle', 'Watch')..."
            className="w-full pl-10 pr-24 py-2.5 bg-neutral-950 border border-neutral-700 rounded-lg text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-neutral-500 text-sm"
          />
          <div className="absolute right-2.5 flex items-center gap-2">
            {loading ? (
              <Loader2 className="w-4 h-4 text-neutral-400 animate-spin mr-1" />
            ) : query.startsWith('https://demo.inelabteamdev.com') ? (
              <button
                type="submit"
                disabled={addingId !== null}
                className="text-xs font-medium px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1 transition-colors"
              >
                <LinkIcon className="w-3 h-3" /> Add Link
              </button>
            ) : null}
          </div>
        </div>
      </form>

      {/* Status banner */}
      {statusMessage && (
        <div
          className={`mt-2 px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Search dropdown results */}
      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl max-h-80 overflow-y-auto z-50 divide-y divide-neutral-800">
          <div className="px-3.5 py-1.5 bg-neutral-950 text-[11px] text-neutral-400 flex justify-between items-center">
            <span>{results.length} matches found</span>
            <span>Click to add</span>
          </div>
          {results.map((product) => {
            const isTracked = trackedUrls.includes(product.url);
            const isAdding = addingId === product.id;

            return (
              <div
                key={product.id}
                className="p-3 hover:bg-neutral-800/60 transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-medium text-neutral-100 truncate">
                      {product.name}
                    </h4>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                      {product.sku}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">
                      {product.category}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 truncate mt-0.5">
                    {product.brand} · {product.description}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleAddProduct(product)}
                  disabled={isTracked || isAdding}
                  className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1 shrink-0 transition-colors ${
                    isTracked
                      ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  {isAdding ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isTracked ? (
                    'Tracked'
                  ) : (
                    <>
                      <Plus className="w-3 h-3" /> Track
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
