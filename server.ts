import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { getSales, saveSales, generateInvoiceNo, Sale } from "./src/serverDb";
import { generateServerInvoicePDF, generateServerMonthlySummaryPDF } from "./src/serverPdfGenerator";

// Helper function to manually follow redirects and preserve method/body for POST requests.
// This is critical for Google Apps Script which redirects POST to another server.
async function fetchWithRedirects(url: string, options: RequestInit, maxRedirects = 5): Promise<Response> {
  let currentUrl = url;
  let currentOptions = { ...options };

  currentOptions.redirect = 'manual';

  for (let i = 0; i < maxRedirects; i++) {
    console.log(`[Proxy Redirect Tracker] Fetching ${currentOptions.method || 'GET'} to: ${currentUrl}`);
    
    const urlObj = new URL(currentUrl);
    const headers = new Headers(currentOptions.headers || {});
    
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

      const nextUrl = new URL(location, currentUrl).toString();
      console.log(`[Proxy Redirect Tracker] Redirecting from ${currentUrl} to ${nextUrl} with status ${response.status}`);
      currentUrl = nextUrl;

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

// Lazy initialization of Gemini API Client
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is required for automation features. Please specify it in settings.');
    }
    geminiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return geminiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // --- API ROUTES ---

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // REST API: Get all sales
  app.get("/api/sales", (req, res) => {
    try {
      const sales = getSales();
      res.json(sales);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // REST API: Add a new sale
  app.post("/api/sales", (req, res) => {
    try {
      const sales = getSales();
      const payload = req.body;

      if (!payload.client_name || !payload.amount || !payload.category || !payload.payment_method) {
        return res.status(400).json({ error: 'Missing required fields: client_name, amount, category, payment_method' });
      }

      const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
      const newSale: Sale = {
        id,
        created_at: new Date().toISOString(),
        sale_date: payload.sale_date || new Date().toISOString().split('T')[0],
        category: payload.category,
        client_name: payload.client_name,
        client_email: payload.client_email || '',
        client_phone: payload.client_phone || '',
        amount: Number(payload.amount),
        payment_method: payload.payment_method,
        description: payload.description || '',
        payment_status: payload.payment_status || 'Pending'
      };

      // Chronological invoice generation
      newSale.invoice_no = generateInvoiceNo(sales);

      sales.push(newSale);
      saveSales(sales);

      res.status(201).json(newSale);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // REST API: Update a sale
  app.patch("/api/sales/:id", (req, res) => {
    try {
      const sales = getSales();
      const id = req.params.id;
      const saleIndex = sales.findIndex(s => s.id === id);

      if (saleIndex === -1) {
        return res.status(404).json({ error: `Sale with ID ${id} not found.` });
      }

      const currentSale = sales[saleIndex];
      const updates = req.body;

      // Apply updates
      const updatedSale: Sale = {
        ...currentSale,
        ...updates,
        // Keep ID immutable
        id: currentSale.id
      };

      if (updates.amount !== undefined) {
        updatedSale.amount = Number(updates.amount);
      }

      sales[saleIndex] = updatedSale;
      saveSales(sales);

      res.json(updatedSale);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // REST API: Delete a sale
  app.delete("/api/sales/:id", (req, res) => {
    try {
      const sales = getSales();
      const id = req.params.id;
      const filtered = sales.filter(s => s.id !== id);

      if (filtered.length === sales.length) {
        return res.status(404).json({ error: `Sale with ID ${id} not found.` });
      }

      saveSales(filtered);
      res.json({ success: true, message: `Sale with ID ${id} deleted successfully.` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // REST API: Cache monthly summary compatibility stub
  app.post("/api/monthly-summary/cache", (req, res) => {
    res.json({ success: true, message: "Server-side dynamic generator active. Caching bypassed." });
  });

  // REST API: Generate & download an invoice PDF
  app.get("/api/sales/:id/invoice", (req, res) => {
    try {
      const sales = getSales();
      const id = req.params.id;
      const sale = sales.find(s => s.id === id);

      if (!sale) {
        return res.status(404).send('Sale record not found.');
      }

      const pdfBuffer = generateServerInvoicePDF(sale, sales);
      const safeName = sale.client_name.replace(/[^a-zA-Z0-9]/g, '_');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=Invoice_${sale.invoice_no || 'INV'}_${safeName}.pdf`);
      res.send(pdfBuffer);
    } catch (error: any) {
      res.status(500).send('Error generating invoice PDF: ' + error.message);
    }
  });

  // REST API: Generate & download monthly summary report PDF
  app.get("/api/sales/summary", (req, res) => {
    try {
      const sales = getSales();
      const monthQuery = req.query.month as string; // Expects YYYY-MM format, optional

      const pdfBuffer = generateServerMonthlySummaryPDF(sales, monthQuery);
      
      let reportName = 'Monthly_Sales_Summary_Report.pdf';
      if (monthQuery) {
        reportName = `Sales_Summary_Report_${monthQuery}.pdf`;
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${reportName}`);
      res.send(pdfBuffer);
    } catch (error: any) {
      res.status(500).send('Error generating monthly report: ' + error.message);
    }
  });

  // REST API: NLP Automation endpoint for Claude (exposes Gemini text command parser)
  app.post("/api/automate", async (req, res) => {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Missing text input. Please send your natural language command inside {"text": "..."}' });
    }

    try {
      const sales = getSales();
      const ai = getGeminiClient();

      // We pass the current sales state so Gemini knows IDs, dates, clients, etc. to match
      const simplifiedSales = sales.map(s => ({
        id: s.id,
        invoice_no: s.invoice_no,
        client_name: s.client_name,
        sale_date: s.sale_date,
        amount: s.amount,
        category: s.category,
        payment_method: s.payment_method,
        payment_status: s.payment_status,
        description: s.description
      }));

      const systemInstruction = `You are a high-intelligence Natural Language API agent that automates database updates and queries for "Tech4Geeky Systems".
Your job is to read the user's instructions and convert them into one of these actions:
1. "add" - Add a new sale record.
2. "update_payment" - Update the payment status (Received / Pending) of an existing sale.
3. "query" - Answer a query, calculate total revenue, category details, or summarize lists.
4. "error" - Handle unrecognized commands or errors.

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
- payment_status: Default to "Pending" if unspecified.
- description: Brief description notes if present.

If the user wants to UPDATE a payment status, you must find the correct ID from the sales context provided. Match by client name (case-insensitive, substring search) or invoice number.

If the user asks a question, summarize, or query data (e.g. "what is total money pending?", "who is our highest-paying client?", etc.), perform the math or search internally using the provided context and draft a detailed response.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          { text: `Context: Here is the current active sales database for Tech4Geeky:
${JSON.stringify(simplifiedSales, null, 2)}

User Natural Language Automation Request: "${text}"` }
        ],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              action: {
                type: Type.STRING,
                description: "Action type. Must be one of: 'add', 'update_payment', 'query', or 'error'."
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
                  payment_status: { type: Type.STRING },
                  description: { type: Type.STRING }
                }
              },
              updatePayload: {
                type: Type.OBJECT,
                description: "Payload for action: 'update_payment'",
                properties: {
                  id: { type: Type.STRING, description: "The UUID matching the sale record to update" },
                  payment_status: { type: Type.STRING, description: "'Received' or 'Pending'" }
                }
              },
              queryResponse: {
                type: Type.STRING,
                description: "The direct text response to give back. If an update/addition was performed, describe what was updated or added."
              }
            },
            required: ["action", "queryResponse"]
          }
        }
      });

      const parsed = JSON.parse(response.text || '{}');
      console.log('[Automation Engine] Gemini parsed result:', parsed);

      let actionResult: any = null;

      if (parsed.action === 'add' && parsed.addPayload) {
        const payload = parsed.addPayload;
        const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
        const newSale: Sale = {
          id,
          created_at: new Date().toISOString(),
          sale_date: payload.sale_date || new Date().toISOString().split('T')[0],
          category: payload.category || 'PC Repair',
          client_name: payload.client_name || 'N/A',
          client_email: '',
          client_phone: '',
          amount: Number(payload.amount || 0),
          payment_method: payload.payment_method || 'UPI/Online',
          description: payload.description || '',
          payment_status: payload.payment_status || 'Pending',
          invoice_no: generateInvoiceNo(sales)
        };

        sales.push(newSale);
        saveSales(sales);
        actionResult = { type: 'add', sale: newSale };
        parsed.queryResponse = `✅ SUCCESS: Successfully created a new sale record for ${newSale.client_name} with amount ${newSale.amount} and invoice number ${newSale.invoice_no}. \n\n${parsed.queryResponse}`;

      } else if (parsed.action === 'update_payment' && parsed.updatePayload) {
        const { id, payment_status } = parsed.updatePayload;
        const saleIndex = sales.findIndex(s => s.id === id);

        if (saleIndex !== -1) {
          const updatedSale = {
            ...sales[saleIndex],
            payment_status: payment_status
          };
          sales[saleIndex] = updatedSale;
          saveSales(sales);
          actionResult = { type: 'update_payment', sale: updatedSale };
          parsed.queryResponse = `✅ SUCCESS: Updated payment status of invoice ${updatedSale.invoice_no} (${updatedSale.client_name}) to: ${payment_status}. \n\n${parsed.queryResponse}`;
        } else {
          parsed.queryResponse = `❌ ERROR: Could not find any sale matching that client in our database to update.`;
        }
      }

      // Automatically construct helpful actionable helper endpoints for Claude
      const currentHost = req.headers.host || 'localhost:3000';
      const protocol = req.secure ? 'https' : 'http';
      const baseUrl = `${protocol}://${currentHost}`;

      res.json({
        action: parsed.action,
        queryResponse: parsed.queryResponse,
        executed: actionResult ? true : false,
        result: actionResult,
        actions: actionResult ? {
          downloadInvoicePdf: `${baseUrl}/api/sales/${actionResult.sale.id}/invoice`,
          downloadMonthlySummaryPdf: `${baseUrl}/api/sales/summary?month=${actionResult.sale.sale_date.substring(0, 7)}`
        } : {
          downloadMonthlySummaryPdf: `${baseUrl}/api/sales/summary`
        }
      });

    } catch (err: any) {
      console.error('[Automation Engine] Failure:', err);
      res.status(500).json({ error: 'Automation Engine Exception: ' + err.message });
    }
  });

  // REST API: Get instruction sheets for Claude (Option 2 setup instructions)
  app.get("/api/claude-instructions", (req, res) => {
    const currentHost = req.headers.host || 'localhost:3000';
    const protocol = req.secure ? 'https' : 'http';
    const baseUrl = `${protocol}://${currentHost}`;

    res.setHeader('Content-Type', 'text/markdown');
    res.send(`# CLAUDE AUTOMATION GUIDELINES - TECH4GEEKY SALES MANAGER

This server is equipped with a centralized JSON sales database and a robust developer API, allowing you (Claude) to automate tasks directly via plain text or JSON!

## Option 2: REST & NLP Automation Engine

You can execute all requested automation tasks using the single endpoint below, or by utilizing structured HTTP methods:

### Method A: Single NLP Command Box (Easiest & Most Intelligent)
Send a POST request to: \`${baseUrl}/api/automate\`
Body JSON:
\`\`\`json
{
  "text": "Add a video editing sale for Ajay for amount 4500 on 2026-07-13, UPI payment, status Pending"
}
\`\`\`
The backend uses a local Gemini intelligence client to parse your plain English instructions, execute the DB additions or status updates, and automatically generate and return PDF download links for the invoice and monthly summary report!

### Method B: Structured REST Endpoints
For precision tasks, use these standard JSON endpoints:

1. **List all Sales**
   - **Method**: \`GET\`
   - **URL**: \`${baseUrl}/api/sales\`

2. **Add a New Sale**
   - **Method**: \`POST\`
   - **URL**: \`${baseUrl}/api/sales\`
   - **Body JSON**:
     \`\`\`json
     {
       "sale_date": "2026-07-14",
       "category": "Web Site development",
       "client_name": "Rohan Sharma",
       "amount": 25000,
       "payment_method": "UPI/Online",
       "payment_status": "Pending",
       "description": "E-Commerce portal build"
     }
     \`\`\`

3. **Update Payment Status**
   - **Method**: \`PATCH\`
   - **URL**: \`${baseUrl}/api/sales/:id\`
   - **Body JSON**:
     \`\`\`json
     {
       "payment_status": "Received"
     }
     \`\`\`

4. **Download PDF Invoice**
   - **Method**: \`GET\`
   - **URL**: \`${baseUrl}/api/sales/:id/invoice\`
   - *Returns standard binary PDF download attachment.*

5. **Download Monthly Performance Summary PDF**
   - **Method**: \`GET\`
   - **URL**: \`${baseUrl}/api/sales/summary?month=YYYY-MM\` (or omit month for the previous month)
   - *Returns standard binary PDF download attachment.*

---
*Created dynamically by Tech4Geeky Systems Developer Agent.*`);
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
      
      try {
        const json = JSON.parse(text);
        res.status(response.status).json(json);
      } catch (e) {
        res.status(response.status).send(text);
      }
    } catch (err: any) {
      console.error('[Proxy] Failed to proxy request:', err);
      res.status(500).json({ error: 'Failed to fetch through proxy: ' + err.message });
    }
  });

  // Serve static files / Vite serving
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
