"use client";

import React, { useEffect, useState, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area 
} from 'recharts';
import { 
  ArrowUpRight, ArrowDownRight, Wallet, TrendingUp, ShoppingBag, 
  AlertCircle, Calendar, Coins, Calculator, Info, Smartphone, Table2, Receipt 
} from 'lucide-react';
import { 
  format, startOfMonth, endOfMonth, isWithinInterval, parse, 
  subDays, differenceInDays, startOfDay, endOfDay, eachMonthOfInterval, subMonths 
} from 'date-fns';
import { id } from 'date-fns/locale';

// --- KONFIGURASI LINK CSV ---
const URL_OMSET = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTWtMR7ARzvb7uoojhGE1o3wWWoFk1nOZ7bqy7ebS5Hv3H7DS5lIt4dtNaW_hvBMlu116i6EuzHlIpN/pub?gid=810592588&single=true&output=csv"; 
const URL_BIAYA = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTWtMR7ARzvb7uoojhGE1o3wWWoFk1nOZ7bqy7ebS5Hv3H7DS5lIt4dtNaW_hvBMlu116i6EuzHlIpN/pub?gid=1688819356&single=true&output=csv"; 
const URL_MODAL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTWtMR7ARzvb7uoojhGE1o3wWWoFk1nOZ7bqy7ebS5Hv3H7DS5lIt4dtNaW_hvBMlu116i6EuzHlIpN/pub?gid=850061034&single=true&output=csv"; 

// --- Tipe Data ---
interface DataOmset {
  Tanggal: string;
  Channel_Penjualan: string;
  Nominal_Omset: string;
}

interface DataBiaya {
  Tanggal: string;
  Kategori_Biaya: string;
  Nominal_Biaya: string;
}

interface DataModal {
  Tanggal: string;
  Keterangan: string;
  Nominal_Modal: string;
}

// Warna Chart
const COLOR_ONLINE = '#6366F1'; 
const COLOR_OFFLINE = '#F97316';
const COLORS_COST = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6'];

