/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  FolderLock, 
  Plus, 
  Trash2, 
  FileCode, 
  Link2, 
  Upload, 
  Tv, 
  Sparkles,
  Info
} from "lucide-react";
import { PlaylistInfo } from "../types.js";

// Curated safe, free public streams
export const PRESETS: PlaylistInfo[] = [
  {
    id: "preset-news",
    name: "Global News Feeds (IPTV)",
    url: "https://iptv-org.github.io/iptv/categories/news.m3u",
    isCustom: false
  },
  {
    id: "preset-music",
    name: "Global Music (IPTV)",
    url: "https://iptv-org.github.io/iptv/categories/music.m3u",
    isCustom: false
  },
  {
    id: "preset-education",
    name: "Global Science & Tech (IPTV)",
    url: "https://iptv-org.github.io/iptv/categories/education.m3u",
    isCustom: false
  }
];

// Presets for XMLTV EPG
export const DEFAULT_EPG_PRESETS = [
  { name: "No EPG (Synthetic fallback)", url: "" },
  { name: "IPTV-org US Guide", url: "https://iptv-org.github.io/epg/guides/us/tv.xml" },
  { name: "IPTV-org UK Guide", url: "https://iptv-org.github.io/epg/guides/uk/tv.xml" }
];

interface PlaylistManagerProps {
  playlists: PlaylistInfo[];
  selectedPlaylistId: string;
  onSelectPlaylist: (id: string) => void;
  onAddPlaylist: (name: string, url: string) => void;
  onDeletePlaylist: (id: string) => void;
  epgUrl: string;
  onChangeEpgUrl: (url: string) => void;
  onUploadRawM3U: (name: string, content: string) => void;
}

