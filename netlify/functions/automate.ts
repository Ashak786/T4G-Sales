import { GoogleGenAI, Type } from "@google/genai";

const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL || "";

interface SheetRow extends Array<any> {}

function parseIndianDate(dateStr: string): string {
  const cleanDate = (dateStr || "").split(/[ T]/)[0].trim();
  let parts = cleanDate.split("-");
  if (parts.length === 3 && parts[2].length === 4) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return cleanDate;
}

function formatIndianDateLocal(dateStr: string): string {
  const cleanDate = dateStr.split(/[ T]/)[0].trim();
  let parts = cleanDate.split("-");
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const [year, month, day] = parts;
      return `${day.padStart(2, "0")}-${month.padStart(2, "0")}-${year}`;
    } else if (parts[2].length === 4) {
      const [day, month, year] = parts;
      return `${day.padStart(2, "0")}-${month.padStart(2, "0")}-${year}`;
    }
  }
  return cleanDate;
}

function rowToSale(row: SheetRow) {
  if (!row || row.length === 0 || !row[0]) return null;
  if (row[0] === "Sl No." || row[1] === "Inv No." || row[2] === "Client Name")
    return null;
  const parsedDate = parseIndianDate(row[3]);
  return {
    id: row[8] || row[0],
    invoice_no: row[1] || "",
    sale_date: parsedDate,
    category: row[4],
    client_name: row[2] || "",
    amount: Number(row[5]) || 0,
    payment_method: row[6],
    description: row[7] || "",
    payment_status: row[9] || "Received"
  };
}

function checkAuth(url: URL): Response | null {
  const requiredKey = process.env.SALES_API_SECRET;
  if (!requiredKey) {
    return new Response(
      JSON.stringify({
        error:
          "SALES_API_SECRET is not set. Please set it in your Netlify dashboard environment variables.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  const providedKey = url.searchParams.get("key");
  if (providedKey !== requiredKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

// Lazy initialization of Gemini API Client
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required for automation features. Please specify it in Netlify settings.");
    }
    geminiClient = new GoogleGenAI({ apiKey: key });
  }
  return geminiClient;
}

export default async (req: Request) => {
  const url = new URL(req.url);

  // Authenticate the incoming request
  const authError = checkAuth(url);
  if (authError) return authError;

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!APPS_SCRIPT_URL) {
    return new Response(
      JSON.stringify({
        error: "GOOGLE_APPS_SCRIPT_URL is not set in Netlify environment variables.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { text } = body;
  if (!text) {
    return new Response(
      JSON.stringify({ error: 'Missing text input. Please send {"text": "..."}' }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // 1. Fetch current sales from Google Sheets
    const gatewayRes = await fetch(APPS_SCRIPT_URL, { method: "GET" });
    if (!gatewayRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch sales database from Google Apps Script." }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }
    const data = await gatewayRes.json();
    const rows: SheetRow[] = data.values || [];
    const sales = rows.map(rowToSale).filter((s) => s !== null);

    // 2. Query Gemini
    const ai = getGeminiClient();

    const systemInstruction = `You are a high-intelligence Natural Language API agent that automates database updates and queries for "Tech4Geeky Systems".
Your job is to read the user's instructions and convert them into one of these actions:
1. "add" - Add a new sale record.
2. "query" - Answer a query, calculate total revenue, category details, or summarize lists.
3. "error" - Handle unrecognized commands or errors.

Below is the list of valid categories, payment methods, and statuses. You MUST normalize user input to match these exactly:
- Valid Categories: 'Video editing', 'Web Site development', 'Govt. Service (Appl.)', 'PC Repair', 'Graphic Designing'
- Valid Payment Methods: 'Cash', 'UPI/Online', 'Card', 'Bank Transfer'
- Valid Payment Statuses: 'Received', 'Pending'

If the user wants to ADD a sale, make sure to extract or assume these fields:
- sale_date: Date in YYYY-MM-DD. If not mentioned, assume today's date ${new Date().toISOString().split('T')[0]}.
- category: Normalize user-input category. For instance, "coding", "website development", "site" -> "Web Site development"; "repairing", "laptop service", "pc fix" -> "PC Repair"; "video", "reels" -> "Video editing"; "government", "form apply" -> "Govt. Service (Appl.)"; "logo", "poster", "banner" -> "Graphic Designing".
- client_name: Extract name of client.
- amount: Numeric amount in Rupees.
- payment_method: Default to "UPI/Online" if unspecified.
- payment_status: Normalize status to 'Received' or 'Pending'. Default to 'Received' if unspecified.
- description: Brief description notes if present.

If the user asks a question, summarize, or query data (e.g. "what is total money pending?", "who is our highest-paying client?", etc.), perform the math or search internally using the provided context and draft a detailed response.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          text: `Context: Here is the current active sales database for Tech4Geeky:
${JSON.stringify(sales, null, 2)}

User Natural Language Automation Request: "${text}"`,
        },
      ],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: {
              type: Type.STRING,
              description: "Action type. Must be one of: 'add', 'query', or 'error'.",
            },
            addPayload: {
              type: Type.OBJECT,
              description: "Payload for action: 'add'",
              properties: {
                sale_date: { type: Type.STRING },
                category: { type: Type.STRING },
                client_name: { type: Type.STRING },
                amount: { type: Type.NUMBER },
                payment_method: { type: Type.STRING },
                payment_status: { type: Type.STRING, description: "Must be 'Received' or 'Pending'." },
                description: { type: Type.STRING },
              },
            },
            queryResponse: {
              type: Type.STRING,
              description: "The direct text response to give back. If an addition was performed, describe what was added.",
            },
          },
          required: ["action", "queryResponse"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    let executed = false;
    let actionResult: any = null;

    // 3. Execute the Action if "add"
    if (parsed.action === "add" && parsed.addPayload) {
      const payload = parsed.addPayload;
      const id =
        globalThis.crypto && globalThis.crypto.randomUUID
          ? globalThis.crypto.randomUUID()
          : Math.random().toString(36).slice(2);

      const effectiveDate = payload.sale_date || new Date().toISOString().split("T")[0];

      const row = [
        "=ROW()-1",
        '="INV-" & TEXT(ROW()-1, "000")',
        payload.client_name || "N/A",
        formatIndianDateLocal(effectiveDate),
        payload.category || "PC Repair",
        Number(payload.amount || 0),
        payload.payment_method || "UPI/Online",
        payload.description || "",
        id,
        payload.payment_status || "Received",
      ];

      const postRes = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "insert", row }),
      });

      const resData = await postRes.json().catch(() => ({}));
      if (postRes.ok && !resData.error) {
        executed = true;
        actionResult = {
          id,
          client_name: payload.client_name,
          amount: payload.amount,
          category: payload.category,
          sale_date: effectiveDate,
        };
        parsed.queryResponse = `✅ SUCCESS: Created sale record in Google Sheets for ${payload.client_name} (Amount: Rs. ${payload.amount}).\n\n${parsed.queryResponse}`;
      } else {
        parsed.queryResponse = `❌ ERROR: Failed to insert row in Google Sheets via Apps Script: ${resData.error || "Network error"}`;
      }
    }

    return new Response(
      JSON.stringify({
        action: parsed.action,
        queryResponse: parsed.queryResponse,
        executed,
        result: actionResult,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "Automation Error: " + err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config = {
  path: "/.netlify/functions/automate",
};
