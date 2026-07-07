import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Replaces the old Express routes from server.ts:
//   POST /api/monthly-summary/cache  -> caches the latest generated PDF
//   GET  /api/monthly-summary.pdf    -> serves the cached PDF back
// Uses Netlify Blobs since Netlify Functions have no persistent filesystem.

const STORE_NAME = "monthly-summary";
const BLOB_KEY = "cached-pdf";

interface CachedPdf {
  fileName: string;
  base64: string;
  updatedAt: string;
}

export default async (req: Request) => {
  const store = getStore(STORE_NAME);
  const url = new URL(req.url);

  if (req.method === "POST") {
    let body: { fileName?: string; base64?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { fileName, base64 } = body;
    if (!fileName || !base64) {
      return new Response(
        JSON.stringify({ error: "Missing fileName or base64 data" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    await store.setJSON(BLOB_KEY, {
      fileName,
      base64,
      updatedAt: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ success: true, fileName }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "GET") {
    const requiredKey = process.env.MONTHLY_SUMMARY_SECRET;
    if (requiredKey) {
      const providedKey = url.searchParams.get("key");
      if (providedKey !== requiredKey) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const cached = (await store.get(BLOB_KEY, {
      type: "json",
    })) as CachedPdf | null;

    if (!cached) {
      return new Response(
        "No monthly summary PDF has been cached yet. Please open the Tech4Geeky Dashboard at least once in your browser so it can generate and sync the latest report.",
        { status: 404 }
      );
    }

    const buffer = Buffer.from(cached.base64, "base64");
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${cached.fileName}"`,
      },
    });
  }

  return new Response("Method Not Allowed", { status: 405 });
};

export const config = {
  path: "/.netlify/functions/monthly-summary",
};
