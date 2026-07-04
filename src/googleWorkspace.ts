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
import type { Sale } from './supabase';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/spreadsheets');

let isSigningIn = false;
const SPREADSHEET_ID_CACHE_KEY = 'tech4geeky_google_sheet_id';
const GOOGLE_ACCESS_TOKEN_KEY = 'tech4geeky_google_access_token';

// Read token from persistent storage initially
let cachedAccessToken: string | null = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  // 1. Process pending redirect results on page init
  getRedirectResult(auth)
    .then((result) => {
      if (result) {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          cachedAccessToken = credential.accessToken;
          localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, credential.accessToken);
          if (result.user && onAuthSuccess) {
            onAuthSuccess(result.user, credential.accessToken);
          }
        }
      }
    })
    .catch((error) => {
      console.error('Redirect sign in error:', error);
    });

  // 2. Track real-time auth state changes
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        // If we don't have the token cached (e.g. session expired or cleared), trigger failure
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  isSigningIn = true;
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (isMobileDevice) {
    // Mobile browsers: call redirect flow directly to avoid pop-up blockages completely
    try {
      await signInWithRedirect(auth, provider);
      return null; // Will trigger redirect page reload, callback on load will handle it
    } catch (error: any) {
      console.error('Mobile redirect auth error:', error);
      throw error;
    } finally {
      isSigningIn = false;
    }
  }

  // Desktop/default: try popup, fallback to redirect if blocked
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
    console.warn('Popup authentication issue, attempting fallback redirect flow...', error);
    // Code 'auth/popup-blocked' or generic error fallback
    try {
      await signInWithRedirect(auth, provider);
      return null;
    } catch (redirectErr: any) {
      console.error('Mobile redirection fallback failed:', redirectErr);
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
    localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
    cachedAccessToken = null;
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Google Sheets access denied (HTTP ${response.status}): ${errData.error?.message || 'Unauthorized or insufficient scopes'}. Please re-sign in to grant Sheets & Drive permissions.`);
  }
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`${defaultError} (HTTP ${response.status}): ${errData.error?.message || response.statusText}`);
  }
  return response.json();
}

async function getOrCreateSpreadsheet(token: string): Promise<string> {
  let cached = localStorage.getItem(SPREADSHEET_ID_CACHE_KEY);
  if (!cached) {
    // Default to the user's requested spreadsheet
    cached = '1yE9_IElbygv0tMCTLS7en-HsdxigwQKk';
    localStorage.setItem(SPREADSHEET_ID_CACHE_KEY, cached);
  }

  // Verify sheet existence and ensure 'SalesList' page is configured
  try {
    const checkRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cached}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (checkRes.ok) {
      const data = await checkRes.json();
      const sheetTitles = data.sheets?.map((s: any) => s.properties?.title) || [];
      if (!sheetTitles.includes('SalesList')) {
        // Create the SalesList sheet inside this spreadsheet
        const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cached}:batchUpdate`, {
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

        if (updateRes.ok) {
          // Initialize headers in SalesList
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cached}/values/SalesList!A1:K1?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              values: [
                ['ID', 'Created At', 'Sale Date', 'Category', 'Client Name', 'Client Email', 'Client Phone', 'Amount', 'Status', 'Payment Method', 'Description']
              ]
            })
          });
        } else {
          const errData = await updateRes.json().catch(() => ({}));
          throw new Error(`Failed to create 'SalesList' tab: ${errData.error?.message || updateRes.statusText}`);
        }
      }
    } else {
      if (checkRes.status === 401 || checkRes.status === 403) {
        localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
        cachedAccessToken = null;
        const errData = await checkRes.json().catch(() => ({}));
        throw new Error(`Google Sheets access denied (HTTP ${checkRes.status}): ${errData.error?.message || 'Unauthorized or insufficient scopes'}. Please re-sign in to grant Sheets & Drive permissions.`);
      }

      console.warn(`Spreadsheet ID ${cached} could not be loaded directly (${checkRes.status}), searching or creating standard "Tech4Geeky Sales Tracker" file...`);
      // Search for an existing file
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name%3D'Tech4Geeky+Sales+Tracker'+and+mimeType%3D'application/vnd.google-apps.spreadsheet'+and+trashed%3Dfalse&fields=files(id,name)`;
      const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const searchData = await handleResponse(searchRes, 'Google Drive search failed');
      if (searchData.files && searchData.files.length > 0) {
        cached = searchData.files[0].id;
        localStorage.setItem(SPREADSHEET_ID_CACHE_KEY, cached);
      } else {
        // Create new Spreadsheet
        const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            properties: {
              title: 'Tech4Geeky Sales Tracker'
            },
            sheets: [
              {
                properties: {
                  title: 'SalesList'
                }
              }
            ]
          })
        });

        const created = await handleResponse(createRes, 'Failed to create new Google Sheet');

        cached = created.spreadsheetId;
        localStorage.setItem(SPREADSHEET_ID_CACHE_KEY, cached);

        // Insert headers
        const headerRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cached}/values/SalesList!A1:K1?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [
              ['ID', 'Created At', 'Sale Date', 'Category', 'Client Name', 'Client Email', 'Client Phone', 'Amount', 'Status', 'Payment Method', 'Description']
            ]
          })
        });

        await handleResponse(headerRes, 'Failed to initialize headers');
      }
    }
  } catch (err: any) {
    console.error('Spreadsheet resolution error:', err);
    throw err; // bubble up so the user gets a helpful, readable warning in the UI
  }

  return cached;
}

// Map Google Sheets standard array to Sale type
function rowToSale(row: any[]): Sale | null {
  if (!row || row.length === 0 || !row[0]) return null;
  return {
    id: row[0],
    created_at: row[1] || new Date().toISOString(),
    sale_date: row[2] || new Date().toISOString().split('T')[0],
    category: row[3] as any,
    client_name: row[4] || '',
    client_email: row[5] || '',
    client_phone: row[6] || '',
    amount: Number(row[7]) || 0,
    status: row[8] as any,
    payment_method: row[9] as any,
    description: row[10] || ''
  };
}

// Convert Sale to Row Array
function saleToRow(sale: Sale): any[] {
  return [
    sale.id,
    sale.created_at,
    sale.sale_date,
    sale.category,
    sale.client_name,
    sale.client_email || '',
    sale.client_phone || '',
    sale.amount,
    sale.status,
    sale.payment_method,
    sale.description || ''
  ];
}

export async function fetchSheetsSales(token: string): Promise<Sale[]> {
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
  const spreadsheetId = await getOrCreateSpreadsheet(token);
  const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
  const created_at = new Date().toISOString();
  
  const fullSale: Sale = {
    ...sale,
    id,
    created_at
  };

  const row = saleToRow(fullSale);

  const appendRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A2:K2:append?valueInputOption=USER_ENTERED`, {
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
  const spreadsheetId = await getOrCreateSpreadsheet(token);
  
  // Find matching row by ID
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A1:A10000`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await handleResponse(response, 'Failed to read spreadsheet structure for update');
  if (!data.values) throw new Error('Document structure is empty.');
  
  let rowIndex = -1;
  for (let i = 0; i < data.values.length; i++) {
    if (data.values[i][0] === sale.id) {
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
  const spreadsheetId = await getOrCreateSpreadsheet(token);
  
  // Find matching row by ID
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A1:A10000`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await handleResponse(response, 'Failed to read spreadsheet structure for deletion');
  if (!data.values) return false;

  let rowIndex = -1;
  for (let i = 0; i < data.values.length; i++) {
    if (data.values[i][0] === id) {
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
    const spreadsheetId = await getOrCreateSpreadsheet(token);
    const sheetsSales = await fetchSheetsSales(token);

    const sheetsIds = new Set(sheetsSales.map(item => item.id));
    const toInsert = localSales.filter(item => !sheetsIds.has(item.id));

    if (toInsert.length === 0) {
      return { syncedCount: 0 };
    }

    const rows = toInsert.map(sale => saleToRow(sale));

    const appendRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A2:K2:append?valueInputOption=USER_ENTERED`, {
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
