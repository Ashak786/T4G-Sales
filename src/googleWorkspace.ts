import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import type { Sale } from './salesDb';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/spreadsheets');

let isSigningIn = false;
let isSpreadsheetVerified = false;
const SPREADSHEET_ID_CACHE_KEY = 'tech4geeky_google_sheet_id';
const GOOGLE_ACCESS_TOKEN_KEY = 'tech4geeky_google_access_token';
export const APPS_SCRIPT_URL_KEY = 'tech4geeky_apps_script_url';

// Read token from persistent storage initially
let cachedAccessToken: string | null = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);

export function getAppsScriptUrl(): string | null {
  const url = localStorage.getItem(APPS_SCRIPT_URL_KEY);
  if (url === null) {
    const disconnected = localStorage.getItem('tech4geeky_disconnected_gateway');
    if (disconnected === 'true') {
      return null;
    }
    const defaultUrl = 'https://script.google.com/macros/s/AKfycbxDPTiNCV95mv91CzS_1lSX34T_ZLhI-mhSx-4fNkRX161sXUzbVNm4xW7dQ7EnbyhXDA/exec';
    localStorage.setItem(APPS_SCRIPT_URL_KEY, defaultUrl);
    return defaultUrl;
  }
  return url || null;
}

export function setAppsScriptUrl(url: string | null) {
  if (url) {
    localStorage.setItem(APPS_SCRIPT_URL_KEY, url.trim());
    localStorage.removeItem('tech4geeky_disconnected_gateway');
  } else {
    localStorage.removeItem(APPS_SCRIPT_URL_KEY);
    localStorage.setItem('tech4geeky_disconnected_gateway', 'true');
  }
}

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (getAppsScriptUrl()) {
    const dummyUser = {
      uid: 'apps_script_user',
      displayName: 'Apps Script Connection',
      email: 'connected-24-7@apps-script.local',
      photoURL: null,
    } as any;
    setTimeout(() => {
      if (onAuthSuccess) onAuthSuccess(dummyUser, 'apps_script');
    }, 50);
    return () => {};
  }

  let redirectChecked = false;
  let authStateUser: User | null = null;
  let hasCheckedAuthOnce = false;

  const emitAuthState = () => {
    if (getAppsScriptUrl()) {
      const dummyUser = {
        uid: 'apps_script_user',
        displayName: 'Apps Script Connection',
        email: 'connected-24-7@apps-script.local',
        photoURL: null,
      } as any;
      if (onAuthSuccess) onAuthSuccess(dummyUser, 'apps_script');
      return;
    }

    if (!redirectChecked) {
      // Do not emit yet! We must wait for getRedirectResult to finish so we don't prematurely report "no token" during the redirect callback.
      return;
    }

    if (authStateUser) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(authStateUser, cachedAccessToken);
      } else {
        // If we have a user but no access token cached, report failure so they can login again
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      if (onAuthFailure) onAuthFailure();
    }
  };

  // 1. Process pending redirect results on page init
  getRedirectResult(auth)
    .then((result) => {
      if (result) {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          cachedAccessToken = credential.accessToken;
          localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, credential.accessToken);
        }
      }
      redirectChecked = true;
      emitAuthState();
    })
    .catch((error) => {
      console.error('Redirect sign in error:', error);
      redirectChecked = true;
      emitAuthState();
    });

  // 2. Track real-time auth state changes
  return onAuthStateChanged(auth, async (user: User | null) => {
    authStateUser = user;
    if (!user) {
      cachedAccessToken = null;
      localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
    }
    emitAuthState();
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  isSigningIn = true;

  // Modern browsers (including iOS Safari and mobile Chrome) support signInWithPopup when triggered by a direct user click (gesture).
  // Using signInWithPopup is CRITICAL on custom domains (like Netlify) because signInWithRedirect gets blocked by 
  // third-party cookie restrictions (Apple Intelligent Tracking Prevention / iOS 14+ / Chrome cookie policies),
  // which leaves mobile users stuck in "Sandbox Mode" (anonymous/unauthenticated state). signInWithPopup uses direct postMessage window mechanics and bypasses third-party cookie blockages perfectly!
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, credential.accessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.warn('Popup authentication issue, trying fallback redirect flow...', error);
    
    // Fallback to redirect only if popup-blocked or other popup issues occur
    try {
      await signInWithRedirect(auth, provider);
      return null;
    } catch (redirectErr: any) {
      console.error('Redirect fallback failed:', redirectErr);
      throw redirectErr;
    }
  } finally {
    isSigningIn = false;
  }
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  localStorage.removeItem(SPREADSHEET_ID_CACHE_KEY);
  localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
  localStorage.removeItem(APPS_SCRIPT_URL_KEY);
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

// Spreadsheet Management API Client

// Find or Create spreadsheet
export function extractSpreadsheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return input.trim();
}

