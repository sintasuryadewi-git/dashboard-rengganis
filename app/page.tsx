"use client";

import React, { useEffect, useState, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area 
} from 'recharts';
import { ArrowUpRight, ArrowDownRight, Wallet, TrendingUp, ShoppingBag, AlertCircle, Calendar } from 'lucide-react';
import { 
  format, startOfMonth, endOfMonth, isWithinInterval, parse, 
  subDays, differenceInDays, startOfDay, endOfDay, eachMonthOfInterval, subMonths 
} from 'date-fns';
import { id } from 'date-fns/locale';

// --- KONFIGURASI LINK CSV ---
const URL_OMSET = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTWtMR7ARzvb7uoojhGE1o3wWWoFk1nOZ7bqy7ebS5Hv3H7DS5lIt4dtNaW_hvBMlu116i6EuzHlIpN/pub?gid=810592588&single=true&output=csv"; 
const URL_BIAYA = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTWtMR7ARzvb7uoojhGE1o3wWWoFk1nOZ7bqy7ebS5Hv3H7DS5lIt4dtNaW_hvBMlu116i6EuzHlIpN/pub?gid=1688819356&single=true&output=csv"; 

// --- Tipe Data ---
interface DataOmset {
  Tanggal: string;
  Channel_Penjualan: string;
  Metode_Pembayaran: string;
  Nominal_Omset: string;
}

interface DataBiaya {
  Tanggal: string;
  Kategori_Biaya: string;
  Nominal_Biaya: string;
}

// Warna Chart
const COLORS_COST = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6']; 
const COLOR_OFFLINE = '#F97316'; 
const COLOR_ONLINE = '#6366F1';  

