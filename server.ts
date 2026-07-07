import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

// Helper function to manually follow redirects and preserve method/body for POST requests.
// This is critical for Google Apps Script which redirects POST to another server.
async function fetchWithRedirects(url: string, options: RequestInit, maxRedirects = 5): Promise<Response> {
  let currentUrl = url;
  let currentOptions = { ...options };

  // Set manual redirect handling
  currentOptions.redirect = 'manual';

  for (let i = 0; i < maxRedirects; i++) {
    console.log(`[Proxy Redirect Tracker] Fetching ${currentOptions.method || 'GET'} to: ${currentUrl}`);
    
    const urlObj = new URL(currentUrl);
    const headers = new Headers(currentOptions.headers || {});
    
    // Strip custom and Auth headers when calling the Google content CDN to prevent 403 Forbidden
    if (urlObj.hostname.endsWith('googleusercontent.com')) {
      headers.delete('x-apps-script-url');
      headers.delete('authorization');
      if (currentOptions.method === 'GET') {
        headers.delete('content-type');
        headers.delete('content-length');
      }
    }
    
    if (!headers.has('User-Agent')) {
      headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    }
    currentOptions.headers = headers;

    const response = await fetch(currentUrl, currentOptions);

    const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
    if (isRedirect) {
      const location = response.headers.get('location');
      if (!location) {
        console.log(`[Proxy Redirect Tracker] Redirect status ${response.status} but no location header found.`);
        return response;
      }

      // Resolve redirect location against current URL if relative
      const nextUrl = new URL(location, currentUrl).toString();
      console.log(`[Proxy Redirect Tracker] Redirecting from ${currentUrl} to ${nextUrl} with status ${response.status}`);
      currentUrl = nextUrl;

      // For 301, 302, 303 redirects (especially from Google Apps Script),
      // we must change the method to GET, strip the body, and clear Content-Type/Length headers.
      if ([301, 302, 303].includes(response.status)) {
        const nextHeaders = new Headers(currentOptions.headers);
        nextHeaders.delete('content-type');
        nextHeaders.delete('content-length');
        currentOptions = {
          ...currentOptions,
          method: 'GET',
          body: undefined,
          headers: nextHeaders,
        };
      } else {
        // Maintain method, headers, and body for 307, 308
        currentOptions = {
          ...currentOptions,
        };
      }
      continue;
    }

    return response;
  }

  throw new Error('Too many redirects');
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse json bodies
  app.use(express.json({ limit: '10mb' }));

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Proxy to Google Apps Script to bypass browser CORS and redirect issues
  app.all("/api/proxy-apps-script", async (req, res) => {
    const targetUrl = req.headers['x-apps-script-url'] as string;
    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing x-apps-script-url header' });
    }

    try {
      const options: RequestInit = {
        method: req.method,
      };

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        options.body = JSON.stringify(req.body);
        options.headers = {
          'Content-Type': 'application/json'
        };
      }

      console.log(`[Proxy] Forwarding ${req.method} request to Google Apps Script...`);
      const response = await fetchWithRedirects(targetUrl, options);
      const text = await response.text();
      
      // Attempt to parse response as JSON
      try {
        const json = JSON.parse(text);
        res.status(response.status).json(json);
      } catch (e) {
        // Fallback to sending text if not JSON
        res.status(response.status).send(text);
      }
    } catch (err: any) {
      console.error('[Proxy] Failed to proxy request:', err);
      res.status(500).json({ error: 'Failed to fetch through proxy: ' + err.message });
    }
  });

  // Vite middleware setup for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
