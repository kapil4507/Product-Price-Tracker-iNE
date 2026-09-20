import React from 'react';
import { RefreshCw, Package, ArrowRight } from 'lucide-react';

export default function ProductList({
  products,
  loading,
  onSelectProduct,
  onManualScrape,
  scrapingId
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="p-4 rounded-lg bg-neutral-900 border border-neutral-800 animate-pulse space-y-3"
          >
            <div className="h-4 bg-neutral-800 rounded w-3/4"></div>
            <div className="h-6 bg-neutral-800 rounded w-1/3"></div>
            <div className="h-3 bg-neutral-800 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <div className="text-center py-12 px-4 rounded-xl border border-dashed border-neutral-800 bg-neutral-900/40">
        <div className="w-10 h-10 rounded-lg bg-neutral-800 text-neutral-400 flex items-center justify-center mx-auto mb-2.5">
          <Package className="w-5 h-5" />
        </div>
        <h3 className="text-sm font-medium text-neutral-200">No tracked products yet</h3>
        <p className="text-xs text-neutral-500 mt-1 max-w-xs mx-auto">
          Search for products above to begin monitoring their price and availability.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {products.map((product) => {
        const isScraping = scrapingId === product.id;
        const lastScraped = product.last_scraped_at
          ? new Date(product.last_scraped_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : null;

        const isStockOk = product.current_stock?.toLowerCase().includes('in stock') || product.current_stock?.toLowerCase().includes('selling fast');
        const isOutOfStock = product.current_stock?.toLowerCase().includes('out of stock');

        return (
          <div
            key={product.id}
            onClick={() => onSelectProduct(product)}
            className="group p-4 rounded-lg bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 transition-colors cursor-pointer flex flex-col justify-between space-y-3"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="text-sm font-medium text-neutral-100 group-hover:text-white transition-colors line-clamp-1">
                  {product.name}
                </h4>
                <ArrowRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 transition-colors shrink-0 mt-0.5" />
              </div>

              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-semibold text-emerald-400">
                    {product.current_price || '—'}
                  </span>
                  {!product.current_price && (
                    <span className="text-xs text-neutral-500">Pending scrape</span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded border ${
                      isStockOk
                        ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                        : isOutOfStock
                        ? 'bg-rose-950/40 text-rose-300 border-rose-800/60'
                        : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                    }`}
                  >
                    {product.current_stock || 'Pending'}
                  </span>

                  {lastScraped && (
                    <span className="text-[11px] text-neutral-500">
                      Scraped at {lastScraped}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2.5 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400">
              <span className="text-neutral-500 group-hover:text-neutral-400 transition-colors">
                View history & logs
              </span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onManualScrape(product);
                }}
                disabled={isScraping}
                className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors disabled:opacity-50"
                title="Scrape price now"
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