export function setSpreadsheetId(idOrUrl: string) {
  const id = extractSpreadsheetId(idOrUrl);
  localStorage.setItem(SPREADSHEET_ID_CACHE_KEY, id);
  return id;
}

// Helper to handle API responses and clear stale tokens on 401/403
async function handleResponse(response: Response, defaultError: string): Promise<any> {
  if (response.status === 401 || response.status === 403) {
    const errData = await response.json().catch(() => ({}));
    const message = errData.error?.message || '';
    const isApiDisabled = message.toLowerCase().includes('disabled') || 
                          message.toLowerCase().includes('has not been used') || 
                          message.toLowerCase().includes('enable it');
    
    if (isApiDisabled) {
      throw new Error(`API_DISABLED_ERROR: ${message}`);
    }

    localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
    cachedAccessToken = null;
    throw new Error(`Google Sheets access denied (HTTP ${response.status}): ${message || 'Unauthorized or insufficient scopes'}. Please re-sign in to grant Sheets & Drive permissions.`);
  }
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`${defaultError} (HTTP ${response.status}): ${errData.error?.message || response.statusText}`);
  }
  return response.json();
}

async function getOrCreateSpreadsheet(token: string): Promise<string> {
  const targetId = '1ja7eXl1Ie9cFyyZMBabq54-EhFtgkY0JDjqof6cWWDQ';
  // Force cache to match this ID
  localStorage.setItem(SPREADSHEET_ID_CACHE_KEY, targetId);

  if (isSpreadsheetVerified) {
    return targetId;
  }

  // Verify sheet existence and ensure 'SalesList' page is configured
  try {
    const checkRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${targetId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (checkRes.ok) {
      const data = await checkRes.json();
      const sheetTitles = data.sheets?.map((s: any) => s.properties?.title) || [];
      if (!sheetTitles.includes('SalesList')) {
        // Create the SalesList sheet inside this spreadsheet
        const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${targetId}:batchUpdate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            requests: [
              {
                addSheet: {
                  properties: {
                    title: 'SalesList'
                  }
                }
              }
            ]
          })
        });

        if (!updateRes.ok) {
          const errData = await updateRes.json().catch(() => ({}));
          throw new Error(`Failed to create 'SalesList' tab in the spreadsheet: ${errData.error?.message || updateRes.statusText}`);
        }
      }

      // ALWAYS ensure correct headers are written to SalesList!
      // This solves the issue where the sheet is blank or cleared but the tab already exists.
      const headers = ['Sl No.', 'Inv No.', 'Client Name', 'Date', 'Category', 'Amount', 'Mode of Transaction', 'Notes', 'Status', 'Received Amount', 'ID'];
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values/SalesList!A1:K1?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [headers]
        })
      });

      isSpreadsheetVerified = true;
    } else {
      if (checkRes.status === 401 || checkRes.status === 403) {
        const errData = await checkRes.json().catch(() => ({}));
        const message = errData.error?.message || '';
        const isApiDisabled = message.toLowerCase().includes('disabled') || 
                              message.toLowerCase().includes('has not been used') || 
                              message.toLowerCase().includes('enable it');
        
        if (isApiDisabled) {
          throw new Error(`API_DISABLED_ERROR: ${message}`);
        }
        
        if (checkRes.status === 401) {
          localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
          cachedAccessToken = null;
          throw new Error(`Google Sheets access denied (HTTP ${checkRes.status}): ${message || 'Unauthorized or expired credentials'}. Please re-sign in to grant Sheets & Drive permissions.`);
        } else {
          throw new Error(`Google Sheets access denied (HTTP 403): ${message || 'Access Forbidden'}. Please check if your account has permissions to view and edit this spreadsheet.`);
        }
      } else if (checkRes.status === 404) {
        throw new Error(`Spreadsheet not found (HTTP 404). Please ensure you have access to the spreadsheet '1ja7eXl1Ie9cFyyZMBabq54-EhFtgkY0JDjqof6cWWDQ' and it hasn't been deleted.`);
      } else {
        const errData = await checkRes.json().catch(() => ({}));
        throw new Error(`Failed to access Google Spreadsheet: ${errData.error?.message || checkRes.statusText}`);
      }
    }
  } catch (err: any) {
    console.error('Spreadsheet resolution error:', err);
    throw err;
  }

  return targetId;
}

function parseIndianDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const cleanDate = dateStr.split(/[ T]/)[0].trim();
  
  let parts = cleanDate.split('-');
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      // DD-MM-YYYY
      const [day, month, year] = parts;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } else if (parts[0].length === 4) {
      // YYYY-MM-DD
      const [year, month, day] = parts;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }
  
  parts = cleanDate.split('/');
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      // DD/MM/YYYY
      const [day, month, year] = parts;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } else if (parts[0].length === 4) {
      // YYYY/MM/DD
      const [year, month, day] = parts;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }
  
  return cleanDate;
}

function formatIndianDateLocal(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const cleanDate = dateStr.split(/[ T]/)[0].trim();
  
  let parts = cleanDate.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      const [year, month, day] = parts;
      return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
    } else if (parts[2].length === 4) {
      // DD-MM-YYYY
      const [day, month, year] = parts;
      return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
    }
  }
  
  parts = cleanDate.split('/');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY/MM/DD
      const [year, month, day] = parts;
      return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
    } else if (parts[2].length === 4) {
      // DD/MM/YYYY
      const [day, month, year] = parts;
      return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
    }
  }
  
  return cleanDate;
}

function extractThumbnailAmount(description: string): number {
  if (!description) return 0;
  const parts = description.split('\n\n===METADATA===\n');
  if (parts.length === 2) {
    try {
      const parsed = JSON.parse(parts[1]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.thumbnail_amount !== undefined) {
        return Number(parsed.thumbnail_amount) || 0;
      }
    } catch {
      // ignore
    }
  }
  return 0;
}

function extractPartialPayments(description: string): any[] | undefined {
  if (!description) return undefined;
  const parts = description.split('\n\n===METADATA===\n');
  if (parts.length === 2) {
    try {
      const parsed = JSON.parse(parts[1]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.partial_payments !== undefined) {
        return parsed.partial_payments;
      }
    } catch {
      // ignore
    }
  }
  return undefined;
}

