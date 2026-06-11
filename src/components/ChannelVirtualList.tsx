/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useMemo } from "react";
import { Star, Tv, Search, Hash } from "lucide-react";
import { IPTVChannel, EPGCurrentShow } from "../types.js";

interface ChannelVirtualListProps {
  channels: IPTVChannel[];
  selectedChannel: IPTVChannel | null;
  onSelectChannel: (channel: IPTVChannel) => void;
  favorites: string[];
  onToggleFavorite: (id: string, name: string) => void;
  epgSchedule: Record<string, EPGCurrentShow>;
  itemHeight?: number;
}

export default function ChannelVirtualList({
  channels,
  selectedChannel,
  onSelectChannel,
  favorites,
  onToggleFavorite,
  epgSchedule,
  itemHeight = 72,
}: ChannelVirtualListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(500);

  // Set the height of the container dynamically
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight || 500);
      }
    };
    
    handleResize();
    window.addEventListener("resize", handleResize);
    
    // Quick delay check for loading layout shifts
    const timer = setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timer);
    };
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  // Virtualization calculations
  const totalItems = channels.length;
  const totalHeight = totalItems * itemHeight;

  // Buffer so scroll transitions are completely smooth with no visual gaps
  const bufferCount = 5;

  const { startIndex, endIndex, visibleItems } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferCount);
    const end = Math.min(totalItems, Math.ceil((scrollTop + containerHeight) / itemHeight) + bufferCount);

    const items = [];
    for (let i = start; i < end; i++) {
      items.push({
        index: i,
        channel: channels[i],
      });
    }

    return {
      startIndex: start,
      endIndex: end,
      visibleItems: items,
    };
  }, [scrollTop, containerHeight, channels, totalItems, itemHeight]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-neutral-950">
      {/* Scrollable grid container */}
      {totalItems === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-neutral-500">
          <Tv className="w-10 h-10 text-neutral-700 mb-2" />
          <p className="text-xs">No channels in this group.</p>
        </div>
      ) : (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto relative outline-none custom-scrollbar"
          id="virtual-channel-viewport"
        >
          {/* Scroll spacer to support correct native scroll bar length */}
          <div style={{ height: `${totalHeight}px`, width: "100%", pointerEvents: "none" }} />

          {/* Sliced Absolute Elements container */}
          <div className="absolute top-0 left-0 right-0 w-full">
            {visibleItems.map(({ index, channel }) => {
              if (!channel) return null;
              
              const isSelected = selectedChannel?.id === channel.id;
              const isFav = favorites.includes(channel.id);
              
              // Extract EPG current show for display inside list row
              const chEpg = epgSchedule[channel.epgId || channel.name] || null;
              const hasEpg = !!chEpg?.current;

              return (
                <div
                  key={channel.id}
                  style={{
                    position: "absolute",
                    top: `${index * itemHeight}px`,
                    height: `${itemHeight}px`,
                    left: 0,
                    right: 0,
                  }}
                  className={`p-1 px-3 border-b border-neutral-900/40 flex items-center justify-between gap-3 select-none text-left transition ${
                    isSelected 
                      ? "bg-yellow-500/10 border-l-4 border-l-yellow-500" 
                      : "hover:bg-neutral-900/60"
                  }`}
                  id={`channel-item-${channel.id}`}
                >
                  {/* Select Channel clickable zone */}
                  <div 
                    onClick={() => onSelectChannel(channel)}
                    className="flex-1 min-w-0 flex items-center gap-3 cursor-pointer py-1 h-full"
                  >
                    {/* Channel Logo / Initial */}
                    <div className="w-11 h-11 bg-neutral-900 border border-neutral-800 rounded flex items-center justify-center overflow-hidden shrink-0">
                      {channel.logo ? (
                        <img
                          src={channel.logo}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain p-0.5"
                          onError={(e) => {
                            // Hide image on error, display generic Initial instead
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                            const fallback = e.currentTarget.nextSibling as HTMLDivElement;
                            if (fallback) fallback.style.display = "flex";
                          }}
                        />
                      ) : null}
                      <div 
                        className="w-full h-full text-xs font-bold text-neutral-400 bg-neutral-900 flex items-center justify-center uppercase"
                        style={{ display: channel.logo ? "none" : "flex" }}
                      >
                        {channel.name.substring(0, 2)}
                      </div>
                    </div>

                    {/* Metadata (Name + EPG schedule) */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-neutral-500 font-bold">
                          #{index + 1}
                        </span>
                        <h4 className="text-xs font-semibold text-neutral-200 truncate pr-2">
                          {channel.name}
                        </h4>
                      </div>

                      {/* EPG row */}
                      {hasEpg && chEpg ? (
                        <div className="mt-1 space-y-1">
                          <p className="text-[10px] text-yellow-400/80 truncate">
                            {chEpg.current?.title}
                          </p>
                          <div className="w-full bg-neutral-800 h-[2px] rounded-full overflow-hidden">
                            <div 
                              className="bg-yellow-500 h-full transition-all duration-300"
                              style={{ width: `${chEpg.progress}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-neutral-500 truncate mt-0.5">
                          EPG: Click to view details
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Favorite / Action buttons */}
                  <div className="flex items-center pr-1 justify-end shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(channel.id, channel.name);
                      }}
                      className={`p-1.5 rounded-full transition ${
                        isFav 
                          ? "text-yellow-400 hover:bg-yellow-400/10" 
                          : "text-neutral-600 hover:text-neutral-400 hover:bg-neutral-800"
                      }`}
                      title={isFav ? "Remove from Favorites" : "Mark as Favorite"}
                    >
                      <Star className={`w-4 h-4 ${isFav ? "fill-yellow-400" : ""}`} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