export default function PlaylistManager({
  playlists,
  selectedPlaylistId,
  onSelectPlaylist,
  onAddPlaylist,
  onDeletePlaylist,
  epgUrl,
  onChangeEpgUrl,
  onUploadRawM3U
}: PlaylistManagerProps) {
  const [nameInput, setNameInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [showConfig, setShowConfig] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Parse input
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim() || !urlInput.trim()) {
      setErrorMsg("Please fill out both playlist name and M3U URL.");
      return;
    }
    if (!urlInput.startsWith("http://") && !urlInput.startsWith("https://")) {
      setErrorMsg("URL must start with http:// or https://");
      return;
    }
    
    onAddPlaylist(nameInput.trim(), urlInput.trim());
    setNameInput("");
    setUrlInput("");
    setErrorMsg(null);
  };

  // Drag over
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Drag handle file upload
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith(".m3u") || file.name.endsWith(".m3u8") || file.type === "audio/x-mpegurl") {
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result as string;
          onUploadRawM3U(file.name.replace(/\.[^/.]+$/, ""), text);
        };
        reader.readAsText(file);
      } else {
        setErrorMsg("Invalid file. Please drop a valid .m3u or .m3u8 playlist file.");
      }
    }
  };

  // File picker upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        onUploadRawM3U(file.name.replace(/\.[^/.]+$/, ""), text);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="bg-neutral-900 border-b border-neutral-800 p-3 select-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Tv className="w-4 h-4 text-yellow-500" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">Feed Control</span>
        </div>
        
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="text-[10px] text-yellow-500 hover:text-yellow-400 font-semibold px-2 py-1 rounded bg-yellow-500/5 hover:bg-yellow-500/10 transition border border-yellow-500/20"
        >
          {showConfig ? "Collapse Source Panel" : "Change M3U / EPG Source"}
        </button>
      </div>

      {/* Playlist Selector always showing top summary */}
      <div className="mt-3 grid grid-cols-1 gap-2">
        <label className="text-[9px] text-neutral-500 uppercase font-black tracking-wide">Selected IPTV M3U Provider</label>
        <div className="flex gap-2">
          <select
            value={selectedPlaylistId}
            onChange={(e) => onSelectPlaylist(e.target.value)}
            className="flex-1 bg-neutral-950 border border-neutral-800 text-xs text-neutral-250 py-1.5 px-2.5 rounded outline-none focus:border-yellow-500"
          >
            {playlists.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.name} {pl.isCustom ? "(User Upload)" : ""}
              </option>
            ))}
          </select>

          {/* Delete Button */}
          {playlists.find(p => p.id === selectedPlaylistId)?.isCustom && (
            <button
              onClick={() => onDeletePlaylist(selectedPlaylistId)}
              className="p-1.5 bg-red-500/10 hover:bg-red-500-20 text-red-400 hover:text-red-300 border border-red-500/20 rounded transition"
              title="Delete Playlist"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* EXPANDABLE CONTEXT CONFIGURATION PANEL */}
      {showConfig && (
        <div className="mt-4 pt-3 border-t border-neutral-800 space-y-4 animate-fade-in text-[11px]">
          {/* Preset guides helper */}
          <div className="bg-neutral-950/50 p-2.5 rounded border border-neutral-800/60 text-neutral-400 leading-relaxed font-sans text-[11px] flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              We automatically bypass strict CORS blocks by fetching playlists and EPG through our built-in Node pipeline, so <strong>you can insert even protected streams!</strong>
            </div>
          </div>

          {/* 1. M3U URL CUSTOM FORM */}
          <form onSubmit={handleAddSubmit} className="space-y-2">
            <h5 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide flex items-center gap-1">
              <Link2 className="w-3 h-3 text-neutral-500" /> Add Online M3U Playlist
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Provider Name (e.g. US Networks)"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 text-xs p-1.5 rounded outline-none text-white focus:border-yellow-500 font-sans"
              />
              <input
                type="text"
                placeholder="https://example.com/playlist.m3u"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 text-xs p-1.5 rounded outline-none text-white focus:border-yellow-500"
              />
            </div>
            <button
              type="submit"
              className="w-full py-1.5 bg-yellow-500 hover:bg-yellow-400 cursor-pointer text-black text-xs font-bold rounded flex items-center justify-center gap-1 transition"
            >
              <Plus className="w-3.5 h-3.5" /> ADD INTERNET LIST
            </button>
          </form>

          {/* 2. LOCAL FILE DRAG & DROP */}
          <div className="space-y-2">
            <h5 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide flex items-center gap-1">
              <FileCode className="w-3 h-3 text-neutral-500" /> Drag-and-Drop Local M3U
            </h5>
            
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition ${
                dragActive 
                  ? "border-yellow-500 bg-yellow-500/5 text-yellow-400" 
                  : "border-neutral-800 bg-neutral-950 hover:border-neutral-700 text-neutral-400"
              }`}
            >
              <input
                type="file"
                id="file-upload-input"
                accept=".m3u,.m3u8,audio/x-mpegurl"
                onChange={handleFileChange}
                className="hidden"
              />
              <label htmlFor="file-upload-input" className="cursor-pointer block text-center">
                <Upload className="w-6 h-6 mx-auto mb-1.5 text-neutral-500" />
                <p className="text-[11px] font-medium text-neutral-300">Drag or click to choose .m3u local file</p>
                <p className="text-[9px] text-neutral-600 mt-1 font-mono">Bypasses server loading delays completely</p>
              </label>
            </div>
          </div>

          {/* 3. ELECTRONIC PROGRAM GUIDE (EPG) INPUT */}
          <div className="space-y-2 pt-2 border-t border-neutral-800">
            <h5 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide flex items-center gap-1">
              <FolderLock className="w-3 h-3 text-neutral-500" /> EPG Guide (XMLTV URL)
            </h5>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="https://example.com/guide.xml"
                value={epgUrl}
                onChange={(e) => onChangeEpgUrl(e.target.value)}
                className="flex-1 bg-neutral-950 border border-neutral-800 text-xs p-1.5 rounded outline-none text-white focus:border-yellow-500"
              />
            </div>
            
            {/* Quick Presets for EPG */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {DEFAULT_EPG_PRESETS.map((preset, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => onChangeEpgUrl(preset.url)}
                  className={`text-[9px] px-1.5 py-0.5 rounded border transition ${
                    epgUrl === preset.url
                      ? "bg-yellow-500/10 border-yellow-500/40 text-yellow-400"
                      : "bg-neutral-950 border-neutral-900 text-neutral-500 hover:text-neutral-400"
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* ERROR DISPLAY */}
          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] p-2.5 rounded font-mono">
              {errorMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
