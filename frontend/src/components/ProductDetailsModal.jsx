import React, { useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Trash2
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  AreaChart
} from 'recharts';
import axios from 'axios';

// Robust helper to parse numeric value from any price string format (INR, Euro-formatted, Unicode, spaced, etc.)
function parseNumericPrice(priceStr) {
  if (!priceStr) return null;
  let s = String(priceStr).trim();
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.replace(/₹|Rs\.?|INR/gi, '').trim();
  s = s.replace(/\/-.*$/i, '').trim();

  // Euro format with decimals e.g. "3.383,00"
  if (/,\d{2}$/.test(s)) {
    s = s.replace(/,\d{2}$/, '');
    s = s.replace(/\./g, '');
  } else if (/\.\d{2}$/.test(s)) {
    // Standard decimal format e.g. "17,331.00"
    s = s.replace(/\.\d{2}$/, '');
    s = s.replace(/,/g, '');
  }

  // Remove any remaining non-digits
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
    // Poll every 8 seconds while modal is open to catch in-flight scrape results
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [product?.id]);

  const handleManualScrape = async () => {
    setScraping(true);
    try {
      await axios.post(`/api/products/${product.id}/scrape`);
      // Re-fetch after short delays to catch retry progress
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

  // Prepare chart data
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

  // Calculate statistics
  const successCount = logs.filter(l => l.status === 'success').length;
  const retryCount = logs.filter(l => l.status === 'retried').length;
  const failCount = logs.filter(l => l.status === 'failed').length;

  // Derive latest price and stock dynamically from live history
  const latestEntry = history.length > 0 ? history[history.length - 1] : null;
  const currentPrice = latestEntry ? latestEntry.price : (product.current_price || 'Pending scrape');
  const currentStock = latestEntry ? latestEntry.stock_status : (product.current_stock || 'Unknown');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-sm overflow-y-auto animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-start justify-between gap-4 bg-slate-950/40">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <h2 className="text-xl font-bold text-slate-100 truncate">
                {product.name}
              </h2>
              <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-800/40"
              >
                View in Store <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-xs text-slate-400 truncate">
              URL: <span className="font-mono text-slate-300">{product.url}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleManualScrape}
              disabled={scraping}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all disabled:opacity-50 shadow-sm"
              title="Trigger immediate scrape now"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scraping ? 'animate-spin' : ''}`} />
              <span>{scraping ? 'Scraping...' : 'Scrape Now'}</span>
            </button>

            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-900/60 transition-colors"
              title="Remove product"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Latest Price</span>
              <p className="text-lg font-bold text-emerald-400 mt-0.5">
                {currentPrice}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Stock Status</span>
              <p className="text-sm font-semibold text-slate-200 mt-1 truncate">
                {currentStock}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Data Points</span>
              <p className="text-lg font-bold text-indigo-400 mt-0.5">{history.length}</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Scrape Attempts</span>
              <div className="flex items-center gap-2 mt-1 text-xs">
                <span className="text-emerald-400 font-semibold">{successCount} ok</span>
                <span className="text-amber-400 font-semibold">{retryCount} retry</span>
                <span className="text-rose-400 font-semibold">{failCount} fail</span>
              </div>
            </div>
          </div>

          {/* Section 1: Price History Chart */}
          <div className="p-4 sm:p-5 rounded-xl bg-slate-950/50 border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-200">Price History Over Time</h3>
              </div>
              <span className="text-xs text-slate-400">{history.length} snapshots recorded</span>
            </div>

            {loading ? (
              <div className="h-56 flex items-center justify-center text-slate-500 text-xs">
                Loading history data...
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center text-slate-500 text-xs text-center p-4">
                <Clock className="w-8 h-8 text-slate-600 mb-2 stroke-1" />
                <p>No price history recorded yet.</p>
                <p className="text-slate-600 mt-1">Click "Scrape Now" above to capture the first live snapshot.</p>
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="displayTime"
                      stroke="#64748b"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      domain={['dataMin - 150', 'dataMax + 150']}
                      tickFormatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                        color: '#f8fafc',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                      }}
                      formatter={(val, name, props) => [
                        `${props.payload.priceRaw} (${props.payload.stock})`,
                        'Price & Stock'
                      ]}
                      labelFormatter={(label, payload) => {
                        const item = payload?.[0]?.payload;
                        return item ? `${item.displayDate} at ${item.displayTime}` : label;
                      }}
                    />
                    <Area
                      type="monotoneX"
                      dataKey="priceValue"
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: '#818cf8', strokeWidth: 1, stroke: '#1e1b4b' }}
                      activeDot={{ r: 6, fill: '#a5b4fc', stroke: '#6366f1', strokeWidth: 2 }}
                      fillOpacity={1}
                      fill="url(#priceGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Section 2: Scrape Logs Table */}
          <div className="p-4 sm:p-5 rounded-xl bg-slate-950/50 border border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-200">Scrape Attempt Logs</h3>
              </div>
              <span className="text-[11px] text-slate-400">All outcomes recorded transparently</span>
            </div>

            {logs.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No scrape logs recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Attempted At</th>
                      <th className="py-2.5 px-3">Outcome Status</th>
                      <th className="py-2.5 px-3">Details / Error Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {logs.map((log) => {
                      const date = new Date(log.attempted_at);
                      return (
                        <tr key={log.id} className="hover:bg-slate-900/40 transition-colors">
                          <td className="py-2.5 px-3 whitespace-nowrap font-mono text-slate-400 text-[11px]">
                            {date.toLocaleDateString()} {date.toLocaleTimeString()}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {log.status === 'success' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle className="w-3 h-3" /> success
                              </span>
                            ) : log.status === 'retried' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <AlertTriangle className="w-3 h-3" /> retried
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                <XCircle className="w-3 h-3" /> failed
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                            {log.error_message ? (
                              <span className="text-rose-300/90 font-mono bg-rose-950/30 px-1.5 py-0.5 rounded border border-rose-900/40">
                                {log.error_message}
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
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
