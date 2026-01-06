"use client";

import React, { useEffect, useState, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area, Legend 
} from 'recharts';
import { 
  ArrowUpRight, ArrowDownRight, Wallet, TrendingUp, ShoppingBag, 
  AlertCircle, Calendar, Coins, Calculator, Info, Smartphone, Banknote, Store, PieChart as PieIcon 
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

// --- Warna Chart ---
const COLOR_ONLINE = '#6366F1'; 
const COLOR_OFFLINE = '#F97316';
const COLORS_CHART = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function Dashboard() {
  const [rawOmset, setRawOmset] = useState<any[]>([]);
  const [rawBiaya, setRawBiaya] = useState<any[]>([]);
  const [rawModal, setRawModal] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState<Date>(subMonths(new Date(), 6)); 
  const [endDate, setEndDate] = useState<Date>(endOfDay(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<string>(""); 

  // --- Helpers ---
  const normalizeKeys = (data: any[]) => {
    return data.map(item => {
      const newItem: any = {};
      Object.keys(item).forEach(key => {
        const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_');
        newItem[cleanKey] = item[key];
      });
      return newItem;
    });
  };

  const parseDate = (dateStr: string) => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    try {
      let parsed = parse(dateStr, 'dd/MM/yyyy', new Date());
      if (!isNaN(parsed.getTime())) return parsed;
      parsed = parse(dateStr, 'M/d/yyyy', new Date());
      if (!isNaN(parsed.getTime())) return parsed;
      parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) return parsed;
      return null;
    } catch { return null; }
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

  // --- Fetch Data ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resOmset, resBiaya, resModal] = await Promise.all([
          fetch(URL_OMSET), fetch(URL_BIAYA), fetch(URL_MODAL)
        ]);
        
        const textOmset = await resOmset.text();
        const textBiaya = await resBiaya.text();
        const textModal = await resModal.text();
        
        setRawOmset(normalizeKeys(Papa.parse(textOmset, { header: true, skipEmptyLines: true }).data));
        setRawBiaya(normalizeKeys(Papa.parse(textBiaya, { header: true, skipEmptyLines: true }).data));
        setRawModal(normalizeKeys(Papa.parse(textModal, { header: true, skipEmptyLines: true }).data));
        
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // --- 2. LOGIC FILTER PERIODE (Untuk Scorecard & Laporan Periode Ini) ---
  const periodData = useMemo(() => {
    // A. Filter Tanggal
    const checkFilter = (tgl: string) => {
      const d = parseDate(tgl);
      if (!d) return false;
      return isWithinInterval(d, { start: startOfDay(startDate), end: endOfDay(endDate) });
    };

    const omsetFiltered = rawOmset.filter(item => checkFilter(item.tanggal));
    const biayaFiltered = rawBiaya.filter(item => checkFilter(item.tanggal));
    const modalFiltered = rawModal.filter(item => checkFilter(item.tanggal));

    // B. Hitung Omset (P&L & Cashflow)
    let revenue = 0;
    let omsetOnline = 0;
    let omsetOffline = 0;
    omsetFiltered.forEach(item => {
      const val = parseRupiah(item.nominal_omset);
      revenue += val;
      const ch = (item.channel_penjualan || '').toLowerCase();
      if (ch.includes('offline') || ch.includes('kedai')) omsetOffline += val;
      else omsetOnline += val;
    });

    // C. Logic Biaya (Pemisahan P&L vs Cashflow)
    // P&L Variables
    let pl_hpp = 0;
    let pl_opex = 0;
    
    // Cashflow Variables
    let cf_capex = 0;
    let cf_opex = 0; // Opex versi cashflow (semua yg bukan capex)

    // Chart Data Arrays
    const capexChartData: any = {};
    const opexChartData: any = {};

    biayaFiltered.forEach(item => {
      const val = parseRupiah(item.nominal_biaya);
      const kat = (item.kategori_biaya || '').trim();
      const katLower = kat.toLowerCase();

      // --- LOGIC 1: P&L (Laba Rugi) ---
      // HPP: Bahan Baku & Modal Bahan Baku
      if (katLower === 'bahan baku' || katLower === 'modal bahan baku') {
        pl_hpp += val;
      }
      // OPEX P&L: Operasional, Marketing, Gaji, R&D
      else if (['operasional', 'marketing', 'gaji', 'r&d'].includes(katLower)) {
        pl_opex += val;
      }
      // Note: 'Modal Operasional' tidak masuk P&L (karena Capex)

      // --- LOGIC 2: CASHFLOW (Arus Kas) ---
      // CAPEX: Modal Operasional & Modal Bahan Baku
      if (katLower === 'modal operasional' || katLower === 'modal bahan baku') {
        cf_capex += val;
        // Collect chart data
        capexChartData[kat] = (capexChartData[kat] || 0) + val;
      } else {
        // OPEX CF: Semua yg bukan Capex
        cf_opex += val;
        // Collect chart data
        opexChartData[kat] = (opexChartData[kat] || 0) + val;
      }
    });

    const grossProfit = revenue - pl_hpp;
    const netProfit = grossProfit - pl_opex;

    // --- LOGIC 3: CASHFLOW SUM ---
    let totalModalIn = 0;
    modalFiltered.forEach(item => totalModalIn += parseRupiah(item.nominal_modal));
    
    const cashIn = revenue + totalModalIn;
    const cashOut = cf_capex + cf_opex;
    const netCashflow = cashIn - cashOut;

    // --- LOGIC 4: CHARTS ---
    // Trend Omset
    const diffDays = differenceInDays(endDate, startDate);
    const isMonthlyView = diffDays > 60; 
    const trendMap = omsetFiltered.reduce((acc: any, curr) => {
      const d = parseDate(curr.tanggal);
      if(!d) return acc;
      const key = isMonthlyView ? format(d, 'MMM yyyy', { locale: id }) : format(d, 'dd MMM', { locale: id });
      const sortKey = isMonthlyView ? startOfMonth(d).getTime() : startOfDay(d).getTime();
      if (!acc[sortKey]) { acc[sortKey] = { name: key, value: 0, sortKey }; }
      acc[sortKey].value += parseRupiah(curr.nominal_omset);
      return acc;
    }, {});
    const trendSeries = Object.values(trendMap).sort((a: any, b: any) => a.sortKey - b.sortKey);

    // Capex & Opex Composition
    const capexSeries = Object.keys(capexChartData).map(k => ({ name: k, value: capexChartData[k] }));
    const opexSeries = Object.keys(opexChartData).map(k => ({ name: k, value: opexChartData[k] }));

    return {
      revenue, omsetOnline, omsetOffline,
      pl_hpp, pl_opex, grossProfit, netProfit,
      totalModalIn, cashIn, cashOut, cf_capex, cf_opex, netCashflow,
      trendSeries, capexSeries, opexSeries, isMonthlyView
    };
  }, [rawOmset, rawBiaya, rawModal, startDate, endDate]);


  // --- 3. LOGIC LIFETIME (Untuk BEP / Balik Modal) ---
  // Tidak terpengaruh filter tanggal
  const lifetimeData = useMemo(() => {
    let totalModal = 0;
    rawModal.forEach(item => totalModal += parseRupiah(item.nominal_modal));

    let totalRevenue = 0;
    rawOmset.forEach(item => totalRevenue += parseRupiah(item.nominal_omset));

    let totalHPP = 0;
    let totalOpex = 0;

    rawBiaya.forEach(item => {
      const val = parseRupiah(item.nominal_biaya);
      const kat = (item.kategori_biaya || '').trim().toLowerCase();

      // Logic P&L yang sama diterapkan ke data lifetime
      if (kat === 'bahan baku' || kat === 'modal bahan baku') {
        totalHPP += val;
      }
      else if (['operasional', 'marketing', 'gaji', 'r&d'].includes(kat)) {
        totalOpex += val;
      }
    });

    const lifetimeNetProfit = totalRevenue - totalHPP - totalOpex;
    const sisaModal = totalModal - lifetimeNetProfit;
    const isBEP = lifetimeNetProfit >= totalModal;
    const progressBEP = totalModal > 0 ? (lifetimeNetProfit / totalModal) * 100 : 0;

    return { totalModal, lifetimeNetProfit, sisaModal, isBEP, progressBEP };
  }, [rawOmset, rawBiaya, rawModal]);


  // --- Handlers ---
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
  const monthOptions = eachMonthOfInterval({ start: new Date(2025, 0, 1), end: new Date() });

  if (loading) return <div className="flex h-screen items-center justify-center text-gray-500 animate-pulse">Memuat Data Rengganis...</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans text-slate-800">
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
            <select value={selectedMonth} onChange={handleMonthChange} className="bg-gray-50 border border-gray-200 text-sm py-2 px-4 rounded-lg">
              <option value="">Pilih Bulan...</option>
              {monthOptions.map((date) => (<option key={date.toString()} value={format(date, 'yyyy-MM')}>{format(date, 'MMMM yyyy', { locale: id })}</option>))}
            </select>
            <div className="flex items-center gap-2 bg-gray-50 p-1 px-3 rounded-lg border border-gray-200">
              <input type="date" value={format(startDate, 'yyyy-MM-dd')} onChange={(e) => { setStartDate(new Date(e.target.value)); setSelectedMonth(""); }} className="bg-transparent text-sm focus:outline-none" />
              <span className="text-xs text-gray-400">-</span>
              <input type="date" value={format(endDate, 'yyyy-MM-dd')} onChange={(e) => { setEndDate(new Date(e.target.value)); setSelectedMonth(""); }} className="bg-transparent text-sm focus:outline-none" />
            </div>
          </div>
        </div>

        {/* --- BAGIAN 1: LAPORAN LABA RUGI (P&L) --- */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-blue-600 rounded text-white"><Calculator size={16}/></div>
            <h2 className="text-lg font-bold text-gray-800">Laporan Laba Rugi (Profit & Loss)</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-400 font-semibold mb-1">PENJUALAN (OMSET)</p>
              <h3 className="text-xl font-bold text-blue-600">{formatIDR(periodData.revenue)}</h3>
            </div>
            
            <div className="bg-white p-5 rounded-xl border border-red-100 shadow-sm bg-red-50/30">
              <p className="text-xs text-red-400 font-semibold mb-1">(-) HPP</p>
              <h3 className="text-xl font-bold text-red-600">{formatIDR(periodData.pl_hpp)}</h3>
              <p className="text-[9px] text-gray-400 mt-1">Bahan Baku & Modal BB</p>
            </div>

            <div className="bg-blue-50 p-5 rounded-xl border border-blue-200 shadow-sm">
              <p className="text-xs text-blue-600 font-semibold mb-1">LABA KOTOR</p>
              <h3 className="text-xl font-bold text-blue-800">{formatIDR(periodData.grossProfit)}</h3>
              <p className="text-[9px] text-blue-400 mt-1">Omset - HPP</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-orange-100 shadow-sm bg-orange-50/30">
              <p className="text-xs text-orange-400 font-semibold mb-1">(-) BIAYA OPEX</p>
              <h3 className="text-xl font-bold text-orange-600">{formatIDR(periodData.pl_opex)}</h3>
              <p className="text-[9px] text-gray-400 mt-1">Ops, Mkt, Gaji, R&D</p>
            </div>

            <div className={`p-5 rounded-xl border shadow-sm text-white ${periodData.netProfit >= 0 ? 'bg-gradient-to-br from-green-500 to-emerald-600 border-green-600' : 'bg-gradient-to-br from-red-500 to-red-600 border-red-600'}`}>
              <p className="text-xs text-green-100 font-semibold mb-1">LABA BERSIH</p>
              <h3 className="text-2xl font-bold">{formatIDR(periodData.netProfit)}</h3>
              <p className="text-[9px] text-green-100 mt-1 opacity-80">Net Profit (Performance)</p>
            </div>
          </div>
        </div>

        {/* --- BAGIAN 2: LAPORAN ARUS KAS (CASHFLOW) --- */}
        <div className="space-y-4 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-emerald-600 rounded text-white"><Banknote size={16}/></div>
            <h2 className="text-lg font-bold text-gray-800">Laporan Arus Kas (Cashflow)</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* CASH IN */}
            <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-100">
              <h4 className="font-bold text-emerald-800 flex items-center gap-2 text-sm mb-3">
                <ArrowUpRight size={16}/> UANG MASUK (CASH IN)
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Dari Penjualan</span>
                  <span className="font-medium">{formatIDR(periodData.revenue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Suntikan Modal</span>
                  <span className="font-medium">{formatIDR(periodData.totalModalIn)}</span>
                </div>
                <div className="border-t border-emerald-200 pt-2 flex justify-between font-bold text-emerald-700">
                  <span>TOTAL MASUK</span>
                  <span>{formatIDR(periodData.cashIn)}</span>
                </div>
              </div>
            </div>

            {/* CASH OUT */}
            <div className="bg-red-50 rounded-xl p-5 border border-red-100">
              <h4 className="font-bold text-red-800 flex items-center gap-2 text-sm mb-3">
                <ArrowDownRight size={16}/> UANG KELUAR (CASH OUT)
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">CAPEX (Modal Ops & BB)</span>
                  <span className="font-medium">{formatIDR(periodData.cf_capex)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">OPEX (Lainnya)</span>
                  <span className="font-medium">{formatIDR(periodData.cf_opex)}</span>
                </div>
                <div className="border-t border-red-200 pt-2 flex justify-between font-bold text-red-700">
                  <span>TOTAL KELUAR</span>
                  <span>{formatIDR(periodData.cashOut)}</span>
                </div>
              </div>
            </div>

            {/* NET CASHFLOW */}
            <div className="bg-slate-800 text-white rounded-xl p-5 flex flex-col justify-center items-center text-center">
              <p className="text-xs text-slate-400 font-semibold mb-2">NET CASHFLOW (PERIODE INI)</p>
              <h3 className={`text-3xl font-bold ${periodData.netCashflow >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatIDR(periodData.netCashflow)}
              </h3>
              <p className="text-[10px] text-slate-500 mt-2">
                Surplus / Defisit Kas Riil
              </p>
            </div>
          </div>
        </div>

        {/* --- BAGIAN 3: ANALYTICS CHARTS --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-gray-200">
          
          {/* Chart Trend Omset */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-2">
            <h4 className="font-bold text-gray-700 mb-4 text-sm flex items-center gap-2">
              <TrendingUp size={16}/> Trend Penjualan
            </h4>
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={periodData.trendSeries}>
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
                  <Area type="monotone" dataKey="value" stroke="#3b82f6" fillOpacity={1} fill="url(#colorOmset)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Donut Chart: Online vs Offline */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h4 className="font-bold text-gray-700 mb-4 text-sm flex items-center gap-2">
              <Store size={16}/> Komposisi Online vs Offline
            </h4>
            <div className="h-48 relative">
              <ResponsiveContainer>
                <PieChart>
                  <Pie 
                    data={[
                      { name: 'Offline', value: periodData.omsetOffline },
                      { name: 'Online', value: periodData.omsetOnline }
                    ]} 
                    cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value"
                  >
                    <Cell fill={COLOR_OFFLINE} />
                    <Cell fill={COLOR_ONLINE} />
                  </Pie>
                  <RechartsTooltip formatter={(val: any) => formatIDR(Number(val))} />
                  <Legend verticalAlign="bottom"/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pie Charts: CAPEX vs OPEX Anatomy */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h4 className="font-bold text-gray-700 mb-4 text-sm flex items-center gap-2">
              <PieIcon size={16}/> Struktur Biaya (Cost Anatomy)
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {/* Capex Pie */}
              <div className="h-48">
                <p className="text-xs text-center text-gray-500 mb-2 font-semibold">CAPEX (Modal)</p>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={periodData.capexSeries} cx="50%" cy="50%" innerRadius={0} outerRadius={50} dataKey="value">
                      {periodData.capexSeries.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS_CHART[index % COLORS_CHART.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(val: any) => formatIDR(Number(val))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Opex Pie */}
              <div className="h-48">
                <p className="text-xs text-center text-gray-500 mb-2 font-semibold">OPEX (Operasional)</p>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={periodData.opexSeries} cx="50%" cy="50%" innerRadius={0} outerRadius={50} dataKey="value">
                      {periodData.opexSeries.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS_CHART[(index + 2) % COLORS_CHART.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(val: any) => formatIDR(Number(val))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

        </div>

        {/* --- BAGIAN 4: INVESTMENT STATUS (LIFETIME BEP) --- */}
        <div className="bg-slate-900 rounded-xl p-8 text-white relative overflow-hidden mt-6">
          <div className="absolute top-0 right-0 p-8 opacity-5"><Coins size={120}/></div>
          
          <div className="flex items-center justify-between mb-6 border-b border-slate-700 pb-4">
             <div className="flex items-center gap-3">
               <div className="p-2 bg-yellow-500 rounded text-slate-900"><Wallet size={24}/></div>
               <div>
                 <h2 className="text-xl font-bold text-white">Status Investasi & BEP</h2>
                 <p className="text-sm text-slate-400">Balik Modal Tracker (Lifetime)</p>
               </div>
             </div>
             <div className={`px-4 py-2 rounded font-bold text-sm ${lifetimeData.isBEP ? 'bg-green-500' : 'bg-red-500/20 border border-red-500 text-red-200'}`}>
               {lifetimeData.isBEP ? "SUDAH BALIK MODAL" : "BELUM BALIK MODAL"}
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-4">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Total Modal Disetor</p>
              <p className="text-3xl font-bold text-white">{formatIDR(lifetimeData.totalModal)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Profit Bersih Terkumpul</p>
              <p className={`text-3xl font-bold ${lifetimeData.lifetimeNetProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatIDR(lifetimeData.lifetimeNetProfit)}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">Rumus: Rev(Life) - HPP(Life) - OPEX(Life)</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">
                {lifetimeData.sisaModal <= 0 ? "Surplus Profit" : "Sisa Modal Belum Kembali"}
              </p>
              <p className="text-3xl font-bold text-yellow-400">
                {formatIDR(Math.abs(lifetimeData.sisaModal))}
              </p>
            </div>
          </div>

          {/* Progress Bar BEP */}
          <div className="mt-4">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-slate-300">Progress Balik Modal</span>
              <span className="font-bold text-yellow-400">{lifetimeData.progressBEP.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-4 overflow-hidden">
              <div 
                className={`h-4 rounded-full transition-all duration-1000 ${lifetimeData.isBEP ? 'bg-green-500' : 'bg-yellow-500'}`}
                style={{ width: `${Math.min(lifetimeData.progressBEP, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}