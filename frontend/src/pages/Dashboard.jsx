import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import api from '../api/axios';
import { formatCurrency } from '../utils/format';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // State Variables
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' or 'quotes'
  const [hoveredBar, setHoveredBar] = useState(null); // { index, type: 'sales'|'purchases', x, y, value }
  const [hoveredCard, setHoveredCard] = useState(null);
  const [hoveredAction, setHoveredAction] = useState(null);

  // Light / Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('dhaka_blinds_theme');
    return saved ? saved === 'dark' : true; // default to dark theme
  });

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const nextTheme = !prev;
      localStorage.setItem('dhaka_blinds_theme', nextTheme ? 'dark' : 'light');
      return nextTheme;
    });
  };

  const capitalize = (str) => (str ? str.charAt(0).toUpperCase() + str.slice(1) : '');

  const fetchDashboardStats = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/reports/dashboard-stats');
      if (response?.data?.status === 'success') {
        setData(response.data.data);
      } else {
        setError(response?.data?.message || 'Failed to fetch dashboard data.');
      }
    } catch (err) {
      console.error('Dashboard stats error:', err);
      if (err.response) {
        setError(`Server returned status ${err.response.status}: ${err.response.data?.message || 'Backend Server Error'}`);
      } else if (err.request) {
        setError('Laravel Backend Server is not reachable at http://127.0.0.1:8000. Please ensure php artisan serve is running.');
      } else {
        setError(err.message || 'Error connecting to server.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  // Theme Styles Tokens
  const theme = {
    pageBg: isDarkMode ? '#080c14' : '#f8fafc',
    textMain: isDarkMode ? '#f8fafc' : '#0f172a',
    textSub: isDarkMode ? '#94a3b8' : '#475569',
    cardBg: isDarkMode ? 'rgba(15, 23, 42, 0.75)' : '#ffffff',
    cardBorder: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
    cardShadow: isDarkMode ? '0 10px 30px 0 rgba(0, 0, 0, 0.4)' : '0 4px 20px rgba(0,0,0,0.06)',
    itemBg: isDarkMode ? 'rgba(255, 255, 255, 0.025)' : '#f1f5f9',
    itemBorder: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : '#e2e8f0',
    chartGrid: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0',
    chartText: isDarkMode ? '#94a3b8' : '#64748b',
    chartLabel: isDarkMode ? '#cbd5e1' : '#334155',
    accentColor: isDarkMode ? '#00f2fe' : '#0284c7',
  };

  const glassmorphismStyle = {
    background: theme.cardBg,
    backdropFilter: isDarkMode ? 'blur(16px)' : 'none',
    WebkitBackdropFilter: isDarkMode ? 'blur(16px)' : 'none',
    border: `1px solid ${theme.cardBorder}`,
    boxShadow: theme.cardShadow,
  };

  if (loading) {
    return (
      <div className="content-container animate-fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: theme.pageBg }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ border: '4px solid rgba(0,0,0,0.1)', borderLeftColor: '#00f2fe', borderRadius: '50%', width: '50px', height: '50px', animation: 'spin 1s linear infinite', margin: '0 auto 20px', boxShadow: '0 0 15px rgba(0,242,254,0.4)' }}></div>
          <p style={{ color: theme.textSub, fontSize: '15px', fontWeight: 600 }}>Loading Dhaka Blinds Dashboard...</p>
          <style>{`
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          `}</style>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="content-container animate-fade-in" style={{ padding: '24px', background: theme.pageBg, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ ...glassmorphismStyle, padding: '32px', borderRadius: '16px', width: '100%', maxWidth: '560px', textAlign: 'center', borderLeft: '5px solid #ef4444' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '28px', margin: '0 auto 16px' }}>
            📡
          </div>
          <h3 style={{ margin: '0 0 8px 0', fontWeight: 800, fontSize: '20px', color: theme.textMain }}>
            Server Connection Required
          </h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: theme.textSub, lineHeight: 1.5 }}>
            {error}
          </p>

          <div style={{ background: theme.itemBg, padding: '14px', borderRadius: '10px', textAlign: 'left', marginBottom: '24px', border: `1px solid ${theme.itemBorder}`, fontSize: '13px', color: theme.textSub }}>
            <strong style={{ color: theme.textMain, display: 'block', marginBottom: '6px' }}>💡 How to start backend server:</strong>
            <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.6 }}>
              <li>Double-click <code>run_project.bat</code> in the project folder, OR</li>
              <li>Open terminal in <code>becha-kena-erp</code> and run: <code>php artisan serve</code></li>
            </ol>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => fetchDashboardStats()}
              className="btn btn-primary"
              style={{ background: 'linear-gradient(135deg, #0284c7, #00f2fe)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '10px', cursor: 'pointer', fontWeight: 800, fontSize: '14px', boxShadow: '0 4px 15px rgba(2, 132, 199, 0.4)' }}
            >
              🔄 Retry Connection
            </button>
            <button
              onClick={() => setError('')}
              className="btn btn-secondary"
              style={{ background: 'transparent', color: theme.textSub, border: `1px solid ${theme.cardBorder}`, padding: '12px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' }}
            >
              Preview Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Extract data with fallback defaults
  const today = data?.today || {};
  const totals = data?.totals || {};
  const chart = data?.chart || [];
  const recent_orders = data?.recent_orders || [];
  const recent_quotations = data?.recent_quotations || [];
  const top_due_customers = data?.top_due_customers || [];
  const top_selling_products = data?.top_selling_products || [];
  const wallets = data?.wallets || {};

  const todayData = {
    sales: today.sales || 0,
    purchases: today.purchases || 0,
    expenses: today.expenses || 0,
    profit: today.profit || 0,
    collection: today.collection || 0,
  };

  const totalsData = {
    invoices: totals.invoices || 0,
    customers: totals.customers || 0,
    suppliers: totals.suppliers || 0,
    products: totals.products || 0,
  };

  const walletBalances = {
    cash: wallets.cash || 0,
    bank: wallets.bank || 0,
    mobile: wallets.mobile || 0,
  };

  // Formatter for numerical values in chart labels
  const formatChartLabel = (val) => {
    if (val >= 10000000) return `৳${(val / 10000000).toFixed(1)}Cr`;
    if (val >= 100000) return `৳${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `৳${(val / 1000).toFixed(0)}k`;
    return `৳${val}`;
  };

  // SVG Chart Computations
  const chartHeight = 230;
  const chartWidth = 750;
  const paddingLeft = 60;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;
  
  const graphHeight = chartHeight - paddingTop - paddingBottom;
  const graphWidth = chartWidth - paddingLeft - paddingRight;

  const maxChartVal = chart.length > 0 
    ? Math.max(...chart.map((d) => Math.max(d.sales || 0, d.purchases || 0)))
    : 1000;
  const maxVal = Math.max(1000, maxChartVal) * 1.15;

  const chartLength = chart.length || 1;
  const sectionWidth = graphWidth / chartLength;

  // Stats cards metadata
  const cards = [
    {
      title: 'Today Sales',
      value: formatCurrency(todayData.sales),
      color: '#10b981', // Emerald Green
      borderGlow: 'rgba(16, 185, 129, 0.4)',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="36" height="36" style={{ opacity: isDarkMode ? 0.7 : 0.8, color: '#10b981' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
    },
    {
      title: 'Todays Purchase',
      value: formatCurrency(todayData.purchases),
      color: '#0284c7', // Cyan/Teal
      borderGlow: 'rgba(2, 132, 199, 0.4)',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="36" height="36" style={{ opacity: isDarkMode ? 0.7 : 0.8, color: '#0284c7' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      ),
    },
    {
      title: 'Today Expense',
      value: formatCurrency(todayData.expenses),
      color: '#ef4444', // Red
      borderGlow: 'rgba(239, 68, 68, 0.4)',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="36" height="36" style={{ opacity: isDarkMode ? 0.7 : 0.8, color: '#ef4444' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.003 9.003 0 1020.945 13H11V3.055z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
        </svg>
      ),
    },
    {
      title: 'Today Profit',
      value: formatCurrency(todayData.profit),
      color: todayData.profit >= 0 ? '#10b981' : '#ef4444',
      borderGlow: todayData.profit >= 0 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="36" height="36" style={{ opacity: isDarkMode ? 0.7 : 0.8, color: todayData.profit >= 0 ? '#10b981' : '#ef4444' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      title: 'Today Collection',
      value: formatCurrency(todayData.collection),
      color: '#f59e0b', // Amber
      borderGlow: 'rgba(245, 158, 11, 0.4)',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="36" height="36" style={{ opacity: isDarkMode ? 0.7 : 0.8, color: '#f59e0b' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: 'Total Invoice',
      value: totalsData.invoices,
      color: '#10b981', // Green
      borderGlow: 'rgba(16, 185, 129, 0.3)',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="36" height="36" style={{ opacity: isDarkMode ? 0.7 : 0.8, color: '#10b981' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      title: 'Total Customer',
      value: totalsData.customers,
      color: '#3b82f6', // Blue
      borderGlow: 'rgba(59, 130, 246, 0.4)',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="36" height="36" style={{ opacity: isDarkMode ? 0.7 : 0.8, color: '#3b82f6' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      title: 'Total Supplier',
      value: totalsData.suppliers,
      color: '#8b5cf6', // Purple
      borderGlow: 'rgba(139, 92, 246, 0.3)',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="36" height="36" style={{ opacity: isDarkMode ? 0.7 : 0.8, color: '#8b5cf6' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 01-8 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      title: 'Total Product',
      value: totalsData.products,
      color: '#64748b', // Slate
      borderGlow: 'rgba(100, 116, 139, 0.3)',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="36" height="36" style={{ opacity: isDarkMode ? 0.7 : 0.8, color: '#64748b' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
  ];

  // Role-tailored cards filter
  const userRole = user?.role || 'staff';

  const roleCardIndices = {
    admin: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    manager: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    salesman: [0, 4, 5, 6, 8],
    staff: [1, 2, 7, 8],
  };

  const visibleCards = cards.filter((_, idx) => (roleCardIndices[userRole] || roleCardIndices.staff).includes(idx));

  return (
    <div className="content-container animate-fade-in" style={{ padding: '24px', background: theme.pageBg, minHeight: '100vh', position: 'relative', overflow: 'hidden', color: theme.textMain, transition: 'background 0.3s, color 0.3s' }}>
      
      {/* Background ambient glow accents for dark mode */}
      {isDarkMode && (
        <>
          <div style={{ position: 'absolute', width: '350px', height: '350px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, transparent 70%)', top: '-100px', left: '-100px', pointerEvents: 'none', zIndex: 0 }} />
          <div style={{ position: 'absolute', width: '450px', height: '450px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(236, 72, 153, 0.08) 0%, transparent 70%)', bottom: '5%', right: '-100px', pointerEvents: 'none', zIndex: 0 }} />
        </>
      )}

      {/* Header and Theme Switcher Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', position: 'relative', zIndex: 1, flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: theme.textMain, letterSpacing: '-0.5px' }}>
              Dhaka Blinds IMS Portal
            </h1>
            <span style={{ background: userRole === 'admin' ? '#ef4444' : userRole === 'manager' ? '#3b82f6' : userRole === 'salesman' ? '#10b981' : '#f59e0b', color: '#fff', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', padding: '3px 10px', borderRadius: '20px' }}>
              {userRole} Mode
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: theme.textSub, fontWeight: 500 }}>
            Welcome back, <strong style={{ color: theme.textMain }}>{user?.name}</strong>. Here is your role-customized workspace summary.
          </p>
        </div>
        
        {/* Right Action Tools: Date Badge & Theme Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          
          {/* Light / Dark Mode Switcher Button */}
          <button
            onClick={toggleTheme}
            style={{
              ...glassmorphismStyle,
              padding: '10px 16px',
              borderRadius: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              fontSize: '13px',
              color: isDarkMode ? '#ffb800' : '#4f46e5',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.04)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <span>{isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}</span>
          </button>

          <div style={{ ...glassmorphismStyle, padding: '10px 16px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>📅</span>
            <span style={{ fontWeight: 700, color: theme.textMain, fontSize: '13px' }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      {/* Grid of Role-Filtered Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '20px', marginBottom: '28px', position: 'relative', zIndex: 1 }}>
        {visibleCards.map((card, idx) => {
          const isHovered = hoveredCard === idx;
          return (
            <div
              key={idx}
              onMouseEnter={() => setHoveredCard(idx)}
              onMouseLeave={() => setHoveredCard(null)}
              style={{
                ...glassmorphismStyle,
                borderRadius: '14px',
                padding: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
                borderLeft: `4px solid ${card.color}`,
                boxShadow: isHovered 
                  ? (isDarkMode ? `0 15px 30px rgba(0,0,0,0.4), 0 0 15px ${card.borderGlow}` : '0 10px 25px rgba(0,0,0,0.08)') 
                  : theme.cardShadow,
                borderColor: isHovered ? card.color : theme.cardBorder,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                overflow: 'hidden',
                cursor: 'pointer',
              }}
            >
              {isDarkMode && isHovered && (
                <div style={{
                  position: 'absolute',
                  width: '120px',
                  height: '120px',
                  borderRadius: '50%',
                  background: `radial-gradient(circle, ${card.borderGlow} 0%, transparent 70%)`,
                  top: '-20px',
                  left: '-20px',
                  zIndex: 0,
                  pointerEvents: 'none',
                }} />
              )}

              <div style={{ zIndex: 2 }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: theme.textSub, letterSpacing: '0.8px' }}>
                  {card.title}
                </p>
                <h3 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: theme.textMain, letterSpacing: '-0.5px' }}>
                  {card.value}
                </h3>
              </div>
              <div style={{ zIndex: 2, transform: isHovered ? 'scale(1.1)' : 'scale(1)', transition: 'transform 0.3s' }}>
                {card.icon}
              </div>
            </div>
          );
        })}
      </div>

      {/* Row 1 Widgets: Top Selling Products + Liquid Funds + Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '24px', marginBottom: '28px', position: 'relative', zIndex: 1 }}>
        
        {/* Top Selling Products Widget */}
        <div style={{ ...glassmorphismStyle, borderRadius: '16px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: theme.textMain }}>
                🔥 Best Sales Products
              </h2>
              <span style={{ fontSize: '11px', color: theme.textSub }}>Top performing products by total sales</span>
            </div>
            <Link to="/products" style={{ fontSize: '12px', fontWeight: 800, color: theme.accentColor, textDecoration: 'none' }}>
              All Products →
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {top_selling_products.length === 0 ? (
              <p style={{ fontStyle: 'italic', color: theme.textSub, textAlign: 'center', padding: '20px 0', margin: 0 }}>No product sales recorded yet.</p>
            ) : (
              top_selling_products.map((prd, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: theme.itemBg, border: `1px solid ${theme.itemBorder}`, borderRadius: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: isDarkMode ? 'rgba(0,242,254,0.1)' : '#e0f2fe', color: isDarkMode ? '#00c0ef' : '#0284c7', fontWeight: 800, fontSize: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      #{idx + 1}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: theme.textMain }}>{prd.product_name}</div>
                      <div style={{ fontSize: '11px', color: theme.textSub, marginTop: '2px' }}>Code: {prd.product_code}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: '#10b981' }}>{formatCurrency(prd.total_sales)}</div>
                    <div style={{ fontSize: '10px', color: theme.textSub, marginTop: '2px', fontWeight: 600 }}>Qty: {prd.total_qty} pcs</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Cash & Book Balance Widget */}
        <div style={{ ...glassmorphismStyle, borderRadius: '16px', padding: '24px' }}>
          <h2 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: 800, color: theme.textMain }}>
            💳 Liquid Funds Overview
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Cash Wallet */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px', background: theme.itemBg, border: `1px solid ${theme.itemBorder}`, borderRadius: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '18px' }}>
                💵
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', color: theme.textSub, fontWeight: 700, letterSpacing: '0.5px' }}>CASH BOOK BALANCE</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#10b981', marginTop: '3px' }}>{formatCurrency(walletBalances.cash)}</div>
              </div>
            </div>

            {/* Bank Wallet */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px', background: theme.itemBg, border: `1px solid ${theme.itemBorder}`, borderRadius: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', color: isDarkMode ? '#38bdf8' : '#0284c7', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '18px' }}>
                🏦
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', color: theme.textSub, fontWeight: 700, letterSpacing: '0.5px' }}>BANK BOOK BALANCE</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: isDarkMode ? '#38bdf8' : '#0284c7', marginTop: '3px' }}>{formatCurrency(walletBalances.bank)}</div>
              </div>
            </div>

            {/* Mobile Banking Wallet */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px', background: theme.itemBg, border: `1px solid ${theme.itemBorder}`, borderRadius: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.15)', color: isDarkMode ? '#c084fc' : '#7e22ce', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '18px' }}>
                📱
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', color: theme.textSub, fontWeight: 700, letterSpacing: '0.5px' }}>MOBILE BANKING BALANCE</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: isDarkMode ? '#c084fc' : '#7e22ce', marginTop: '3px' }}>{formatCurrency(walletBalances.mobile)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions Panel */}
        <div style={{ ...glassmorphismStyle, borderRadius: '16px', padding: '24px' }}>
          <h2 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: 800, color: theme.textMain }}>
            ⚡ Quick Shortcuts
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              onClick={() => navigate('/quotations')}
              onMouseEnter={() => setHoveredAction(0)}
              onMouseLeave={() => setHoveredAction(null)}
              style={{
                padding: '14px',
                borderRadius: '10px',
                border: `1px solid ${theme.itemBorder}`,
                background: hoveredAction === 0 ? (isDarkMode ? 'rgba(99, 102, 241, 0.15)' : '#e0f2fe') : theme.itemBg,
                cursor: 'pointer',
                textAlign: 'center',
                fontWeight: 700,
                fontSize: '13px',
                color: theme.textMain,
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '18px' }}>➕</span> Create Quotation
            </button>

            <button
              onClick={() => navigate('/vouchers-expenses')}
              onMouseEnter={() => setHoveredAction(1)}
              onMouseLeave={() => setHoveredAction(null)}
              style={{
                padding: '14px',
                borderRadius: '10px',
                border: `1px solid ${theme.itemBorder}`,
                background: hoveredAction === 1 ? (isDarkMode ? 'rgba(99, 102, 241, 0.15)' : '#e0f2fe') : theme.itemBg,
                cursor: 'pointer',
                textAlign: 'center',
                fontWeight: 700,
                fontSize: '13px',
                color: theme.textMain,
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '18px' }}>💸</span> Record Expense
            </button>

            <button
              onClick={() => navigate(userRole === 'admin' ? '/payments' : '/invoices')}
              onMouseEnter={() => setHoveredAction(2)}
              onMouseLeave={() => setHoveredAction(null)}
              style={{
                padding: '14px',
                borderRadius: '10px',
                border: `1px solid ${theme.itemBorder}`,
                background: hoveredAction === 2 ? (isDarkMode ? 'rgba(99, 102, 241, 0.15)' : '#e0f2fe') : theme.itemBg,
                cursor: 'pointer',
                textAlign: 'center',
                fontWeight: 700,
                fontSize: '13px',
                color: theme.textMain,
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '18px' }}>📥</span> Receive Payment
            </button>

            <button
              onClick={() => navigate(userRole === 'admin' ? '/admin-access' : '/products')}
              onMouseEnter={() => setHoveredAction(3)}
              onMouseLeave={() => setHoveredAction(null)}
              style={{
                padding: '14px',
                borderRadius: '10px',
                border: `1px solid ${theme.itemBorder}`,
                background: hoveredAction === 3 ? (isDarkMode ? 'rgba(99, 102, 241, 0.15)' : '#e0f2fe') : theme.itemBg,
                cursor: 'pointer',
                textAlign: 'center',
                fontWeight: 700,
                fontSize: '13px',
                color: theme.textMain,
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '18px' }}>{userRole === 'admin' ? '🔑' : '📦'}</span> {userRole === 'admin' ? 'Admin Access' : 'View Products'}
            </button>
          </div>
        </div>

      </div>

      {/* Row 2 Widgets: Recent Activity Feed & Outstanding Receivables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '28px', position: 'relative', zIndex: 1 }}>
        
        {/* Recent Activity Tabs Widget */}
        <div style={{ ...glassmorphismStyle, borderRadius: '16px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: `1px solid ${theme.itemBorder}`, paddingBottom: '14px' }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: theme.textMain }}>
              📋 Recent Activities
            </h2>
            <div style={{ display: 'flex', background: theme.itemBg, padding: '4px', borderRadius: '8px', border: `1px solid ${theme.itemBorder}` }}>
              <button
                onClick={() => setActiveTab('orders')}
                style={{
                  border: 'none',
                  background: activeTab === 'orders' ? (isDarkMode ? 'rgba(255,255,255,0.08)' : '#ffffff') : 'transparent',
                  color: activeTab === 'orders' ? theme.accentColor : theme.textSub,
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: activeTab === 'orders' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                Orders
              </button>
              <button
                onClick={() => setActiveTab('quotes')}
                style={{
                  border: 'none',
                  background: activeTab === 'quotes' ? (isDarkMode ? 'rgba(255,255,255,0.08)' : '#ffffff') : 'transparent',
                  color: activeTab === 'quotes' ? '#d97706' : theme.textSub,
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: activeTab === 'quotes' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                Quotations
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activeTab === 'orders' ? (
              recent_orders.length === 0 ? (
                <p style={{ fontStyle: 'italic', color: theme.textSub, textAlign: 'center', padding: '20px 0', margin: 0 }}>No approved orders found.</p>
              ) : (
                recent_orders.map((order) => (
                  <div key={order.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: theme.itemBg, borderRadius: '10px', borderLeft: '4px solid #10b981', border: `1px solid ${theme.itemBorder}`, borderLeftWidth: '4px' }}>
                    <div>
                      <Link to={`/orders?search=${order.quotation_number}`} style={{ fontWeight: 800, fontSize: '13px', color: isDarkMode ? '#38bdf8' : '#0284c7', textDecoration: 'none' }}>
                        {order.quotation_number}
                      </Link>
                      <div style={{ fontSize: '12px', color: theme.textSub, marginTop: '3px', fontWeight: 500 }}>{order.customer_name}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: theme.textMain }}>{formatCurrency(order.amount)}</div>
                      <span style={{ fontSize: '9px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '2px 8px', borderRadius: '10px', fontWeight: 800, textTransform: 'uppercase', display: 'inline-block', marginTop: '4px' }}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))
              )
            ) : (
              recent_quotations.length === 0 ? (
                <p style={{ fontStyle: 'italic', color: theme.textSub, textAlign: 'center', padding: '20px 0', margin: 0 }}>No active draft quotations found.</p>
              ) : (
                recent_quotations.map((quote) => (
                  <div key={quote.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: theme.itemBg, borderRadius: '10px', borderLeft: '4px solid #f59e0b', border: `1px solid ${theme.itemBorder}`, borderLeftWidth: '4px' }}>
                    <div>
                      <Link to={`/quotations?search=${quote.quotation_number}`} style={{ fontWeight: 800, fontSize: '13px', color: isDarkMode ? '#f59e0b' : '#d97706', textDecoration: 'none' }}>
                        {quote.quotation_number}
                      </Link>
                      <div style={{ fontSize: '12px', color: theme.textSub, marginTop: '3px', fontWeight: 500 }}>{quote.customer_name}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: theme.textMain }}>{formatCurrency(quote.amount)}</div>
                      <span style={{ fontSize: '9px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '2px 8px', borderRadius: '10px', fontWeight: 800, textTransform: 'uppercase', display: 'inline-block', marginTop: '4px' }}>
                        {quote.status}
                      </span>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>

        {/* Top Due Customers Widget */}
        <div style={{ ...glassmorphismStyle, borderRadius: '16px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: theme.textMain }}>
              ⚠️ Outstanding Receivables
            </h2>
            <Link to="/reports" style={{ fontSize: '12px', fontWeight: 800, color: theme.accentColor, textDecoration: 'none' }}>
              View Due Report →
            </Link>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {top_due_customers.length === 0 ? (
              <p style={{ fontStyle: 'italic', color: theme.textSub, textAlign: 'center', padding: '20px 0', margin: 0 }}>No outstanding customer dues found.</p>
            ) : (
              top_due_customers.map((c, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${theme.itemBorder}` }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: theme.textMain }}>{c.customer_name}</div>
                    <div style={{ fontSize: '11px', color: theme.textSub, marginTop: '3px', fontWeight: 500 }}>Phone: {c.phone}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: '#ef4444' }}>
                      {formatCurrency(c.due_amount)}
                    </div>
                    <div style={{ fontSize: '10px', color: theme.textSub, marginTop: '3px' }}>Invoice: {c.invoice_number}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Sales & Purchases Report Chart */}
      <div style={{ ...glassmorphismStyle, borderRadius: '16px', padding: '24px', position: 'relative', zIndex: 1, overflow: 'visible' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: theme.textMain }}>
              📊 Sales & Purchases Report
            </h2>
            <span style={{ fontSize: '12px', color: theme.textSub, fontWeight: 500 }}>Monthly comparison for the last 7 months</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-block', width: '10px', height: '10px', background: 'linear-gradient(to bottom, #00f2fe, #4facfe)', borderRadius: '50%', boxShadow: '0 0 8px rgba(0,242,254,0.6)' }}></span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: theme.textMain }}>Sales</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-block', width: '10px', height: '10px', background: 'linear-gradient(to bottom, #f093fb, #f5576c)', borderRadius: '50%', boxShadow: '0 0 8px rgba(245,87,108,0.6)' }}></span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: theme.textMain }}>Purchases</span>
            </div>
          </div>
        </div>

        {/* Responsive Custom SVG Neon Chart */}
        <div style={{ position: 'relative', overflowX: 'auto', paddingTop: '10px', paddingBottom: '10px' }}>
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} width="100%" height={chartHeight} style={{ minWidth: '650px', overflow: 'visible' }}>
            <defs>
              <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00f2fe" />
                <stop offset="100%" stopColor="#4facfe" />
              </linearGradient>
              <linearGradient id="purchaseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f093fb" />
                <stop offset="100%" stopColor="#f5576c" />
              </linearGradient>
              <filter id="neonGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Grid Lines and Y-Axis Labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
              const yVal = graphHeight * (1 - ratio) + paddingTop;
              const numericLabel = maxVal * ratio;
              return (
                <g key={index}>
                  <line
                    x1={paddingLeft}
                    y1={yVal}
                    x2={chartWidth - paddingRight}
                    y2={yVal}
                    stroke={theme.chartGrid}
                    strokeWidth={1}
                    strokeDasharray={index === 0 ? 'none' : '5 5'}
                  />
                  <text
                    x={paddingLeft - 12}
                    y={yVal + 4}
                    fill={theme.chartText}
                    fontSize="10px"
                    fontWeight="700"
                    textAnchor="end"
                  >
                    {formatChartLabel(numericLabel)}
                  </text>
                </g>
              );
            })}

            {/* Bars and X-Axis Labels */}
            {chart.length === 0 ? (
              <text x={chartWidth / 2} y={chartHeight / 2} fill={theme.chartText} fontSize="13px" fontWeight="600" textAnchor="middle">
                No monthly sales chart records found yet.
              </text>
            ) : (
              chart.map((d, index) => {
                const barWidth = 22;
                const barGap = 6;
                
                const sectionX = paddingLeft + (index * sectionWidth) + (sectionWidth / 2);
                
                // Sales Bar
                const salesVal = d.sales || 0;
                const salesHeight = (salesVal / maxVal) * graphHeight;
                const salesX = sectionX - barWidth - (barGap / 2);
                const salesY = graphHeight - salesHeight + paddingTop;

                // Purchase Bar
                const purchaseVal = d.purchases || 0;
                const purchaseHeight = (purchaseVal / maxVal) * graphHeight;
                const purchaseX = sectionX + (barGap / 2);
                const purchaseY = graphHeight - purchaseHeight + paddingTop;

                return (
                  <g key={index}>
                    {/* Sales Rect */}
                    <rect
                      x={salesX}
                      y={salesY}
                      width={barWidth}
                      height={Math.max(2, salesHeight)}
                      fill="url(#salesGrad)"
                      filter={hoveredBar?.index === index && hoveredBar?.type === 'sales' ? 'url(#neonGlow)' : 'none'}
                      rx={4}
                      style={{ cursor: 'pointer', transition: 'all 0.3s' }}
                      onMouseEnter={() =>
                        setHoveredBar({
                          index,
                          type: 'sales',
                          x: salesX + barWidth / 2,
                          y: salesY,
                          value: salesVal,
                        })
                      }
                      onMouseLeave={() => setHoveredBar(null)}
                    />

                    {/* Purchases Rect */}
                    <rect
                      x={purchaseX}
                      y={purchaseY}
                      width={barWidth}
                      height={Math.max(2, purchaseHeight)}
                      fill="url(#purchaseGrad)"
                      filter={hoveredBar?.index === index && hoveredBar?.type === 'purchases' ? 'url(#neonGlow)' : 'none'}
                      rx={4}
                      style={{ cursor: 'pointer', transition: 'all 0.3s' }}
                      onMouseEnter={() =>
                        setHoveredBar({
                          index,
                          type: 'purchases',
                          x: purchaseX + barWidth / 2,
                          y: purchaseY,
                          value: purchaseVal,
                        })
                      }
                      onMouseLeave={() => setHoveredBar(null)}
                    />

                    {/* Month Label */}
                    <text
                      x={sectionX - 4}
                      y={chartHeight - 8}
                      fill={theme.chartLabel}
                      fontSize="11px"
                      fontWeight="800"
                      textAnchor="middle"
                    >
                      {d.month}
                    </text>
                  </g>
                );
              })
            )}
          </svg>

          {/* Tooltip */}
          {hoveredBar && (
            <div
              style={{
                position: 'absolute',
                left: `${(hoveredBar.x / chartWidth) * 100}%`,
                top: `${Math.max(10, hoveredBar.y - 45)}px`,
                transform: 'translateX(-50%)',
                background: isDarkMode ? 'rgba(15, 23, 42, 0.95)' : '#0f172a',
                color: '#fff',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 100,
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '3px', fontWeight: 800 }}>
                {hoveredBar.type === 'sales' ? 'Total Sales' : 'Total Purchases'}
              </div>
              <div style={{ color: hoveredBar.type === 'sales' ? '#00f2fe' : '#f093fb', fontSize: '13px' }}>{formatCurrency(hoveredBar.value)}</div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
