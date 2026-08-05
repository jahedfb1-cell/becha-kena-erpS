import React, { useState, useEffect } from 'react';
import api from '../api/axios';

const NotificationSettingsModal = ({ isOpen, onClose }) => {
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await api.get('/notification-settings');
      if (res.data && res.data.data) {
        setEmailEnabled(res.data.data.email_enabled);
        setSmsEnabled(res.data.data.sms_enabled);
      }
    } catch (err) {
      console.error('Error fetching notification settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage('');
      await api.put('/notification-settings', {
        email_enabled: emailEnabled,
        sms_enabled: smsEnabled,
      });
      setMessage('Notification preferences saved successfully!');
      setTimeout(() => {
        setMessage('');
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Error saving notification settings:', err);
      alert('Failed to save notification settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-container" style={{ maxWidth: '480px', borderRadius: '12px' }}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>⚙️ Notification Preferences</h3>
          <button className="close-btn" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: '20px' }}>
          {message && (
            <div style={{ padding: '10px 14px', background: '#dcfce7', color: '#15803d', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
              {message}
            </div>
          )}

          {/* In-App Notification Mandatory Status */}
          <div style={{ padding: '12px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', marginBottom: '20px' }}>
            <strong style={{ fontSize: '13px', color: '#1e40af', display: 'block', marginBottom: '4px' }}>
              🔔 In-App Notifications: ALWAYS ON
            </strong>
            <p style={{ margin: 0, fontSize: '12px', color: '#3b82f6' }}>
              In-app bell notifications are non-optional and permanently active for system alerts, quotation updates, order approvals, and invoice status.
            </p>
          </div>

          {loading ? (
            <p>Loading settings...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Email Notifications Toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div>
                  <strong style={{ fontSize: '14px', display: 'block', color: 'var(--text-heading)' }}>📧 Email Notifications</strong>
                  <span style={{ fontSize: '12px', color: 'var(--text-main)', opacity: 0.8 }}>Receive email alerts for order status, invoices, and payments</span>
                </div>
                <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
                  <input 
                    type="checkbox" 
                    checked={emailEnabled} 
                    onChange={(e) => setEmailEnabled(e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: emailEnabled ? '#2563eb' : '#ccc',
                    transition: '.4s', borderRadius: '24px'
                  }}>
                    <span style={{
                      position: 'absolute', content: '""', height: '18px', width: '18px', left: emailEnabled ? '22px' : '3px', bottom: '3px',
                      backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                    }} />
                  </span>
                </label>
              </div>

              {/* SMS Notifications Toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div>
                  <strong style={{ fontSize: '14px', display: 'block', color: 'var(--text-heading)' }}>📱 SMS Notifications</strong>
                  <span style={{ fontSize: '12px', color: 'var(--text-main)', opacity: 0.8 }}>Receive mobile SMS alerts for urgent order routing and payment receipts</span>
                </div>
                <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
                  <input 
                    type="checkbox" 
                    checked={smsEnabled} 
                    onChange={(e) => setSmsEnabled(e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: smsEnabled ? '#2563eb' : '#ccc',
                    transition: '.4s', borderRadius: '24px'
                  }}>
                    <span style={{
                      position: 'absolute', content: '""', height: '18px', width: '18px', left: smsEnabled ? '22px' : '3px', bottom: '3px',
                      backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                    }} />
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: '#f8fafc', borderRadius: '0 0 12px 12px' }}>
          <button className="secondary-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="primary-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : '💾 Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationSettingsModal;
