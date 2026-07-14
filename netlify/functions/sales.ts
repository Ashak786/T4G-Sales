// Handles:
//   GET  /api/sales?client=NAME&description=TEXT&category=CATEGORY
//        -> returns matching sales as JSON
//   POST /api/sales
//        body: { client_name, category, amount, payment_method,
//                 description?, sale_date?, client_email?, client_phone? }
//        -> appends a new sale row via the Apps Script gateway
//
// Both require ?key=YOUR_SECRET (see SALES_API_SECRET below) because this
// endpoint can read and write real client data.

const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL || "";

interface SheetRow extends Array<any> {}

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

function parseIndianDate(dateStr: string): string {
  const cleanDate = (dateStr || "").split(/[ T]/)[0].trim();
  let parts = cleanDate.split("-");
  if (parts.length === 3 && parts[2].length === 4) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
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
    payment_status: row[9] || "Received",
  };
}

function checkAuth(url: URL): Response | null {
  const requiredKey = process.env.SALES_API_SECRET;
  if (!requiredKey) {
    return new Response(
      JSON.stringify({
        error:
          "SALES_API_SECRET is not set. Set it in Netlify environment variables before using this endpoint (it protects real client data).",
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

export default async (req: Request) => {
  const url = new URL(req.url);

  const authError = checkAuth(url);
  if (authError) return authError;

  if (!APPS_SCRIPT_URL) {
    return new Response(
      JSON.stringify({
        error:
          "GOOGLE_APPS_SCRIPT_URL is not set in Netlify environment variables.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // ---- GET: list / filter sales ----
  if (req.method === "GET") {
    const clientFilter = (url.searchParams.get("client") || "").toLowerCase();
    const descriptionFilter = (
      url.searchParams.get("description") || ""
    ).toLowerCase();
    const categoryFilter = url.searchParams.get("category") || "";

    const gatewayRes = await fetch(APPS_SCRIPT_URL, { method: "GET" });
    if (!gatewayRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to reach Google Apps Script gateway" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }
    const data = await gatewayRes.json();
    const rows: SheetRow[] = data.values || [];

    let sales = rows.map(rowToSale).filter((s) => s !== null) as any[];

    if (clientFilter) {
      sales = sales.filter((s) =>
        s.client_name.toLowerCase().includes(clientFilter)
      );
    }
    if (descriptionFilter) {
      sales = sales.filter((s) =>
        (s.description || "").toLowerCase().includes(descriptionFilter)
      );
    }
    if (categoryFilter) {
      sales = sales.filter((s) => s.category === categoryFilter);
    }

    return new Response(JSON.stringify({ count: sales.length, sales }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ---- POST: add a new sale/log entry ----
  if (req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const {
      client_name,
      category,
      amount,
      payment_method,
      description,
      sale_date,
    } = body;

    if (!client_name || !category || amount === undefined || !payment_method) {
      return new Response(
        JSON.stringify({
          error:
            "Missing required field(s): client_name, category, amount, payment_method are all required.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const id =
      (globalThis.crypto && globalThis.crypto.randomUUID
        ? globalThis.crypto.randomUUID()
        : Math.random().toString(36).slice(2));

    const effectiveDate = sale_date || new Date().toISOString().split("T")[0];

    const row = [
      "=ROW()-1",
      '="INV-" & TEXT(ROW()-1, "000")',
      client_name,
      formatIndianDateLocal(effectiveDate),
      category,
      amount,
      payment_method,
      description || "",
      id,
      body.payment_status || "Received",
    ];

    const gatewayRes = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "insert", row }),
    });

    const resData = await gatewayRes.json().catch(() => ({}));
    if (!gatewayRes.ok || resData.error) {
      return new Response(
        JSON.stringify({
          error: resData.error || "Failed to write to Google Sheet",
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, id, client_name, amount }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response("Method Not Allowed", { status: 405 });
};

export const config = {
  path: "/.netlify/functions/sales",
};