// Map Google Sheets standard array to Sale type
function rowToSale(row: any[]): Sale | null {
  if (!row || row.length === 0 || !row[0]) return null;
  if (row[0] === 'Sl No.' || row[1] === 'Inv No.' || row[2] === 'Client Name') return null;
  
  const parsedDate = parseIndianDate(row[3]);
  const amount = Number(row[5]) || 0;
  
  let payment_status: 'Received' | 'Pending' | 'Partial' = 'Received';
  let received_amount = amount;
  let id = row[8] || row[0];
  
  if (row.length > 10) {
    // Newest 11-column layout
    payment_status = (row[8] as any) || 'Received';
    received_amount = row[9] !== undefined ? Number(row[9]) : amount;
    id = row[10] || row[0];
  } else if (row.length > 9) {
    // 10-column layout
    payment_status = (row[8] as any) || 'Received';
    received_amount = payment_status === 'Received' ? amount : (payment_status === 'Pending' ? 0 : amount);
    id = row[9] || row[0];
  } else {
    // 9-column layout
    payment_status = 'Received';
    received_amount = amount;
    id = row[8] || row[0];
  }

  const descriptionStr = row[7] || '';
  const thumbnailCharges = descriptionStr ? extractThumbnailAmount(descriptionStr) : 0;
  const partialPayments = descriptionStr ? extractPartialPayments(descriptionStr) : undefined;

  // --- MERGE WITH LOCAL STORAGE FOR EXTRA ROBUSTNESS ---
  // If we have a local sale with the same ID, and it has custom payment_status or received_amount,
  // we should preserve that status if the spreadsheet layout returned a fallback or hasn't updated yet!
  let finalPartialPayments = partialPayments;
  if (typeof window !== 'undefined') {
    try {
      const localDataStr = localStorage.getItem('tech4geeky_sales_data');
      if (localDataStr) {
        const localSales: Sale[] = JSON.parse(localDataStr);
        const matched = localSales.find(s => s.id === String(id));
        if (matched) {
          if (matched.payment_status) {
            payment_status = matched.payment_status;
          }
          if (matched.received_amount !== undefined) {
            received_amount = matched.received_amount;
          }
          if (matched.partial_payments) {
            finalPartialPayments = matched.partial_payments;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to merge with local storage in rowToSale:', e);
    }
  }

  return {
    id: String(id),
    invoice_no: row[1] || '',
    created_at: parsedDate ? new Date(parsedDate).toISOString() : new Date().toISOString(),
    sale_date: parsedDate || new Date().toISOString().split('T')[0],
    category: row[4] as any,
    client_name: row[2] || '',
    amount,
    payment_method: row[6] as any,
    description: descriptionStr,
    payment_status,
    received_amount,
    thumbnail_charges: thumbnailCharges || undefined,
    partial_payments: finalPartialPayments
  };
}

// Convert Sale to Row Array
function saleToRow(sale: Sale): any[] {
  const status = sale.payment_status || 'Received';
  let recAmt = sale.amount;
  if (status === 'Pending') recAmt = 0;
  else if (status === 'Partial') recAmt = sale.received_amount !== undefined ? sale.received_amount : (sale.amount / 2);

  return [
    '=ROW()-1',
    '="INV-" & TEXT(ROW()-1, "000")',
    sale.client_name,
    formatIndianDateLocal(sale.sale_date),
    sale.category,
    sale.amount,
    sale.payment_method,
    sale.description || '',
    status,
    recAmt,
    sale.id
  ];
}

async function handleAppsScriptResponse(response: Response, defaultMessage: string) {
  if (!response.ok) {
    let errorDetail = '';
    try {
      const data = await response.json();
      errorDetail = data.error || data.message || JSON.stringify(data);
    } catch (e) {
      try {
        errorDetail = await response.text();
      } catch (ex) {}
    }
    throw new Error(`${defaultMessage}: ${errorDetail || response.statusText || response.status}`);
  }
  return response.json();
}

async function fetchAppsScript(url: string, method: 'GET' | 'POST', body?: any): Promise<Response> {
  try {
    const isLocalOrDev = window.location.hostname === 'localhost' || 
                         window.location.hostname === '127.0.0.1' || 
                         window.location.hostname.includes('run.app') || 
                         window.location.hostname.includes('aistudio');

    if (isLocalOrDev) {
      const headers: Record<string, string> = {
        'x-apps-script-url': url,
      };
      if (body) {
        headers['Content-Type'] = 'application/json';
      }
      const response = await fetch('/api/proxy-apps-script', {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.ok) {
        return response;
      }
      console.warn(`Proxy request returned non-OK status ${response.status}. Retrying via direct client fetch...`);
    }
  } catch (err) {
    console.warn('Backend proxy call failed, falling back to direct Apps Script call:', err);
  }

  // Fallback: direct client fetch to Google Apps Script.
  // When calling Apps Script directly:
  // - For POST requests, we MUST use 'Content-Type': 'text/plain;charset=utf-8' so that the browser handles it as a simple request and skips preflight checks.
  console.log('[Direct Client Fetch] Fetching directly from client browser to:', url);
  if (method === 'POST') {
    return fetch(url, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(body),
    });
  } else {
    return fetch(url, {
      method: 'GET',
      mode: 'cors',
    });
  }
}

export async function fetchSheetsSales(token: string): Promise<Sale[]> {
  if (getAppsScriptUrl()) {
    const url = getAppsScriptUrl()!;
    const response = await fetchAppsScript(url, 'GET');
    const data = await handleAppsScriptResponse(response, 'Google Apps Script connection failed');
    if (!data.values) return [];
    
    const sales: Sale[] = [];
    data.values.forEach((row: any[]) => {
      const sale = rowToSale(row);
      if (sale) sales.push(sale);
    });
    return sales;
  }

  const spreadsheetId = await getOrCreateSpreadsheet(token);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A2:K10000`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  const data = await handleResponse(response, 'Failed to fetch sales from Google Sheets');
  if (!data.values) return [];
  
  const sales: Sale[] = [];
  data.values.forEach((row: any[]) => {
    const sale = rowToSale(row);
    if (sale) sales.push(sale);
  });
  return sales;
}

export async function insertSheetSale(token: string, sale: Omit<Sale, 'id' | 'created_at'>): Promise<Sale> {
  const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
  const created_at = new Date().toISOString();
  
  const fullSale: Sale = {
    ...sale,
    id,
    created_at
  };

  const row = saleToRow(fullSale);

  if (getAppsScriptUrl()) {
    const url = getAppsScriptUrl()!;
    const response = await fetchAppsScript(url, 'POST', { action: 'insert', row });
    const resData = await handleAppsScriptResponse(response, 'Google Apps Script connection failed');
    if (resData.error) throw new Error(resData.error);
    return fullSale;
  }

  const spreadsheetId = await getOrCreateSpreadsheet(token);
  const appendRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A:K:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: [row]
    })
  });

  await handleResponse(appendRes, 'Google Sheets write failed');

  return fullSale;
}

export async function updateSheetSale(token: string, sale: Sale): Promise<Sale> {
  if (getAppsScriptUrl()) {
    const url = getAppsScriptUrl()!;
    const row = saleToRow(sale);
    const response = await fetchAppsScript(url, 'POST', { action: 'update', id: sale.id, row });
    const resData = await handleAppsScriptResponse(response, 'Google Apps Script connection failed');
    if (resData.error) throw new Error(resData.error);
    return sale;
  }

  const spreadsheetId = await getOrCreateSpreadsheet(token);
  
  // Find matching row by ID (Column K is index 10)
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A1:K10000`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await handleResponse(response, 'Failed to read spreadsheet structure for update');
  if (!data.values) throw new Error('Document structure is empty.');
  
  let rowIndex = -1;
  for (let i = 0; i < data.values.length; i++) {
    if (data.values[i][10] === sale.id || data.values[i][9] === sale.id || data.values[i][8] === sale.id) {
      rowIndex = i + 1; // 1-indexed for sheets
      break;
    }
  }

  if (rowIndex === -1) {
    // Attempt fallback to append it if not found in sheets active list
    return insertSheetSale(token, sale);
  }

  const row = saleToRow(sale);
  const putRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A${rowIndex}:K${rowIndex}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: [row]
    })
  });

  await handleResponse(putRes, 'Failed to update Google Sheets cell record');

  return sale;
}

