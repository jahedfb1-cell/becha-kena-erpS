import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { formatDate } from '../utils/format';

const DatabaseBackup = () => {
  const [backups, setBackups] = useState([]);
  const [dbInfo, setDbInfo] = useState({ db_name: '', total_tables: 0 });
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [actionLoading, setActionLoading] = useState(null); // stores filename being processed
  const [message, setMessage] = useState({ type: '', text: '' });
  
  // Selected backup for restore confirmation modal
  const [restoreTarget, setRestoreTarget] = useState(null);

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/database-backup');
      const data = res.data?.data || {};
      setBackups(data.backups || []);
      setDbInfo({
        db_name: data.db_name || 'becha_kena_erp',
        total_tables: data.total_tables || 0,
      });
    } catch (err) {
      setMessage({ type: 'danger', text: 'Failed to retrieve database backups.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  // Generate new database backup
  const handleGenerateBackup = async () => {
    setIsGenerating(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await api.post('/database-backup/generate');
      setMessage({ type: 'success', text: res.data?.message || 'New database backup generated successfully!' });
      fetchBackups();
    } catch (err) {
      setMessage({ type: 'danger', text: err.response?.data?.message || 'Failed to generate database backup.' });
    } finally {
      setIsGenerating(false);
    }
  };

  // Download backup file
  const handleDownloadBackup = async (filename) => {
    try {
      setActionLoading(filename);
      const response = await api.get(`/database-backup/download/${filename}`, {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Failed to download backup file.');
    } finally {
      setActionLoading(null);
    }
  };

  // Execute Restore
  const handleConfirmRestore = async () => {
    if (!restoreTarget) return;
    const filename = restoreTarget;
    setRestoreTarget(null);
    setActionLoading(filename);
    setMessage({ type: '', text: '' });

    try {
      const res = await api.post(`/database-backup/restore/${filename}`);
      setMessage({ type: 'success', text: res.data?.message || `Database restored successfully from ${filename}!` });
      fetchBackups();
    } catch (err) {
      setMessage({ type: 'danger', text: err.response?.data?.message || 'Failed to restore database.' });
    } finally {
      setActionLoading(null);
    }
  };

  // Delete Backup file
  const handleDeleteBackup = async (filename) => {
    if (!window.confirm(`Are you sure you want to delete backup file "${filename}"?`)) return;
    
    setActionLoading(filename);
    try {
      const res = await api.delete(`/database-backup/${filename}`);
      setMessage({ type: 'success', text: res.data?.message || 'Backup file deleted successfully.' });
      fetchBackups();
    } catch (err) {
      setMessage({ type: 'danger', text: err.response?.data?.message || 'Failed to delete backup file.' });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="content-container animate-fade-in">
      {/* Page Title Row */}
      <div className="page-header-row">
        <div>
          <h1>💾 Database Backup &amp; System Safety</h1>
          <p>Generate, download, and manage full system SQL database backups</p>
        </div>
        <button
          type="button"
          className="btn-gradient-submit"
          onClick={handleGenerateBackup}
          disabled={isGenerating}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <span>{isGenerating ? '⏳' : '⚡'}</span>
          {isGenerating ? 'Generating Backup...' : 'Generate Backup Now'}
        </button>
      </div>

      {/* Alert Notification */}
      {message.text && (
        <div 
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
            fontWeight: 600,
            backgroundColor: message.type === 'success' ? '#def7ec' : '#fde8e8',
            color: message.type === 'success' ? '#03543f' : '#9b1c1c',
            border: `1px solid ${message.type === 'success' ? '#84e1bc' : '#f8b4b4'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>{message.type === 'success' ? '✅' : '⚠️'} {message.text}</span>
          <button type="button" onClick={() => setMessage({ type: '', text: '' })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>&times;</button>
        </div>
      )}

      {/* Database Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="stat-card">
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>🗄️</div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-main)', textTransform: 'uppercase', fontWeight: 600 }}>Active Database</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-heading)' }}>{dbInfo.db_name}</div>
          </div>
        </div>

        <div className="stat-card">
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>📊</div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-main)', textTransform: 'uppercase', fontWeight: 600 }}>Database Tables</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-heading)' }}>{dbInfo.total_tables} Tables</div>
          </div>
        </div>

        <div className="stat-card">
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>📁</div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-main)', textTransform: 'uppercase', fontWeight: 600 }}>Total Backups</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-heading)' }}>{backups.length} Files</div>
          </div>
        </div>

        <div className="stat-card">
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔒</div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-main)', textTransform: 'uppercase', fontWeight: 600 }}>Dump Engine</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--success)' }}>PDO SQL Safe Engine</div>
          </div>
        </div>
      </div>

      {/* Backup Files List */}
      <div className="welcome-banner" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: 'var(--text-heading)' }}>Available Backup Files</h3>
          <button type="button" className="text-btn" onClick={fetchBackups} disabled={loading}>
            🔄 Refresh List
          </button>
        </div>

        {loading ? (
          <div className="flex-center" style={{ padding: '40px' }}><div className="spinner"></div></div>
        ) : backups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-main)' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>📦</div>
            <h4>No backups generated yet</h4>
            <p style={{ fontSize: '13px', margin: '4px 0 16px 0' }}>Click "Generate Backup Now" above to create your first full SQL database dump file.</p>
          </div>
        ) : (
          <div className="card-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Backup File Name</th>
                  <th>Created Date &amp; Time</th>
                  <th>File Size</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((item, idx) => (
                  <tr key={item.filename}>
                    <td>{idx + 1}</td>
                    <td>
                      <strong style={{ fontSize: '13px', color: 'var(--primary)' }}>{item.filename}</strong>
                    </td>
                    <td>{item.created_at}</td>
                    <td>
                      <span className="badge badge-outline" style={{ fontWeight: 600 }}>
                        {item.formatted_size}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="text-btn"
                          onClick={() => handleDownloadBackup(item.filename)}
                          disabled={actionLoading === item.filename}
                          style={{ color: '#0ea5e9', fontWeight: 600 }}
                        >
                          📥 Download SQL
                        </button>

                        <button
                          type="button"
                          className="text-btn"
                          onClick={() => setRestoreTarget(item.filename)}
                          disabled={actionLoading === item.filename}
                          style={{ color: '#8b5cf6', fontWeight: 600 }}
                        >
                          🔄 Restore
                        </button>

                        <button
                          type="button"
                          className="text-btn"
                          onClick={() => handleDeleteBackup(item.filename)}
                          disabled={actionLoading === item.filename}
                          style={{ color: 'var(--danger)', fontWeight: 600 }}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Restore Confirmation Modal */}
      {restoreTarget && (
        <div className="custom-modal-overlay">
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '520px', padding: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
              <h2 style={{ margin: 0, color: 'var(--danger)' }}>Confirm Database Restore</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-main)', marginTop: '8px' }}>
                Are you sure you want to restore the database from backup:
              </p>
              <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', margin: '12px 0' }}>
                {restoreTarget}
              </div>
              <p style={{ fontSize: '12px', color: '#991b1b', background: '#fef2f2', padding: '8px 12px', borderRadius: '6px' }}>
                ⚠️ Warning: Restoring will overwrite existing records with the data inside this backup file!
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button
                type="button"
                className="logout-btn"
                onClick={() => setRestoreTarget(null)}
                style={{ padding: '8px 16px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleConfirmRestore}
                style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--danger)', padding: '8px 20px', fontWeight: 'bold' }}
              >
                Yes, Restore Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatabaseBackup;
