import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import NotificationBell from '../components/NotificationBell';

const DashboardLayout = () => {
  const { user, login, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = React.useRef(null);

  React.useEffect(() => {
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const quickSwitchRole = async (email, pass) => {
    setUserMenuOpen(false);
    await logout();
    const result = await login(email, pass);
    if (result.success) {
      navigate('/dashboard');
    }
  };

  const getMenuLinks = () => {
    const role = user?.role || 'staff';

    const links = [
      { path: '/dashboard', label: 'Dashboard', roles: ['admin', 'manager', 'salesman', 'staff'], icon: 'grid' },
      { path: '/customers', label: 'Customers', roles: ['admin', 'manager', 'salesman'], icon: 'users' },
      { path: '/quotations', label: 'Quotations', roles: ['admin', 'manager', 'salesman'], icon: 'file-text' },
      { path: '/orders?tab=pending', label: 'Placed Orders (Pending)', roles: ['admin', 'manager', 'salesman'], icon: 'clock' },
      { path: '/orders?tab=confirmed', label: role === 'salesman' ? 'My Confirmed Orders' : 'Confirmed Orders', roles: ['admin', 'manager', 'salesman'], icon: 'shopping-cart' },
      { path: '/invoices', label: 'Invoices & Deliveries', roles: ['admin', 'manager', 'salesman', 'staff'], icon: 'invoice' },
      { path: '/payments', label: 'Payments', roles: ['admin'], icon: 'credit-card' },
      { path: '/notifications', label: 'Notifications', roles: ['admin', 'manager', 'salesman', 'staff'], icon: 'bell' },
      { path: '/products', label: 'Products & Stock', roles: ['admin', 'manager', 'staff'], icon: 'box' },
      { path: '/vouchers-expenses', label: 'Vouchers & Expenses', roles: ['admin', 'manager', 'staff'], icon: 'file-text' },
      { path: '/suppliers', label: 'Suppliers', roles: ['admin', 'manager'], icon: 'truck' },
      { path: '/purchases', label: 'Purchases', roles: ['admin', 'manager'], icon: 'box' },
      { path: '/reports', label: role === 'manager' ? 'Reports (Ltd)' : 'Reports', roles: ['admin', 'manager'], icon: 'bar-chart' },
      { path: '/admin-access', label: 'Admin Access', roles: ['admin'], icon: 'key' },
      { path: '/audit-logs', label: 'Audit Logs', roles: ['admin'], icon: 'shield' },
      { path: '/database-backup', label: 'Database Backup', roles: ['admin'], icon: 'database' },
      { path: '/settings', label: 'Setting', roles: ['admin'], icon: 'cog' },
    ];

    return links.filter(link => link.roles.includes(role));
  };

  const renderIcon = (type) => {
    const icons = {
      bell: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
      cog: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      clock: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      database: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
      ),
      grid: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
      users: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      truck: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
        </svg>
      ),
      box: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      'file-text': (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      'shopping-cart': (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      invoice: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 019.5 3H9a2 2 0 00-2 2v10a2 2 0 002 2h4a3 3 0 003-3v-1a3 3 0 00-3-3h-1" />
        </svg>
      ),
      'credit-card': (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      'bar-chart': (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      shield: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      key: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      )
    };

    return icons[type] || icons.grid;
  };

  const roleColors = {
    admin: '#ef4444',
    manager: '#3b82f6',
    salesman: '#10b981',
    staff: '#f59e0b',
  };

  const userRole = user?.role || 'staff';
  const roleColor = roleColors[userRole] || '#00f2fe';

  return (
    <div className="dashboard-container">
      {/* Sidebar Overlay for Mobile */}
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-header" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="brand-logo" style={{ background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)', borderRadius: '10px', color: '#0f172a', fontWeight: '900', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>DB</div>
            <div style={{ flex: 1, marginLeft: '10px' }}>
              <div style={{ fontWeight: '800', fontSize: '15px', color: '#f8fafc' }}>Dhaka Blinds</div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>IMS & ERP Portal</div>
            </div>
            <button className="mobile-close-btn" onClick={() => setMobileOpen(false)}>×</button>
          </div>
          <Link
            to={userRole === 'admin' ? '/admin-access' : '/my-profile'}
            style={{
              alignSelf: 'flex-start',
              background: `${roleColor}20`,
              border: `1px solid ${roleColor}60`,
              color: roleColor,
              fontSize: '10px',
              fontWeight: '800',
              textTransform: 'uppercase',
              padding: '3px 8px',
              borderRadius: '6px',
              letterSpacing: '0.5px',
              textDecoration: 'none',
              cursor: 'pointer'
            }}
          >
            ● {userRole} Access
          </Link>
        </div>

        <nav className="sidebar-nav" style={{ padding: '12px 8px' }}>
          {getMenuLinks().map((link) => {
            // For links with query params (like /orders?tab=pending), we need to compare the full path + search
            const fullPath = location.pathname + location.search;
            const isActive = location.pathname === link.path || fullPath === link.path || (link.path.includes('?') && location.pathname === link.path.split('?')[0] && fullPath.includes(link.path.split('?')[1]));
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setMobileOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  color: isActive ? '#fff' : '#94a3b8',
                  background: isActive ? `linear-gradient(135deg, ${roleColor}aa, ${roleColor}dd)` : 'transparent',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '14px',
                  marginBottom: '4px',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <span className="nav-icon" style={{ opacity: isActive ? 1 : 0.7 }}>{renderIcon(link.icon)}</span>
                <span className="nav-label">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="main-wrapper">
        {/* Header Bar */}
        <header className="header">
          <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="mobile-toggle-btn" onClick={() => setMobileOpen(!mobileOpen)}>
              ☰
            </button>
            <div className="page-title" style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', textTransform: 'capitalize' }}>
              {location.pathname.replace('/', '').replace('-', ' ') || 'Dashboard'}
            </div>
          </div>

          <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <NotificationBell />

            {/* User Dropdown */}
            <div style={{ position: 'relative' }} ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: '#f8fafc',
                  fontWeight: 600,
                  fontSize: '14px',
                  padding: '6px 12px',
                  borderRadius: '10px',
                  cursor: 'pointer'
                }}
              >
                <div style={{
                  width: '32px', height: '32px',
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${roleColor}, ${roleColor}aa)`,
                  color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: '13px', flexShrink: 0
                }}>
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ lineHeight: '1.2', fontSize: '13px' }}>{user?.name || 'User'}</div>
                  <div style={{ fontSize: '10px', color: roleColor, fontWeight: 700, textTransform: 'uppercase' }}>{userRole}</div>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="14" height="14" style={{ transform: userMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {userMenuOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  background: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '12px',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                  minWidth: '240px',
                  zIndex: 1000,
                  overflow: 'hidden'
                }}>
                  {/* User Info Header */}
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#f8fafc' }}>{user?.name}</div>
                    <div style={{ fontSize: '12px', color: roleColor, marginTop: '2px', fontWeight: '700', textTransform: 'capitalize' }}>
                      {userRole} Account
                    </div>
                  </div>

                  {/* Role Switcher Section */}
                  <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
                      ⚡ Switch Role Demo
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      <button onClick={() => quickSwitchRole('admin@bechakenarp.com', 'Admin@1234')} style={{ background: userRole === 'admin' ? '#ef4444' : 'rgba(255,255,255,0.05)', color: '#fff', border: 'none', padding: '6px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>Admin</button>
                      <button onClick={() => quickSwitchRole('kamal@bechakenarp.com', 'Manager@1234')} style={{ background: userRole === 'manager' ? '#3b82f6' : 'rgba(255,255,255,0.05)', color: '#fff', border: 'none', padding: '6px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>Manager</button>
                      <button onClick={() => quickSwitchRole('rahim@bechakenarp.com', 'Password1234')} style={{ background: userRole === 'salesman' ? '#10b981' : 'rgba(255,255,255,0.05)', color: '#fff', border: 'none', padding: '6px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>Salesman</button>
                      <button onClick={() => quickSwitchRole('staff@bechakenarp.com', 'Staff@1234')} style={{ background: userRole === 'staff' ? '#f59e0b' : 'rgba(255,255,255,0.05)', color: '#fff', border: 'none', padding: '6px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>Staff</button>
                    </div>
                  </div>

                  {/* Navigation links */}
                  <button onClick={() => { setUserMenuOpen(false); navigate('/my-profile'); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', fontSize: '13px', color: '#cbd5e1', cursor: 'pointer' }}>👤 My Profile</button>
                  {userRole === 'admin' && (
                    <button onClick={() => { setUserMenuOpen(false); navigate('/access-setup'); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', fontSize: '13px', color: '#cbd5e1', cursor: 'pointer' }}>🔑 User & Access Matrix</button>
                  )}

                  <button onClick={() => { setUserMenuOpen(false); handleLogout(); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', border: 'none', fontSize: '13px', color: '#fca5a5', cursor: 'pointer', fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    🚪 Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="dashboard-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
