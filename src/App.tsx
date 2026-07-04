import { useState, useEffect, useMemo, FormEvent } from 'react';
import { 
  DollarSign, 
  Plus, 
  Search, 
  Trash2, 
  Edit, 
  Video, 
  Wrench, 
  Globe, 
  Palette, 
  Database, 
  Copy, 
  Check, 
  RotateCcw, 
  Info, 
  X, 
  User, 
  Calendar, 
  CreditCard, 
  TrendingUp, 
  ExternalLink,
  Lock,
  Settings,
  ChevronDown,
  Filter,
  CheckCircle,
  Clock,
  AlertTriangle,
  Activity,
  FileText,
  Calculator,
  Sun,
  Moon
} from 'lucide-react';
import { 
  Sale, 
  getLocalSales, 
  saveLocalSales 
} from './supabase';
import {
  initAuth,
  googleSignIn,
  logout,
  fetchSheetsSales,
  insertSheetSale,
  updateSheetSale,
  deleteSheetSale,
  syncLocalToSheets,
  setSpreadsheetId,
  extractSpreadsheetId
} from './googleWorkspace';

export default function App() {
  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
  });

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
  };

  const isDark = theme === 'dark';

  // Delete Confirmation State (bypasses iframe block on window.confirm)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false);

  // Sales State
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [dbSource, setDbSource] = useState<'sheets' | 'local'>('local');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [sqlCopied, setSqlCopied] = useState<boolean>(false);

  // Google Connection / Auth state
  const [user, setUser] = useState<any>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [sheetInput, setSheetInput] = useState<string>(() => {
    return localStorage.getItem('tech4geeky_google_sheet_id') || '1yE9_IElbygv0tMCTLS7en-HsdxigwQKk';
  });
  
  // Search & Filters State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedPayment, setSelectedPayment] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');

  // Modal Control States
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);
  const [activeSale, setActiveSale] = useState<Sale | null>(null);

  // Temporary Form States
  const [formData, setFormData] = useState<{
    sale_date: string;
    category: 'Video editing' | 'Web Site development' | 'Govt. Service (Appl.)' | 'PC Repair' | 'Graphic Designing';
    client_name: string;
    client_email: string;
    client_phone: string;
    amount: string;
    status: 'Paid' | 'Pending' | 'Refunded';
    payment_method: 'Cash' | 'UPI/Online' | 'Bank Transfer';
    description: string;
  }>({
    sale_date: new Date().toISOString().split('T')[0],
    category: 'Video editing',
    client_name: '',
    client_email: '',
    client_phone: '',
    amount: '',
    status: 'Paid',
    payment_method: 'UPI/Online',
    description: ''
  });

  // Mini Calculator State
  const [calcInput, setCalcInput] = useState<string>('');
  const [calcResult, setCalcResult] = useState<string>('');
  const [showCalculator, setShowCalculator] = useState<boolean>(false);

  const handleCalcPress = (val: string) => {
    setCalcInput((prev) => {
      // Prevent consecutive operators if desired, but keep it simple and robust
      return prev + val;
    });
  };

  const handleCalcClear = () => {
    setCalcInput('');
    setCalcResult('');
  };

  const handleCalcEvaluate = () => {
    // Replace visual support characters to math safe operations
    const mathExpr = calcInput.replace(/×/g, '*').replace(/÷/g, '/');
    const safeExpr = mathExpr.replace(/[^0-9.\+\-\*\/\(\)\s]/g, '');
    try {
      if (!safeExpr.trim()) return;
      
      // Safe execution context
      const result = new Function(`return (${safeExpr})`)();
      if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
        const finishedValue = String(Math.round(result * 100) / 100);
        setCalcResult(finishedValue);
        // Automatically put the answer directly in the active form's amount field
        setFormData((prev) => ({ ...prev, amount: finishedValue }));
      } else {
        setCalcResult('Error');
      }
    } catch (e) {
      setCalcResult('Error');
    }
  };

  const handleCalcApply = () => {
    if (calcResult && calcResult !== 'Error') {
      setFormData((prev) => ({ ...prev, amount: calcResult }));
    }
  };

  // Reset calculator when modals open or close
  useEffect(() => {
    handleCalcClear();
  }, [isAddOpen, isEditOpen]);

  // Group sales for sales performance bar chart by Month
  const chartData = useMemo(() => {
    const monthGroups: { [key: string]: { label: string; amount: number; yearMonthVal: string } } = {};
    sales.forEach(sale => {
      if (sale.status === 'Paid' || sale.status === 'Pending') {
        const dateStr = sale.sale_date;
        try {
          const date = new Date(dateStr);
          const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
          const yearMonthVal = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
          
          if (!monthGroups[yearMonthVal]) {
            monthGroups[yearMonthVal] = {
              label: monthLabel,
              amount: 0,
              yearMonthVal
            };
          }
          monthGroups[yearMonthVal].amount += sale.amount;
        } catch {
          const fallbackKey = dateStr.slice(0, 7);
          if (!monthGroups[fallbackKey]) {
            monthGroups[fallbackKey] = {
              label: fallbackKey,
              amount: 0,
              yearMonthVal: fallbackKey
            };
          }
          monthGroups[fallbackKey].amount += sale.amount;
        }
      }
    });

    const sortedMonths = Object.values(monthGroups)
      .sort((a, b) => a.yearMonthVal.localeCompare(b.yearMonthVal))
      .map(item => ({ date: item.label, amount: item.amount }))
      .slice(-12); // Show up to the last 12 active months

    if (sortedMonths.length === 0) {
      return [
        { date: 'No Data', amount: 0 }
      ];
    }
    return sortedMonths;
  }, [sales]);

  // Load Sales initially
  const loadData = async (activeToken?: string | null) => {
    setLoading(true);
    setErrorMessage('');
    const curToken = activeToken !== undefined ? activeToken : googleToken;
    try {
      if (curToken) {
        const sheetsSales = await fetchSheetsSales(curToken);
        setSales(sheetsSales);
        setDbSource('sheets');
        saveLocalSales(sheetsSales);
      } else {
        const local = getLocalSales();
        setSales(local);
        setDbSource('local');
      }
    } catch (err: any) {
      console.error(err);
      const isAuthErr = err.message?.includes('401') || 
                        err.message?.includes('403') || 
                        err.message?.toLowerCase().includes('access denied') || 
                        err.message?.toLowerCase().includes('unauthorized') ||
                        err.message?.toLowerCase().includes('permissions') ||
                        err.message?.toLowerCase().includes('credentials') ||
                        err.message?.toLowerCase().includes('sign-in') ||
                        err.message?.toLowerCase().includes('re-sign');
      if (isAuthErr) {
        setUser(null);
        setGoogleToken(null);
        setErrorMessage('Google Connection Expired or Lacks Scopes: Please sign out and sign in again to grant permissions.');
      } else {
        setErrorMessage('Google Sheets connection error: ' + (err.message || 'Check connection.'));
      }
      setSales(getLocalSales());
      setDbSource('local');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setUser(user);
        setGoogleToken(token);
        loadData(token);
      },
      () => {
        setUser(null);
        setGoogleToken(null);
        loadData(null);
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);  // Category Colors and Settings Map
  const categoryConfig = {
    'Video editing': {
      bg: 'bg-purple-50 text-purple-700 border-purple-100',
      tagBg: 'bg-purple-600 text-white',
      border: 'border-purple-200',
      text: 'text-purple-800',
      icon: Video,
      colorHex: '#9333ea',
      lightHex: '#f3e8ff'
    },
    'Web Site development': {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      tagBg: 'bg-emerald-600 text-white',
      border: 'border-emerald-200',
      text: 'text-emerald-800',
      icon: Globe,
      colorHex: '#059669',
      lightHex: '#ecfdf5'
    },
    'Govt. Service (Appl.)': {
      bg: 'bg-blue-50 text-blue-700 border-blue-100',
      tagBg: 'bg-blue-600 text-white',
      border: 'border-blue-200',
      text: 'text-blue-800',
      icon: FileText,
      colorHex: '#2563eb',
      lightHex: '#eff6ff'
    },
    'PC Repair': {
      bg: 'bg-amber-50 text-amber-700 border-amber-100',
      tagBg: 'bg-amber-600 text-white',
      border: 'border-amber-200',
      text: 'text-amber-800',
      icon: Wrench,
      colorHex: '#d97706',
      lightHex: '#fef3c7'
    },
    'Graphic Designing': {
      bg: 'bg-rose-50 text-rose-700 border-rose-100',
      tagBg: 'bg-rose-600 text-white',
      border: 'border-rose-200',
      text: 'text-rose-800',
      icon: Palette,
      colorHex: '#e11d48',
      lightHex: '#fff1f2'
    }
  };

  // Payment method icons / labels mapped
  const paymentMethods = ['Cash', 'UPI/Online', 'Bank Transfer'];
  const categories: Array<'Video editing' | 'Web Site development' | 'Govt. Service (Appl.)' | 'PC Repair' | 'Graphic Designing'> = [
    'Video editing',
    'Web Site development',
    'Govt. Service (Appl.)',
    'PC Repair',
    'Graphic Designing'
  ];

  // Manual Trigger to Sync records
  const handleSyncButton = async () => {
    if (!googleToken) {
      setErrorMessage('Connect your Google Account in settings to sync records online with Google Sheets!');
      return;
    }
    setSyncing(true);
    setErrorMessage('');
    try {
      const local = getLocalSales();
      const result = await syncLocalToSheets(googleToken, local);
      if (result.error) {
        setErrorMessage(result.error);
      } else {
        alert(`Successfully synced ${result.syncedCount} offline sales to Google Sheets!`);
        await loadData(googleToken);
      }
    } catch (err: any) {
      setErrorMessage('Sync error: ' + (err.message || err));
    } finally {
      setSyncing(false);
    }
  };

  // Handle Create Submit
  const handleCreateSale = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.client_name.trim()) return alert('Client Name is required');
    if (!formData.amount || isNaN(Number(formData.amount)) || Number(formData.amount) <= 0) {
      return alert('Enter a valid sales amount');
    }

    setLoading(true);
    try {
      const saleData = {
        sale_date: formData.sale_date,
        category: formData.category,
        client_name: formData.client_name.trim(),
        client_email: formData.client_email.trim() || undefined,
        client_phone: formData.client_phone.trim() || undefined,
        amount: Number(formData.amount),
        status: formData.status,
        payment_method: formData.payment_method,
        description: formData.description.trim() || undefined
      };

      if (googleToken) {
        const created = await insertSheetSale(googleToken, saleData);
        // Cache locally as fallback
        const local = getLocalSales();
        local.unshift(created);
        saveLocalSales(local);
      } else {
        const newId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
        const newCreated = new Date().toISOString();
        const fullSale: Sale = {
          ...saleData,
          id: newId,
          created_at: newCreated
        };
        const local = getLocalSales();
        local.unshift(fullSale);
        saveLocalSales(local);
      }
      
      // Reload from local storage or cloud
      await loadData(googleToken);
      
      // Reset Form State
      setFormData({
        sale_date: new Date().toISOString().split('T')[0],
        category: 'Video editing',
        client_name: '',
        client_email: '',
        client_phone: '',
        amount: '',
        status: 'Paid',
        payment_method: 'UPI/Online',
        description: ''
      });
      setIsAddOpen(false);
    } catch (err: any) {
      setErrorMessage('Failed to capture sale: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Set up values for edit modal
  const openEditModal = (sale: Sale) => {
    setActiveSale(sale);
    setFormData({
      sale_date: sale.sale_date,
      category: sale.category,
      client_name: sale.client_name,
      client_email: sale.client_email || '',
      client_phone: sale.client_phone || '',
      amount: String(sale.amount),
      status: sale.status,
      payment_method: sale.payment_method,
      description: sale.description || ''
    });
    setIsEditOpen(true);
  };

  // Handle Update Submit
  const handleUpdateSale = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeSale) return;
    if (!formData.client_name.trim()) return alert('Client Name is required');
    if (!formData.amount || isNaN(Number(formData.amount)) || Number(formData.amount) <= 0) {
      return alert('Enter a valid sale amount');
    }

    setLoading(true);
    try {
      const updatedItem: Sale = {
        ...activeSale,
        sale_date: formData.sale_date,
        category: formData.category,
        client_name: formData.client_name.trim(),
        client_email: formData.client_email.trim() || undefined,
        client_phone: formData.client_phone.trim() || undefined,
        amount: Number(formData.amount),
        status: formData.status,
        payment_method: formData.payment_method,
        description: formData.description.trim() || undefined
      };

      if (googleToken) {
        await updateSheetSale(googleToken, updatedItem);
        // Cache locally
        const local = getLocalSales();
        const idx = local.findIndex(s => s.id === updatedItem.id);
        if (idx !== -1) {
          local[idx] = updatedItem;
        } else {
          local.push(updatedItem);
        }
        saveLocalSales(local);
      } else {
        const local = getLocalSales();
        const idx = local.findIndex(s => s.id === updatedItem.id);
        if (idx !== -1) {
          local[idx] = updatedItem;
        }
        saveLocalSales(local);
      }

      await loadData(googleToken);
      setIsEditOpen(false);
      setActiveSale(null);
    } catch (err: any) {
      setErrorMessage('Update failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Delete
  const handleDeleteSale = async (id: string) => {
    setLoading(true);
    try {
      if (googleToken) {
        await deleteSheetSale(googleToken, id);
      }
      
      // Update local storage
      const local = getLocalSales();
      const filtered = local.filter(s => s.id !== id);
      saveLocalSales(filtered);

      await loadData(googleToken);
      setIsDetailsOpen(false);
      setIsConfirmingDelete(false);
      setActiveSale(null);
    } catch (err: any) {
      setErrorMessage('Deletion failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // View Details Model
  const showDetails = (sale: Sale) => {
    setActiveSale(sale);
    setIsConfirmingDelete(false);
    setIsDetailsOpen(true);
  };

  // Filter & Search Calculations
  const filteredSales = useMemo(() => {
    let result = [...sales];

    // Search query constraint
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.client_name.toLowerCase().includes(q) ||
          (s.description && s.description.toLowerCase().includes(q)) ||
          s.amount.toString().includes(q)
      );
    }

    // Category check
    if (selectedCategory !== 'All') {
      result = result.filter((s) => s.category === selectedCategory);
    }

    // Status check
    if (selectedStatus !== 'All') {
      result = result.filter((s) => s.status === selectedStatus);
    }

    // Payment method filter
    if (selectedPayment !== 'All') {
      result = result.filter((s) => s.payment_method === selectedPayment);
    }

    // Sort order logic
    result.sort((a, b) => {
      if (sortBy === 'date-desc') {
        return new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime();
      } else if (sortBy === 'date-asc') {
        return new Date(a.sale_date).getTime() - new Date(b.sale_date).getTime();
      } else if (sortBy === 'amount-desc') {
        return b.amount - a.amount;
      } else {
        return a.amount - b.amount;
      }
    });

    return result;
  }, [sales, searchQuery, selectedCategory, selectedStatus, selectedPayment, sortBy]);

  // Aggregate Metrics
  const stats = useMemo(() => {
    let totalSales = 0;
    let pendingSales = 0;
    let refundedSales = 0;
    let videoAmount = 0;
    let websiteAmount = 0;
    let govtApplAmount = 0;
    let repairAmount = 0;
    let graphicAmount = 0;

    sales.forEach((s) => {
      // Overall stats
      if (s.status === 'Paid') {
        totalSales += s.amount;
      } else if (s.status === 'Pending') {
        pendingSales += s.amount;
      } else if (s.status === 'Refunded') {
        refundedSales += s.amount;
      }

      // Breakdown by categories
      if (s.category === 'Video editing') {
        videoAmount += s.amount;
      } else if (s.category === 'Web Site development' || s.category === 'Govt. Services (Website)' as any) {
        websiteAmount += s.amount;
      } else if (s.category === 'Govt. Service (Appl.)') {
        govtApplAmount += s.amount;
      } else if (s.category === 'PC Repair') {
        repairAmount += s.amount;
      } else if (s.category === 'Graphic Designing') {
        graphicAmount += s.amount;
      }
    });

    const categorySummary = {
      'Video editing': videoAmount,
      'Web Site development': websiteAmount,
      'Govt. Service (Appl.)': govtApplAmount,
      'PC Repair': repairAmount,
      'Graphic Designing': graphicAmount
    };

    const maximum = Math.max(videoAmount, websiteAmount, govtApplAmount, repairAmount, graphicAmount, 1);
    const sumAll = videoAmount + websiteAmount + govtApplAmount + repairAmount + graphicAmount || 1;

    return {
      totalSales,
      pendingSales,
      refundedSales,
      categorySummary,
      maximum,
      sumAll
    };
  }, [sales]);

  // Dynamic visual feedback helpers
  const getStatusBadge = (status: 'Paid' | 'Pending' | 'Refunded') => {
    switch (status) {
      case 'Paid':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Paid
          </span>
        );
      case 'Pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Pending
          </span>
        );
      case 'Refunded':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
            Refunded
          </span>
        );
    }
  };

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-100 text-slate-800'} font-sans antialiased flex flex-col md:py-6 md:px-4 items-center justify-start transition-colors duration-200`}>
      
      {/* Container adapting to screen width: smartphone mockup on mobile/tablet, full-scale dashboard on desktop */}
      <div className={`w-full max-w-md lg:max-w-5xl xl:max-w-6xl ${isDark ? 'bg-slate-950 border-slate-800/80 md:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)]' : 'bg-white border-slate-200 md:shadow-[0_20px_50px_rgba(0,0,0,0.1)]'} md:rounded-[40px] overflow-hidden flex flex-col min-h-screen md:min-h-[850px] relative border transition-all duration-200`}>
        
        {/* Smartphone top notched sensor strip for visual character, visible on medium mock viewports but hidden in desktop dashboard mode */}
        <div className={`hidden md:max-lg:flex justify-between items-center px-8 pt-3 pb-2 text-[11px] font-semibold ${isDark ? 'text-slate-500 bg-slate-950 border-slate-900' : 'text-slate-400 bg-slate-50 border-slate-150'} border-b select-none transition-colors duration-200`}>
          <span>Tech4Geeky HQ</span>
          <div className={`w-24 h-4 ${isDark ? 'bg-slate-900' : 'bg-slate-100/80'} rounded-full flex items-center justify-center`}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
            <span className={`text-[9px] ${isDark ? 'text-slate-400' : 'text-slate-650'} font-bold tracking-wider`}>SECURE DB</span>
          </div>
          <span className="opacity-0 w-0 select-none pointer-events-none"></span>
        </div>

        {/* Global App Header */}
        <header className={`sticky top-0 z-20 ${isDark ? 'bg-slate-950/90 border-slate-900' : 'bg-white/95 border-slate-200 text-slate-900'} backdrop-blur-md border-b p-4 transition-colors duration-200`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
                <img 
                  src="https://lh3.googleusercontent.com/d/1kVnKI3jYuJO4QkmBtig52cargj1MGR92" 
                  alt="Tech4Geeky Logo" 
                  className="w-7 h-7 object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <h1 className={`text-lg font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'} flex items-center gap-1.5`}>
                  Tech4Geeky
                  <span className={`text-xs ${isDark ? 'bg-indigo-500/10 text-cyan-400 border-cyan-500/20' : 'bg-indigo-50 text-indigo-600 border-indigo-205'} font-normal px-1.5 py-0.5 rounded border`}>Sales</span>
                </h1>
                <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Mobile Hub &amp; Live Database</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                id="theme-toggle-btn"
                onClick={toggleTheme}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all border active:scale-[0.93] ${
                  isDark 
                    ? 'bg-slate-900/80 hover:bg-slate-800 text-amber-400 border-slate-800' 
                    : 'bg-slate-100 hover:bg-slate-200 text-indigo-600 border-slate-200 shadow-2xs'
                }`}
                title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              <button 
                id="settings-btn"
                onClick={() => setIsSettingsOpen(true)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all border active:scale-[0.93] ${
                  isDark
                    ? 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800'
                    : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600 hover:text-slate-900 border-slate-200'
                }`}
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Database Connection Status Bar */}
          <div className={`mt-3.5 flex items-center justify-between text-xs px-3 py-2 rounded-lg border transition-colors duration-200 ${
            isDark ? 'bg-slate-900/60 border-slate-800/80 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-655'
          }`}>
            <div className="flex items-center gap-2">
              {dbSource === 'sheets' ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Google Sheets Connected</span>
                </>
              ) : (
                <>
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
                  <span className={`font-medium ${isDark ? 'text-slate-300' : 'text-slate-650'}`}>Local Space (Offline Sandbox)</span>
                </>
              )}
            </div>

            {dbSource === 'sheets' ? (
              <button 
                onClick={handleSyncButton}
                disabled={syncing}
                className={`text-[10px] px-2 py-0.5 rounded font-semibold transition border flex items-center gap-1 ${
                  isDark 
                    ? 'bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border-emerald-800/50' 
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                }`}
              >
                <Database className="w-3 h-3" />
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            ) : (
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className={`text-[10px] px-2.5 py-1 rounded font-semibold transition flex items-center gap-1 ${
                  isDark 
                    ? 'bg-slate-800 hover:bg-slate-705 text-slate-300' 
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <Database className={`w-3 h-3 ${isDark ? 'text-amber-400' : 'text-amber-500'}`} />
                Connect Sheets
              </button>
            )}
          </div>

          {errorMessage && (
            <div className={`mt-2.5 p-2 ${
              isDark ? 'bg-rose-950/60 text-rose-300 border-rose-800/50' : 'bg-rose-50 text-rose-805 border-rose-200/80'
            } text-[11px] rounded-lg border flex gap-1.5 items-start`}>
              <Info className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <span className="line-clamp-2">{errorMessage}</span>
            </div>
          )}
        </header>

        {/* Global Tab Content Viewport */}
        <main className="flex-1 overflow-y-auto px-4 py-4 pb-24 space-y-5 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
          
          {/* LEFT PANEL: Analytics & Summary (Desktop side-by-side) */}
          <div className="lg:col-span-5 space-y-5 flex flex-col">
            
            {/* Main Financial Metrics Carousel / Grid */}
          <section className="space-y-3">
            <h2 className={`text-xs font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'} uppercase`}>Sales Performance Summary</h2>
            <div className="grid grid-cols-2 gap-3">
              
              {/* Paid Sales Card */}
              <div className={`p-3.5 bg-gradient-to-br ${
                isDark 
                  ? 'from-emerald-950/30 to-slate-900 border-emerald-500/20' 
                  : 'from-emerald-50/60 to-emerald-100/30 border-emerald-200 shadow-2xs'
              } border rounded-2xl relative overflow-hidden transition-all duration-200`}>
                <div className="absolute top-0 right-0 p-3 text-emerald-400/20">
                  <TrendingUp className="w-12 h-12" />
                </div>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Total Earned</p>
                <p className={`text-2xl font-black ${isDark ? 'text-emerald-400' : 'text-emerald-600'} mt-1`}>₹{stats.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1">
                  <span className={`${isDark ? 'text-emerald-400' : 'text-emerald-600'} font-semibold`}>★ Paid Cash flows</span>
                </div>
              </div>

              {/* Outstanding/Pending Card */}
              <div className={`p-3.5 bg-gradient-to-br ${
                isDark 
                  ? 'from-amber-950/30 to-slate-900 border-amber-500/20' 
                  : 'from-amber-50/60 to-amber-100/30 border-amber-200 shadow-2xs'
              } border rounded-2xl relative overflow-hidden transition-all duration-200`}>
                <div className="absolute top-0 right-0 p-3 text-amber-400/20">
                  <Clock className="w-12 h-12" />
                </div>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Pending Receivables</p>
                <p className={`text-2xl font-black ${isDark ? 'text-amber-400' : 'text-amber-600'} mt-1`}>₹{stats.pendingSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1">
                  <span className={`${isDark ? 'text-amber-400' : 'text-amber-600'} font-semibold`}>⏳ Awaiting Collection</span>
                </div>
              </div>

            </div>

            {/* Visual Bar Chart representing sales performance over time */}
            <div className={`p-4 border rounded-2xl transition-colors duration-200 mt-1 ${
              isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200/80 shadow-3xs'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-[10px] font-black tracking-wider uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Monthly Revenue Chart</span>
                <span className="text-[9px] font-semibold text-slate-400">Monthly Timeline</span>
              </div>
              
              {/* Monthly breakdown columns */}
              <div className="h-28 flex items-end justify-between gap-3 pt-3 px-1 relative border-b border-slate-700/20">
                {/* Horizontal guidelines */}
                <div className="absolute inset-x-0 top-0 border-t border-dashed border-slate-700/10" />
                <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-700/10" />

                {chartData.map((item, index) => {
                  const maxAmount = Math.max(...chartData.map(d => d.amount), 1);
                  const pct = (item.amount / maxAmount) * 100;
                  return (
                    <div key={index} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                      {/* Interactive Hover Tooltip */}
                      <div className="absolute bottom-full mb-1 bg-slate-950 text-white text-[9px] font-black px-1.5 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-lg border border-slate-800">
                        ₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                      
                      {/* Bar Column representation */}
                      <div 
                        className="w-full rounded-t px-0.5 transition-all duration-500 relative overflow-hidden"
                        style={{ 
                          height: `${Math.max(pct, 6)}%`,
                          background: isDark 
                            ? 'linear-gradient(to top, rgba(99, 102, 241, 0.15), rgba(16, 185, 129, 0.9))' 
                            : 'linear-gradient(to top, rgba(99, 102, 241, 0.25), rgba(5, 150, 105, 0.95))'
                        }}
                      >
                        <div className="absolute top-0 inset-x-0 h-0.5 bg-emerald-405 shadow-xs animate-pulse" />
                      </div>

                      {/* Date details below timeline */}
                      <span className="text-[8.5px] font-bold text-slate-500 mt-2 whitespace-nowrap">
                        {item.date}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

          </section>

          {/* Interactive Spark Bars by Service Section */}
          <section className={`p-4 rounded-2xl border transition-colors duration-200 ${isDark ? 'bg-slate-900/60 border-slate-800 space-y-4' : 'bg-slate-50 border-slate-200/80 space-y-4 shadow-3xs'}`}>
            <div className="flex items-center justify-between">
              <h3 className={`text-xs font-black tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'} uppercase`}>Revenue by Category</h3>
            </div>

            <div className="space-y-3.5">
              {categories.map((catKey) => {
                const config = categoryConfig[catKey];
                const catAmount = stats.categorySummary[catKey] || 0;
                const pctOfMax = stats.maximum > 0 ? (catAmount / stats.maximum) * 100 : 0;
                const pctOfTotal = stats.sumAll > 0 ? (catAmount / stats.sumAll) * 100 : 0;
                const Icon = config.icon;

                return (
                  <div key={catKey} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${config.bg} border`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{catKey}</span>
                      </div>
                      <div className="text-right border-0">
                        <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>₹{catAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Information Notice explaining the setup capability */}
          {!googleToken && (
            <section className={`p-3.5 rounded-xl border space-y-1 transition-all duration-250 ${
              isDark 
                ? 'bg-gradient-to-r from-amber-950/20 to-slate-900 border-amber-500/20' 
                : 'bg-amber-50/40 border-amber-200 text-slate-800'
            }`}>
              <div className={`flex items-center gap-1.5 text-xs font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>Notice: Local Sandbox Mode</span>
              </div>
              <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-650'} leading-relaxed`}>
                Sales are currently persisting directly to your browser storage. Connect your Google Account in the Cloud Base Settings to automatically sync and record with Google Sheets!
              </p>
            </section>
          )}

          </div>

          {/* RIGHT PANEL: Sales Record Directory (Desktop side-by-side) */}
          <div className="lg:col-span-7 space-y-5 flex flex-col">

          {/* Search, Filter pill and Sort block */}
          <section className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-500" />
              <input
                id="search-input"
                type="text"
                placeholder="Search clients, descriptions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full border text-xs sm:text-sm pl-10 pr-4 py-2.5 rounded-xl transition-all focus:outline-none placeholder-slate-500 ${
                  isDark 
                    ? 'bg-slate-900 border-slate-800 text-slate-100 focus:border-cyan-500' 
                    : 'bg-slate-50 border-slate-200/90 text-slate-800 focus:border-indigo-500 focus:bg-white shadow-3xs'
                }`}
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className={`absolute right-3 top-2.5 text-slate-500 hover:${isDark ? 'text-white' : 'text-slate-900'}`}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Scrolling pill row for easy mobile tapping Filter Category */}
            <div className="overflow-x-auto scrollbar-none flex items-center gap-2 pb-1.5 pt-0.5 select-none -mx-4 px-4">
              <span className="text-[10px] text-slate-500 uppercase font-bold flex-shrink-0">Service:</span>
              <button
                onClick={() => setSelectedCategory('All')}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all duration-150 flex-shrink-0 ${
                  selectedCategory === 'All' 
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10' 
                    : isDark
                      ? 'bg-slate-900 text-slate-400 hover:bg-slate-850 hover:text-white border border-slate-800'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
                }`}
              >
                All Services
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all duration-150 flex-shrink-0 ${
                    selectedCategory === cat 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/15' 
                      : isDark
                        ? 'bg-slate-900 text-slate-400 hover:bg-slate-850 hover:text-white border border-slate-800'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Detailed filter drawers with small selects */}
            <div className="grid grid-cols-2 gap-2">
              {/* Payment Method Select */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-slate-500 uppercase">Payment Method</label>
                <div className="relative">
                  <select
                    value={selectedPayment}
                    onChange={(e) => setSelectedPayment(e.target.value)}
                    className={`w-full text-xs font-medium border rounded-lg p-2 focus:outline-none focus:border-indigo-505 appearance-none cursor-pointer ${
                      isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <option value="All" className={isDark ? "bg-slate-900 text-slate-300" : "bg-white text-slate-800"}>All Payments</option>
                    {paymentMethods.map(p => (
                      <option key={p} value={p} className={isDark ? "bg-slate-900 text-slate-300" : "bg-white text-slate-800"}>{p}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
                </div>
              </div>

              {/* Status Select */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-slate-500 uppercase">Status</label>
                <div className="relative">
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className={`w-full text-xs font-medium border rounded-lg p-2 focus:outline-none focus:border-indigo-505 appearance-none cursor-pointer ${
                      isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <option value="All" className={isDark ? "bg-slate-900 text-slate-300" : "bg-white text-slate-800"}>All Statuses</option>
                    <option value="Paid" className={isDark ? "bg-slate-900 text-slate-300" : "bg-white text-slate-800"}>Paid Only</option>
                    <option value="Pending" className={isDark ? "bg-slate-900 text-slate-300" : "bg-white text-slate-800"}>Pending Only</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Sorting trigger and count indicator */}
            <div className={`flex justify-between items-center p-2 rounded-lg text-xs ${
              isDark ? 'bg-slate-900/30 text-slate-400' : 'bg-slate-100/50 text-slate-600'
            }`}>
              <div className="flex items-center gap-2">
                <span>Showing <b>{filteredSales.length}</b> records</span>
                <button
                  type="button"
                  id="desktop-add-sale-btn"
                  onClick={() => {
                    setFormData({
                      sale_date: new Date().toISOString().split('T')[0],
                      category: 'Video editing',
                      client_name: '',
                      client_email: '',
                      client_phone: '',
                      amount: '',
                      status: 'Paid',
                      payment_method: 'UPI/Online',
                      description: ''
                    });
                    setIsAddOpen(true);
                  }}
                  className="hidden lg:flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] transition-all"
                >
                  <Plus className="w-3 h-3" />
                  <span>Log Sale</span>
                </button>
              </div>
              <div className="flex items-center gap-1">
                <span>By:</span>
                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                  className={`bg-transparent font-bold focus:outline-none cursor-pointer ${
                    isDark ? 'text-indigo-400' : 'text-indigo-605'
                  }`}
                >
                  <option value="date-desc" className={isDark ? "bg-slate-900 text-slate-300" : "bg-white text-slate-800"}>Newest Date</option>
                  <option value="date-asc" className={isDark ? "bg-slate-900 text-slate-300" : "bg-white text-slate-800"}>Oldest Date</option>
                  <option value="amount-desc" className={isDark ? "bg-slate-900 text-slate-300" : "bg-white text-slate-800"}>Amount: High-Low</option>
                  <option value="amount-asc" className={isDark ? "bg-slate-900 text-slate-300" : "bg-white text-slate-800"}>Amount: Low-High</option>
                </select>
              </div>
            </div>
          </section>

          {/* Core Transaction Card Timeline */}
          <section className="space-y-2.5">
            {loading && sales.length === 0 ? (
              <div className="py-12 text-center text-slate-500 space-y-2">
                <RotateCcw className="w-8 h-8 mx-auto animate-spin text-indigo-500" />
                <p className="text-xs">Connecting to Tech4Geeky repositories...</p>
              </div>
            ) : filteredSales.length === 0 ? (
              <div className={`py-12 px-4 rounded-2xl text-center border border-dashed space-y-2 ${
                isDark ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-50 border-slate-205'
              }`}>
                <AlertTriangle className="w-7 h-7 mx-auto text-slate-400" />
                <p className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>No sales data found matching criteria</p>
                <p className="text-[10px] text-slate-505">Tap the floating "+" card at the bottom to register an item.</p>
              </div>
            ) : (
              filteredSales.map((sale) => {
                const config = categoryConfig[sale.category];
                const CatIcon = config.icon;

                return (
                  <div
                    key={sale.id}
                    onClick={() => showDetails(sale)}
                    className={`p-3 border rounded-xl flex items-center justify-between cursor-pointer transition-all hover:scale-[1.01] duration-150 relative overflow-hidden group select-none ${
                      isDark 
                        ? 'bg-slate-900/70 hover:bg-slate-900 active:bg-slate-950 border-slate-800/80 text-white' 
                        : 'bg-slate-50 hover:bg-slate-100/70 active:bg-slate-100 border-slate-150 text-slate-850 shadow-3xs'
                    }`}
                  >
                    {/* Tiny category dynamic vertical badge bar */}
                    <div 
                      className="absolute top-0 left-0 w-1 h-full" 
                      style={{ backgroundColor: config.colorHex }}
                    />
                    
                    <div className="flex items-center gap-2.5 pl-1.5">
                      <div className={`p-2 rounded-lg ${config.bg} border flex-shrink-0`}>
                        <CatIcon className="w-4 h-4" />
                      </div>
                      
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <h4 className={`text-xs font-bold transition-colors line-clamp-1 max-w-[150px] ${
                            isDark ? 'text-slate-100 group-hover:text-indigo-400' : 'text-slate-800 group-hover:text-indigo-600'
                          }`}>
                            {sale.client_name}
                          </h4>
                        </div>
                        <p className={`text-[10px] flex items-center gap-1 ${
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}>
                          <span>{sale.sale_date}</span>
                          <span className={isDark ? "text-slate-700" : "text-slate-300"}>•</span>
                          <span>{sale.payment_method}</span>
                        </p>
                      </div>
                    </div>

                    <div className="text-right flex flex-col items-end gap-1 flex-shrink-0">
                      <div className={`text-xs font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        ₹{sale.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div>
                        {sale.status === 'Paid' ? (
                          <span className={`text-[9px] font-semibold px-2 py-0.5 rounded border ${
                            isDark ? 'bg-emerald-950/80 text-emerald-400 border-emerald-900' : 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                          }`}>Paid</span>
                        ) : sale.status === 'Pending' ? (
                          <span className={`text-[9px] font-semibold px-2 py-0.5 rounded border ${
                            isDark ? 'bg-amber-950/80 text-amber-400 border-amber-900' : 'bg-amber-50 text-amber-700 border-amber-200/80'
                          }`}>Pending</span>
                        ) : (
                          <span className={`text-[9px] font-semibold px-2 py-0.5 rounded border ${
                            isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200/85'
                          }`}>Refund</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </div>

      </main>

        {/* Global Bottom Sticky Action Command Strip */}
        <div className="absolute bottom-4 right-4 z-10">
          <button
            id="fab-add-sale"
            onClick={() => {
              setFormData({
                sale_date: new Date().toISOString().split('T')[0],
                category: 'Video editing',
                client_name: '',
                client_email: '',
                client_phone: '',
                amount: '',
                status: 'Paid',
                payment_method: 'UPI/Online',
                description: ''
              });
              setIsAddOpen(true);
            }}
            className="w-14 h-14 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white flex items-center justify-center shadow-xl shadow-indigo-950/60 transition-transform active:scale-90"
            title="Create Sales Entry"
          >
            <Plus className="w-7 h-7" />
          </button>
        </div>

        {/* ================= MODAL DRAWERS (MOBILE SHEET STYLE OVERLAYS) ================= */}

        {/* SHEETS DETAILED OVERLAYS COVER */}
        {(isAddOpen || isEditOpen || isSettingsOpen || isDetailsOpen) && (
          <div 
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs z-30 transition-opacity" 
            onClick={() => {
              setIsAddOpen(false);
              setIsEditOpen(false);
              setIsSettingsOpen(false);
              setIsDetailsOpen(false);
            }}
          />
        )}

        {/* 1. VIEW SALES DETAILS COMPONENT */}
        {isDetailsOpen && activeSale && (
          <div className={`absolute bottom-0 inset-x-0 lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl lg:max-w-md lg:border lg:inset-x-auto lg:w-full lg:max-h-[85%] rounded-t-[32px] border-t z-40 max-h-[90%] flex flex-col transition-all duration-300 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xl'}`}>
            {/* Grab Bar Header */}
            <div className={`w-12 h-1.5 rounded-full mx-auto my-3 flex-shrink-0 ${isDark ? 'bg-slate-700/80' : 'bg-slate-300'}`} />
            
            {/* Context Header */}
            <div className={`px-5 pb-3 border-b flex items-center justify-between ${isDark ? 'border-slate-850' : 'border-slate-100'}`}>
              <span className={`text-xs font-black uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Sale Details</span>
              <button 
                onClick={() => setIsDetailsOpen(false)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-105 text-slate-500 hover:text-slate-800'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content List */}
            <div className="overflow-y-auto p-5 space-y-4 text-xs font-medium">
              <div className={`flex items-center gap-3 p-4 rounded-xl border ${isDark ? 'bg-slate-950 border-slate-850' : 'bg-slate-50 border-slate-150 shadow-3xs'}`}>
                <div className={`p-2.5 rounded-xl ${categoryConfig[activeSale.category].bg}`}>
                  {(() => {
                    const ConfigIcon = categoryConfig[activeSale.category].icon;
                    return <ConfigIcon className="w-5 h-5" />;
                  })()}
                </div>
                <div>
                  <p className={`text-[10.5px] uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{activeSale.category}</p>
                  <p className={`text-lg font-black mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>₹{activeSale.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>

              {/* Data Blocks */}
              <div className={`space-y-3.5 p-4 rounded-2xl border ${isDark ? 'bg-slate-950/40 border-slate-850' : 'bg-slate-50 border-slate-150/70 shadow-3xs'}`}>
                <div className="flex justify-between items-start">
                  <span className="text-slate-500">CLIENT NAME</span>
                  <span className={`font-bold text-right break-words max-w-[200px] ${isDark ? 'text-white' : 'text-slate-905'}`}>{activeSale.client_name}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-slate-500">SALES DATE</span>
                  <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-905'}`}>{activeSale.sale_date}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">PAYMENT STATUS</span>
                  <span>{getStatusBadge(activeSale.status)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">METHOD</span>
                  <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-905'}`}>{activeSale.payment_method}</span>
                </div>
              </div>

              {activeSale.description && (
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Description Notes</span>
                  <p className={`p-3 rounded-xl leading-relaxed text-xs border whitespace-pre-wrap ${isDark ? 'bg-slate-950 text-slate-300 border-slate-850' : 'bg-slate-50 text-slate-700 border-slate-200/85'}`}>
                    {activeSale.description}
                  </p>
                </div>
              )}

              {/* Action Operations Grid */}
              {!isConfirmingDelete ? (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => {
                      setIsDetailsOpen(false);
                      openEditModal(activeSale);
                    }}
                    className={`py-3 font-bold rounded-xl flex items-center justify-center gap-1.5 border transition ${
                      isDark 
                        ? 'bg-slate-800 hover:bg-slate-705 text-slate-100 border-slate-700' 
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 shadow-3xs'
                    }`}
                  >
                    <Edit className="w-4 h-4" />
                    Edit Entry
                  </button>
                  <button
                    onClick={() => setIsConfirmingDelete(true)}
                    className="py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 transition shadow-xs"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Receipt
                  </button>
                </div>
              ) : (
                <div className={`border rounded-2xl p-4 space-y-3.5 mt-2 transition-colors ${
                  isDark ? 'bg-rose-950/20 border-rose-500/20' : 'bg-rose-50 border-rose-200'
                }`}>
                  <div className="flex items-center gap-2 text-rose-500 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>Confirm Receipt Deletion</span>
                  </div>
                  <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    This will permanently delete this client's sale statement. This action is irreversible. Are you sure you want to proceed?
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setIsConfirmingDelete(false)}
                      className={`py-2 text-[11px] font-bold rounded-lg border transition ${
                        isDark 
                          ? 'bg-slate-850 hover:bg-slate-800 text-slate-300 border-slate-700' 
                          : 'bg-slate-100 hover:bg-slate-205 text-slate-700 border-slate-200'
                      }`}
                    >
                      No, Keep It
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSale(activeSale.id)}
                      className="py-2 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold rounded-lg shadow-sm transition"
                    >
                      Yes, Delete Statement
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. ADD SALES RECORD COMPONENT */}
        {isAddOpen && (
          <div className={`absolute bottom-0 inset-x-0 lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl lg:max-w-lg lg:border lg:inset-x-auto lg:w-full lg:max-h-[85%] rounded-t-[32px] border-t z-40 max-h-[92%] flex flex-col transition-all duration-300 ${
            isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800 shadow-2xl'
          }`}>
            {/* Grab Bar Header */}
            <div className={`w-12 h-1.5 rounded-full mx-auto my-3 flex-shrink-0 ${isDark ? 'bg-slate-700/80' : 'bg-slate-300'}`} />

            <div className={`px-5 pb-3 border-b flex items-center justify-between flex-shrink-0 ${isDark ? 'border-slate-850' : 'border-slate-100'}`}>
              <span className={`text-xs font-black uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Register New Sale</span>
              <button 
                onClick={() => setIsAddOpen(false)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-550 hover:text-slate-800'}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleCreateSale} className="flex-1 overflow-y-auto p-5 space-y-4">
              
              {/* Category picker pills inside form */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase">Service Sector</label>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map((catKey) => {
                    const config = categoryConfig[catKey];
                    const CatIcon = config.icon;
                    const isSelected = formData.category === catKey;

                    return (
                      <button
                        key={catKey}
                        type="button"
                        onClick={() => setFormData({ ...formData, category: catKey })}
                        className={`p-2.5 rounded-xl border flex items-center gap-2 text-left transition-all ${
                          isSelected 
                            ? isDark 
                              ? 'bg-slate-950 border-cyan-500 shadow-md ring-1 ring-cyan-500/20 text-white' 
                              : 'bg-indigo-50 border-indigo-600 text-indigo-900 shadow-sm ring-1 ring-indigo-600/10'
                            : isDark 
                              ? 'bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white' 
                              : 'bg-slate-50 border-slate-200/80 hover:border-slate-300 text-slate-650 hover:text-slate-900'
                        }`}
                      >
                        <div className={`p-1.5 rounded-lg border ${
                          isSelected 
                            ? config.bg 
                            : isDark ? 'bg-slate-855 text-slate-500 border-slate-800' : 'bg-white text-slate-400 border-slate-200'
                        }`}>
                          <CatIcon className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-[10.5px] font-bold line-clamp-1">{catKey}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Amount input */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black tracking-wider text-slate-400 uppercase">Sale Value (INR)</label>
                  <button
                    type="button"
                    onClick={() => setShowCalculator(!showCalculator)}
                    className={`text-[10px] font-bold flex items-center gap-1 transition ${isDark ? 'text-cyan-400 hover:text-cyan-300' : 'text-indigo-600 hover:text-indigo-700'}`}
                  >
                    <Calculator className="w-3 h-3" />
                    <span>{showCalculator ? 'Hide Calculator' : 'Mini Calculator'}</span>
                  </button>
                </div>
                <div className="relative">
                  <span className={`absolute left-3.5 top-2.5 text-lg font-bold ${isDark ? 'text-cyan-400' : 'text-indigo-600'}`}>₹</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="250.00"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className={`w-full border rounded-xl pl-8 pr-4 py-2.5 text-sm font-bold focus:outline-none transition-all ${
                      isDark 
                        ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500 placeholder-slate-600' 
                        : 'bg-slate-50 border-slate-205 text-slate-850 focus:border-indigo-500 placeholder-slate-400'
                    }`}
                  />
                </div>

                {showCalculator && (
                  <div className={`p-2.5 rounded-xl border space-y-2 mt-2 transition-colors duration-200 ${isDark ? 'bg-slate-950 border-slate-850' : 'bg-slate-100 border-slate-200/80 shadow-3xs'}`}>
                    <div className={`rounded-lg border p-2 flex flex-col items-end text-right min-h-[48px] transition-colors duration-200 ${isDark ? 'bg-slate-900 border-slate-850' : 'bg-white border-slate-200'}`}>
                      <div className="text-[9.5px] text-slate-500 font-mono tracking-wider max-w-full break-all">
                        {calcInput || '0'}
                      </div>
                      <div className={`text-xs font-black font-mono mt-0.5 ${isDark ? 'text-cyan-400' : 'text-indigo-600'}`}>
                        {calcResult ? `= ₹${calcResult}` : '₹0'}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-1 font-mono">
                      {[
                        { label: '7', val: '7', action: () => handleCalcPress('7') },
                        { label: '8', val: '8', action: () => handleCalcPress('8') },
                        { label: '9', val: '9', action: () => handleCalcPress('9') },
                        { label: '÷', val: '/', action: () => handleCalcPress('/') },
                        { label: '4', val: '4', action: () => handleCalcPress('4') },
                        { label: '5', val: '5', action: () => handleCalcPress('5') },
                        { label: '6', val: '6', action: () => handleCalcPress('6') },
                        { label: '×', val: '*', action: () => handleCalcPress('*') },
                        { label: '1', val: '1', action: () => handleCalcPress('1') },
                        { label: '2', val: '2', action: () => handleCalcPress('2') },
                        { label: '3', val: '3', action: () => handleCalcPress('3') },
                        { label: '-', val: '-', action: () => handleCalcPress('-') }
                      ].map((btn) => (
                        <button 
                          key={btn.label}
                          type="button" 
                          onClick={btn.action} 
                          className={`p-1.5 text-xs font-black rounded-lg transition-all active:scale-95 ${
                            btn.val === '/' || btn.val === '*' || btn.val === '-'
                              ? isDark ? 'bg-slate-900 hover:bg-slate-850 text-cyan-400' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100'
                              : isDark ? 'bg-slate-900 hover:bg-slate-800 text-slate-200' : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-3xs'
                          }`}
                        >
                          {btn.label}
                        </button>
                      ))}
                      
                      <button 
                        type="button" 
                        onClick={() => handleCalcClear()} 
                        className={`p-1.5 text-xs font-black rounded-lg transition-all active:scale-95 border ${
                          isDark ? 'bg-rose-950/20 text-rose-400 border-rose-900/10' : 'bg-rose-50 hover:bg-rose-100 text-rose-600 border-rose-200'
                        }`}
                      >
                        C
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleCalcPress('0')} 
                        className={`p-1.5 text-xs font-black rounded-lg transition-all active:scale-95 border ${
                          isDark ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-transparent' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-3xs'
                        }`}
                      >
                        0
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleCalcPress('.')} 
                        className={`p-1.5 text-xs font-black rounded-lg transition-all active:scale-95 border ${
                          isDark ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-transparent' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-3xs'
                        }`}
                      >
                        .
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleCalcPress('+')} 
                        className={`p-1.5 text-xs font-black rounded-lg transition-all active:scale-95 border ${
                          isDark ? 'bg-slate-900 hover:bg-slate-850 text-cyan-400 border-transparent' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border-indigo-100'
                        }`}
                      >
                        +
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-1 font-sans">
                      <button 
                        type="button" 
                        onClick={() => handleCalcEvaluate()} 
                        className={`py-1.5 text-white text-[11px] font-bold rounded-lg transition-all active:scale-95 flex items-center justify-center gap-1 ${
                          isDark ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-indigo-600 hover:bg-indigo-700 shadow-3xs'
                        }`}
                      >
                        <span>=</span>
                        <span>Calculate</span>
                      </button>
                      <button 
                        type="button" 
                        disabled={!calcResult || calcResult === 'Error'}
                        onClick={() => handleCalcApply()} 
                        className={`py-1.5 border disabled:opacity-30 disabled:pointer-events-none text-[11px] font-bold rounded-lg transition-all active:scale-95 flex items-center justify-center gap-1 ${
                          isDark 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' 
                            : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 shadow-3xs'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                        <span>Apply &amp; Select</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Client Name */}
              <div className="space-y-1">
                <label className="text-[10px] font-black tracking-wider text-slate-400 uppercase">Client identifier / Project</label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Dev (Tech Vlog)"
                  required
                  value={formData.client_name}
                  onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                  className={`w-full border rounded-xl px-4 py-2.5 text-xs font-medium focus:outline-none transition-all ${
                    isDark 
                      ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500 placeholder-slate-650' 
                      : 'bg-slate-50 border-slate-205 text-slate-800 focus:border-indigo-500 placeholder-slate-400'
                  }`}
                />
              </div>

              {/* Date, Status & Payment in structured mobile grid */}
              <div className={`space-y-3.5 p-3.5 rounded-xl border transition-colors duration-200 ${
                isDark ? 'bg-slate-950/40 border-slate-850' : 'bg-slate-50 border-slate-150'
              }`}>
                
                {/* Date Input */}
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-bold text-slate-400">SALE DATE</span>
                  <input
                    type="date"
                    required
                    value={formData.sale_date}
                    onChange={(e) => setFormData({ ...formData, sale_date: e.target.value })}
                    className={`text-xs font-semibold border rounded px-2.5 py-1.5 focus:outline-none ${
                      isDark 
                        ? 'bg-slate-950 text-white border-slate-850 focus:border-cyan-500' 
                        : 'bg-white text-slate-800 border-slate-205 focus:border-indigo-500'
                    }`}
                  />
                </div>

                <hr className={isDark ? "border-slate-850" : "border-slate-150"} />

                {/* Status Options */}
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-bold text-slate-400">PAYMENT STATUS</span>
                  <div className={`flex p-0.5 rounded-lg border ${
                    isDark ? 'bg-slate-950 border-slate-850' : 'bg-slate-105 border-slate-200'
                  }`}>
                    {(['Paid', 'Pending'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setFormData({ ...formData, status: st })}
                        className={`text-[9.5px] font-black tracking-wider px-2.5 py-1.5 rounded-md transition ${
                          formData.status === st
                            ? st === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20' 
                              : 'bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20'
                            : isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:text-slate-805'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <hr className={isDark ? "border-slate-850" : "border-slate-150"} />

                {/* Payment Method */}
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-bold text-slate-400">PAYMENT METHOD</span>
                  <select
                    value={formData.payment_method}
                    onChange={(e: any) => setFormData({ ...formData, payment_method: e.target.value })}
                    className={`text-xs font-bold border rounded px-2.5 py-1.5 focus:outline-none ${
                      isDark 
                        ? 'bg-slate-950 text-white border-slate-850 focus:border-indigo-500' 
                        : 'bg-white text-slate-800 border-slate-205 focus:border-indigo-500'
                    }`}
                  >
                    {paymentMethods.map(p => (
                      <option key={p} value={p} className={isDark ? 'bg-slate-950 text-white' : 'bg-white text-slate-800'}>{p}</option>
                    ))}
                  </select>
                </div>

              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[10px] font-black tracking-wider text-slate-400 uppercase">Performance note / Details</label>
                <textarea
                  placeholder="Scope of work details, deliverables, revision counts, parts replaced..."
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className={`w-full border rounded-xl px-4 py-2 text-xs focus:outline-none transition-all resize-none ${
                    isDark 
                      ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500 placeholder-slate-650' 
                      : 'bg-slate-50 border-slate-205 text-slate-805 focus:border-indigo-500 placeholder-slate-400'
                  }`}
                />
              </div>

              {/* Action Operations */}
              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-gradient-to-tr from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 rounded-xl text-white font-black text-xs uppercase tracking-wider transition shadow-lg shadow-indigo-950/40 cursor-pointer"
                >
                  Confirm &amp; Log Sale
                </button>
              </div>

            </form>
          </div>
        )}

        {/* 3. EDIT SALES RECORD COMPONENT */}
        {isEditOpen && activeSale && (
          <div className={`absolute bottom-0 inset-x-0 lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl lg:max-w-lg lg:border lg:inset-x-auto lg:w-full lg:max-h-[85%] rounded-t-[32px] border-t z-40 max-h-[92%] flex flex-col transition-all duration-300 ${
            isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800 shadow-2xl'
          }`}>
            {/* Grab Bar Header */}
            <div className={`w-12 h-1.5 rounded-full mx-auto my-3 flex-shrink-0 ${isDark ? 'bg-slate-700/80' : 'bg-slate-300'}`} />

            <div className={`px-5 pb-3 border-b flex items-center justify-between flex-shrink-0 ${isDark ? 'border-slate-850' : 'border-slate-100'}`}>
              <span className="text-xs font-black uppercase tracking-widest text-emerald-500">Modify Record</span>
              <button 
                onClick={() => {
                  setIsEditOpen(false);
                  setActiveSale(null);
                }}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-550 hover:text-slate-800'}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleUpdateSale} className="flex-1 overflow-y-auto p-5 space-y-4">
              
              {/* Category selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase">Service Sector</label>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map((catKey) => {
                    const config = categoryConfig[catKey];
                    const CatIcon = config.icon;
                    const isSelected = formData.category === catKey;

                    return (
                      <button
                        key={catKey}
                        type="button"
                        onClick={() => setFormData({ ...formData, category: catKey })}
                        className={`p-2.5 rounded-xl border flex items-center gap-2 text-left transition-all ${
                          isSelected 
                            ? 'bg-emerald-500/10 border-emerald-500 shadow-md ring-1 ring-emerald-550/20 text-[#05966c]' 
                            : isDark
                              ? 'bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white'
                              : 'bg-slate-50 border-slate-200/80 hover:border-slate-300 text-slate-650 hover:text-slate-900'
                        }`}
                      >
                        <div className={`p-1.5 rounded-lg border ${
                          isSelected 
                            ? config.bg 
                            : isDark ? 'bg-slate-855 text-slate-500 border-slate-800' : 'bg-white text-slate-400 border-slate-200'
                        }`}>
                          <CatIcon className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-[10.5px] font-bold line-clamp-1">{catKey}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Amount */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black tracking-wider text-slate-400 uppercase">Sale Value (INR)</label>
                  <button
                    type="button"
                    onClick={() => setShowCalculator(!showCalculator)}
                    className={`text-[10px] font-bold flex items-center gap-1 transition ${isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-600 hover:text-emerald-700'}`}
                  >
                    <Calculator className="w-3 h-3" />
                    <span>{showCalculator ? 'Hide Calculator' : 'Mini Calculator'}</span>
                  </button>
                </div>
                <div className="relative">
                  <span className={`absolute left-3.5 top-2.5 text-lg font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>₹</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="250.00"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className={`w-full border rounded-xl pl-8 pr-4 py-2.5 text-sm font-bold focus:outline-none transition-all ${
                      isDark 
                        ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-emerald-500 placeholder-slate-600' 
                        : 'bg-slate-50 border-slate-205 text-slate-850 focus:border-emerald-600 placeholder-slate-400'
                    }`}
                  />
                </div>

                {showCalculator && (
                  <div className={`p-2.5 rounded-xl border space-y-2 mt-2 transition-colors duration-200 ${isDark ? 'bg-slate-950 border-slate-850' : 'bg-slate-100 border-slate-200/80 shadow-3xs'}`}>
                    <div className={`rounded-lg border p-2 flex flex-col items-end text-right min-h-[48px] transition-colors duration-200 ${isDark ? 'bg-slate-900 border-slate-850' : 'bg-white border-slate-200'}`}>
                      <div className="text-[9.5px] text-slate-500 font-mono tracking-wider max-w-full break-all">
                        {calcInput || '0'}
                      </div>
                      <div className={`text-xs font-black font-mono mt-0.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        {calcResult ? `= ₹${calcResult}` : '₹0'}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-1 font-mono">
                      {[
                        { label: '7', val: '7', action: () => handleCalcPress('7') },
                        { label: '8', val: '8', action: () => handleCalcPress('8') },
                        { label: '9', val: '9', action: () => handleCalcPress('9') },
                        { label: '÷', val: '/', action: () => handleCalcPress('/') },
                        { label: '4', val: '4', action: () => handleCalcPress('4') },
                        { label: '5', val: '5', action: () => handleCalcPress('5') },
                        { label: '6', val: '6', action: () => handleCalcPress('6') },
                        { label: '×', val: '*', action: () => handleCalcPress('*') },
                        { label: '1', val: '1', action: () => handleCalcPress('1') },
                        { label: '2', val: '2', action: () => handleCalcPress('2') },
                        { label: '3', val: '3', action: () => handleCalcPress('3') },
                        { label: '-', val: '-', action: () => handleCalcPress('-') }
                      ].map((btn) => (
                        <button 
                          key={btn.label}
                          type="button" 
                          onClick={btn.action} 
                          className={`p-1.5 text-xs font-black rounded-lg transition-all active:scale-95 ${
                            btn.val === '/' || btn.val === '*' || btn.val === '-'
                              ? isDark ? 'bg-slate-900 hover:bg-slate-850 text-emerald-400' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-100 shadow-3xs'
                              : isDark ? 'bg-slate-900 hover:bg-slate-800 text-slate-200' : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-3xs'
                          }`}
                        >
                          {btn.label}
                        </button>
                      ))}
                      
                      <button 
                        type="button" 
                        onClick={() => handleCalcClear()} 
                        className={`p-1.5 text-xs font-black rounded-lg transition-all active:scale-95 border ${
                          isDark ? 'bg-rose-950/20 text-rose-400 border-rose-900/10' : 'bg-rose-50 hover:bg-rose-100 text-rose-600 border-rose-200'
                        }`}
                      >
                        C
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleCalcPress('0')} 
                        className={`p-1.5 text-xs font-black rounded-lg transition-all active:scale-95 border ${
                          isDark ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-transparent' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-3xs'
                        }`}
                      >
                        0
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleCalcPress('.')} 
                        className={`p-1.5 text-xs font-black rounded-lg transition-all active:scale-95 border ${
                          isDark ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-transparent' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-3xs'
                        }`}
                      >
                        .
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleCalcPress('+')} 
                        className={`p-1.5 text-xs font-black rounded-lg transition-all active:scale-95 border ${
                          isDark ? 'bg-slate-900 hover:bg-slate-850 text-emerald-400 border-transparent' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border-emerald-100'
                        }`}
                      >
                        +
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-1 font-sans">
                      <button 
                        type="button" 
                        onClick={() => handleCalcEvaluate()} 
                        className={`py-1.5 text-white text-[11px] font-bold rounded-lg transition-all active:scale-95 flex items-center justify-center gap-1 ${
                          isDark ? 'bg-emerald-600 hover:bg-emerald-550' : 'bg-emerald-600 hover:bg-emerald-700 shadow-3xs'
                        }`}
                      >
                        <span>=</span>
                        <span>Calculate</span>
                      </button>
                      <button 
                        type="button" 
                        disabled={!calcResult || calcResult === 'Error'}
                        onClick={() => handleCalcApply()} 
                        className={`py-1.5 border disabled:opacity-30 disabled:pointer-events-none text-[11px] font-bold rounded-lg transition-all active:scale-95 flex items-center justify-center gap-1 ${
                          isDark 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' 
                            : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-105 shadow-3xs'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                        <span>Apply &amp; Select</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Client Name */}
              <div className="space-y-1">
                <label className="text-[10px] font-black tracking-wider text-slate-400 uppercase">Client identifier / Project</label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Dev (Tech Vlog)"
                  required
                  value={formData.client_name}
                  onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                  className={`w-full border rounded-xl px-4 py-2.5 text-xs font-medium focus:outline-none transition-all ${
                    isDark 
                      ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-emerald-500 placeholder-slate-650' 
                      : 'bg-slate-50 border-slate-205 text-slate-800 focus:border-emerald-600 placeholder-slate-400'
                  }`}
                />
              </div>

              {/* Configuration Settings Box */}
              <div className={`space-y-3.5 p-3.5 rounded-xl border transition-colors duration-200 ${
                isDark ? 'bg-slate-950/40 border-slate-850' : 'bg-slate-50 border-slate-150'
              }`}>
                
                {/* Date Input */}
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-bold text-slate-400">SALE DATE</span>
                  <input
                    type="date"
                    required
                    value={formData.sale_date}
                    onChange={(e) => setFormData({ ...formData, sale_date: e.target.value })}
                    className={`text-xs font-semibold border rounded px-2.5 py-1.5 focus:outline-none ${
                      isDark 
                        ? 'bg-slate-950 text-white border-slate-850 focus:border-emerald-500' 
                        : 'bg-white text-slate-800 border-slate-205 focus:border-emerald-600'
                    }`}
                  />
                </div>

                <hr className={isDark ? "border-slate-850" : "border-slate-150"} />

                {/* Status Selection */}
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-bold text-slate-400">PAYMENT STATUS</span>
                  <div className={`flex p-0.5 rounded-lg border ${
                    isDark ? 'bg-slate-950 border-slate-850' : 'bg-slate-105 border-slate-200'
                  }`}>
                    {(['Paid', 'Pending'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setFormData({ ...formData, status: st })}
                        className={`text-[9.5px] font-black tracking-wider px-2.5 py-1.5 rounded-md transition ${
                          formData.status === st
                            ? st === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20' 
                              : 'bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20'
                            : isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:text-slate-805'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <hr className={isDark ? "border-slate-850" : "border-slate-150"} />

                {/* Payment Method */}
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-bold text-slate-400">PAYMENT METHOD</span>
                  <select
                    value={formData.payment_method}
                    onChange={(e: any) => setFormData({ ...formData, payment_method: e.target.value })}
                    className={`text-xs font-bold border rounded px-2.5 py-1.5 focus:outline-none ${
                      isDark 
                        ? 'bg-slate-950 text-white border-slate-850 focus:border-emerald-550' 
                        : 'bg-white text-slate-800 border-slate-205 focus:border-emerald-600'
                    }`}
                  >
                    {paymentMethods.map(p => (
                      <option key={p} value={p} className={isDark ? 'bg-slate-950 text-white' : 'bg-white text-slate-800'}>{p}</option>
                    ))}
                  </select>
                </div>

              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[10px] font-black tracking-wider text-slate-400 uppercase">Performance note / Details</label>
                <textarea
                  placeholder="Scope of work details..."
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className={`w-full border rounded-xl px-4 py-2 text-xs focus:outline-none transition-all resize-none ${
                    isDark 
                      ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-emerald-500 placeholder-slate-650' 
                      : 'bg-slate-50 border-slate-205 text-slate-805 focus:border-emerald-650 placeholder-slate-400'
                  }`}
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white font-black text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-950/20 cursor-pointer"
                >
                  Save Changes
                </button>
              </div>

            </form>
          </div>
        )}

        {/* 4. GOOGLE DRIVE & GOOGLE SHEETS BASE CONFIGS COMPONENT (SETTINGS MENU) */}
        {isSettingsOpen && (
          <div className="absolute bottom-0 inset-x-0 lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl lg:max-w-lg lg:border lg:inset-x-auto lg:w-full lg:max-h-[85%] bg-slate-900 rounded-t-[32px] border-t border-slate-800 z-40 max-h-[94%] flex flex-col transition-all duration-300">
            <div className="pt-5 px-5 pb-3 border-b border-slate-850 flex items-center justify-between flex-shrink-0">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Database className="w-4 h-4 text-indigo-400" />
                Google Workspace Connection
              </span>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 font-medium text-xs">
              
              {/* Connection State Info card */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <p className="text-slate-500 text-[10px] uppercase">ACTIVE DRIVER</p>
                  <p className="text-sm font-bold text-white mt-0.5">
                    {googleToken ? 'Google Sheets cloud database' : 'Local Sandbox Client'}
                  </p>
                  {user && (
                    <p className="text-[10px] text-slate-400 mt-1 font-mono">
                      Connected: {user.email || 'Authorized User'}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {googleToken ? (
                    <span className="px-2.5 py-1 text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-900 rounded-full font-bold">● Connected</span>
                  ) : (
                    <span className="px-2.5 py-1 text-[10px] bg-amber-950 text-amber-400 border border-amber-900 rounded-full font-bold">♟ Sandbox Offline</span>
                  )}
                </div>
              </div>

              {/* Target Spreadsheet Configuration */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-850 space-y-3">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider block">
                    Target Google Sheet ID / Link
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={sheetInput}
                      onChange={(e) => setSheetInput(e.target.value)}
                      placeholder="Paste sheet URL or spreadsheet ID"
                      className="flex-1 bg-slate-900 border border-slate-800 text-xs px-3 py-2 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!sheetInput.trim()) {
                          alert('Please enter a valid Google Sheet URL or ID.');
                          return;
                        }
                        const updatedId = setSpreadsheetId(sheetInput);
                        setSheetInput(updatedId);
                        
                        if (googleToken) {
                          setLoading(true);
                          try {
                            await loadData(googleToken);
                            alert('Google Sheet database target updated and reloaded!');
                          } catch (err: any) {
                            alert('Failed to reload data: ' + err.message);
                          } finally {
                            setLoading(false);
                          }
                        } else {
                          alert('Sheet configuration saved! Sign in to Google Workspace to read and write records.');
                        }
                      }}
                      className="px-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-bold transition flex items-center justify-center cursor-pointer text-[11px]"
                    >
                      Apply
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Active Sheet ID: <code className="text-cyan-400 bg-slate-900 px-1.5 py-0.5 rounded font-mono break-all">{localStorage.getItem('tech4geeky_google_sheet_id') || '1yE9_IElbygv0tMCTLS7en-HsdxigwQKk'}</code>
                  </p>
                  <p className="text-[9.5px] text-slate-555 leading-relaxed">
                    If missing, we will automatically set up a sub-sheet tab named <b className="text-slate-400">"SalesList"</b>, configure tracking columns, and keep it synchronized.
                  </p>
                </div>
              </div>

              {/* Login / Actions Controls */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-850 space-y-3.5">
                {!googleToken ? (
                  <div className="space-y-3 text-center">
                    <p className="text-[11px] text-slate-355 leading-relaxed text-left">
                      To persist and query sales from Google Sheets, sign in using your Google account with Sheets and Drive permission:
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          setLoading(true);
                          const result = await googleSignIn();
                          if (result) {
                            setUser(result.user);
                            setGoogleToken(result.accessToken);
                            await loadData(result.accessToken);
                          }
                        } catch (err: any) {
                          setErrorMessage('Sign-in failed: ' + err.message);
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-950/20"
                    >
                      <User className="w-4 h-4" />
                      Sign in with Google Account
                    </button>
                    <p className="text-[9px] text-slate-500 mt-1.5">
                      This will connect to your active sheet database in Google Drive.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      You are authenticated. Your active database live spreadsheet resides on your personal Google Drive.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const sheetId = localStorage.getItem('tech4geeky_google_sheet_id');
                          if (sheetId) {
                            window.open(`https://docs.google.com/spreadsheets/d/${sheetId}`, '_blank');
                          } else {
                            alert('Google Sheet database has not been initialized yet. Create or load a record first!');
                          }
                        }}
                        className="py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 font-semibold text-center flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                        Open Sheet
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm('Are you sure you want to log out from GDrive database connectivity?')) {
                            setLoading(true);
                            await logout();
                            setUser(null);
                            setGoogleToken(null);
                            await loadData(null);
                            setLoading(false);
                            setIsSettingsOpen(false);
                          }
                        }}
                        className="py-2 px-3 bg-slate-900 hover:bg-red-950/30 hover:text-red-400 border border-slate-800 hover:border-red-900/50 rounded-lg text-slate-400 font-semibold text-center flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        Sign Out
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleSyncButton}
                      disabled={syncing}
                      className="w-full mt-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {syncing ? (
                        <>
                          <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                          <span>Syncing...</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Synergize / Push Offline Work</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Backup Client Utilities */}
              <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-850 space-y-3.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Sandbox & Backup Operations</span>
                
                <div className="grid grid-cols-2 gap-2">
                  {/* Export CSV */}
                  <button
                    type="button"
                    onClick={() => {
                      if (sales.length === 0) return alert('No performance sales recorded yet.');
                      const headers = ['id', 'sale_date', 'category', 'client_name', 'amount', 'status', 'payment_method', 'description'];
                      const csvRows = [headers.join(',')];
                      
                      sales.forEach(s => {
                        const row = [
                          s.id,
                          JSON.stringify(s.sale_date),
                          JSON.stringify(s.category),
                          JSON.stringify(s.client_name),
                          s.amount,
                          JSON.stringify(s.status),
                          JSON.stringify(s.payment_method),
                          JSON.stringify(s.description || '')
                        ];
                        csvRows.push(row.join(','));
                      });

                      const csvBlob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
                      const url = URL.createObjectURL(csvBlob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `tech4geeky_sales_${new Date().toISOString().split('T')[0]}.csv`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    }}
                    className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-[11px] font-semibold text-slate-300 transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    Download CSV
                  </button>

                  {/* Seed Restore */}
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Reset local sales state back to system seed defaults? This clears custom local changes!')) {
                        localStorage.removeItem('tech4geeky_sales_data');
                        loadData(googleToken);
                        setIsSettingsOpen(false);
                      }
                    }}
                    className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-[11px] font-semibold text-slate-300 transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                    Reset Seeds
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