export default function Dashboard() {
  const [rawOmset, setRawOmset] = useState<DataOmset[]>([]);
  const [rawBiaya, setRawBiaya] = useState<DataBiaya[]>([]);
  const [rawModal, setRawModal] = useState<DataModal[]>([]);
  const [loading, setLoading] = useState(true);

  // Default: 6 Bulan Terakhir
  const [startDate, setStartDate] = useState<Date>(subMonths(new Date(), 6)); 
  const [endDate, setEndDate] = useState<Date>(endOfDay(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<string>(""); 

  // --- Helper Functions ---
  const parseDate = (dateStr: string, formatStr: string) => {
    if (!dateStr) return new Date();
    try {
      const parsed = parse(dateStr, formatStr, new Date());
      if (!isNaN(parsed.getTime())) return parsed;
      const parsedMachine = new Date(dateStr);
      if (!isNaN(parsedMachine.getTime())) return parsedMachine;
      return new Date(); 
    } catch { return new Date(); }
  };

  const parseRupiah = (val: string) => {
    if (!val) return 0;
    let str = val.toString();
    str = str.replace(/\./g, '');
    str = str.split(',')[0];
    str = str.replace(/[^0-9]/g, '');
    return parseInt(str, 10) || 0;
  };

  const formatIDR = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
  };

  // --- 1. Fetch Data ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resOmset, resBiaya, resModal] = await Promise.all([
          fetch(URL_OMSET), fetch(URL_BIAYA), fetch(URL_MODAL)
        ]);
        
        const textOmset = await resOmset.text();
        const textBiaya = await resBiaya.text();
        const textModal = await resModal.text();
        
        setRawOmset(Papa.parse(textOmset, { header: true, skipEmptyLines: true }).data as DataOmset[]);
        setRawBiaya(Papa.parse(textBiaya, { header: true, skipEmptyLines: true }).data as DataBiaya[]);
        setRawModal(Papa.parse(textModal, { header: true, skipEmptyLines: true }).data as DataModal[]);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // --- 2. Filter & Process Data (Utama) ---
  const data = useMemo(() => {
    // 1. Filter Tanggal
    const omsetFiltered = rawOmset.filter(item => {
      if (!item.Tanggal) return false;
      const d = parseDate(item.Tanggal, 'dd/MM/yyyy'); 
      return isWithinInterval(d, { start: startOfDay(startDate), end: endOfDay(endDate) });
    });

    const biayaFiltered = rawBiaya.filter(item => {
      if (!item.Tanggal) return false;
      const d = parseDate(item.Tanggal, 'M/d/yyyy'); 
      return isWithinInterval(d, { start: startOfDay(startDate), end: endOfDay(endDate) });
    });

    // 2. Hitung Omset
    let totalOmset = 0;
    let omsetOffline = 0;
    let omsetOnline = 0;
    omsetFiltered.forEach(item => {
      const val = parseRupiah(item.Nominal_Omset);
      totalOmset += val;
      const channel = item.Channel_Penjualan?.toLowerCase() || '';
      if (channel.includes('offline') || channel.includes('kedai')) omsetOffline += val;
      else omsetOnline += val;
    });

    // 3. Hitung Biaya & Split (CAPEX vs OPEX)
    let grandTotalBiaya = 0;
    let totalCapex = 0; 
    let totalOpex = 0;

    const capexDetails: Record<string, number> = {};
    const opexDetails: Record<string, number> = {};

    biayaFiltered.forEach(item => {
      const val = parseRupiah(item.Nominal_Biaya);
      const kat = item.Kategori_Biaya || 'Umum';
      const katLower = kat.toLowerCase();

      grandTotalBiaya += val;

      if (katLower.includes('modal')) {
        totalCapex += val;
        capexDetails[kat] = (capexDetails[kat] || 0) + val;
      } else {
        totalOpex += val;
        opexDetails[kat] = (opexDetails[kat] || 0) + val;
      }
    });

    // 4. Hitung Profit
    const profitOperasional = totalOmset - totalOpex;

    // 5. Data Trend
    const diffDays = differenceInDays(endDate, startDate);
    const isMonthlyView = diffDays > 60; 
    const trendMap = omsetFiltered.reduce((acc: any, curr) => {
      const d = parseDate(curr.Tanggal, 'dd/MM/yyyy');
      const key = isMonthlyView ? format(d, 'MMM yyyy', { locale: id }) : format(d, 'dd MMM', { locale: id });
      const sortKey = isMonthlyView ? startOfMonth(d).getTime() : startOfDay(d).getTime();
      if (!acc[sortKey]) { acc[sortKey] = { name: key, value: 0, sortKey }; }
      acc[sortKey].value += parseRupiah(curr.Nominal_Omset);
      return acc;
    }, {});
    const trendSeries = Object.values(trendMap).sort((a: any, b: any) => a.sortKey - b.sortKey);

    return {
      totalOmset, omsetOffline, omsetOnline,
      grandTotalBiaya, totalCapex, totalOpex,
      capexDetails, opexDetails,
      profitOperasional, trendSeries, isMonthlyView
    };
  }, [rawOmset, rawBiaya, startDate, endDate]);

  // --- 3. Hitung BEP (Lifetime Data) ---
  const bepData = useMemo(() => {
    const totalModalDisetor = rawModal.reduce((acc, curr) => acc + parseRupiah(curr.Nominal_Modal), 0);
    
    const lifetimeOmset = rawOmset.reduce((acc, curr) => acc + parseRupiah(curr.Nominal_Omset), 0);
    
    // Hitung Lifetime OPEX dan CAPEX
    let lifetimeOpex = 0;
    let lifetimeGrandTotalBiaya = 0; // Total Uang Keluar (Semua)

    rawBiaya.forEach((curr) => {
      const val = parseRupiah(curr.Nominal_Biaya);
      lifetimeGrandTotalBiaya += val; // Semua masuk sini
      if (!curr.Kategori_Biaya?.toLowerCase().includes('modal')) {
        lifetimeOpex += val; // Hanya non-modal masuk OPEX
      }
    });

    const lifetimeProfitOps = lifetimeOmset - lifetimeOpex;
    const sisaModalBelumKembali = totalModalDisetor - lifetimeProfitOps;
    const persentaseBalikModal = totalModalDisetor > 0 ? (lifetimeProfitOps / totalModalDisetor) * 100 : 0;

    return { 
      totalModalDisetor, 
      lifetimeOmset, lifetimeOpex, lifetimeProfitOps, 
      lifetimeGrandTotalBiaya, // <-- VARIABLE BARU BUAT CROSSCHECK
      sisaModalBelumKembali, persentaseBalikModal 
    };
  }, [rawOmset, rawBiaya, rawModal]);

  // --- 4. Misc Handlers ---
  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedMonth(val);
    if (val) {
      const [year, month] = val.split('-').map(Number);
      const newStart = new Date(year, month - 1, 1);
      setStartDate(startOfMonth(newStart));
      setEndDate(endOfMonth(newStart));
    }
  };
  const monthOptions = eachMonthOfInterval({ start: new Date(2025, 5, 1), end: new Date() });

  if (loading) return <div className="flex h-screen items-center justify-center text-gray-500 animate-pulse">Memuat Data Rengganis...</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER & FILTER */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col lg:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <ShoppingBag className="text-blue-600" /> Dashboard Rengganis
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              Periode: {format(startDate, 'dd MMM yyyy', { locale: id })} - {format(endDate, 'dd MMM yyyy', { locale: id })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <select value={selectedMonth} onChange={handleMonthChange} className="appearance-none bg-gray-50 border border-gray-200 text-gray-700 py-2 pl-4 pr-8 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
                <option value="">Pilih Bulan...</option>
                {monthOptions.map((date) => (<option key={date.toString()} value={format(date, 'yyyy-MM')}>{format(date, 'MMMM yyyy', { locale: id })}</option>))}
              </select>
              <Calendar className="absolute right-3 top-2.5 text-gray-400 w-4 h-4 pointer-events-none" />
            </div>
            <span className="text-gray-300">|</span>
            <div className="flex items-center gap-2 bg-gray-50 p-1 px-3 rounded-lg border border-gray-200">
              <span className="text-xs text-gray-400">Dari:</span>
              <input type="date" value={format(startDate, 'yyyy-MM-dd')} onChange={(e) => { setStartDate(new Date(e.target.value)); setSelectedMonth(""); }} className="bg-transparent text-sm text-gray-700 focus:outline-none" />
              <span className="text-xs text-gray-400 ml-2">Sampai:</span>
              <input type="date" value={format(endDate, 'yyyy-MM-dd')} onChange={(e) => { setEndDate(new Date(e.target.value)); setSelectedMonth(""); }} className="bg-transparent text-sm text-gray-700 focus:outline-none" />
            </div>
          </div>
        </div>

        {/* --- SECTION 1: FINANCIAL HIGHLIGHTS --- */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><TrendingUp size={48} className="text-blue-600"/></div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Omset (Gross)</p>
            <h3 className="text-2xl font-bold text-gray-800">{formatIDR(data.totalOmset)}</h3>
            <p className="text-[10px] text-gray-400 mt-2">Pemasukan Kotor (Periode Terpilih)</p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><Wallet size={48} className="text-red-600"/></div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Uang Keluar</p>
            <h3 className="text-2xl font-bold text-gray-800">{formatIDR(data.grandTotalBiaya)}</h3>
            <p className="text-[10px] text-gray-400 mt-2">Belanja Modal + Operasional (Sesuai Filter)</p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-100 bg-blue-50/50 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><AlertCircle size={48} className="text-blue-600"/></div>
            <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-1">Biaya Operasional (OPEX)</p>
            <h3 className="text-2xl font-bold text-blue-700">{formatIDR(data.totalOpex)}</h3>
            <p className="text-[10px] text-blue-400 mt-2">Biaya Rutin (Sesuai Filter)</p>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-6 rounded-xl shadow-lg text-white relative overflow-hidden">
             <div className="absolute top-0 right-0 p-3 opacity-20"><Coins size={48} className="text-white"/></div>
            <p className="text-xs font-semibold text-green-100 uppercase tracking-wider mb-1">Profit Operasional</p>
            <h3 className="text-2xl font-bold">{formatIDR(data.profitOperasional)}</h3>
            <p className="text-[10px] text-green-100 mt-2 flex items-center gap-1">
              <Calculator size={10}/> Rumus: Omset - OPEX (Periode Ini)
            </p>
          </div>
        </div>

        {/* --- SECTION 2: BREAKDOWN PENGELUARAN --- */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <h3 className="font-bold text-gray-700 flex items-center gap-2">
              <Calculator size={18} className="text-gray-400"/> Struktur Biaya (Cost Breakdown)
            </h3>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">Grand Total: {formatIDR(data.grandTotalBiaya)}</span>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2">
            
            {/* KOLOM KIRI: CAPEX */}
            <div className="p-6 border-b lg:border-b-0 lg:border-r border-gray-100">
              <div className="flex justify-between items-center mb-4">
                 <h4 className="font-bold text-orange-600 flex items-center gap-2">
                   1. CAPEX (Belanja Modal)
                   <span className="text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-normal">Investasi Aset</span>
                 </h4>
                 <span className="font-bold text-gray-800">{formatIDR(data.totalCapex)}</span>
              </div>
              
              <div className="space-y-2 pl-4 border-l-2 border-orange-100 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                {Object.keys(data.capexDetails).length === 0 ? (
                  <p className="text-sm text-gray-400 italic">Tidak ada data CAPEX periode ini.</p>
                ) : (
                  Object.entries(data.capexDetails)
                    .sort(([, a], [, b]) => b - a)
                    .map(([name, val], idx) => (
                    <div key={idx} className="flex justify-between text-sm items-center hover:bg-gray-50 p-1 rounded">
                      <span className="text-gray-600 truncate w-2/3">{name}</span>
                      <span className="font-medium text-gray-800">{formatIDR(val)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* KOLOM KANAN: OPEX */}
            <div className="p-6">
               <div className="flex justify-between items-center mb-4">
                 <h4 className="font-bold text-blue-600 flex items-center gap-2">
                   2. OPEX (Biaya Operasional)
                   <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-normal">Pengurang Profit</span>
                 </h4>
                 <span className="font-bold text-gray-800">{formatIDR(data.totalOpex)}</span>
              </div>

              <div className="space-y-2 pl-4 border-l-2 border-blue-100 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                {Object.keys(data.opexDetails).length === 0 ? (
                  <p className="text-sm text-gray-400 italic">Belum ada data OPEX periode ini.</p>
                ) : (
                  Object.entries(data.opexDetails)
                    .sort(([, a], [, b]) => b - a)
                    .map(([name, val], idx) => (
                    <div key={idx} className="flex justify-between text-sm items-center hover:bg-gray-50 p-1 rounded">
                      <span className="text-gray-600 truncate w-2/3">{name}</span>
                      <span className="font-medium text-gray-800">{formatIDR(val)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>

        {/* --- SECTION 3: TREND & CHANNEL --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
           <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-2">
              <div className="flex justify-between items-center mb-6">
                <h4 className="font-bold text-gray-700">Trend Omset</h4>
                <span className="text-[10px] bg-gray-100 px-2 py-1 rounded text-gray-500">
                  {data.isMonthlyView ? 'Bulanan' : 'Harian'}
                </span>
              </div>
              <div className="h-64">
                <ResponsiveContainer>
                  <AreaChart data={data.trendSeries}>
                    <defs>
                      <linearGradient id="colorOmset" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={11} tickMargin={10} />
                    <YAxis fontSize={11} tickFormatter={(val) => `${val/1000}k`} />
                    <RechartsTooltip formatter={(val: any) => formatIDR(Number(val))} />
                    <Area type="monotone" dataKey="value" stroke="#2563eb" fillOpacity={1} fill="url(#colorOmset)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
           </div>

           <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-1">
              <h4 className="font-bold text-gray-700 mb-2 text-center">Komposisi Penjualan</h4>
              <div className="h-48 relative">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie 
                      data={[
                        { name: 'Offline', value: data.omsetOffline, color: COLOR_OFFLINE },
                        { name: 'Online', value: data.omsetOnline, color: COLOR_ONLINE }
                      ]} 
                      cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value"
                    >
                      {[0, 1].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? COLOR_OFFLINE : COLOR_ONLINE} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(val: any) => formatIDR(Number(val))} />
                    <Legend verticalAlign="bottom"/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
           </div>
        </div>

        {/* --- SECTION 4: INVESTMENT STATUS (LIFETIME) --- */}
        <div className="bg-slate-900 rounded-xl p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5"><Coins size={120}/></div>
          
          <div className="flex items-center gap-3 mb-6 border-b border-slate-700 pb-4">
             <div className="p-2 bg-yellow-500 rounded text-slate-900"><Wallet size={24}/></div>
             <div>
               <h2 className="text-xl font-bold text-white">Status Investasi & Balik Modal (BEP)</h2>
               <p className="text-sm text-slate-400">Tracker akumulasi (Sejak Awal Berdiri - Lifetime)</p>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-6">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Total Modal Disetor</p>
              <p className="text-3xl font-bold text-white">{formatIDR(bepData.totalModalDisetor)}</p>
              <p className="text-[10px] text-slate-500 mt-1">Sumber: DB_MODAL</p>
            </div>
            
            {/* INDIKATOR BARU: TOTAL LIFETIME EXPENSE */}
            <div className="relative group">
               <div className="absolute -left-2 top-0 h-full w-1 bg-slate-700 rounded-full"></div>
               <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Total Uang Keluar (Lifetime)</p>
               <p className="text-3xl font-bold text-red-300">{formatIDR(bepData.lifetimeGrandTotalBiaya)}</p>
               <p className="text-[10px] text-slate-500 mt-1">Capex + Opex (Cek Google Sheets)</p>
            </div>

            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Profit Ops. Terkumpul</p>
              <p className={`text-3xl font-bold ${bepData.lifetimeProfitOps >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatIDR(bepData.lifetimeProfitOps)}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">(Omset Lifetime - Opex Lifetime)</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">
                {bepData.sisaModalBelumKembali <= 0 ? "Surplus (Keuntungan)" : "Sisa Modal Belum Kembali"}
              </p>
              <p className="text-3xl font-bold text-yellow-400">
                {formatIDR(Math.abs(bepData.sisaModalBelumKembali))}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">Target Profit yg harus dikejar</p>
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-4 text-xs text-slate-300 space-y-4 border border-slate-700">
            <p className="font-semibold text-white mb-2 flex items-center gap-2">
              <Info size={14}/> Detail Perhitungan Real-Time:
            </p>
            <ul className="list-disc pl-4 space-y-3">
              <li>
                <strong>Profit Operasional Terkumpul:</strong>
                <div className="ml-1 mt-1 text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-600/50 font-mono">
                   {formatIDR(bepData.lifetimeOmset)} (Omset) - {formatIDR(bepData.lifetimeOpex)} (Opex) 
                   = <span className="text-white font-bold">{formatIDR(bepData.lifetimeProfitOps)}</span>
                </div>
              </li>
              <li>
                <strong>Sisa Modal:</strong> 
                <div className="ml-1 mt-1 text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-600/50 font-mono">
                  {formatIDR(bepData.totalModalDisetor)} (Modal) - {formatIDR(bepData.lifetimeProfitOps)} (Profit)
                  = <span className="text-yellow-400 font-bold">{formatIDR(bepData.sisaModalBelumKembali)}</span>
                </div>
              </li>
            </ul>
          </div>
        </div>

      </div>
    </main>
  );
}