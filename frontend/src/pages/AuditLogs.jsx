import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api/axios';
import { formatDate } from '../utils/format';

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);

  // Filters
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page,
        user_name: filterUser,
        action_type: filterAction,
        module: filterModule,
        from_date: fromDate,
        to_date: toDate,
      };

      const response = await api.get('/audit-logs', { params });
      
      // Standard paginatedResponse formats data, meta
      setLogs(response.data.data);
      setCurrentPage(response.data.meta?.current_page || 1);
      setLastPage(response.data.meta?.last_page || 1);
      setTotalLogs(response.data.meta?.total || 0);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to retrieve system audit logs.');
    } finally {
      setLoading(false);
    }
  }, [filterUser, filterAction, filterModule, fromDate, toDate]);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  return (
    <div className="content-container animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1>System Audit Logs</h1>
          <p>Logged activity trail and database modification history (Administrators only)</p>
        </div>
      </div>

      {/* Filters Banner */}
      <div className="welcome-banner" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', padding: '20px', marginBottom: '16px' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Filter User Name</label>
          <input type="text" placeholder="e.g. Admin" value={filterUser} onChange={(e) => setFilterUser(e.target.value)} />
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label>Action Type</label>
          <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} style={{ padding: '8px', fontSize: '13px', width: '100%', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--bg-base)' }}>
            <option value="">All Actions</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="generate">Generate</option>
            <option value="approve">Approve</option>
            <option value="reject">Reject</option>
            <option value="convert">Convert</option>
            <option value="archive">Archive</option>
            <option value="restore">Restore</option>
            <option value="void">Void</option>
          </select>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label>Module / Area</label>
          <select value={filterModule} onChange={(e) => setFilterModule(e.target.value)} style={{ padding: '8px', fontSize: '13px', width: '100%', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--bg-base)' }}>
            <option value="">All Modules</option>
            <option value="Auth">Auth</option>
            <option value="Customer">Customer</option>
            <option value="Quotation">Quotation</option>
            <option value="Invoice">Invoice</option>
            <option value="DeliveryChallan">Delivery Challan</option>
            <option value="Payment">Payment</option>
            <option value="Supplier">Supplier</option>
            <option value="Product">Product</option>
          </select>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label>From Date</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label>To Date</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>

        <button className="logout-btn" onClick={() => { setFilterUser(''); setFilterAction(''); setFilterModule(''); setFromDate(''); setToDate(''); }} style={{ alignSelf: 'flex-end', height: '38px', justifyContent: 'center' }}>
          Reset Filters
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div className="flex-center" style={{ padding: '40px' }}><div className="spinner"></div></div>
      ) : (
        <div className="card-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Operator</th>
                <th>Action</th>
                <th>Module</th>
                <th>Ref Code</th>
                <th>Description</th>
                <th>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-main)' }}>No logs matched filters.</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: '13px' }}>{formatDate(log.created_at)} {new Date(log.created_at).toLocaleTimeString()}</td>
                    <td><strong>{log.user_name}</strong></td>
                    <td>
                      <span className={`badge ${
                        log.action_type === 'create' || log.action_type === 'generate' ? 'badge-success' :
                        log.action_type === 'update' || log.action_type === 'convert' ? 'badge-warning' :
                        log.action_type === 'archive' || log.action_type === 'void' || log.action_type === 'reject' ? 'badge-danger' :
                        log.action_type === 'login' ? 'badge-info' : 'badge-outline'
                      }`} style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                        {log.action_type}
                      </span>
                    </td>
                    <td>{log.module}</td>
                    <td><strong>{log.reference_number || `ID: ${log.reference_id || 'N/A'}`}</strong></td>
                    <td style={{ fontSize: '13px', maxWidth: '300px', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                      {log.description}
                    </td>
                    <td style={{ fontSize: '12px', fontFamily: 'monospace' }}>{log.ip_address}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination Controls */}
          {lastPage > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: '13px' }}>Total matching entries: <strong>{totalLogs}</strong></span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="logout-btn"
                  onClick={() => fetchLogs(currentPage - 1)}
                  disabled={currentPage === 1}
                  style={{ padding: '4px 12px' }}
                >
                  Previous
                </button>
                <span style={{ fontSize: '14px', alignSelf: 'center' }}>Page {currentPage} of {lastPage}</span>
                <button
                  className="logout-btn"
                  onClick={() => fetchLogs(currentPage + 1)}
                  disabled={currentPage === lastPage}
                  style={{ padding: '4px 12px' }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AuditLogs;