export async function deleteSheetSale(token: string, id: string): Promise<boolean> {
  if (getAppsScriptUrl()) {
    const url = getAppsScriptUrl()!;
    const response = await fetchAppsScript(url, 'POST', { action: 'delete', id });
    const resData = await handleAppsScriptResponse(response, 'Google Apps Script connection failed');
    if (resData.error) throw new Error(resData.error);
    return true;
  }

  const spreadsheetId = await getOrCreateSpreadsheet(token);
  
  // Find matching row by ID (Column K is index 10)
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A1:K10000`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await handleResponse(response, 'Failed to read spreadsheet structure for deletion');
  if (!data.values) return false;

  let rowIndex = -1;
  for (let i = 0; i < data.values.length; i++) {
    if (data.values[i][10] === id || data.values[i][9] === id || data.values[i][8] === id) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) return true; // Already deleted or not present

  // Clear specific row values to maintain indexes without complex dimensions shifts
  const clearRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A${rowIndex}:K${rowIndex}:clear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  await handleResponse(clearRes, 'Failed to clear Google Sheets cell record');
  return true;
}

// Bulk Sync Local Offline entries to Google Sheets
export async function syncLocalToSheets(token: string, localSales: Sale[]): Promise<{ syncedCount: number; error?: string }> {
  try {
    if (getAppsScriptUrl()) {
      const url = getAppsScriptUrl()!;
      const sheetsSales = await fetchSheetsSales('');
      const sheetsIds = new Set(sheetsSales.map(item => item.id));
      const toInsert = localSales.filter(item => !sheetsIds.has(item.id));

      if (toInsert.length === 0) {
        return { syncedCount: 0 };
      }

      const rows = toInsert.map(sale => saleToRow(sale));
      const response = await fetchAppsScript(url, 'POST', { action: 'sync', rows });
      const resData = await handleAppsScriptResponse(response, 'Google Apps Script connection failed');
      if (resData.error) throw new Error(resData.error);
      return { syncedCount: toInsert.length };
    }

    const spreadsheetId = await getOrCreateSpreadsheet(token);
    const sheetsSales = await fetchSheetsSales(token);

    const sheetsIds = new Set(sheetsSales.map(item => item.id));
    const toInsert = localSales.filter(item => !sheetsIds.has(item.id));

    if (toInsert.length === 0) {
      return { syncedCount: 0 };
    }

    const rows = toInsert.map(sale => saleToRow(sale));

    const appendRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A:K:append?valueInputOption=USER_ENTERED`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: rows
      })
    });

    await handleResponse(appendRes, 'Sync append to sheet failed');

    return { syncedCount: toInsert.length };
  } catch (err: any) {
    console.error('Google sheet syncing error:', err);
    return { syncedCount: 0, error: err.message };
  }
}

