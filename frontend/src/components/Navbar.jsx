import React, { useState } from 'react';
import { Activity, RefreshCw, ExternalLink } from 'lucide-react';
import axios from 'axios';

export default function Navbar({ onRefresh }) {
  const [triggering, setTriggering] = useState(false);
  const [cronMessage, setCronMessage] = useState(null);

  const handleCronTrigger = async () => {
    setTriggering(true);
    setCronMessage(null);
    try {
      const res = await axios.get('/api/cron/scrape');
      setCronMessage(res.data.message || 'Scrape job scheduled');
      setTimeout(() => setCronMessage(null), 5000);
      if (onRefresh) onRefresh();
    } catch (err) {
      setCronMessage('Failed to trigger cron scrape');
      setTimeout(() => setCronMessage(null), 5000);
    } finally {
      setTriggering(false);
    }
  };

  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              PricePulse
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                INE Mock Store
              </span>
            </h1>
            <p className="text-xs text-slate-400">Resilient Product Price & Stock Tracker</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {cronMessage && (
            <span className="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1.5 rounded-lg animate-fade-in">
              {cronMessage}
            </span>
          )}

          <a
            href="https://demo.inelabteamdev.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors px-3 py-2 rounded-lg hover:bg-slate-800/60"
          >
            Open Store <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={handleCronTrigger}
            disabled={triggering}
            className="inline-flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 hover:border-slate-600 transition-all disabled:opacity-50"
            title="Trigger scheduled scraper for all tracked products"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${triggering ? 'animate-spin text-indigo-400' : ''}`} />
            <span>{triggering ? 'Scraping...' : 'Trigger Cron Scrape'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
