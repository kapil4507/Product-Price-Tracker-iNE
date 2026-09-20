import React from 'react';
import { ExternalLink, LineChart, RefreshCw, Package, ArrowUpRight } from 'lucide-react';

export default function ProductList({
  products,
  loading,
  onSelectProduct,
  onManualScrape,
  scrapingId
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse space-y-4"
          >
            <div className="h-5 bg-slate-800 rounded w-3/4"></div>
            <div className="h-8 bg-slate-800 rounded w-1/2"></div>
            <div className="h-4 bg-slate-800 rounded w-full"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-slate-800 bg-slate-900/20">
        <div className="w-12 h-12 rounded-2xl bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto mb-3">
          <Package className="w-6 h-6 stroke-1" />
        </div>
        <h3 className="text-base font-semibold text-slate-200">No tracked products yet</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          Use the search bar above to select products from the mock store and start monitoring prices over time.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {products.map((product) => {
        const isScraping = scrapingId === product.id;
        const lastScraped = product.last_scraped_at
          ? new Date(product.last_scraped_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : null;

        return (
          <div
            key={product.id}
            onClick={() => onSelectProduct(product)}
            className="group relative p-5 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/50 transition-all cursor-pointer shadow-lg hover:shadow-indigo-500/5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="text-base font-bold text-slate-100 group-hover:text-indigo-300 transition-colors line-clamp-1">
                  {product.name}
                </h3>
                <span className="p-1 rounded-lg text-slate-500 group-hover:text-indigo-400 group-hover:bg-indigo-950/40 transition-colors shrink-0">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>

              {/* Price & Stock Display */}
              <div className="space-y-1 my-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-emerald-400 tracking-tight">
                    {product.current_price || '—'}
                  </span>
                  {!product.current_price && (
                    <span className="text-xs text-slate-500 italic">Initial scrape pending</span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                      product.current_stock?.toLowerCase().includes('in stock') || product.current_stock?.toLowerCase().includes('selling fast')
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : product.current_stock?.toLowerCase().includes('out of stock')
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        : 'bg-slate-800 text-slate-400 border-slate-700/60'
                    }`}
                  >
                    {product.current_stock || 'Awaiting status'}
                  </span>

                  {lastScraped && (
                    <span className="text-[10px] text-slate-500">
                      Scraped at {lastScraped}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 mt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1 text-slate-400 group-hover:text-slate-300 transition-colors">
                <LineChart className="w-3.5 h-3.5 text-indigo-400" /> View History & Logs
              </span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onManualScrape(product);
                }}
                disabled={isScraping}
                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-950/60 transition-colors disabled:opacity-50"
                title="Run immediate scrape"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScraping ? 'animate-spin text-indigo-400' : ''}`} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
