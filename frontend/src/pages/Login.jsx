import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';

const Login = () => {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error);
    }
  };

  const quickLogin = async (roleEmail, rolePass) => {
    setEmail(roleEmail);
    setPassword(rolePass);
    setError('');
    setLoading(true);
    const result = await login(roleEmail, rolePass);
    setLoading(false);

    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error);
    }
  };

  const accounts = [
    { role: 'Admin', title: 'System Admin', email: 'admin@bechakenarp.com', pass: 'Admin@1234', color: '#ef4444', badge: 'Full Access' },
    { role: 'Manager', title: 'Kamal (Manager)', email: 'kamal@bechakenarp.com', pass: 'Manager@1234', color: '#3b82f6', badge: 'Team & Approvals' },
    { role: 'Salesman', title: 'Rahim (Salesman)', email: 'rahim@bechakenarp.com', pass: 'Password1234', color: '#10b981', badge: 'Quotes & Orders' },
    { role: 'Staff', title: 'Tariq (Staff)', email: 'staff@bechakenarp.com', pass: 'Staff@1234', color: '#f59e0b', badge: 'Inventory & Dispatch' },
  ];

  return (
    <div className="login-wrapper" style={{ background: '#090d16', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="login-card" style={{ maxWidth: '460px', width: '100%', background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '20px', padding: '32px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
        <div className="login-header" style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div className="brand-logo" style={{ width: '56px', height: '56px', background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '24px', fontWeight: '900', margin: '0 auto 16px auto', boxShadow: '0 10px 20px rgba(0, 242, 254, 0.3)' }}>BK</div>
          <h1 style={{ color: '#f8fafc', fontSize: '24px', fontWeight: '800', margin: '0 0 8px 0' }}>Dhaka Blinds IMS & ERP</h1>
          <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>Multi-Role System Access Control Portal</p>
        </div>

        {error && <div className="alert alert-danger" style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', marginBottom: '20px' }}>{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label htmlFor="email" style={{ display: 'block', color: '#cbd5e1', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Email Address</label>
            <input
              type="email"
              id="email"
              placeholder="e.g. admin@bechakenarp.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              style={{ width: '100%', padding: '12px 16px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: '#fff', fontSize: '14px', outline: 'none' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label htmlFor="password" style={{ display: 'block', color: '#cbd5e1', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Password</label>
            <input
              type="password"
              id="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              style={{ width: '100%', padding: '12px 16px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: '#fff', fontSize: '14px', outline: 'none' }}
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)', border: 'none', borderRadius: '10px', color: '#0f172a', fontSize: '15px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(0,242,254,0.3)' }}>
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚡ Quick Demo Role Login</span>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Select to test interface</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {accounts.map((acc) => (
              <button
                key={acc.role}
                type="button"
                onClick={() => quickLogin(acc.email, acc.pass)}
                disabled={loading}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${acc.color}40`,
                  borderRadius: '10px',
                  padding: '10px 12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = `${acc.color}15`}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: acc.color, fontWeight: '800', fontSize: '13px' }}>{acc.role}</span>
                  <span style={{ fontSize: '9px', background: `${acc.color}25`, color: acc.color, padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>{acc.badge}</span>
                </div>
                <span style={{ color: '#e2e8f0', fontSize: '11px', fontWeight: '600' }}>{acc.title}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="login-footer" style={{ textAlign: 'center', marginTop: '24px' }}>
          <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>© 2026 Dhaka Blinds IMS / Becha Kena ERP. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
