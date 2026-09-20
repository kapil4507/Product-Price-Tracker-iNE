import React, { useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  ExternalLink,
  Trash2
} from 'lucide-react';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  AreaChart
} from 'recharts';
import axios from 'axios';

function parseNumericPrice(priceStr) {
  if (!priceStr) return null;
  let s = String(priceStr).trim();
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.replace(/₹|Rs\.?|INR/gi, '').trim();
  s = s.replace(/\/-.*$/i, '').trim();

  if (/,\d{2}$/.test(s)) {
    s = s.replace(/,\d{2}$/, '');
    s = s.replace(/\./g, '');
  } else if (/\.\d{2}$/.test(s)) {
    s = s.replace(/\.\d{2}$/, '');
    s = s.replace(/,/g, '');
  }

  s = s.replace(/\D/g, '');
  const num = parseInt(s, 10);
  return isNaN(num) || num <= 0 ? null : num;
}

export default function ProductDetailsModal({ product, onClose, onProductDeleted, onProductUpdated }) {
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    if (!product?.id) return;
    try {
      const [histRes, logsRes] = await Promise.all([
        axios.get(`/api/products/${product.id}/history`),
        axios.get(`/api/products/${product.id}/logs`)
      ]);
      setHistory(histRes.data || []);
      setLogs(logsRes.data || []);
    } catch (err) {
      console.error('Failed to load history or logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [product?.id]);

  const handleManualScrape = async () => {
    setScraping(true);
    try {
      await axios.post(`/api/products/${product.id}/scrape`);
      setTimeout(fetchData, 2500);
      setTimeout(fetchData, 6000);
      setTimeout(() => {
        fetchData();
        setScraping(false);
        if (onProductUpdated) onProductUpdated();
      }, 10000);
    } catch (err) {
      console.error('Scrape trigger error:', err);
      setScraping(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Stop tracking "${product.name}"?`)) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/products/${product.id}`);
      if (onProductDeleted) onProductDeleted(product.id);
      onClose();
    } catch (err) {
      alert('Failed to delete product');
      setDeleting(false);
    }
  };

  const chartData = history
    .map((item) => {
      const date = new Date(item.scraped_at);
      const numPrice = parseNumericPrice(item.price);
      return {
        timestamp: item.scraped_at,
        displayTime: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        displayDate: date.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        priceRaw: numPrice ? `₹${numPrice.toLocaleString('en-IN')}` : item.price,
        priceValue: numPrice,
        stock: item.stock_status
      };
    })
    .filter((item) => item.priceValue !== null);

  const successCount = logs.filter(l => l.status === 'success').length;
  const retryCount = logs.filter(l => l.status === 'retried').length;
  const failCount = logs.filter(l => l.status === 'failed').length;

  const latestEntry = history.length > 0 ? history[history.length - 1] : null;
  const currentPrice = latestEntry ? latestEntry.price : (product.current_price || 'Pending');
  const currentStock = latestEntry ? latestEntry.stock_status : (product.current_stock || 'Unknown');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-start justify-between gap-3 bg-neutral-950/40">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-semibold text-white truncate">
                {product.name}
              </h2>
              <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-white px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 transition-colors"
              >
                Store Link <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-xs text-neutral-500 font-mono truncate mt-1">
              {product.url}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleManualScrape}
              disabled={scraping}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scraping ? 'animate-spin' : ''}`} />
              <span>{scraping ? 'Scraping...' : 'Scrape Now'}</span>
            </button>

            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 transition-colors"
              title="Delete product"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
              <span className="text-[11px] text-neutral-400">Current Price</span>
              <p className="text-base font-semibold text-emerald-400 mt-0.5">
                {currentPrice}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
              <span className="text-[11px] text-neutral-400">Stock</span>
              <p className="text-xs font-medium text-neutral-200 mt-1 truncate">
                {currentStock}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
              <span className="text-[11px] text-neutral-400">Snapshots</span>
              <p className="text-base font-semibold text-neutral-100 mt-0.5">{history.length}</p>
            </div>

            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
              <span className="text-[11px] text-neutral-400">Logs Summary</span>
              <div className="flex items-center gap-1.5 mt-1 text-xs">
                <span className="text-emerald-400 font-medium">{successCount} ok</span>
                <span className="text-neutral-500">/</span>
                <span className="text-amber-400 font-medium">{retryCount} retry</span>
                <span className="text-neutral-500">/</span>
                <span className="text-rose-400 font-medium">{failCount} fail</span>
              </div>
            </div>
          </div>

          {/* Section 1: Price History Chart */}
          <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-neutral-200">Price Trend</h3>
              <span className="text-[11px] text-neutral-500">{history.length} data points</span>
            </div>

            {loading ? (
              <div className="h-48 flex items-center justify-center text-neutral-500 text-xs">
                Loading history...
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-neutral-500 text-xs text-center p-4">
                <p>No price records yet.</p>
                <p className="text-neutral-600 mt-0.5">Click "Scrape Now" to fetch the first snapshot.</p>
              </div>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                    <XAxis
                      dataKey="displayTime"
                      stroke="#737373"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#737373"
                      fontSize={11}
                      domain={['dataMin - 150', 'dataMax + 150']}
                      tickFormatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#171717',
                        borderColor: '#404040',
                        borderRadius: '0.375rem',
                        fontSize: '12px',
                        color: '#f5f5f5'
                      }}
                      formatter={(val, name, props) => [
                        `${props.payload.priceRaw} (${props.payload.stock})`,
                        'Price'
                      ]}
                      labelFormatter={(label, payload) => {
                        const item = payload?.[0]?.payload;
                        return item ? `${item.displayDate} ${item.displayTime}` : label;
                      }}
                    />
                    <Area
                      type="monotoneX"
                      dataKey="priceValue"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: '#818cf8', strokeWidth: 0 }}
                      fillOpacity={1}
                      fill="url(#priceGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Section 2: Scrape Logs Table */}
          <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-semibold text-neutral-200">Scrape Logs</h3>
              <span className="text-[11px] text-neutral-500">Detailed attempt history</span>
            </div>

            {logs.length === 0 ? (
              <p className="text-xs text-neutral-500 py-4 text-center">No logs recorded yet.</p>
            ) : (
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs text-neutral-300">
                  <thead className="bg-neutral-900 text-neutral-400 text-[10px] uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="py-2 px-2.5">Timestamp</th>
                      <th className="py-2 px-2.5">Status</th>
                      <th className="py-2 px-2.5">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {logs.map((log) => {
                      const date = new Date(log.attempted_at);
                      return (
                        <tr key={log.id} className="hover:bg-neutral-900/50">
                          <td className="py-2 px-2.5 whitespace-nowrap font-mono text-neutral-400 text-[11px]">
                            {date.toLocaleDateString()} {date.toLocaleTimeString()}
                          </td>
                          <td className="py-2 px-2.5 whitespace-nowrap">
                            {log.status === 'success' ? (
                              <span className="text-emerald-400 font-medium">success</span>
                            ) : log.status === 'retried' ? (
                              <span className="text-amber-400 font-medium">retried</span>
                            ) : (
                              <span className="text-rose-400 font-medium">failed</span>
                            )}
                          </td>
                          <td className="py-2 px-2.5 text-neutral-400 text-[11px] max-w-xs truncate">
                            {log.error_message || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
