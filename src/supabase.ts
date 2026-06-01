import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface Sale {
  id: string;
  created_at: string;
  sale_date: string;
  category: 'Video editing' | 'Web Site development' | 'Govt. Service (Appl.)' | 'PC Repair' | 'Graphic Designing';
  client_name: string;
  client_email?: string;
  client_phone?: string;
  amount: number;
  status: 'Paid' | 'Pending' | 'Refunded';
  payment_method: 'Cash' | 'UPI/Online' | 'Card' | 'Bank Transfer';
  description?: string;
}

// Read environment variables
const supabaseUrl = ((import.meta as any).env?.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '').trim();

// Safe helper to strip enclosing quotes if accidentally present in environment string configuration
function sanitizeEnvValue(val: string): string {
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1).trim();
  }
  return val;
}

const cleanUrl = sanitizeEnvValue(supabaseUrl);
const cleanAnonKey = sanitizeEnvValue(supabaseAnonKey);

const isUrlValid = (url: string) => {
  return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'));
};

// Lazy initialization of Supabase client to prevent startup crash
let supabase: SupabaseClient | null = null;
let isSupabaseConfigured = false;

if (
  cleanUrl && 
  cleanAnonKey && 
  isUrlValid(cleanUrl) && 
  cleanUrl !== 'MY_SUPABASE_URL' && 
  cleanAnonKey !== 'MY_SUPABASE_ANON_KEY'
) {
  try {
    supabase = createClient(cleanUrl, cleanAnonKey);
    isSupabaseConfigured = true;
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
  }
}

export { supabase, isSupabaseConfigured };

// SQL Script for setting up Supabase table
export const SUPABASE_SQL_SCRIPT = `-- SQL Script to create sales table in Supabase
-- Go to your Supabase Dashboard -> SQL Editor, paste this script, and run it!

CREATE TABLE IF NOT EXISTS public.sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL CHECK (category IN ('Video editing', 'Web Site development', 'Govt. Service (Appl.)', 'PC Repair', 'Graphic Designing')),
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Paid', 'Pending', 'Refunded')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'UPI/Online', 'Bank Transfer')),
  description TEXT
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- Create an open policy to allow client-side access
-- (Note: For production, you may restrict this by setting up auth roles!)
CREATE POLICY "Allow public access to sales" 
  ON public.sales 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);
`;

const LOCAL_STORAGE_KEY = 'tech4geeky_sales_data';

// Helper to load fallback items from localStorage
export function getLocalSales(): Sale[] {
  try {
    const rawData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!rawData) {
      const initialSeed: Sale[] = [];
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(initialSeed));
      return initialSeed;
    }
    const parsed: Sale[] = JSON.parse(rawData);
    // Guarantee any legacy seed item is removed to respect "remove dummy datas" instantly
    const cleanList = parsed.filter(item => !item.id.toString().startsWith('seed-'));
    if (cleanList.length !== parsed.length) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleanList));
    }
    return cleanList;
  } catch (error) {
    console.error('Failed to read from localStorage:', error);
    return [];
  }
}

// Helper to save fallback items to localStorage
export function saveLocalSales(sales: Sale[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sales));
  } catch (error) {
    console.error('Failed to write to localStorage:', error);
  }
}

/**
 * Robust Core Storage Hub:
 * Reads from Supabase if configured & active, with automatic fallback to localStorage.
 * Writes to Supabase and falls back to LocalStorage, allowing syncing.
 */
export async function getSales(): Promise<{ sales: Sale[]; source: 'supabase' | 'local'; error?: string }> {
  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .order('sale_date', { ascending: false });

      if (error) {
        throw error;
      }

      if (data) {
        // Map any naming schema adjustments
        const parsedSales: Sale[] = data.map((item: any) => ({
          id: item.id,
          created_at: item.created_at || new Date().toISOString(),
          sale_date: item.sale_date || new Date().toISOString().split('T')[0],
          category: item.category === 'Govt. Services (Website)' ? 'Web Site development' : item.category,
          client_name: item.client_name,
          client_email: item.client_email || '',
          client_phone: item.client_phone || '',
          amount: Number(item.amount),
          status: item.status,
          payment_method: item.payment_method,
          description: item.description || ''
        }));
        
        // Cache in localStorage as local fallback
        saveLocalSales(parsedSales);
        return { sales: parsedSales, source: 'supabase' };
      }
    } catch (err: any) {
      console.warn('Supabase fetch failed, using local fallback:', err.message || err);
      return { 
        sales: getLocalSales(), 
        source: 'local', 
        error: `Supabase database fetch error: ${err.message || 'Check your schema setup. Falling back to offline client mode.'}` 
      };
    }
  }
  
  return { sales: getLocalSales(), source: 'local' };
}

