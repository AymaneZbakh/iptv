/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Clock, Tv, Calendar, CalendarDays, Sparkles } from "lucide-react";
import { IPTVChannel, EPGCurrentShow } from "../types.js";

interface EpgGuideProps {
  channel: IPTVChannel | null;
  epgShow: EPGCurrentShow | null;
}

export default function EpgGuide({ channel, epgShow }: EpgGuideProps) {
  if (!channel) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 text-center text-neutral-500 h-full flex flex-col items-center justify-center min-h-[220px]">
        <Tv className="w-8 h-8 text-neutral-700 mb-2" />
        <h4 className="text-xs font-semibold text-neutral-400">Electronic Program Guide</h4>
        <p className="text-[11px] text-neutral-500 mt-1 max-w-xs font-sans">
          Select a channel from the directory list to examine the active television program timeline.
        </p>
      </div>
    );
  }

  const { current, next, progress } = epgShow || { current: null, next: null, progress: 0 };

  const formatProgTime = (isoString?: string) => {
    if (!isoString) return "--:--";
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "--:--";
    }
  };

  const calculateDuration = (startIso?: string, stopIso?: string) => {
    if (!startIso || !stopIso) return "Unknown duration";
    try {
      const start = new Date(startIso).getTime();
      const stop = new Date(stopIso).getTime();
      const diffMin = Math.round((stop - start) / 1000 / 60);
      return `${diffMin} min`;
    } catch {
      return "";
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 font-sans select-none space-y-4">
      {/* Header section */}
      <div className="flex items-start justify-between border-b border-neutral-800 pb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider">LIVE SCHEDULE</span>
            {channel.group && (
              <span className="text-[9px] text-neutral-500 font-mono tracking-wide">{channel.group.toUpperCase()}</span>
            )}
          </div>
          <h3 className="text-sm font-bold text-white mt-1.5 flex items-center gap-1.5">
            {channel.name} EPG
          </h3>
        </div>
        <CalendarDays className="w-5 h-5 text-neutral-500 shrink-0" />
      </div>

      {/* Main timeline listing */}
      <div className="space-y-4">
        {/* CURRENTLY AIRING SHOW */}
        <div className="relative pl-4 border-l-2 border-yellow-500">
          <div className="absolute top-1 -left-1.5 w-3.5 h-3.5 rounded-full bg-yellow-500 border-4 border-neutral-900 animate-pulse" />
          
          <div className="flex items-center justify-between text-[11px] font-mono text-yellow-400 font-bold">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> AIRING NOW • {formatProgTime(current?.start)} - {formatProgTime(current?.stop)}
            </span>
            <span className="bg-yellow-500/10 px-2 py-0.5 rounded text-[10px]">
              {calculateDuration(current?.start, current?.stop)}
            </span>
          </div>

          <h4 className="text-sm font-bold text-neutral-100 mt-1">
            {current?.title || "Regular Scheduled Broadcasting"}
          </h4>
          
          <p className="text-xs text-neutral-400 mt-1 leading-relaxed bg-black/25 p-2 rounded border border-neutral-800/40 mt-2 font-light">
            {current?.desc || "High definition live network channels delivering standard media schedules and localized reports directly on-demand."}
          </p>

          {/* Progress bar inside details block */}
          {current && (
            <div className="mt-3 space-y-1">
              <div className="flex justify-between items-center text-[10px] text-neutral-500 font-mono">
                <span>Completed: {Math.round(progress)}%</span>
                <span>Remaining: {100 - Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-yellow-500 h-full transition-all duration-500" 
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* UPCOMING SHOWS */}
        <div className="relative pl-4 border-l-2 border-neutral-800 space-y-4">
          <div className="absolute top-1 -left-1.5 w-3 h-3 rounded-full bg-neutral-800 border-2 border-neutral-900" />
          
          <div>
            <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 font-bold uppercase">
              <span>UPCOMING NEXT • {formatProgTime(next?.start)} - {formatProgTime(next?.stop)}</span>
              <span>{calculateDuration(next?.start, next?.stop)}</span>
            </div>

            <h5 className="text-xs font-bold text-neutral-300 mt-1">
              {next?.title || "Programming Preview Hour"}
            </h5>
            
            <p className="text-[11px] text-neutral-500 mt-1 font-light italic">
              {next?.desc || "Stick around for our upcoming scheduled networks session immediately detailing top stories of the global week."}
            </p>
          </div>
        </div>
      </div>

      {/* Decorative Disclaimer footer */}
      <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800 text-[10px] text-neutral-500 leading-relaxed font-sans mt-4 flex items-start gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-yellow-500 shrink-0 mt-0.5" />
        <span>
          EPG listings are parsed in real-time or synthetically scheduled deterministic of geographic clocks. Change the M3U Category list to preview other scheduling regions.
        </span>
      </div>
    </div>
  );
}
