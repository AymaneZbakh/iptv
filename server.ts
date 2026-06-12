/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import http from "http";
import https from "https";
import {
  getPlaylistChannels,
  getEPGProgrammes,
  getCurrentShow,
} from "./src/backend/iptv-helper.js";

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json());

  // CORS headers
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.sendStatus(200); } else { next(); }
  });

  // 1. Playlist endpoint
  app.get("/api/playlist", async (req, res) => {
    const playlistUrl = req.query.url as string;
    if (!playlistUrl) return res.status(400).json({ error: "Missing 'url' query parameter" });
    try {
      console.log(`[IPTV Engine] Fetching M3U from URL: ${playlistUrl}`);
      const channels = await getPlaylistChannels(playlistUrl, req.query.refresh === "true");
      return res.json({ success: true, count: channels.length, channels });
    } catch (err: any) {
      console.error(`[IPTV Engine] Error parsing M3U:`, err);
      return res.status(500).json({ error: err.message || "Failed to load M3U playlist" });
    }
  });

  // 2. Batch EPG endpoint
  app.post("/api/epg/batch", async (req, res) => {
    const { epgUrl, channels } = req.body as { epgUrl: string; channels: { epgId: string | null; name: string }[] };
    if (!epgUrl) return res.status(400).json({ error: "Missing 'epgUrl' parameter" });
    if (!channels || !Array.isArray(channels)) return res.status(400).json({ error: "Missing or invalid 'channels' array" });
    try {
      let programmes: any[] = [];
      try { programmes = await getEPGProgrammes(epgUrl); }
      catch (e) { console.warn(`[IPTV Engine] Real EPG failed, using synthetic fallback.`); }
      const scheduleMap: Record<string, any> = {};
      for (const ch of channels) {
        const id = ch.epgId || ch.name;
        scheduleMap[id] = getCurrentShow(programmes, ch.epgId || "", ch.name);
      }
      return res.json({ success: true, schedule: scheduleMap });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to batch load EPG" });
    }
  });

  // 3. CORS Proxy
  app.get("/api/proxy-resource", (req, res) => {
    const targetUrlStr = req.query.url as string;
    if (!targetUrlStr) return res.status(400).send("Missing 'url' parameter");
    try {
      const targetUrl = new URL(targetUrlStr);
      const client = targetUrl.protocol === "https:" ? https : http;
      const proxyReq = client.request(targetUrlStr, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": targetUrl.origin,
          "Accept": "*/*",
        },
      }, (proxyRes) => {
        const headers = { ...proxyRes.headers };
        delete headers["access-control-allow-origin"];
        res.writeHead(proxyRes.statusCode || 200, {
          ...headers,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
        });
        proxyRes.pipe(res);
      });
      proxyReq.on("error", (err) => {
        if (!res.headersSent) res.status(500).send(`Proxy Error: ${err.message}`);
      });
      proxyReq.end();
    } catch (err: any) {
      return res.status(400).send(`Invalid URL: ${err.message}`);
    }
  });

  // Static files / Vite middleware
  if (process.env.NODE_ENV !== "production") {
    console.log("[IPTV Engine] Mounting Vite development middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[IPTV Engine] Serving production static files...");
    const distPath = path.join(process.cwd(), "dist", "renderer");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[IPTV Engine] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
