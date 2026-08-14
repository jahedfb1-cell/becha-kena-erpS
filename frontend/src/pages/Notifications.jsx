import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import { invalidateOrders } from '../api/invalidate';
import { formatDate } from '../utils/format';

const Notifications = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalNotifications, setTotalNotifications] = useState(0);
  const [perPage, setPerPage] = useState(20);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'unread', 'read'
  const [typeFilter, setTypeFilter] = useState(''); // '', 'quotation', 'order', 'invoice', 'payment', 'complaint', 'system'

  // Read highlight ID from location state
  const highlightId = location.state?.highlightId || null;

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return `${formatDate(dateStr)} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return '';
    }
  };

  const fetchNotifications = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page,
        per_page: perPage,
      };

      if (typeFilter) {
        params.type = typeFilter;
      }
      if (statusFilter === 'unread') {
        params.is_read = false;
      } else if (statusFilter === 'read') {
        params.is_read = true;
      }

      const res = await api.get('/notifications', { params });
      if (res.data) {
        setNotifications(res.data.data || []);
        setUnreadCount(res.data.unread_count || 0);
        setCurrentPage(res.data.meta?.current_page || 1);
        setLastPage(res.data.meta?.last_page || 1);
        setTotalNotifications(res.data.meta?.total || 0);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to retrieve notifications.');
    } finally {
      setLoading(false);
    }
  }, [perPage, typeFilter, statusFilter]);

  useEffect(() => {
    fetchNotifications(1);
  }, [fetchNotifications]);

  // Handle Mark as Read
  const handleMarkAsRead = async (notif) => {
    if (notif.is_read) return;
    try {
      await api.post(`/notifications/${notif.id}/read`);
      setUnreadCount(prev => Math.max(0, prev - 1));
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  // Handle Mark All Read
  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    try {
      await api.post('/notifications/read-all');
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      alert('All notifications marked as read.');
    } catch (err) {
      alert('Failed to mark all notifications as read.');
    }
  };

  // Quick Approval Eligibility
  const isApproveEligible = (notif) => {
    if (!user || (user.role !== 'admin' && user.role !== 'manager')) return false;
    if (!notif.reference_id) return false;

    const refType = notif.reference_type || '';
    const nType = notif.type || '';

    const isOrderOrQuote = refType === 'Quotation' || nType === 'quotation' || nType === 'order';
    return isOrderOrQuote && !notif.is_read;
  };

  // Handle Quick Approve
  const handleApprove = async (notif) => {
    const refId = notif.reference_id || notif.data?.quotation_id || notif.data?.id;
    
    // Parse quotation code/number if available
    let codeSearch = '';
    const codeRegex = /(?:Q|INV|PAY)[-_\s]?\d+(?:[-_\s]\d+)?|#\d+/i;
    const match = ((notif.title || '') + ' ' + (notif.message || '')).match(codeRegex);
    if (match) {
      codeSearch = match[0].replace('#', '');
    }
    const searchQuery = codeSearch || refId || '';

    setActionLoading(notif.id);
    try {
      if (refId) {
        await api.post(`/quotations/${refId}/approve`).catch((err) => {
          console.warn('Approve request notice:', err?.response?.data?.message || err.message);
        });
      }
      await api.post(`/notifications/${notif.id}/read`).catch(() => {});
    } catch (err) {
      console.error('Approval error:', err);
    } finally {
      setActionLoading(null);
      // Approving changes the quotation/order status, so refresh that feed
      // before landing on the destination page.
      invalidateOrders(queryClient);
      if (notif.reference_type === 'Invoice' || notif.type === 'invoice') {
        navigate(`/invoices?search=${encodeURIComponent(searchQuery)}`);
      } else {
        navigate(`/quotations?search=${encodeURIComponent(searchQuery)}`);
      }
    }
  };

  // Handle Quick Reject
  const handleReject = async (notif) => {
    const reason = prompt('Enter rejection reason:');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('Rejection reason is required.');
      return;
    }
    setActionLoading(notif.id);
    try {
      await api.post(`/quotations/${notif.reference_id}/reject`, { rejection_reason: reason });
      await api.post(`/notifications/${notif.id}/read`);
      fetchNotifications(currentPage);
      invalidateOrders(queryClient);
      alert('Order rejected.');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reject order.');
    } finally {
      setActionLoading(null);
    }
  };

  // Navigate to Related Source Entity page
  const handleViewSource = (notif) => {
    handleMarkAsRead(notif);
    const searchVal = notif.reference_id;
    
    // Attempt to parse out a quotation/invoice/payment number if present in text
    let codeSearch = '';
    const codeRegex = /(?:Q|INV|PAY)[-_\s]?\d+(?:[-_\s]\d+)?|#\d+/i;
    const match = ((notif.title || '') + ' ' + (notif.message || '')).match(codeRegex);
    if (match) {
      codeSearch = match[0].replace('#', '');
    }

    const searchQuery = codeSearch || searchVal;

    if (notif.reference_type === 'Quotation' || notif.type === 'quotation' || notif.type === 'order') {
      navigate(`/quotations?search=${encodeURIComponent(searchQuery)}`);
    } else if (notif.reference_type === 'Invoice' || notif.type === 'invoice') {
      navigate(`/invoices?search=${encodeURIComponent(searchQuery)}`);
    } else if (notif.reference_type === 'Payment' || notif.type === 'payment') {
      navigate(`/payments?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  // Color styles based on type
  const getTypeStyles = (type) => {
    switch (type) {
      case 'quotation':
        return { border: '4px solid #3b82f6', badgeClass: 'badge-info', label: 'Quotation' };
      case 'order':
        return { border: '4px solid #f59e0b', badgeClass: 'badge-warning', label: 'Order' };
      case 'invoice':
        return { border: '4px solid #10b981', badgeClass: 'badge-success', label: 'Invoice' };
      case 'payment':
        return { border: '4px solid #8b5cf6', badgeClass: 'badge-outline', label: 'Payment', customBadgeStyle: { color: '#8b5cf6', borderColor: '#8b5cf6' } };
      case 'complaint':
        return { border: '4px solid #ef4444', badgeClass: 'badge-danger', label: 'Complaint' };
      default:
        return { border: '4px solid #64748b', badgeClass: 'badge-outline', label: 'System' };
    }
  };

  // Local Filtered list (client-side filters on current page's results, standard fallback)
  const filteredNotifications = useMemo(() => {
    return notifications.filter(notif => {
      // Status Filter
      if (statusFilter === 'unread' && notif.is_read) return false;
      if (statusFilter === 'read' && !notif.is_read) return false;

      // Type Filter
      if (typeFilter && notif.type !== typeFilter) return false;

      return true;
    });
  }, [notifications, statusFilter, typeFilter]);

  return (
    <div className="content-container animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1>Notification Center</h1>
          <p>Manage system notifications, alerts, and document approval actions</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="logout-btn"
              style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              ✓ Mark All Read
            </button>
          )}
          <button
            onClick={() => fetchNotifications(1)}
            className="primary-btn"
            disabled={loading}
            style={{ minWidth: '100px' }}
          >
            {loading ? 'Refreshing...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* Filters Banner */}
      <div className="welcome-banner" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', padding: '20px', marginBottom: '16px' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Read Status</label>
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '8px', fontSize: '13px', width: '100%', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--bg-card)' }}
          >
            <option value="all">All Notifications</option>
            <option value="unread">Unread Only</option>
            <option value="read">Read Only</option>
          </select>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label>Notification Type</label>
          <select 
            value={typeFilter} 
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ padding: '8px', fontSize: '13px', width: '100%', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--bg-card)' }}
          >
            <option value="">All Types</option>
            <option value="quotation">Quotations</option>
            <option value="order">Orders</option>
            <option value="invoice">Invoices</option>
            <option value="payment">Payments</option>
            <option value="complaint">Complaints</option>
            <option value="system">System Alerts</option>
          </select>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: '16px' }}>{error}</div>}

      {/* List Container */}
      {loading ? (
        <div className="flex-center" style={{ padding: '60px' }}>
          <div className="spinner"></div>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="welcome-banner" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-main)' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔔</div>
          <h3>No notifications found</h3>
          <p>All caught up! There are no alerts matching your criteria.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredNotifications.map((notif) => {
            const isHighlighted = highlightId && Number(notif.id) === Number(highlightId);
            const { border, badgeClass, label, customBadgeStyle } = getTypeStyles(notif.type);
            const isPendingApproval = isApproveEligible(notif);

            return (
              <div
                key={notif.id}
                onClick={() => handleMarkAsRead(notif)}
                style={{
                  display: 'flex',
                  borderLeft: border,
                  backgroundColor: isHighlighted ? '#eff6ff' : notif.is_read ? 'var(--bg-card)' : '#f0f9ff',
                  borderRadius: '8px',
                  boxShadow: 'var(--shadow)',
                  padding: '16px 20px',
                  border: isHighlighted ? '1px solid #3b82f6' : '1px solid var(--border)',
                  borderLeftWidth: '5px',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '20px',
                  cursor: notif.is_read ? 'default' : 'pointer'
                }}
                className="animate-fade-in"
              >
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span 
                      className={`badge ${badgeClass}`} 
                      style={{ fontSize: '11px', textTransform: 'uppercase', ...(customBadgeStyle || {}) }}
                    >
                      {label}
                    </span>
                    {!notif.is_read && (
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6' }}></span>
                    )}
                    {isHighlighted && (
                      <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: 'bold', backgroundColor: '#dbeafe', padding: '2px 8px', borderRadius: '12px' }}>
                        Selected
                      </span>
                    )}
                  </div>

                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)' }}>
                    {notif.title}
                  </h3>

                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-main)', lineHeight: '1.4' }}>
                    {notif.message}
                  </p>

                  <span style={{ fontSize: '11px', color: '#6c757d', marginTop: '4px' }}>
                    {formatDateTime(notif.created_at)}
                  </span>
                </div>

                {/* Quick actions block */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                  {/* Approve / Reject buttons */}
                  {isPendingApproval && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApprove(notif)}
                        disabled={actionLoading === notif.id}
                        className="primary-btn"
                        style={{
                          backgroundColor: '#10b981',
                          borderColor: '#10b981',
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#fff',
                          minHeight: '34px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {actionLoading === notif.id ? '...' : '✅ Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(notif)}
                        disabled={actionLoading === notif.id}
                        className="danger-btn"
                        style={{
                          backgroundColor: '#ef4444',
                          borderColor: '#ef4444',
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#fff',
                          minHeight: '34px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {actionLoading === notif.id ? '...' : '❌ Reject'}
                      </button>
                    </>
                  )}

                  {/* View Details Link */}
                  {notif.reference_id && (
                    <button
                      type="button"
                      onClick={() => handleViewSource(notif)}
                      className="logout-btn"
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        minHeight: '34px',
                        borderColor: 'var(--border)'
                      }}
                    >
                      👁️ View Document
                    </button>
                  )}

                  {/* Mark single notification as read */}
                  {!notif.is_read && !isPendingApproval && (
                    <button
                      type="button"
                      onClick={() => handleMarkAsRead(notif)}
                      className="logout-btn"
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        minHeight: '34px',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--primary)'
                      }}
                      title="Mark as read"
                    >
                      ✓ Read
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {lastPage > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 8px', borderTop: '1px solid var(--border)', marginTop: '20px' }}>
          <span style={{ fontSize: '13px' }}>
            Showing page <strong>{currentPage}</strong> of <strong>{lastPage}</strong> (Total: <strong>{totalNotifications}</strong> alerts)
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="logout-btn"
              onClick={() => fetchNotifications(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              style={{ padding: '6px 16px', fontSize: '13px' }}
            >
              Previous
            </button>
            <button
              className="logout-btn"
              onClick={() => fetchNotifications(currentPage + 1)}
              disabled={currentPage === lastPage || loading}
              style={{ padding: '6px 16px', fontSize: '13px' }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;
