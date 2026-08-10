import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';

/**
 * Full notification history - the bell dropdown only ever shows the most
 * recent 15; this page uses the same /api/notifications endpoint's
 * pagination (already returned by the backend, just never consumed until
 * now) to show everything, with type/read filters and the same
 * Approve/Reject actions the bell offers for eligible admin/manager users.
 */
const Notifications = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [filterType, setFilterType] = useState('');
  const [filterRead, setFilterRead] = useState('');

  const isApprover = user && (user.role === 'admin' || user.role === 'manager');

  const fetchNotifications = useCallback(async (targetPage = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ per_page: '20', page: String(targetPage) });
      if (filterType) params.set('type', filterType);
      if (filterRead) params.set('is_read', filterRead === 'read' ? '1' : '0');

      const res = await api.get(`/notifications?${params.toString()}`);
      if (res.data) {
        setNotifications(res.data.data || []);
        setUnreadCount(res.data.unread_count || 0);
        setPage(res.data.meta?.current_page || 1);
        setLastPage(res.data.meta?.last_page || 1);
        setTotal(res.data.meta?.total || 0);
      }
    } catch (err) {
      console.error('Error loading notifications:', err);
      setError('Failed to retrieve notifications.');
    } finally {
      setLoading(false);
    }
  }, [filterType, filterRead]);

  useEffect(() => {
    fetchNotifications(1);
  }, [fetchNotifications]);

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      fetchNotifications(page);
    } catch (err) {
      alert('Failed to mark all as read.');
    }
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.is_read) {
      try {
        await api.post(`/notifications/${notif.id}/read`);
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (err) {
        console.error('Error marking notification as read:', err);
      }
    }

    if (notif.reference_type === 'Quotation' || notif.type === 'quotation' || notif.type === 'order') {
      navigate('/quotations');
    } else if (notif.reference_type === 'Invoice' || notif.type === 'invoice') {
      navigate('/invoices');
    } else if (notif.reference_type === 'Payment' || notif.type === 'payment') {
      navigate('/payments');
    }
  };

  const isApproveEligible = (notif) => {
    if (!isApprover || !notif.reference_id) return false;
    const refType = notif.reference_type || '';
    const nType = notif.type || '';
    const isOrderOrQuote = refType === 'Quotation' || nType === 'quotation' || nType === 'order';
    return isOrderOrQuote && !notif.is_read;
  };

  const handleQuickApprove = async (e, notif) => {
    e.stopPropagation();
    setActionLoading(notif.id);
    try {
      await api.post(`/quotations/${notif.reference_id}/approve`);
      await api.post(`/notifications/${notif.id}/read`);
      fetchNotifications(page);
      alert('Order approved successfully!');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to approve order.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleQuickReject = async (e, notif) => {
    e.stopPropagation();
    const reason = prompt('Enter rejection reason:');
    if (reason === null) return;
    setActionLoading(notif.id);
    try {
      await api.post(`/quotations/${notif.reference_id}/reject`, { reason });
      await api.post(`/notifications/${notif.id}/read`);
      fetchNotifications(page);
      alert('Order rejected.');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reject order.');
    } finally {
      setActionLoading(null);
    }
  };

  const getTypeBadgeStyle = (type) => {
    switch (type) {
      case 'quotation': return { bg: '#eff6ff', color: '#2563eb' };
      case 'order': return { bg: '#fef3c7', color: '#d97706' };
      case 'invoice': return { bg: '#f0fdf4', color: '#16a34a' };
      case 'payment': return { bg: '#faf5ff', color: '#9333ea' };
      case 'complaint': return { bg: '#fef2f2', color: '#dc2626' };
      default: return { bg: '#f1f5f9', color: '#475569' };
    }
  };

  return (
    <div className="content-container animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1>Notifications</h1>
          <p>Everything sent to your account — approvals, orders, invoices, and payments, scoped to your role.</p>
        </div>
        {unreadCount > 0 && (
          <button className="logout-btn" onClick={handleMarkAllRead}>
            ✓ Mark all as read
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="welcome-banner" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '16px', marginBottom: '16px', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0, flex: '1 1 180px' }}>
          <label style={{ fontSize: '12px', fontWeight: '600' }}>Type</label>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="modern-form-control" style={{ padding: '8px 12px', fontSize: '13px' }}>
            <option value="">All Types</option>
            <option value="quotation">Quotation</option>
            <option value="order">Order</option>
            <option value="invoice">Invoice</option>
            <option value="payment">Payment</option>
            <option value="complaint">Complaint</option>
            <option value="system">System</option>
          </select>
        </div>
        <div className="form-group" style={{ margin: 0, flex: '1 1 160px' }}>
          <label style={{ fontSize: '12px', fontWeight: '600' }}>Status</label>
          <select value={filterRead} onChange={(e) => setFilterRead(e.target.value)} className="modern-form-control" style={{ padding: '8px 12px', fontSize: '13px' }}>
            <option value="">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-main)', paddingBottom: '8px' }}>
          {unreadCount} unread · {total} total
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="flex-center" style={{ padding: '40px' }}><div className="spinner"></div></div>
      ) : (
        <div className="welcome-banner" style={{ padding: 0, overflow: 'hidden' }}>
          {notifications.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
              🔔 No notifications found.
            </div>
          ) : (
            notifications.map((notif) => {
              const badge = getTypeBadgeStyle(notif.type);
              return (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    backgroundColor: notif.is_read ? 'transparent' : 'rgba(59, 130, 246, 0.06)',
                    display: 'flex',
                    gap: '14px',
                    alignItems: 'flex-start'
                  }}
                >
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    backgroundColor: badge.bg,
                    color: badge.color,
                    marginTop: '2px',
                    whiteSpace: 'nowrap'
                  }}>
                    {notif.type}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: notif.is_read ? '600' : '700', fontSize: '14px', color: 'var(--text-heading)' }}>
                        {notif.title}
                        {!notif.is_read && <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2563eb', marginLeft: '8px', verticalAlign: 'middle' }}></span>}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {new Date(notif.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-main)', lineHeight: '1.5', marginTop: '4px' }}>
                      {notif.message}
                    </div>

                    {isApproveEligible(notif) && (
                      <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => handleQuickApprove(e, notif)}
                          disabled={actionLoading === notif.id}
                          style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', backgroundColor: '#10b981', color: '#fff', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          ✅ Approve
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleQuickReject(e, notif)}
                          disabled={actionLoading === notif.id}
                          style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', backgroundColor: '#ef4444', color: '#fff', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          ❌ Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Pagination */}
      {lastPage > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '20px' }}>
          <button className="logout-btn" disabled={page <= 1} onClick={() => fetchNotifications(page - 1)} style={{ padding: '6px 14px' }}>
            ← Previous
          </button>
          <span style={{ fontSize: '13px', color: 'var(--text-main)' }}>Page {page} of {lastPage}</span>
          <button className="logout-btn" disabled={page >= lastPage} onClick={() => fetchNotifications(page + 1)} style={{ padding: '6px 14px' }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
};

export default Notifications;
