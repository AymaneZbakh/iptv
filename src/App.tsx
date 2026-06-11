/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { 
  Tv, 
  Search, 
  Star, 
  Compass, 
  Menu, 
  X, 
  Activity, 
  RotateCcw,
  RefreshCw,
  FolderLock,
  Flame,
  UserCheck,
  Radio,
  FileCode,
  Info,
  CalendarCheck,
  Download
} from "lucide-react";
import { IPTVChannel, EPGCurrentShow, PlaylistInfo } from "./types.js";
import PlaylistManager, { PRESETS } from "./components/PlaylistManager.js";
import ChannelVirtualList from "./components/ChannelVirtualList.js";
import MpvPlayer from "./components/MpvPlayer.js";
import EpgGuide from "./components/EpgGuide.js";

// Save Favorites / Playlists in localStorage
const STORAGE_FAVORITES_KEY = "mpv_iptv_favorites";
const STORAGE_PLAYLISTS_KEY = "mpv_iptv_custom_playlists";
const STORAGE_SELECTED_PL_KEY = "mpv_iptv_selected_pl";
const STORAGE_EPG_URL_KEY = "mpv_iptv_epg_url";
const STORAGE_RECENTS_KEY = "mpv_iptv_recent_channels";

export default function App() {
  // Layout Controls
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "favorites" | "recents">("all");

  // Playlists State
  const [playlists, setPlaylists] = useState<PlaylistInfo[]>(() => {
    const saved = localStorage.getItem(STORAGE_PLAYLISTS_KEY);
    if (saved) {
      try {
        return [...PRESETS, ...JSON.parse(saved)];
      } catch {
        return PRESETS;
      }
    }
    return PRESETS;
  });

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_SELECTED_PL_KEY) || PRESETS[0].id;
  });

  const [epgUrl, setEpgUrl] = useState<string>(() => {
    return localStorage.getItem(STORAGE_EPG_URL_KEY) || "";
  });

  // Channels State
  const [channels, setChannels] = useState<IPTVChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Active / Viewing State
  const [selectedChannel, setSelectedChannel] = useState<IPTVChannel | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL_CHANNELS");
  
  // Favorites Cache
  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem(STORAGE_FAVORITES_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  // Recent Streams Cache
  const [recents, setRecents] = useState<IPTVChannel[]>(() => {
    const saved = localStorage.getItem(STORAGE_RECENTS_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  // Program Guides (EPG)
  const [epgSchedule, setEpgSchedule] = useState<Record<string, EPGCurrentShow>>({});
  const [loadingEpg, setLoadingEpg] = useState(false);

  // Retrieve current playlist
  const currentPlaylist = useMemo(() => {
    return playlists.find(p => p.id === selectedPlaylistId) || playlists[0];
  }, [playlists, selectedPlaylistId]);

  // Fetch playlist channels
  const loadPlaylistChannels = useCallback(async (playlist: PlaylistInfo, bypassCache = false) => {
    setLoadingChannels(true);
    setFetchError(null);
    setSelectedChannel(null);
    setChannels([]);
    setEpgSchedule({});

    if (playlist.url.startsWith("raw-upload:")) {
      // It's a static offline file upload, parse immediately
      try {
        const rawText = localStorage.getItem(`m3u_raw_${playlist.id}`);
        if (!rawText) throw new Error("No offline content found");
        
        // Fast client-side parsing fallback
        const lines = rawText.split(/\n/);
        let channelIdCounter = 1;
        const parsed: IPTVChannel[] = [];
        let currentExt: any = null;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          if (line.startsWith("#EXTINF:")) {
            const inf = line.substring(8);
            const nameM = inf.match(/tvg-name="([^"]*)"/) || inf.match(/tvg-name=([^,\s]*)/);
            const logoM = inf.match(/tvg-logo="([^"]*)"/) || inf.match(/tvg-logo=([^,\s]*)/);
            const groupM = inf.match(/group-title="([^"]*)"/) || inf.match(/group-title=([^,\s]*)/);
            const comma = inf.lastIndexOf(",");
            const displayName = comma !== -1 ? inf.substring(comma + 1).trim() : (nameM?.[1] || "Channel");
            currentExt = { name: displayName, logo: logoM?.[1] || null, group: groupM?.[1] || "General", epgId: nameM?.[1] || displayName };
          } else if (!line.startsWith("#")) {
            if (line.startsWith("http://") || line.startsWith("https://")) {
              parsed.push({
                id: `local-ch-${channelIdCounter++}`,
                name: currentExt ? currentExt.name : `Channel ${channelIdCounter}`,
                url: line,
                logo: currentExt ? currentExt.logo : null,
                group: currentExt ? currentExt.group : "General",
                epgId: currentExt ? currentExt.epgId : null,
              });
            }
            currentExt = null;
          }
        }

        setChannels(parsed);
        if (parsed.length > 0) {
          setSelectedChannel(parsed[0]);
        }
        setLoadingChannels(false);
      } catch (err: any) {
        setFetchError("Unable to load offline M3U content.");
        setLoadingChannels(false);
      }
      return;
    }

    try {
      const cacheQS = bypassCache ? "&refresh=true" : "";
      const res = await fetch(`/api/playlist?url=${encodeURIComponent(playlist.url)}${cacheQS}`);
      if (!res.ok) {
        throw new Error(`Load error: server returned status ${res.status}`);
      }
      const data = await res.json();
      if (data.success && data.channels) {
        setChannels(data.channels);
        if (data.channels.length > 0) {
          setSelectedChannel(data.channels[0]);
        }
      } else {
        throw new Error(data.error || "M3U Parsing Failed");
      }
    } catch (err: any) {
      console.error("[Playlist Loading Failure]", err);
      setFetchError(
        err.message || 
        "Failed to establish live playlist. Make sure server backend is active."
      );
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  // Sync state triggers
  useEffect(() => {
    if (currentPlaylist) {
      loadPlaylistChannels(currentPlaylist);
    }
  }, [selectedPlaylistId, currentPlaylist, loadPlaylistChannels]);

  // Persists playlists / setups
  useEffect(() => {
    localStorage.setItem(STORAGE_SELECTED_PL_KEY, selectedPlaylistId);
  }, [selectedPlaylistId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_EPG_URL_KEY, epgUrl);
  }, [epgUrl]);

  // Trigger batch EPG retrieve for channels
  const triggerEpgBatch = useCallback(async (channelSubList: IPTVChannel[]) => {
    if (channelSubList.length === 0) return;
    setLoadingEpg(true);

    // Filter down subset (max 100 channels to fetch EPG guides for, keeping overhead minimal)
    const activeSubset = channelSubList.slice(0, 100).map(ch => ({
      name: ch.name,
      epgId: ch.epgId
    }));

    try {
      const res = await fetch("/api/epg/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          epgUrl: epgUrl,
          channels: activeSubset
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.schedule) {
          // Merge batch schedule guides
          setEpgSchedule(prev => ({
            ...prev,
            ...data.schedule
          }));
        }
      }
    } catch (error) {
      console.warn("[EPG Engine Sync failed, continuing with fallback]", error);
    } finally {
      setLoadingEpg(false);
    }
  }, [epgUrl]);

  // Trigger EPG retrieve on channel change
  const singleChannelEpgFetch = useCallback(async (channel: IPTVChannel) => {
    triggerEpgBatch([channel]);
  }, [triggerEpgBatch]);

  // Retrieve Categories
  const categories = useMemo(() => {
    const unique = new Set<string>();
    channels.forEach((ch) => {
      if (ch.group) unique.add(ch.group.trim());
    });
    return Array.from(unique).sort();
  }, [channels]);

  // Handle category shift
  useEffect(() => {
    setSelectedCategory("ALL_CHANNELS");
  }, [selectedPlaylistId]);

  // Reset filter constraints on tab switch
  useEffect(() => {
    setSearchQuery("");
  }, [activeTab]);

  // Filter channels based on categories, search, tabs
  const filteredChannels = useMemo(() => {
    let result = channels;

    // 1. Tab switches
    if (activeTab === "favorites") {
      result = result.filter(ch => favorites.includes(ch.id));
    } else if (activeTab === "recents") {
      result = recents;
    }

    // 2. Category switches
    if (selectedCategory !== "ALL_CHANNELS") {
      result = result.filter(ch => ch.group === selectedCategory);
    }

    // 3. Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        ch => ch.name.toLowerCase().includes(query) || (ch.group && ch.group.toLowerCase().includes(query))
      );
    }

    return result;
  }, [channels, activeTab, selectedCategory, searchQuery, favorites, recents]);

  // Sync EPG scheduled guides when filtered search list or categories update
  useEffect(() => {
    if (filteredChannels.length > 0) {
      const timer = setTimeout(() => {
        triggerEpgBatch(filteredChannels);
      }, 500); // debounce
      return () => clearTimeout(timer);
    }
  }, [filteredChannels, triggerEpgBatch]);

  // Toggle favorite channel
  const handleToggleFavorite = (id: string, name: string) => {
    let nextFavs: string[];
    if (favorites.includes(id)) {
      nextFavs = favorites.filter(favId => favId !== id);
    } else {
      nextFavs = [...favorites, id];
    }
    setFavorites(nextFavs);
    localStorage.setItem(STORAGE_FAVORITES_KEY, JSON.stringify(nextFavs));
  };

  // Channel Selection callback
  const handleSelectChannel = (channel: IPTVChannel) => {
    setSelectedChannel(channel);

    // Save in Recents list
    setRecents(prev => {
      const filtered = prev.filter(c => c.url !== channel.url); // remove duplication
      const updated = [channel, ...filtered].slice(0, 30); // max 30 recents
      localStorage.setItem(STORAGE_RECENTS_KEY, JSON.stringify(updated));
      return updated;
    });

    singleChannelEpgFetch(channel);
  };

  // Custom Playlist Adding
  const handleAddPlaylist = (name: string, url: string) => {
    const id = `custom-${Date.now()}`;
    const newPl: PlaylistInfo = { id, name, url, isCustom: true };
    const updated = [...playlists.filter(p => p.id !== id), newPl];
    
    // Save in state
    setPlaylists(updated);
    
    // Only save user uploads in local storage
    const customOnly = updated.filter(p => p.isCustom);
    localStorage.setItem(STORAGE_PLAYLISTS_KEY, JSON.stringify(customOnly));
    setSelectedPlaylistId(id);
  };

  // Delete Custom playlist
  const handleDeletePlaylist = (id: string) => {
    const updated = playlists.filter(p => p.id !== id);
    setPlaylists(updated);
    
    // Save state
    const customOnly = updated.filter(p => p.isCustom);
    localStorage.setItem(STORAGE_PLAYLISTS_KEY, JSON.stringify(customOnly));
    
    // Remove static local items
    localStorage.removeItem(`m3u_raw_${id}`);

    // Redraw view selection defaults
    setSelectedPlaylistId(PRESETS[0].id);
  };

  // Raw file uploaded directly fallback parsing
  const handleUploadRawM3U = (name: string, content: string) => {
    const id = `raw-upload-${Date.now()}`;
    const newPl: PlaylistInfo = { id, name, url: `raw-upload:${id}`, isCustom: true };
    
    // Save large text segment directly in localStorage
    try {
      localStorage.setItem(`m3u_raw_${id}`, content);
      const updated = [...playlists, newPl];
      setPlaylists(updated);
      
      const customOnly = updated.filter(p => p.isCustom);
      localStorage.setItem(STORAGE_PLAYLISTS_KEY, JSON.stringify(customOnly));
      
      setSelectedPlaylistId(id);
    } catch {
      alert("Local playlist file too large. Please supply a hosted, online M3U link instead.");
    }
  };

  // Selected show detail reference
  const selectedChannelShow = useMemo(() => {
    if (!selectedChannel) return null;
    return epgSchedule[selectedChannel.epgId || selectedChannel.name] || null;
  }, [selectedChannel, epgSchedule]);

  // Reload action
  const handleReload = () => {
    if (currentPlaylist) {
      loadPlaylistChannels(currentPlaylist, true);
    }
  };

  // Export Full M3U Playlist file for Native MPV/VLC launchers
  const handleExportFullM3u = () => {
    if (channels.length === 0) return;
    let content = "#EXTM3U\n";
    channels.forEach(ch => {
      content += `#EXTINF:-1 tvg-id="${ch.epgId || ""}" tvg-logo="${ch.logo || ""}" group-title="${ch.group || "General"}",${ch.name}\n${ch.url}\n`;
    });
    
    const blob = new Blob([content], { type: "application/x-mpegurl" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentPlaylist.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_for_mpv.m3u`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-neutral-950 font-sans text-neutral-200">
      
      {/* 1. SEAMLESS TOP NAVIGATION HEADER */}
      <header className="z-25 flex items-center justify-between bg-zinc-950 border-b border-neutral-900 px-4 py-3 h-14 select-none">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-yellow-500 hover:text-yellow-400 transition"
            title="Toggle Sidebar Control Panel"
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-yellow-550 animate-pulse text-yellow-500" />
            <span className="font-extrabold uppercase text-sm tracking-widest text-white">
              MPV IPTV Player
            </span>
            <span className="hidden sm:inline-block border border-green-500/30 text-green-400 bg-green-500/10 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
              ONLINE
            </span>
          </div>
        </div>

        {/* Global stream indicators */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="hidden md:flex items-center gap-2 text-neutral-400">
            <Activity className="w-3.5 h-3.5 text-neutral-500" />
            <span>Parsed {channels.length} channels</span>
          </div>
          
          {channels.length > 0 && (
            <button
              onClick={handleExportFullM3u}
              className="flex items-center gap-1.5 bg-yellow-500 hover:bg-yellow-400 text-black font-extrabold px-3 py-1.5 rounded transition cursor-pointer text-xs"
              title="Download entire parsed M3U list to run on native MPV desktop player"
            >
              <Download className="w-3.5 h-3.5" /> EXPORT M3U FOR MPV
            </button>
          )}

          <button
            onClick={handleReload}
            className="flex items-center gap-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 px-2.5 py-1.5 rounded transition border border-neutral-800 cursor-pointer text-xs"
            title="Force refresh current provider channels"
          >
            <RefreshCw className="w-3.5 h-3.5" /> REFRESH
          </button>
        </div>
      </header>

      {/* 2. MAIN HUB WORKSPACE LAYOUT */}
      <div className="flex flex-1 min-h-0 relative">
        
        {/* COLLAPSIBLE SIDEBAR DIRECTORY PANEL */}
        <aside
          style={{ width: sidebarOpen ? "360px" : "0px" }}
          className={`shrink-0 h-full bg-neutral-950 border-r border-neutral-900 overflow-hidden flex flex-col z-20 transition-all duration-300 ${
            sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          {/* M3U & EPG FEED CONTROL MANAGER */}
          <PlaylistManager
            playlists={playlists}
            selectedPlaylistId={selectedPlaylistId}
            onSelectPlaylist={setSelectedPlaylistId}
            onAddPlaylist={handleAddPlaylist}
            onDeletePlaylist={handleDeletePlaylist}
            epgUrl={epgUrl}
            onChangeEpgUrl={setEpgUrl}
            onUploadRawM3U={handleUploadRawM3U}
          />

          {/* CLASSIFICATION MULTI-FILTERS & SEARCH BAR */}
          <div className="p-3 bg-neutral-950 space-y-3 shrink-0 border-b border-neutral-900">
            
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search TV Channels or Groups..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-black border border-neutral-800 text-xs py-2 pl-8 pr-3 rounded-lg outline-none text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 font-sans"
              />
              <Search className="w-4 h-4 text-neutral-500 absolute top-2.5 left-2.5" />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="text-[10px] text-neutral-500 hover:text-white absolute top-2.5 right-2.5"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Quick Filter Selection Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-neutral-900 p-1 rounded-md text-[11px] font-bold">
              <button
                onClick={() => setActiveTab("all")}
                className={`py-1.5 rounded transition ${
                  activeTab === "all"
                    ? "bg-yellow-500 text-black font-extrabold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Channels ({channels.length})
              </button>
              <button
                onClick={() => setActiveTab("favorites")}
                className={`py-1.5 rounded transition flex items-center justify-center gap-1 ${
                  activeTab === "favorites"
                    ? "bg-yellow-500 text-black font-extrabold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <Star className="w-3 h-3 fill-current" /> ⭐ Favs ({favorites.length})
              </button>
              <button
                onClick={() => setActiveTab("recents")}
                className={`py-1.5 rounded transition ${
                  activeTab === "recents"
                    ? "bg-yellow-500 text-black font-extrabold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Recents ({recents.length})
              </button>
            </div>

            {/* Group Categories Selector Ribbon */}
            {categories.length > 0 && activeTab !== "recents" && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-neutral-500 font-bold uppercase shrink-0">GROUP:</span>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="flex-1 bg-black border border-neutral-900 text-[11px] py-1 px-2 rounded text-neutral-400 outline-none focus:border-yellow-500"
                >
                  <option value="ALL_CHANNELS">All Categories / Folders</option>
                  {categories.map((cat, idx) => (
                    <option key={idx} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* VIRTUALIZED CHANNELS STREAMING LIST VIEW */}
          <div className="flex-1 min-h-0 flex flex-col relative">
            {loadingChannels ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950/90 z-10">
                <RefreshCw className="w-8 h-8 text-yellow-500 animate-spin mb-2" />
                <span className="text-xs font-mono text-neutral-500 tracking-wider">INDEXING PROVIDER...</span>
              </div>
            ) : null}

            {fetchError ? (
              <div className="p-4 text-center space-y-3">
                <p className="text-xs text-red-400 bg-red-500/5 p-3 rounded border border-red-500/15 leading-relaxed font-mono">
                  {fetchError}
                </p>
                <button
                  onClick={() => loadPlaylistChannels(currentPlaylist)}
                  className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-bold text-yellow-500 rounded transition"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <ChannelVirtualList
                channels={filteredChannels}
                selectedChannel={selectedChannel}
                onSelectChannel={handleSelectChannel}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
                epgSchedule={epgSchedule}
              />
            )}
          </div>

          {/* Footer Listing Metrics stats */}
          <div className="bg-neutral-950 border-t border-neutral-900 p-2.5 px-3 text-[10px] text-neutral-500 font-mono flex items-center justify-between shrink-0 select-none">
            <span>Filter items: {filteredChannels.length}</span>
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${loadingEpg ? "bg-yellow-500 animate-ping" : "bg-green-500"}`} />
              {loadingEpg ? "Caching Guides..." : "EPG Hydrated"}
            </span>
          </div>
        </aside>

        {/* ACTIVE STAGE VIEW DETAILED PANEL */}
        <main className="flex-1 h-full min-w-0 bg-neutral-950 overflow-y-auto p-4 lg:p-6 custom-scrollbar block">
          <div className="max-w-5xl mx-auto space-y-6">
            
            {/* MPV STYLED WEB PLAYER CONTAINER */}
            <div className="w-full">
              {selectedChannel ? (
                <MpvPlayer
                  channel={selectedChannel}
                  epgShow={selectedChannelShow}
                  onRefreshEpg={() => selectedChannel && singleChannelEpgFetch(selectedChannel)}
                />
              ) : (
                <div className="bg-black border border-neutral-900 rounded-lg aspect-video flex flex-col items-center justify-center text-center p-8">
                  <Tv className="w-16 h-16 text-neutral-800 mb-4 stroke-[1.25]" />
                  <h3 className="text-base font-bold text-neutral-300">No stream feed targeted</h3>
                  <p className="text-xs text-neutral-500 max-w-sm mt-1 mb-4 leading-normal">
                    Select any live channel from the control directory deck on the left panel to trigger playback initialization.
                  </p>
                </div>
              )}
            </div>

            {/* TIMETABLE ELECTRONIC PROGRAM GUIDE */}
            <div className="grid grid-cols-1 gap-6">
              <EpgGuide
                channel={selectedChannel}
                epgShow={selectedChannelShow}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