export async function addSale(sale: Omit<Sale, 'id' | 'created_at'>): Promise<{ sale: Sale; source: 'supabase' | 'local'; error?: string }> {
  const newId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
  const newCreated = new Date().toISOString();
  
  const fullSale: Sale = {
    ...sale,
    id: newId,
    created_at: newCreated
  };

  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('sales')
        .insert([{
          sale_date: fullSale.sale_date,
          category: fullSale.category,
          client_name: fullSale.client_name,
          client_email: fullSale.client_email,
          client_phone: fullSale.client_phone,
          amount: fullSale.amount,
          status: fullSale.status,
          payment_method: fullSale.payment_method,
          description: fullSale.description
        }])
        .select();

      if (error) throw error;
      
      if (data && data[0]) {
        const returnedSale: Sale = {
          id: data[0].id,
          created_at: data[0].created_at,
          sale_date: data[0].sale_date,
          category: data[0].category,
          client_name: data[0].client_name,
          client_email: data[0].client_email || '',
          client_phone: data[0].client_phone || '',
          amount: Number(data[0].amount),
          status: data[0].status,
          payment_method: data[0].payment_method,
          description: data[0].description || ''
        };

        // Sync local storage cache
        const local = getLocalSales();
        local.unshift(returnedSale);
        saveLocalSales(local);

        return { sale: returnedSale, source: 'supabase' };
      }
    } catch (err: any) {
      console.warn('Supabase insert failed, caching locally:', err.message || err);
      // Fallback: save to local storage
      const local = getLocalSales();
      local.unshift(fullSale);
      saveLocalSales(local);
      return { sale: fullSale, source: 'local', error: `Supabase write failed: ${err.message || 'Offline queue saved.'}` };
    }
  }

  // Fallback direct
  const local = getLocalSales();
  local.unshift(fullSale);
  saveLocalSales(local);
  return { sale: fullSale, source: 'local' };
}

export async function updateSale(sale: Sale): Promise<{ sale: Sale; source: 'supabase' | 'local'; error?: string }> {
  if (supabase && isSupabaseConfigured) {
    try {
      // Check if it's a UUID (Supabase uses UUIDs, but seeds use strings)
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sale.id);
      
      if (isUUID) {
        const { data, error } = await supabase
          .from('sales')
          .update({
            sale_date: sale.sale_date,
            category: sale.category,
            client_name: sale.client_name,
            client_email: sale.client_email,
            client_phone: sale.client_phone,
            amount: sale.amount,
            status: sale.status,
            payment_method: sale.payment_method,
            description: sale.description
          })
          .eq('id', sale.id)
          .select();

        if (error) throw error;

        if (data && data[0]) {
          const updated: Sale = {
            id: data[0].id,
            created_at: data[0].created_at,
            sale_date: data[0].sale_date,
            category: data[0].category,
            client_name: data[0].client_name,
            client_email: data[0].client_email || '',
            client_phone: data[0].client_phone || '',
            amount: Number(data[0].amount),
            status: data[0].status,
            payment_method: data[0].payment_method,
            description: data[0].description || ''
          };

          const local = getLocalSales();
          const index = local.findIndex(s => s.id === sale.id);
          if (index !== -1) {
            local[index] = updated;
          } else {
            local.push(updated);
          }
          saveLocalSales(local);

          return { sale: updated, source: 'supabase' };
        }
      } else {
        // If it's a standard string seed-id, we can't update it directly in Supabase
        // because it expects UUID. We will just save it locally first or treat it as a local-only entry.
        const local = getLocalSales();
        const index = local.findIndex(s => s.id === sale.id);
        if (index !== -1) {
          local[index] = sale;
        }
        saveLocalSales(local);
        return { sale, source: 'local' };
      }
    } catch (err: any) {
      console.warn('Supabase update failed, saving locally:', err.message || err);
      const local = getLocalSales();
      const index = local.findIndex(s => s.id === sale.id);
      if (index !== -1) {
        local[index] = sale;
      }
      saveLocalSales(local);
      return { sale, source: 'local', error: `Supabase update failed: ${err.message || 'Local cache updated.'}` };
    }
  }

  const local = getLocalSales();
  const index = local.findIndex(s => s.id === sale.id);
  if (index !== -1) {
    local[index] = sale;
  }
  saveLocalSales(local);
  return { sale, source: 'local' };
}

