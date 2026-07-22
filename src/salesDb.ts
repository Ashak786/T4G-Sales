export interface PartialPayment {
  id: string;
  amount: number;
  date: string;
  payment_method?: 'Cash' | 'UPI/Online' | 'Card' | 'Bank Transfer';
}

export interface Sale {
  id: string;
  created_at: string;
  sale_date: string;
  category: 'Video editing' | 'Web Site development' | 'Govt. Service (Appl.)' | 'PC Repair' | 'Graphic Designing';
  client_name: string;
  client_email?: string;
  client_phone?: string;
  amount: number;
  invoice_no?: string;
  payment_method: 'Cash' | 'UPI/Online' | 'Card' | 'Bank Transfer';
  description?: string;
  payment_status?: 'Received' | 'Pending' | 'Partial';
  received_amount?: number;
  thumbnail_charges?: number;
  partial_payments?: PartialPayment[];
}

const LOCAL_STORAGE_KEY = 'tech4geeky_sales_data';

export const DEFAULT_SEED_SALES: Sale[] = [
  {
    id: "f8b91e92-d67b-4029-9dc4-1be66fb07bf1",
    created_at: "2026-06-06T10:00:00.000Z",
    sale_date: "2026-06-06",
    category: "PC Repair",
    client_name: "Kishore",
    client_email: "",
    client_phone: "",
    amount: 1000,
    payment_method: "UPI/Online",
    description: "Laptop Service",
    payment_status: "Pending"
  },
  {
    id: "9722361b-9a4f-4d9c-bd24-0026e6f0b402",
    created_at: "2025-10-26T10:00:00.000Z",
    sale_date: "2025-10-26",
    category: "Video editing",
    client_name: "Benedict Hoover P",
    client_email: "",
    client_phone: "",
    amount: 500,
    payment_method: "UPI/Online",
    description: "Long Video",
    payment_status: "Received"
  },
  {
    id: "6e2cc76b-9689-4e08-9df2-9b2447ff69df",
    created_at: "2026-01-10T10:00:00.000Z",
    sale_date: "2026-01-10",
    category: "Video editing",
    client_name: "Benedict Hoover P",
    client_email: "",
    client_phone: "",
    amount: 1470,
    payment_method: "UPI/Online",
    description: "Dec 25 O.S + Long Video",
    payment_status: "Received"
  },
  {
    id: "d974e64f-2cc8-4a55-8ee7-84a2cbff497e",
    created_at: "2026-01-27T10:00:00.000Z",
    sale_date: "2026-01-27",
    category: "Graphic Designing",
    client_name: "Pooja",
    client_email: "",
    client_phone: "",
    amount: 1500,
    payment_method: "UPI/Online",
    description: "Logo + Flyer",
    payment_status: "Received"
  },
  {
    id: "2768d76e-3651-40be-bd6f-f06b9b1ee65b",
    created_at: "2026-02-09T10:00:00.000Z",
    sale_date: "2026-02-09",
    category: "Video editing",
    client_name: "Benedict Hoover P",
    client_email: "",
    client_phone: "",
    amount: 380,
    payment_method: "UPI/Online",
    description: "Baby Vlog",
    payment_status: "Pending"
  },
  {
    id: "a3ee7f9b-6b2a-43d9-a764-f6eb80a13ee1",
    created_at: "2026-06-01T10:00:00.000Z",
    sale_date: "2026-06-01",
    category: "Video editing",
    client_name: "Benedict Hoover P",
    client_email: "",
    client_phone: "",
    amount: 914,
    payment_method: "UPI/Online",
    description: "Multi",
    payment_status: "Received"
  },
  {
    id: "be935ef7-0efc-4e8c-8c03-51bf7316713c",
    created_at: "2026-06-03T10:00:00.000Z",
    sale_date: "2026-06-03",
    category: "Govt. Service (Appl.)",
    client_name: "Yogesh",
    client_email: "",
    client_phone: "",
    amount: 3025,
    payment_method: "UPI/Online",
    description: "Marriage Certificate",
    payment_status: "Received"
  },
  {
    id: "c469b72a-6091-4da2-a39c-eb21e053a992",
    created_at: "2026-06-13T10:00:00.000Z",
    sale_date: "2026-06-13",
    category: "PC Repair",
    client_name: "Soma",
    client_email: "",
    client_phone: "",
    amount: 1000,
    payment_method: "UPI/Online",
    description: "Laptop Service",
    payment_status: "Pending"
  }
];

export function getLocalSales(): Sale[] {
  try {
    const rawData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!rawData) {
      console.log('No data found, seeding...');
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(DEFAULT_SEED_SALES));
      return DEFAULT_SEED_SALES;
    }
    console.log('Raw data found:', rawData);
    const parsed: Sale[] = JSON.parse(rawData);
    console.log('Parsed data length:', parsed.length);
    const cleanList = parsed.filter(item => !item.id.toString().startsWith('seed-'));
    
    if (cleanList.length !== parsed.length) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleanList));
    }
    return cleanList;
  } catch (error) {
    console.error('Failed to read from localStorage:', error);
    return DEFAULT_SEED_SALES;
  }
}

export function saveLocalSales(sales: Sale[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sales));
  } catch (error) {
    console.error('Failed to write to localStorage:', error);
  }
}
