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
const SPREADSHEET_ID_CACHE_KEY = 'tech4geeky_google_sheet_id';
const GOOGLE_ACCESS_TOKEN_KEY = 'tech4geeky_google_access_token';

// Read token from persistent storage initially
let cachedAccessToken: string | null = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  let redirectChecked = false;
  let authStateUser: User | null = null;
  let hasCheckedAuthOnce = false;

  const emitAuthState = () => {
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
      const headers = ['Sl No.', 'Inv No.', 'Client Name', 'Date', 'Category', 'Amount', 'Mode of Transaction', 'Notes', 'ID'];
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values/SalesList!A1:I1?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [headers]
        })
      });

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
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[2].length === 4) {
    // DD-MM-YYYY
    const [day, month, year] = parts;
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

function formatIndianDateLocal(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    // YYYY-MM-DD
    const [year, month, day] = parts;
    return `${day}-${month}-${year}`;
  }
  return dateStr;
}

// Map Google Sheets standard array to Sale type
function rowToSale(row: any[]): Sale | null {
  if (!row || row.length === 0 || !row[0]) return null;
  if (row[0] === 'Sl No.' || row[1] === 'Inv No.' || row[2] === 'Client Name') return null;
  
  const parsedDate = parseIndianDate(row[3]);
  return {
    id: row[8] || row[0],
    invoice_no: row[1] || '',
    created_at: parsedDate ? new Date(parsedDate).toISOString() : new Date().toISOString(),
    sale_date: parsedDate || new Date().toISOString().split('T')[0],
    category: row[4] as any,
    client_name: row[2] || '',
    amount: Number(row[5]) || 0,
    payment_method: row[6] as any,
    description: row[7] || ''
  };
}

// Convert Sale to Row Array
function saleToRow(sale: Sale): any[] {
  return [
    '=ROW()-1',
    '="INV-" & TEXT(ROW()-1, "000")',
    sale.client_name,
    formatIndianDateLocal(sale.sale_date),
    sale.category,
    sale.amount,
    sale.payment_method,
    sale.description || '',
    sale.id
  ];
}

export async function fetchSheetsSales(token: string): Promise<Sale[]> {
  const spreadsheetId = await getOrCreateSpreadsheet(token);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A2:I10000`, {
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

  const appendRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A:I:append?valueInputOption=USER_ENTERED`, {
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
  
  // Find matching row by ID (Column I is index 8)
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A1:I10000`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await handleResponse(response, 'Failed to read spreadsheet structure for update');
  if (!data.values) throw new Error('Document structure is empty.');
  
  let rowIndex = -1;
  for (let i = 0; i < data.values.length; i++) {
    if (data.values[i][8] === sale.id) {
      rowIndex = i + 1; // 1-indexed for sheets
      break;
    }
  }

  if (rowIndex === -1) {
    // Attempt fallback to append it if not found in sheets active list
    return insertSheetSale(token, sale);
  }

  const row = saleToRow(sale);
  const putRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A${rowIndex}:I${rowIndex}?valueInputOption=USER_ENTERED`, {
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
  
  // Find matching row by ID (Column I is index 8)
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A1:I10000`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await handleResponse(response, 'Failed to read spreadsheet structure for deletion');
  if (!data.values) return false;

  let rowIndex = -1;
  for (let i = 0; i < data.values.length; i++) {
    if (data.values[i][8] === id) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) return true; // Already deleted or not present

  // Clear specific row values to maintain indexes without complex dimensions shifts
  const clearRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A${rowIndex}:I${rowIndex}:clear`, {
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

    const appendRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A:I:append?valueInputOption=USER_ENTERED`, {
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
  const spreadsheetId = await getOrCreateSpreadsheet(token);
  const clearRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A2:I:clear`, {
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
  const spreadsheetId = await getOrCreateSpreadsheet(token);
  
  // First clear any existing data starting from row 2
  await clearSheetSales(token);

  // Map to rows
  const rows = defaultSales.map(sale => saleToRow(sale));

  const appendRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SalesList!A:I:append?valueInputOption=USER_ENTERED`, {
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