export async function deleteSale(id: string): Promise<{ success: boolean; source: 'supabase' | 'local'; error?: string }> {
  // First update local state
  const local = getLocalSales();
  const filtered = local.filter(s => s.id !== id);
  saveLocalSales(filtered);

  if (supabase && isSupabaseConfigured) {
    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      
      if (isUUID) {
        const { error } = await supabase
          .from('sales')
          .delete()
          .eq('id', id);

        if (error) throw error;
        return { success: true, source: 'supabase' };
      } else {
        // If it was local/seed, deleting it from localStorage is already done!
        return { success: true, source: 'local' };
      }
    } catch (err: any) {
      console.warn('Supabase delete failed, processed locally:', err.message || err);
      return { success: true, source: 'local', error: `Supabase delete failed: ${err.message || 'Saved locally.'}` };
    }
  }

  return { success: true, source: 'local' };
}

/**
 * Bulk Syncing local sales into Supabase.
 * Useful when the user builds records offline and then plugs in their Supabase credentials.
 */
export async function syncLocalToSupabase(): Promise<{ syncedCount: number; error?: string }> {
  if (!supabase || !isSupabaseConfigured) {
    return { syncedCount: 0, error: 'Supabase client is not configured yet.' };
  }

  try {
    const local = getLocalSales();
    if (local.length === 0) return { syncedCount: 0 };

    // Fetch existing records in supabase to prevent duplicates
    const { data: remoteData, error: fetchError } = await supabase.from('sales').select('client_name, amount, category, sale_date');
    if (fetchError) throw fetchError;

    // We can define "duplicates" loosely as same client, amount, category and date
    const remoteSet = new Set(
      (remoteData || []).map(r => `${r.client_name}-${r.amount}-${r.category}-${r.sale_date}`)
    );

    // Filter to inserts that are not duplicate
    const toInsert = local
      .filter(s => !remoteSet.has(`${s.client_name}-${s.amount}-${s.category}-${s.sale_date}`))
      .map(s => ({
        sale_date: s.sale_date,
        category: s.category,
        client_name: s.client_name,
        client_email: s.client_email || '',
        client_phone: s.client_phone || '',
        amount: s.amount,
        status: s.status,
        payment_method: s.payment_method,
        description: s.description || ''
      }));

    if (toInsert.length === 0) {
      return { syncedCount: 0 };
    }

    const { error: insertError } = await supabase.from('sales').insert(toInsert);
    if (insertError) throw insertError;

    // Fetch latest combined list to put back into local storage
    const { data: freshList, error: freshError } = await supabase
      .from('sales')
      .select('*')
      .order('sale_date', { ascending: false });

    if (!freshError && freshList) {
      const parsedSales: Sale[] = freshList.map((item: any) => ({
        id: item.id,
        created_at: item.created_at,
        sale_date: item.sale_date,
        category: item.category,
        client_name: item.client_name,
        client_email: item.client_email || '',
        client_phone: item.client_phone || '',
        amount: Number(item.amount),
        status: item.status,
        payment_method: item.payment_method,
        description: item.description || ''
      }));
      saveLocalSales(parsedSales);
    }

    return { syncedCount: toInsert.length };
  } catch (err: any) {
    console.error('Core Sync error:', err);
    return { syncedCount: 0, error: err.message || 'Transaction syncing failed.' };
  }
}
