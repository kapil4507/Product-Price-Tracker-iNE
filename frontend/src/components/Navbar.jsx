import React, { useState } from 'react';
import { RefreshCw, ExternalLink } from 'lucide-react';
import axios from 'axios';

export default function Navbar({ onRefresh }) {
  const [triggering, setTriggering] = useState(false);
  const [cronMessage, setCronMessage] = useState(null);

  const handleCronTrigger = async () => {
    setTriggering(true);
    setCronMessage(null);
    try {
      const res = await axios.get('/api/cron/scrape');
      setCronMessage(res.data.message || 'Scrape job started');
      setTimeout(() => setCronMessage(null), 4000);
      if (onRefresh) onRefresh();
    } catch (err) {
      setCronMessage('Failed to trigger cron scrape');
      setTimeout(() => setCronMessage(null), 4000);
    } finally {
      setTriggering(false);
    }
  };

  return (
    <header className="border-b border-neutral-800 bg-neutral-900 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center font-bold text-sm text-indigo-400">
            PT
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white leading-tight">
              Price Tracker
            </h1>
            <span className="text-[11px] text-neutral-400">iNE Demo Store</span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {cronMessage && (
            <span className="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 rounded">
              {cronMessage}
            </span>
          )}

          <a
            href="https://demo.inelabteamdev.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors px-2.5 py-1.5 rounded hover:bg-neutral-800"
          >
            Visit Store <ExternalLink className="w-3 h-3" />
          </a>

          <button
            onClick={handleCronTrigger}
            disabled={triggering}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 hover:border-neutral-600 transition-colors disabled:opacity-50"
            title="Trigger scheduled scrape for all tracked products"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${triggering ? 'animate-spin text-indigo-400' : ''}`} />
            <span>{triggering ? 'Scraping...' : 'Scrape All'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
