import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/forgot-password', { email });
      setMessage(response.data?.message || 'If an account exists for that email, a password reset link has been sent.');
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper" style={{ background: '#090d16', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="login-card" style={{ maxWidth: '460px', width: '100%', background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '20px', padding: '32px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
        <div className="login-header" style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div className="brand-logo" style={{ width: '56px', height: '56px', background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '24px', fontWeight: '900', margin: '0 auto 16px auto', boxShadow: '0 10px 20px rgba(0, 242, 254, 0.3)' }}>BK</div>
          <h1 style={{ color: '#f8fafc', fontSize: '22px', fontWeight: '800', margin: '0 0 8px 0' }}>Forgot Password</h1>
          <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>Enter your account email and we'll send you a reset link.</p>
        </div>

        {error && <div className="alert alert-danger" style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', marginBottom: '20px' }}>{error}</div>}
        {message && <div className="alert alert-success" style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#86efac', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', marginBottom: '20px' }}>{message}</div>}

        {!message && (
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label htmlFor="email" style={{ display: 'block', color: '#cbd5e1', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Email Address</label>
              <input
                type="email"
                id="email"
                placeholder="e.g. admin@dhakablinds.shop"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                style={{ width: '100%', padding: '12px 16px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: '#fff', fontSize: '14px', outline: 'none' }}
              />
            </div>

            <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)', border: 'none', borderRadius: '10px', color: '#0f172a', fontSize: '15px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,242,254,0.3)' }}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <Link to="/login" style={{ color: '#38bdf8', fontSize: '13px', fontWeight: '600', textDecoration: 'none' }}>&larr; Back to Sign In</Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
