import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import api from '../api/axios';
import NotificationSettingsModal from './NotificationSettingsModal';

const NotificationBell = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? '' : d.toLocaleString();
    } catch {
      return '';
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications?per_page=15');
      if (res.data) {
        setNotifications(res.data.data || []);
        setUnreadCount(res.data.unread_count || 0);
      }
    } catch (err) {
      console.warn('Error loading notifications:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 20000); // Poll every 20s
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (notif) => {
    if (!notif.is_read) {
      try {
        await api.post(`/notifications/${notif.id}/read`);
        setUnreadCount(prev => Math.max(0, prev - 1));
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
      } catch (err) {
        console.error('Error marking notification as read:', err);
      }
    }

    setIsOpen(false);
    navigate('/notifications', { state: { highlightId: notif.id } });
  };

  // Quick Approve / Reject directly inside Notification bell
  const isApproveEligible = (notif) => {
    if (!user || (user.role !== 'admin' && user.role !== 'manager')) return false;
    if (!notif.reference_id) return false;
    
    const refType = notif.reference_type || '';
    const nType = notif.type || '';
    const msg = ((notif.title || '') + ' ' + (notif.message || '')).toLowerCase();
    
    const isOrderOrQuote = refType === 'Quotation' || nType === 'quotation' || nType === 'order';
    return isOrderOrQuote && !notif.is_read;
  };

  const handleQuickApprove = async (e, notif) => {
    e.stopPropagation();
    const refId = notif.reference_id || notif.data?.quotation_id || notif.data?.id;
    
    let codeSearch = '';
    const codeRegex = /(?:Q|INV|PAY)[-_\s]?\d+(?:[-_\s]\d+)?|#\d+/i;
    const match = ((notif.title || '') + ' ' + (notif.message || '')).match(codeRegex);
    if (match) {
      codeSearch = match[0].replace('#', '');
    }
    const searchQuery = codeSearch || refId || '';

    setActionLoading(notif.id);
    setIsOpen(false);
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
      if (notif.reference_type === 'Invoice' || notif.type === 'invoice') {
        navigate(`/invoices?search=${encodeURIComponent(searchQuery)}`);
      } else {
        navigate(`/quotations?search=${encodeURIComponent(searchQuery)}`);
      }
    }
  };

  const handleQuickReject = async (e, notif) => {
    e.stopPropagation();
    const reason = prompt('Enter rejection reason:');
    if (reason === null) return;
    setActionLoading(notif.id);
    try {
      await api.post(`/quotations/${notif.reference_id}/reject`, { rejection_reason: reason });
      await api.post(`/notifications/${notif.id}/read`);
      fetchNotifications();
      alert('Order rejected.');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reject order.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

  const getTypeBadgeStyle = (type) => {
    switch (type) {
      case 'quotation': return { bg: '#eff6ff', color: '#2563eb' };
      case 'order': return { bg: '#fef3c7', color: '#d97706' };
      case 'invoice': return { bg: '#f0fdf4', color: '#16a34a' };
      case 'payment': return { bg: '#faf5ff', color: '#9333ea' };
      default: return { bg: '#f1f5f9', color: '#475569' };
    }
  };

  return (
    <div className="notification-bell-container" ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button 
        type="button" 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
          padding: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          transition: 'background 0.2s'
        }}
        title="Notifications"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="22" height="22" style={{ color: 'var(--text-heading)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>

        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            backgroundColor: '#ef4444',
            color: '#fff',
            fontSize: '11px',
            fontWeight: 'bold',
            borderRadius: '10px',
            padding: '1px 6px',
            minWidth: '18px',
            textAlign: 'center',
            boxShadow: '0 0 0 2px #fff'
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown Drawer (becomes a full-screen panel on mobile — see .notification-bell-container in index.css) */}
      {isOpen && (
        <div className="notification-panel" style={{
          position: 'absolute',
          right: 0,
          top: '42px',
          width: '360px',
          maxHeight: '480px',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          border: '1px solid var(--border)',
          zIndex: 1000,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f8fafc'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="notification-panel-back"
                onClick={() => setIsOpen(false)}
                style={{ display: 'none', background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-heading)', padding: '0 4px 0 0' }}
                title="Close"
              >
                ←
              </button>
              <strong style={{ fontSize: '15px', color: 'var(--text-heading)' }}>Notifications</strong>
              {unreadCount > 0 && (
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#dbeafe', color: '#1e40af', fontWeight: 'bold' }}>
                  {unreadCount} Unread
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => { setIsOpen(false); setIsSettingsOpen(true); }}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '14px', cursor: 'pointer' }}
                title="Notification Settings"
              >
                ⚙️
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                🔔 No notifications yet
              </div>
            ) : (
              notifications.map((notif) => {
                const badge = getTypeBadgeStyle(notif.type);
                return (
                  <div 
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      backgroundColor: notif.is_read ? '#ffffff' : '#f0f9ff',
                      transition: 'background 0.2s',
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'flex-start'
                    }}
                  >
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      backgroundColor: badge.bg,
                      color: badge.color,
                      marginTop: '2px'
                    }}>
                      {notif.type}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: notif.is_read ? '500' : 'bold', fontSize: '13px', color: '#0f172a', marginBottom: '2px' }}>
                        {notif.title}
                      </div>
                      <div style={{ fontSize: '12px', color: '#475569', lineHeight: '1.4' }}>
                        {notif.message}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                        {formatDateTime(notif.created_at)}
                      </div>

                      {/* Quick Approve / Reject Action Buttons in Notification Bell */}
                      {isApproveEligible(notif) && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => handleQuickApprove(e, notif)}
                            disabled={actionLoading === notif.id}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: 'none',
                              backgroundColor: '#10b981',
                              color: '#ffffff',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            ✅ Approve
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleQuickReject(e, notif)}
                            disabled={actionLoading === notif.id}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: 'none',
                              backgroundColor: '#ef4444',
                              color: '#ffffff',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
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

          {/* Footer - link to the full notifications page */}
          <div
            style={{ borderTop: '1px solid var(--border)', padding: '10px 16px', textAlign: 'center', backgroundColor: '#f8fafc', flexShrink: 0 }}
          >
            <button
              type="button"
              onClick={() => { setIsOpen(false); navigate('/notifications'); }}
              style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
            >
              View all notifications →
            </button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <NotificationSettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
};

export default NotificationBell;