export async function clearSheetSales(token: string): Promise<boolean> {
  if (getAppsScriptUrl()) {
    const url = getAppsScriptUrl()!;
    const response = await fetchAppsScript(url, 'POST', { action: 'clear' });
    const resData = await handleAppsScriptResponse(response, 'Google Apps Script connection failed');
    if (resData.error) throw new Error(resData.error);
    return true;
  }

  const spreadsheetId = await getOrCreateSpreadsheet(token);
  const clearRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A2:K:clear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  await handleResponse(clearRes, 'Failed to clear Google Sheets values');
  return true;
}

// Seed Google Sheets with default database (8 items starting from INV-001)
export async function seedSheetSales(token: string, defaultSales: Sale[]): Promise<boolean> {
  if (getAppsScriptUrl()) {
    await clearSheetSales('');
    const url = getAppsScriptUrl()!;
    const rows = defaultSales.map(sale => saleToRow(sale));
    const response = await fetchAppsScript(url, 'POST', { action: 'sync', rows });
    const resData = await handleAppsScriptResponse(response, 'Google Apps Script connection failed');
    if (resData.error) throw new Error(resData.error);
    return true;
  }

  const spreadsheetId = await getOrCreateSpreadsheet(token);
  
  // First clear any existing data starting from row 2
  await clearSheetSales(token);

  // Map to rows
  const rows = defaultSales.map(sale => saleToRow(sale));

  const appendRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A:K:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: rows
    })
  });

  await handleResponse(appendRes, 'Seeding default database to Google Sheets failed');
  return true;
}
