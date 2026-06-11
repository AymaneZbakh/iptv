/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
// @ts-ignore
import mpegts from "mpegts.js";
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  Tv, 
  Copy, 
  Download, 
  Activity, 
  Sliders, 
  RotateCcw,
  RefreshCw,
  Terminal,
  MonitorPlay,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { IPTVChannel, EPGCurrentShow } from "../types.js";

// Electron API - only available when running inside Electron
declare global {
  interface Window {
    electronAPI?: {
      mpvPlay: (opts: { url: string; channelName: string }) => Promise<{ success: boolean; pid?: number; error?: string }>;
      mpvStop: () => Promise<{ success: boolean }>;
      mpvCheck: () => Promise<{ available: boolean; version?: string; error?: string }>;
      showMpvMissing: () => Promise<number>;
      openExternal: (url: string) => Promise<void>;
      platform: string;
      isElectron: boolean;
    };
  }
}

const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

interface MpvPlayerProps {
  channel: IPTVChannel | null;
  epgShow: EPGCurrentShow | null;
  onRefreshEpg: () => void;
}

export default function MpvPlayer({ channel, epgShow, onRefreshEpg }: MpvPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<any>(null);

  // Video State
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<"auto" | "16:9" | "4:3" | "fill">("auto");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [hlsLevels, setHlsLevels] = useState<{ id: number; name: string }[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);

  // MPV Native State (Electron only)
  const [mpvAvailable, setMpvAvailable] = useState<boolean | null>(null);
  const [mpvVersion, setMpvVersion] = useState<string>("");
  const [mpvActive, setMpvActive] = useState(false);
  const [activePlayerMode, setActivePlayerMode] = useState<"web" | "mpv">("web");

  // OSC / OSD
  const [showOsc, setShowOsc] = useState(true);
  const oscTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [osdText, setOsdText] = useState<string | null>(null);
  const osdTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Stats
  const [showStats, setShowStats] = useState(false);
  const [liveStats, setLiveStats] = useState({
    resolution: "Unknown",
    bitrate: 0,
    fps: 0,
    bufferLength: 0,
    droppedFrames: 0,
    hlsVersion: Hls.version,
    latency: 0,
  });
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ── Check MPV availability on load (Electron only) ──────────────────────
  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI!.mpvCheck().then((result) => {
      setMpvAvailable(result.available);
      if (result.available && result.version) {
        setMpvVersion(result.version);
      }
    });
  }, []);

  // ── OSD ──────────────────────────────────────────────────────────────────
  const triggerOsd = useCallback((text: string) => {
    if (osdTimeoutRef.current) clearTimeout(osdTimeoutRef.current);
    setOsdText(text);
    osdTimeoutRef.current = setTimeout(() => setOsdText(null), 1800);
  }, []);

  // ── Clipboard ────────────────────────────────────────────────────────────
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    triggerOsd("Copied to clipboard!");
  };

  const downloadM3uFile = () => {
    if (!channel) return;
    const content = `#EXTM3U\n#EXTINF:-1 tvg-id="${channel.epgId || ""}" tvg-logo="${channel.logo || ""}",${channel.name}\n${channel.url}`;
    const blob = new Blob([content], { type: "application/x-mpegurl" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${channel.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}.m3u`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    triggerOsd(".m3u file downloaded");
  };

  // ── Launch real MPV (Electron) ───────────────────────────────────────────
  const launchMpv = async () => {
    if (!channel || !isElectron) return;

    if (!mpvAvailable) {
      await window.electronAPI!.showMpvMissing();
      return;
    }

    triggerOsd("Launching MPV...");
    const result = await window.electronAPI!.mpvPlay({
      url: channel.url,
      channelName: channel.name,
    });

    if (result.success) {
      setMpvActive(true);
      setActivePlayerMode("mpv");
      triggerOsd(`MPV launched (PID ${result.pid})`);
      // Pause web player while MPV is active
      const video = videoRef.current;
      if (video && isPlaying) {
        video.pause();
        setIsPlaying(false);
      }
    } else {
      triggerOsd("MPV launch failed");
      await window.electronAPI!.showMpvMissing();
    }
  };

  const stopMpv = async () => {
    if (!isElectron) return;
    await window.electronAPI!.mpvStop();
    setMpvActive(false);
    setActivePlayerMode("web");
    triggerOsd("MPV stopped");
  };

  // ── Web Player Engine ────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel) return;

    // If MPV is active, don't auto-start web player
    if (activePlayerMode === "mpv") return;

    setIsLoading(true);
    setStreamError(null);
    setHlsLevels([]);
    setCurrentLevel(-1);

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (mpegtsRef.current) {
      try { mpegtsRef.current.unload(); mpegtsRef.current.detachMediaElement(); mpegtsRef.current.destroy(); }
      catch (e) { console.warn("mpegts teardown:", e); }
      mpegtsRef.current = null;
    }

    video.muted = isMuted;
    video.volume = volume;
    video.playbackRate = playbackSpeed;

    const rawUrl = channel.url;
    const isMpegTs = rawUrl.includes(".ts") || rawUrl.includes("mpegts") || rawUrl.includes("output=ts");

    const loadForceTimeout = setTimeout(() => setIsLoading(false), 15000);

    const handlePlaying = () => { setIsLoading(false); setIsPlaying(true); setStreamError(null); };
    const handleCanPlay = () => setIsLoading(false);
    const handleVideoError = () => {
      if (video.src && !video.src.includes("/api/proxy-resource") && !rawUrl.includes("/api/proxy-resource")) {
        const proxiedUrl = `/api/proxy-resource?url=${encodeURIComponent(rawUrl)}`;
        video.src = proxiedUrl; video.load(); video.play().catch(() => {});
      } else {
        setStreamError(video.error?.message || "CORS restriction or stream is offline.");
        setIsLoading(false);
      }
    };

    video.addEventListener("playing", handlePlaying);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("error", handleVideoError);

    const startMpegTs = (url: string, useProxy: boolean) => {
      try {
        const player = mpegts.createPlayer({ type: "mse", isLive: true, url }, {
          enableWorker: true, lazyLoadMaxDuration: 10, stashInitialSize: 128 * 1024
        });
        mpegtsRef.current = player;
        player.attachMediaElement(video);
        player.load();
        const p = player.play();
        if (p?.then) p.then(() => { setIsPlaying(true); setIsLoading(false); }).catch(() => {});
        player.on(mpegts.Events.ERROR, (type: any, detail: any) => {
          if (useProxy && !url.includes("/api/proxy-resource")) {
            player.unload(); player.detachMediaElement(); player.destroy(); mpegtsRef.current = null;
            startMpegTs(`/api/proxy-resource?url=${encodeURIComponent(rawUrl)}`, false);
          } else {
            setStreamError(`MPEG-TS Error: ${type} - ${detail}`); setIsLoading(false);
          }
        });
      } catch (err: any) {
        setStreamError(`MPEG-TS Engine failure: ${err.message}`); setIsLoading(false);
      }
    };

    const startHls = (url: string, useProxy: boolean) => {
      const hls = new Hls({ enableWorker: true, maxBufferSize: 30*1024*1024, maxBufferLength: 20, lowLatencyMode: true, backBufferLength: 10 });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => video.play().catch(() => setIsPlaying(false)));
      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setIsLoading(false); setIsPlaying(true);
        setHlsLevels(data.levels.map((l, i) => ({ id: i, name: l.height ? `${l.height}p` : `Level ${i+1}` })));
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (useProxy && !url.includes("/api/proxy-resource")) {
            hls.loadSource(`/api/proxy-resource?url=${encodeURIComponent(rawUrl)}`); hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            setStreamError("HLS Playback Interrupted: CORS lock or stream offline."); setIsLoading(false);
          }
        }
      });
    };

    if (isMpegTs && mpegts.isSupported()) startMpegTs(rawUrl, true);
    else if (Hls.isSupported()) startHls(rawUrl, true);
    else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = rawUrl; video.load();
      video.play().then(() => { setIsPlaying(true); setIsLoading(false); }).catch(() => setIsPlaying(false));
    } else {
      video.src = rawUrl; video.load();
      video.play().then(() => { setIsPlaying(true); setIsLoading(false); })
        .catch(() => { setStreamError("Unsupported browser/stream format."); setIsLoading(false); });
    }

    return () => {
      clearTimeout(loadForceTimeout);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("error", handleVideoError);
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      if (mpegtsRef.current) {
        try { mpegtsRef.current.unload(); mpegtsRef.current.detachMediaElement(); mpegtsRef.current.destroy(); }
        catch (e) { console.warn("Teardown error:", e); }
        mpegtsRef.current = null;
      }
    };
  }, [channel, activePlayerMode]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) { video.volume = volume; video.muted = isMuted; }
  }, [volume, isMuted]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    if (showStats) {
      statsIntervalRef.current = setInterval(() => {
        const video = videoRef.current;
        const hls = hlsRef.current;
        if (!video) return;
        let res = `${video.videoWidth}x${video.videoHeight}`;
        if (video.videoWidth === 0) res = "Detecting...";
        let buf = 0;
        if (video.buffered.length > 0) {
          for (let i = 0; i < video.buffered.length; i++) {
            if (video.currentTime >= video.buffered.start(i) && video.currentTime <= video.buffered.end(i)) {
              buf = video.buffered.end(i) - video.currentTime; break;
            }
          }
        }
        let dropped = 0;
        if ((video as any).getVideoPlaybackQuality) dropped = (video as any).getVideoPlaybackQuality().droppedVideoFrames || 0;
        let br = hls?.levels?.[hls.currentLevel]?.bitrate ? Math.round(hls.levels[hls.currentLevel].bitrate / 1000) : 0;
        setLiveStats(prev => ({ ...prev, resolution: res, bufferLength: Math.round(buf*10)/10, droppedFrames: dropped, bitrate: br || prev.bitrate, fps: 30 }));
      }, 1000);
    } else if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    return () => { if (statsIntervalRef.current) clearInterval(statsIntervalRef.current); };
  }, [showStats, channel]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) { video.pause(); setIsPlaying(false); triggerOsd("Pause"); }
    else { video.play().catch(() => {}); setIsPlaying(true); triggerOsd("Play"); }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    triggerOsd(!isMuted ? "Muted" : `Volume: ${Math.round(volume * 100)}%`);
  };

  const changeVolume = (val: number) => {
    const v = Math.min(1, Math.max(0, val));
    setVolume(v);
    if (v > 0 && isMuted) setIsMuted(false);
    triggerOsd(`Volume: ${Math.round(v * 100)}%`);
  };

  const changeSpeed = (val: number) => { setPlaybackSpeed(val); triggerOsd(`Speed: ${val.toFixed(2)}x`); };
  const toggleStats = () => setShowStats(!showStats);

  const cycleAspectRatio = () => {
    const modes: typeof aspectRatio[] = ["auto", "16:9", "4:3", "fill"];
    const next = modes[(modes.indexOf(aspectRatio) + 1) % modes.length];
    setAspectRatio(next);
    triggerOsd(`Aspect Ratio: ${next.toUpperCase()}`);
  };

  const selectLevel = (levelId: number) => {
    setCurrentLevel(levelId);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelId;
      triggerOsd(`Quality: ${levelId === -1 ? "AUTO" : hlsLevels.find(l => l.id === levelId)?.name}`);
    }
  };

  const toggleFullscreen = () => {
    const c = containerRef.current;
    if (!c) return;
    if (!document.fullscreenElement) c.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    else { document.exitFullscreen(); setIsFullscreen(false); }
  };

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const handleMouseMove = () => {
    setShowOsc(true);
    if (oscTimeoutRef.current) clearTimeout(oscTimeoutRef.current);
    oscTimeoutRef.current = setTimeout(() => { if (isPlaying) setShowOsc(false); }, 3000);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      switch (e.key.toLowerCase()) {
        case " ": e.preventDefault(); togglePlay(); break;
        case "f": e.preventDefault(); toggleFullscreen(); break;
        case "m": e.preventDefault(); toggleMute(); break;
        case "9": e.preventDefault(); changeVolume(volume - 0.05); break;
        case "0": e.preventDefault(); changeVolume(volume + 0.05); break;
        case "i": e.preventDefault(); toggleStats(); break;
        case "[": { const s = [0.5,0.75,1,1.25,1.5,2]; const i = s.indexOf(playbackSpeed); if (i > 0) changeSpeed(s[i-1]); break; }
        case "]": { const s = [0.5,0.75,1,1.25,1.5,2]; const i = s.indexOf(playbackSpeed); if (i < s.length-1) changeSpeed(s[i+1]); break; }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isPlaying, volume, isMuted, playbackSpeed, showStats]);

  const getVideoStyle = (): React.CSSProperties => {
    switch (aspectRatio) {
      case "16:9": return { aspectRatio: "16/9", objectFit: "contain" };
      case "4:3": return { aspectRatio: "4/3", objectFit: "contain" };
      case "fill": return { width: "100%", height: "100%", objectFit: "fill" };
      default: return { width: "100%", height: "100%", objectFit: "contain" };
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Player Mode Toggle (Electron only) ── */}
      {isElectron && (
        <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-neutral-400 uppercase tracking-widest">Player Mode</span>
            <div className="flex gap-1 bg-black rounded-md p-0.5 border border-neutral-800">
              <button
                onClick={() => { setActivePlayerMode("web"); if (mpvActive) stopMpv(); }}
                className={`px-3 py-1 rounded text-xs font-bold transition ${activePlayerMode === "web" ? "bg-yellow-500 text-black" : "text-neutral-400 hover:text-white"}`}
              >
                Web Player
              </button>
              <button
                onClick={launchMpv}
                className={`px-3 py-1 rounded text-xs font-bold transition flex items-center gap-1.5 ${activePlayerMode === "mpv" && mpvActive ? "bg-green-500 text-black" : "text-neutral-400 hover:text-white"}`}
              >
                <MonitorPlay className="w-3.5 h-3.5" />
                MPV Native
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            {mpvAvailable === null && <span className="text-neutral-500">Checking MPV...</span>}
            {mpvAvailable === true && (
              <span className="flex items-center gap-1 text-green-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> {mpvVersion || "MPV Available"}
              </span>
            )}
            {mpvAvailable === false && (
              <span className="flex items-center gap-1 text-yellow-500">
                <AlertCircle className="w-3.5 h-3.5" /> MPV not installed
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── MPV Active State Banner ── */}
      {isElectron && mpvActive && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-green-400 text-sm font-mono">
            <MonitorPlay className="w-4 h-4 animate-pulse" />
            <span className="font-bold">MPV is playing: {channel?.name}</span>
          </div>
          <button
            onClick={stopMpv}
            className="px-3 py-1 text-xs font-bold bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded border border-red-500/30 transition"
          >
            Stop MPV
          </button>
        </div>
      )}

      {/* ── Video Stage ── */}
      <div
        ref={containerRef}
        className="relative bg-black rounded-lg aspect-video shadow-2xl overflow-hidden group select-none border border-neutral-800"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => isPlaying && setShowOsc(false)}
      >
        <video ref={videoRef} style={getVideoStyle()} className="mx-auto block" onClick={togglePlay} playsInline />

        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-30">
            <RefreshCw className="w-12 h-12 text-yellow-500 animate-spin mb-3" />
            <span className="font-mono text-sm tracking-widest text-neutral-400">LOADING STREAM</span>
          </div>
        )}

        {streamError && !mpvActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950/95 z-30 px-6 text-center">
            <Tv className="w-12 h-12 text-yellow-500 mb-2 stroke-[1.5]" />
            <h3 className="text-sm font-semibold text-neutral-200 mb-1">Stream Error / CORS Block</h3>
            <p className="text-[10px] text-neutral-400 max-w-md line-clamp-2 mb-3.5 font-mono leading-relaxed bg-black/60 p-2 rounded border border-neutral-900">
              {streamError}
            </p>
            {isElectron ? (
              <button
                onClick={launchMpv}
                className="px-4 py-2 bg-green-500 hover:bg-green-400 text-black text-xs font-extrabold rounded transition flex items-center gap-2"
              >
                <MonitorPlay className="w-4 h-4" /> Launch in MPV (bypasses all restrictions)
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => channel && copyToClipboard(`mpv "${channel.url}"`)}
                  className="px-3.5 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/20 text-xs font-bold rounded transition">
                  Copy MPV Command
                </button>
                <button onClick={downloadM3uFile}
                  className="px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded transition">
                  Download .m3u
                </button>
              </div>
            )}
          </div>
        )}

        {osdText && (
          <div className="absolute top-6 left-6 text-yellow-400 bg-black/60 border border-neutral-700 font-mono text-base font-bold px-3 py-1.5 rounded z-40"
            style={{ textShadow: "1px 1px 2px #000" }}>
            {osdText}
          </div>
        )}

        {showStats && (
          <div className="absolute inset-x-0 top-0 bg-neutral-950/85 text-xs text-green-400 p-6 font-mono select-text z-20 grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-3 max-h-[80%] overflow-y-auto border-b border-neutral-800">
            <div className="col-span-full border-b border-neutral-800 pb-2 mb-2 flex items-center justify-between text-white font-medium">
              <span className="flex items-center gap-1.5 font-bold"><Activity className="w-4 h-4 text-green-400" /> MPV DETAILED STATISTICS</span>
              <button onClick={() => setShowStats(false)} className="text-neutral-500 hover:text-white font-sans text-lg font-bold">×</button>
            </div>
            <div><span className="text-neutral-400 font-sans">Channel:</span> {channel?.name || "None"}</div>
            <div><span className="text-neutral-400 font-sans">Player:</span> {activePlayerMode === "mpv" ? "MPV Native" : "Web (HLS.js)"}</div>
            <div><span className="text-neutral-400 font-sans">Resolution:</span> {liveStats.resolution}</div>
            <div><span className="text-neutral-400 font-sans">Bitrate:</span> {liveStats.bitrate} kbps</div>
            <div><span className="text-neutral-400 font-sans">Buffer:</span> {liveStats.bufferLength}s</div>
            <div><span className="text-neutral-400 font-sans">Dropped Frames:</span> {liveStats.droppedFrames}</div>
            <div><span className="text-neutral-400 font-sans">HLS.js:</span> {liveStats.hlsVersion}</div>
            {mpvAvailable && <div><span className="text-neutral-400 font-sans">MPV:</span> {mpvVersion}</div>}
            <div className="col-span-full mt-2 pt-2 border-t border-neutral-900 break-all text-[10px] text-neutral-500">
              <span className="text-neutral-400 font-sans">URL:</span> {channel?.url}
            </div>
          </div>
        )}

        {(showOsc || !isPlaying) && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/60 z-10 flex flex-col justify-between p-4 transition-all duration-300">
            <div className="flex items-start justify-between w-full">
              <div className="bg-black/65 p-2 rounded backdrop-blur">
                <h2 className="text-base font-bold text-white tracking-wide truncate max-w-md sm:max-w-xl">
                  {channel?.name || "No Channel Selected"}
                </h2>
                {epgShow?.current ? (
                  <p className="text-xs text-yellow-400 truncate mt-0.5 max-w-sm">NOW: {epgShow.current.title}</p>
                ) : (
                  <p className="text-xs text-neutral-400">No Schedule loaded</p>
                )}
              </div>
              <div className="flex gap-1.5">
                <button onClick={cycleAspectRatio}
                  className="p-1 px-2.5 bg-neutral-900/80 hover:bg-neutral-800 text-xs text-white border border-neutral-700/60 font-mono rounded">
                  ASPECT: {aspectRatio.toUpperCase()}
                </button>
                <button onClick={toggleStats}
                  className={`p-1 px-2.5 hover:bg-neutral-800 text-xs border border-neutral-700/60 font-mono rounded flex items-center gap-1 ${showStats ? "bg-green-500 text-black border-green-400 font-bold" : "bg-neutral-900/80 text-white"}`}>
                  <Activity className="w-3.5 h-3.5" /> STATS (I)
                </button>
                {isElectron && (
                  <button onClick={launchMpv}
                    className={`p-1 px-2.5 text-xs border font-mono rounded flex items-center gap-1 transition ${mpvActive ? "bg-green-500/20 text-green-400 border-green-500/40" : "bg-neutral-900/80 hover:bg-neutral-800 text-white border-neutral-700/60"}`}>
                    <MonitorPlay className="w-3.5 h-3.5" /> MPV
                  </button>
                )}
              </div>
            </div>

            {!isPlaying && !isLoading && (
              <button onClick={togglePlay}
                className="mx-auto w-16 h-16 rounded-full bg-white/10 backdrop-blur hover:bg-white/20 active:scale-95 text-yellow-400 flex items-center justify-center transition border border-white/25 self-center shadow cursor-pointer">
                <Play className="w-8 h-8 fill-yellow-400 pl-1" />
              </button>
            )}

            <div className="space-y-3 pt-6">
              <div className="h-1 bg-neutral-800 rounded-full w-full relative overflow-hidden">
                {epgShow?.current ? (
                  <div className="h-full bg-yellow-400 transition-all duration-300" style={{ width: `${epgShow.progress}%` }} />
                ) : (
                  <div className="h-[2px] bg-neutral-600/55 animate-pulse w-full" />
                )}
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button onClick={togglePlay} className="p-1.5 rounded-full hover:bg-neutral-800 text-white transition active:scale-95"
                    title={isPlaying ? "Pause (Space)" : "Play (Space)"}>
                    {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
                  </button>
                  <div className="flex items-center gap-1.5 md:gap-2">
                    <button onClick={toggleMute} className="p-1.5 rounded-full hover:bg-neutral-800 text-neutral-300 transition" title="Mute (M)">
                      {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input type="range" min="0" max="100" value={isMuted ? 0 : volume * 100}
                      onChange={(e) => changeVolume(parseFloat(e.target.value) / 100)}
                      className="w-16 md:w-20 accent-yellow-400 h-1 bg-neutral-800 rounded-lg cursor-pointer" />
                    <span className="font-mono text-[10px] text-neutral-400 hidden sm:inline w-7 text-right">
                      {isMuted ? "0%" : `${Math.round(volume * 100)}%`}
                    </span>
                  </div>
                  {hlsLevels.length > 0 && (
                    <div className="hidden md:flex items-center gap-1 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded text-[10px]">
                      <Sliders className="w-3 h-3 text-neutral-500" />
                      <span className="text-neutral-400 pr-1">QUALITY:</span>
                      <select value={currentLevel} onChange={(e) => selectLevel(parseInt(e.target.value))}
                        className="bg-transparent text-white font-mono border-none outline-none cursor-pointer">
                        <option value={-1} className="bg-neutral-950">Auto</option>
                        {hlsLevels.map(level => <option key={level.id} value={level.id} className="bg-neutral-950">{level.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="hidden sm:flex items-center gap-1 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded text-[10px]">
                    <span className="text-neutral-400">SPEED:</span>
                    <select value={playbackSpeed} onChange={(e) => changeSpeed(parseFloat(e.target.value))}
                      className="bg-transparent text-white font-mono border-none outline-none cursor-pointer">
                      {[0.5,0.75,1,1.25,1.5,2].map(s => <option key={s} value={s} className="bg-neutral-950">{s.toFixed(2)}x</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={onRefreshEpg} className="p-1.5 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition" title="Reload EPG">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button onClick={toggleFullscreen} className="p-1.5 rounded-full hover:bg-neutral-800 text-white transition" title="Fullscreen (F)">
                    {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── MPV Integration Panel ── */}
      {channel && (
        <div className="bg-neutral-950 border border-neutral-900 rounded-lg p-4 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-neutral-900 pb-2 mb-3">
            <span className="flex items-center gap-1.5 text-yellow-500 font-bold uppercase tracking-wide">
              <Terminal className="w-4 h-4 text-neutral-400" /> MPV Integration
            </span>
            {isElectron && mpvAvailable && (
              <button onClick={launchMpv}
                className="flex items-center gap-1.5 bg-green-500 hover:bg-green-400 text-black font-extrabold px-3 py-1.5 rounded transition text-[10px]">
                <MonitorPlay className="w-3.5 h-3.5" /> LAUNCH IN MPV
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-black border border-neutral-800 p-2.5 rounded gap-2 flex flex-col justify-between">
              <div>
                <div className="text-[9px] text-neutral-500 uppercase font-bold mb-1">CLI LAUNCH SCRIPT</div>
                <div className="text-neutral-300 break-all select-all font-mono text-[10px] bg-neutral-950 p-2 rounded border border-neutral-900 leading-normal">
                  mpv "{channel.url}"
                </div>
              </div>
              <button onClick={() => copyToClipboard(`mpv "${channel.url}"`)}
                className="mt-2 w-full py-1.5 bg-neutral-900 hover:bg-neutral-800 text-yellow-500 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition">
                <Copy className="w-3 h-3" /> COPY CLI COMMAND
              </button>
            </div>
            <div className="bg-black border border-neutral-800 p-2.5 rounded gap-2 flex flex-col justify-between">
              <div>
                <div className="text-[9px] text-neutral-500 uppercase font-bold mb-1">LOCAL STREAM FILE</div>
                <div className="text-neutral-400 text-[11px] font-sans p-1 leading-relaxed">
                  Download a <span className="text-white">.m3u</span> file for this channel to open instantly in any media player.
                </div>
              </div>
              <button onClick={downloadM3uFile}
                className="mt-2 w-full py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition">
                <Download className="w-3 h-3" /> DOWNLOAD CHANNEL .M3U
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