export default function Dashboard() {
  const [rawOmset, setRawOmset] = useState<DataOmset[]>([]);
  const [rawBiaya, setRawBiaya] = useState<DataBiaya[]>([]);
  const [loading, setLoading] = useState(true);

  // --- SETTING DEFAULT: 6 BULAN TERAKHIR ---
  const [startDate, setStartDate] = useState<Date>(subMonths(new Date(), 6)); 
  const [endDate, setEndDate] = useState<Date>(endOfDay(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<string>(""); 

  // --- Helper Functions (CRITICAL UPDATES) ---
  
  // 1. Parse Tanggal (Support Indo & US)
  const parseDate = (dateStr: string, formatStr: string) => {
    if (!dateStr) return new Date();
    try {
      const parsed = parse(dateStr, formatStr, new Date());
      if (!isNaN(parsed.getTime())) return parsed;
      
      // Fallback
      const parsedMachine = new Date(dateStr);
      if (!isNaN(parsedMachine.getTime())) return parsedMachine;
      
      return new Date(); 
    } catch { return new Date(); }
  };

  // 2. Parse Rupiah (FIX FORMAT: 141.000,00)
  const parseRupiah = (val: string) => {
    if (!val) return 0;
    let str = val.toString();
    
    // Hapus titik (pemisah ribuan) -> "141000,00"
    str = str.replace(/\./g, '');
    
    // Ambil angka SEBELUM koma saja -> "141000"
    str = str.split(',')[0];
    
    // Hapus karakter aneh sisa (misal "Rp" atau spasi)
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
        const [resOmset, resBiaya] = await Promise.all([fetch(URL_OMSET), fetch(URL_BIAYA)]);
        const textOmset = await resOmset.text();
        const textBiaya = await resBiaya.text();
        
        setRawOmset(Papa.parse(textOmset, { header: true, skipEmptyLines: true }).data as DataOmset[]);
        setRawBiaya(Papa.parse(textBiaya, { header: true, skipEmptyLines: true }).data as DataBiaya[]);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // --- 2. Filter & Process Data ---
  const filteredData = useMemo(() => {
    
    // A. Filter OMSET (dd/MM/yyyy)
    const omset = rawOmset.filter(item => {
      if (!item.Tanggal) return false;
      const d = parseDate(item.Tanggal, 'dd/MM/yyyy'); 
      return isWithinInterval(d, { start: startOfDay(startDate), end: endOfDay(endDate) });
    });

    // B. Filter BIAYA (MM/dd/yyyy)
    const biaya = rawBiaya.filter(item => {
      if (!item.Tanggal) return false;
      const d = parseDate(item.Tanggal, 'M/d/yyyy'); 
      return isWithinInterval(d, { start: startOfDay(startDate), end: endOfDay(endDate) });
    });

    let totalOmset = 0;
    let omsetOnline = 0;
    let omsetOffline = 0;

    omset.forEach(item => {
      const val = parseRupiah(item.Nominal_Omset);
      totalOmset += val;
      const channel = item.Channel_Penjualan?.toLowerCase() || '';
      if (channel.includes('offline') || channel.includes('kedai')) {
        omsetOffline += val;
      } else {
        omsetOnline += val;
      }
    });

    const totalBiaya = biaya.reduce((acc, curr) => acc + parseRupiah(curr.Nominal_Biaya), 0);

    const diffDays = differenceInDays(endDate, startDate) + 1;
    const prevStart = subDays(startDate, diffDays);
    const prevEnd = subDays(endDate, diffDays);
    const prevOmset = rawOmset
      .filter(item => item.Tanggal && isWithinInterval(parseDate(item.Tanggal, 'dd/MM/yyyy'), { start: startOfDay(prevStart), end: endOfDay(prevEnd) }))
      .reduce((acc, curr) => acc + parseRupiah(curr.Nominal_Omset), 0);

    return { omset, biaya, totalOmset, omsetOnline, omsetOffline, totalBiaya, prevOmset };
  }, [rawOmset, rawBiaya, startDate, endDate]);

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

  // --- 3. Prepare Chart Data ---
  const chartData = useMemo(() => {
    const diffDays = differenceInDays(endDate, startDate);
    const isMonthlyView = diffDays > 60; 

    // Chart Trend
    const trendMap = filteredData.omset.reduce((acc: any, curr) => {
      const d = parseDate(curr.Tanggal, 'dd/MM/yyyy');
      const key = isMonthlyView ? format(d, 'MMM yyyy', { locale: id }) : format(d, 'dd MMM', { locale: id });
      const sortKey = isMonthlyView ? startOfMonth(d).getTime() : startOfDay(d).getTime();
      
      if (!acc[sortKey]) {
        acc[sortKey] = { name: key, value: 0, sortKey };
      }
      acc[sortKey].value += parseRupiah(curr.Nominal_Omset);
      return acc;
    }, {});

    const trendSeries = Object.values(trendMap).sort((a: any, b: any) => a.sortKey - b.sortKey);

    const dataOnlineVsOffline = [
      { name: 'Offline (Kedai)', value: filteredData.omsetOffline, color: COLOR_OFFLINE },
      { name: 'Online (Apps)', value: filteredData.omsetOnline, color: COLOR_ONLINE }
    ];

    const chMap = filteredData.omset.reduce((acc: any, curr) => {
      const k = curr.Channel_Penjualan || 'Lainnya';
      acc[k] = (acc[k] || 0) + parseRupiah(curr.Nominal_Omset);
      return acc;
    }, {});
    const channel = Object.keys(chMap).map(k => ({ name: k, value: chMap[k] }));

    const costMap = filteredData.biaya.reduce((acc: any, curr) => {
      const k = curr.Kategori_Biaya || 'Umum';
      acc[k] = (acc[k] || 0) + parseRupiah(curr.Nominal_Biaya);
      return acc;
    }, {});
    const cost = Object.keys(costMap).map(k => ({ name: k, value: costMap[k] }));

    return { trendSeries, dataOnlineVsOffline, channel, cost, isMonthlyView };
  }, [filteredData, startDate, endDate]);

  if (loading) return <div className="flex h-screen items-center justify-center text-gray-500 animate-pulse">Memuat Data Rengganis...</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* HEADER & FILTER */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col lg:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <ShoppingBag className="text-blue-600" /> Dashboard Rengganis
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              Data Update Terakhir: {format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Dropdown Bulan */}
            <div className="relative">
              <select value={selectedMonth} onChange={handleMonthChange} className="appearance-none bg-gray-50 border border-gray-200 text-gray-700 py-2 pl-4 pr-8 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
                <option value="">Pilih Bulan...</option>
                {monthOptions.map((date) => (
                  <option key={date.toString()} value={format(date, 'yyyy-MM')}>
                    {format(date, 'MMMM yyyy', { locale: id })}
                  </option>
                ))}
              </select>
              <Calendar className="absolute right-3 top-2.5 text-gray-400 w-4 h-4 pointer-events-none" />
            </div>

            <span className="text-gray-300">|</span>

            {/* Custom Date Range */}
            <div className="flex items-center gap-2 bg-gray-50 p-1 px-3 rounded-lg border border-gray-200">
              <span className="text-xs text-gray-400">Dari:</span>
              <input type="date" value={format(startDate, 'yyyy-MM-dd')} onChange={(e) => { setStartDate(new Date(e.target.value)); setSelectedMonth(""); }} className="bg-transparent text-sm text-gray-700 focus:outline-none" />
              <span className="text-xs text-gray-400 ml-2">Sampai:</span>
              <input type="date" value={format(endDate, 'yyyy-MM-dd')} onChange={(e) => { setEndDate(new Date(e.target.value)); setSelectedMonth(""); }} className="bg-transparent text-sm text-gray-700 focus:outline-none" />
            </div>
          </div>
        </div>

        {/* --- KPI CARDS --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex justify-between mb-2">
              <div className="p-2 bg-blue-50 rounded text-blue-600"><TrendingUp size={20}/></div>
              <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">TOTAL OMSET</span>
            </div>
            <h3 className="text-3xl font-bold text-gray-900">{formatIDR(filteredData.totalOmset)}</h3>
            <div className="mt-2">
              {filteredData.prevOmset > 0 && (
                <span className={`text-sm font-bold flex items-center ${filteredData.totalOmset >= filteredData.prevOmset ? 'text-green-600' : 'text-red-600'}`}>
                  {filteredData.totalOmset >= filteredData.prevOmset ? <ArrowUpRight size={16}/> : <ArrowDownRight size={16}/>}
                  {Math.abs(((filteredData.totalOmset - filteredData.prevOmset) / filteredData.prevOmset) * 100).toFixed(1)}%
                  <span className="text-gray-400 font-normal ml-1"> vs periode lalu</span>
                </span>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
             <div className="flex justify-between mb-2">
              <div className="p-2 bg-red-50 rounded text-red-600"><AlertCircle size={20}/></div>
              <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">TOTAL BIAYA</span>
            </div>
            <h3 className="text-3xl font-bold text-gray-900">{formatIDR(filteredData.totalBiaya)}</h3>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
             <div className="flex justify-between mb-2">
              <div className="p-2 bg-green-50 rounded text-green-600"><Wallet size={20}/></div>
              <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">PROFIT BERSIH</span>
            </div>
            <h3 className={`text-3xl font-bold ${filteredData.totalOmset - filteredData.totalBiaya >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatIDR(filteredData.totalOmset - filteredData.totalBiaya)}
            </h3>
          </div>
        </div>

        {/* --- CHART TREND OMSET --- */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-2">
             <div>
               <h4 className="font-bold text-gray-800">Trend Pertumbuhan Omset</h4>
               <p className="text-sm text-gray-500">
                 Periode: {format(startDate, 'dd MMM yyyy', { locale: id })} - {format(endDate, 'dd MMM yyyy', { locale: id })}
               </p>
             </div>
             <span className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-full font-medium">
               {chartData.isMonthlyView ? 'View: Bulanan' : 'View: Harian'}
             </span>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <AreaChart data={chartData.trendSeries}>
                <defs>
                  <linearGradient id="colorOmset" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={11} tickMargin={10} />
                <YAxis fontSize={11} tickFormatter={(val) => `${val/1000000}jt`} />
                <RechartsTooltip formatter={(val: any) => formatIDR(Number(val))} />
                <Area type="monotone" dataKey="value" stroke="#2563eb" fillOpacity={1} fill="url(#colorOmset)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* --- ANALISA PENJUALAN --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-1">
            <h4 className="font-bold text-gray-700 mb-4 text-center">Komposisi Penjualan</h4>
            <div className="h-64 relative">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={chartData.dataOnlineVsOffline} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {chartData.dataOnlineVsOffline.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(val: any) => formatIDR(Number(val))} />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                 <span className="text-xs text-gray-400">Terbanyak</span>
                 <span className="font-bold text-gray-700">{filteredData.omsetOffline > filteredData.omsetOnline ? 'OFFLINE' : 'ONLINE'}</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-2">
            <h4 className="font-bold text-gray-700 mb-6">Detail Channel</h4>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={chartData.channel}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(val) => `${val/1000}k`} />
                  <RechartsTooltip formatter={(val: any) => formatIDR(Number(val))} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* --- COST ANATOMY --- */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h4 className="font-bold text-gray-700 mb-6">Cost Anatomy (Pengeluaran Terbesar)</h4>
            <div className="h-64 md:h-80 w-full">
              <ResponsiveContainer>
                <PieChart>
                  <Pie 
                    data={chartData.cost} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={0} 
                    outerRadius={100} 
                    label={({name, percent}: any) => `${name} ${(percent ? percent * 100 : 0).toFixed(0)}%`}
                    dataKey="value"
                  >
                    {chartData.cost.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS_COST[index % COLORS_COST.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(val: any) => formatIDR(Number(val))} />
                  <Legend layout="vertical" align="right" verticalAlign="middle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

      </div>
    </main>
  );
}