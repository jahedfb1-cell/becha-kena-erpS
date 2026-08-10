import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import { normalizeBdPhone } from '../utils/format';

const AccessSetup = () => {
  const { user: currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState('users'); // 'users' or 'matrix'
  
  // Matrix State
  const [roles, setRoles] = useState(['admin', 'manager', 'salesman', 'staff']);
  const [selectedRole, setSelectedRole] = useState('salesman');
  const [matrixStructure, setMatrixStructure] = useState([]);
  const [rolePermissions, setRolePermissions] = useState({});
  const [currentPermissions, setCurrentPermissions] = useState([]);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [savingMatrix, setSavingMatrix] = useState(false);

  // User Management State
  const [usersList, setUsersList] = useState([]);
  const [departmentsList, setDepartmentsList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'salesman', phone: '', department_id: '', manager_id: '' });
  const [savingUser, setSavingUser] = useState(false);
  const [modalError, setModalError] = useState('');
  const [userMsg, setUserMsg] = useState({ type: '', text: '' });
  const [matrixMsg, setMatrixMsg] = useState({ type: '', text: '' });

  // Load User List
  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const response = await api.get('/users');
      setUsersList(response.data?.data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  // Load Departments List
  const fetchDepartments = useCallback(async () => {
    try {
      const response = await api.get('/settings/departments');
      setDepartmentsList(response.data?.data || []);
    } catch (err) {
      console.error('Error fetching departments:', err);
    }
  }, []);

  // Load Matrix Setup
  const fetchAccessSetup = useCallback(async () => {
    setLoadingMatrix(true);
    try {
      const response = await api.get('/access-setup');
      const data = response.data?.data || {};
      setRoles(data.roles || ['admin', 'manager', 'salesman', 'staff']);
      setMatrixStructure(data.matrix_structure || []);
      setRolePermissions(data.role_permissions || {});
      setCurrentPermissions(data.role_permissions?.[selectedRole] || []);
    } catch (err) {
      console.error('Error loading Access Setup matrix:', err);
    } finally {
      setLoadingMatrix(false);
    }
  }, [selectedRole]);

  useEffect(() => {
    fetchUsers();
    fetchDepartments();
    fetchAccessSetup();
  }, [fetchUsers, fetchDepartments, fetchAccessSetup]);

  const handleRoleChange = (newRole) => {
    setSelectedRole(newRole);
    setCurrentPermissions(rolePermissions[newRole] || []);
    setMatrixMsg({ type: '', text: '' });
  };

  const handlePermissionToggle = (permKey) => {
    setCurrentPermissions(prev => prev.includes(permKey) ? prev.filter(k => k !== permKey) : [...prev, permKey]);
  };

  const handleSavePermissions = async () => {
    setSavingMatrix(true);
    setMatrixMsg({ type: '', text: '' });
    try {
      const response = await api.post('/access-setup/update', {
        role: selectedRole,
        permissions: currentPermissions,
      });
      setRolePermissions(prev => ({ ...prev, [selectedRole]: currentPermissions }));
      setMatrixMsg({ type: 'success', text: response.data?.message || `Permissions for ${selectedRole.toUpperCase()} updated successfully!` });
    } catch (err) {
      setMatrixMsg({ type: 'danger', text: 'Failed to update permissions.' });
    } finally {
      setSavingMatrix(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setModalError('');
    setNewUser({ name: '', email: '', password: '', role: 'salesman', phone: '', department_id: '', manager_id: '' });
    setUserModalOpen(true);
  };

  const handleOpenEditModal = (userObj) => {
    setEditingUser(userObj);
    setModalError('');
    setNewUser({
      name: userObj.name || '',
      email: userObj.email || '',
      password: '',
      role: userObj.role || 'salesman',
      phone: userObj.phone || '',
      department_id: userObj.department_id ? String(userObj.department_id) : '',
      manager_id: userObj.manager_id ? String(userObj.manager_id) : '',
    });
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setModalError('');
    setUserMsg({ type: '', text: '' });
    setSavingUser(true);

    try {
      if (!newUser.phone || !newUser.phone.trim()) {
        setModalError('Mobile Number is mandatory.');
        setSavingUser(false);
        return;
      }

      const payload = {
        name: newUser.name,
        phone: newUser.phone.trim(),
        email: newUser.email && newUser.email.trim() ? newUser.email.trim() : null,
        role: newUser.role,
        department_id: newUser.department_id ? parseInt(newUser.department_id, 10) : null,
        manager_id: newUser.manager_id ? parseInt(newUser.manager_id, 10) : null,
      };

      if (newUser.password && newUser.password.trim().length > 0) {
        payload.password = newUser.password;
      }

      let response;
      if (editingUser) {
        response = await api.put(`/users/${editingUser.id}`, payload);
        setUserMsg({ type: 'success', text: response.data?.message || `User account '${editingUser.name}' updated successfully!` });
      } else {
        if (!newUser.password) {
          setModalError('Password is required when creating a new user account.');
          setSavingUser(false);
          return;
        }
        payload.password = newUser.password;
        response = await api.post('/users', payload);
        setUserMsg({ type: 'success', text: response.data?.message || 'User created successfully!' });
      }

      setUserModalOpen(false);
      setEditingUser(null);
      setNewUser({ name: '', email: '', password: '', role: 'salesman', phone: '', manager_id: '' });
      fetchUsers();
    } catch (err) {
      console.error('Save User error:', err);
      let errText = 'Failed to save user account.';
      if (err.response?.data?.errors) {
        errText = Object.values(err.response.data.errors).flat().join(' | ');
      } else if (err.response?.data?.message) {
        errText = err.response.data.message;
      }
      setModalError(errText);
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleUserStatus = async (userObj) => {
    try {
      if (userObj.is_active) {
        await api.delete(`/users/${userObj.id}`);
      } else {
        await api.put(`/users/${userObj.id}`, { is_active: true, is_archived: false });
      }
      fetchUsers();
    } catch (err) {
      alert('Action failed.');
    }
  };

  const roleBadges = {
    admin: { bg: '#ef444420', color: '#ef4444', border: '#ef444450' },
    manager: { bg: '#3b82f620', color: '#3b82f6', border: '#3b82f650' },
    salesman: { bg: '#10b98120', color: '#10b981', border: '#10b98150' },
    staff: { bg: '#f59e0b20', color: '#f59e0b', border: '#f59e0b50' },
  };

  return (
    <div className="content-container animate-fade-in" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Title Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc', margin: '0 0 6px 0' }}>🔐 Access Control & User Accounts Hub</h1>
          <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>Manage Admin, Manager, Salesman, and Staff accounts & system permission matrices</p>
        </div>

        {/* Tab Buttons */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={() => setActiveTab('users')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'users' ? 'linear-gradient(135deg, #00f2fe, #4facfe)' : 'transparent',
              color: activeTab === 'users' ? '#0f172a' : '#94a3b8',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            👥 User Accounts ({usersList.length})
          </button>
          <button
            onClick={() => setActiveTab('matrix')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'matrix' ? 'linear-gradient(135deg, #00f2fe, #4facfe)' : 'transparent',
              color: activeTab === 'matrix' ? '#0f172a' : '#94a3b8',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            ⚡ Role Permission Matrix
          </button>
        </div>
      </div>

      {userMsg.text && (
        <div className={`alert alert-${userMsg.type}`} style={{ padding: '12px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '14px' }}>
          {userMsg.text}
        </div>
      )}

      {/* TAB 1: USER ACCOUNTS MANAGER */}
      {activeTab === 'users' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>System User Directory</h3>
            <button
              onClick={handleOpenCreateModal}
              style={{
                background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                color: '#0f172a',
                border: 'none',
                padding: '10px 18px',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(0,242,254,0.3)'
              }}
            >
              + Create New User Account
            </button>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: '#f8fafc', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <th style={{ padding: '14px 18px' }}>User Name</th>
                  <th style={{ padding: '14px 18px' }}>Email & Phone</th>
                  <th style={{ padding: '14px 18px' }}>System Role</th>
                  <th style={{ padding: '14px 18px' }}>Department</th>
                  <th style={{ padding: '14px 18px' }}>Assigned Manager</th>
                  <th style={{ padding: '14px 18px' }}>Status</th>
                  <th style={{ padding: '14px 18px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingUsers ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>Loading user directory...</td>
                  </tr>
                ) : usersList.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>No user accounts found.</td>
                  </tr>
                ) : (
                  usersList.map((u) => {
                    const badge = roleBadges[u.role] || roleBadges.staff;
                    return (
                      <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '14px 18px', fontWeight: 600 }}>{u.name}</td>
                        <td style={{ padding: '14px 18px', color: '#cbd5e1' }}>
                          <div>{u.email || '—'}</div>
                          <div style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 600 }}>{u.phone || 'No phone'}</div>
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <span style={{ background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color, padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase' }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ padding: '14px 18px', color: '#93c5fd', fontWeight: 600 }}>
                          {u.department ? u.department.name : '—'}
                        </td>
                        <td style={{ padding: '14px 18px', color: '#94a3b8' }}>
                          {u.manager ? u.manager.name : '—'}
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <span style={{ color: u.is_active ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                            {u.is_active ? '● Active' : '○ Deactivated'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                              onClick={() => handleOpenEditModal(u)}
                              style={{
                                background: 'rgba(59, 130, 246, 0.15)',
                                color: '#93c5fd',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              ✏️ Edit
                            </button>
                            {u.id !== currentUser?.id && (
                              <button
                                onClick={() => handleToggleUserStatus(u)}
                                style={{
                                  background: u.is_active ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                  color: u.is_active ? '#fca5a5' : '#a7f3d0',
                                  border: '1px solid ' + (u.is_active ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'),
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                {u.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: ROLE PERMISSION MATRIX */}
      {activeTab === 'matrix' && (
        <div>
          {matrixMsg.text && (
            <div className={`alert alert-${matrixMsg.type}`} style={{ padding: '12px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '14px' }}>
              {matrixMsg.text}
            </div>
          )}

          {/* Role selector bar */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
            {['admin', 'manager', 'salesman', 'staff'].map((r) => {
              const active = selectedRole === r;
              const badge = roleBadges[r];
              return (
                <button
                  key={r}
                  onClick={() => handleRoleChange(r)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '10px',
                    border: `1px solid ${active ? badge.color : 'rgba(255,255,255,0.1)'}`,
                    background: active ? badge.bg : 'rgba(255,255,255,0.03)',
                    color: active ? badge.color : '#94a3b8',
                    fontWeight: 800,
                    fontSize: '14px',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {r} Role Permissions
                </button>
              );
            })}
          </div>

          {/* Matrix Table */}
          <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', margin: 0, textTransform: 'capitalize' }}>
                Configuring Matrix for: <span style={{ color: roleBadges[selectedRole]?.color }}>{selectedRole}</span>
              </h4>
              <button
                onClick={handleSavePermissions}
                disabled={savingMatrix}
                style={{
                  background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                  color: '#0f172a',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(0,242,254,0.3)'
                }}
              >
                {savingMatrix ? 'Saving...' : '💾 Save Role Matrix'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
              {matrixStructure.map((mod) => (
                <div key={mod.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: '#f8fafc', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{mod.icon}</span> {mod.name}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {mod.functions.map((fn) => {
                      const checked = currentPermissions.includes(fn.key);
                      return (
                        <label key={fn.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: checked ? '#f8fafc' : '#64748b', fontSize: '13px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handlePermissionToggle(fn.key)}
                            style={{ accentColor: '#00f2fe', width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          {fn.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT USER MODAL */}
      {userModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '20px', maxWidth: '480px', width: '100%', padding: '28px', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#f8fafc', margin: '0 0 20px 0' }}>
              {editingUser ? `✏️ Edit Account (${editingUser.name})` : '➕ Create User Account'}
            </h3>

            {modalError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.5)', color: '#fca5a5', padding: '10px 14px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', lineHeight: '1.4' }}>
                ⚠️ {modalError}
              </div>
            )}

            <form onSubmit={handleSaveUser} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Full Name *</label>
                <input
                  type="text"
                  required
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="e.g. Tariq Staff"
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Phone / Mobile Number *</label>
                <input
                  type="text"
                  required
                  value={newUser.phone}
                  onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                  onBlur={(e) => setNewUser(prev => ({ ...prev, phone: normalizeBdPhone(e.target.value) }))}
                  placeholder="e.g. 01700000000"
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Email Address (Optional)</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="e.g. staff@bechakenarp.com"
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  {editingUser ? 'New Password (leave empty to keep current)' : 'Password *'}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder={editingUser ? 'Leave blank to keep existing password' : 'Min 6 characters'}
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Role Selection *</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                >
                  <option value="admin">Admin (Full Control)</option>
                  <option value="manager">Manager (Team Operations)</option>
                  <option value="salesman">Salesman (Quotes & Orders)</option>
                  <option value="staff">Staff (Stock & Logistics)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Department</label>
                <select
                  value={newUser.department_id || ''}
                  onChange={(e) => setNewUser({ ...newUser, department_id: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                >
                  <option value="">-- No Department Assigned --</option>
                  {departmentsList.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Assigned Manager</label>
                <select
                  value={newUser.manager_id || ''}
                  onChange={(e) => setNewUser({ ...newUser, manager_id: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                >
                  <option value="">-- No Assigned Manager --</option>
                  {usersList
                    .filter(u => (u.role === 'manager' || u.role === 'admin') && u.id !== editingUser?.id)
                    .map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.role.toUpperCase()})</option>
                    ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => { setUserModalOpen(false); setEditingUser(null); }} style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={savingUser} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #00f2fe, #4facfe)', color: '#0f172a', fontWeight: 700, cursor: savingUser ? 'not-allowed' : 'pointer', opacity: savingUser ? 0.7 : 1 }}>
                  {savingUser ? 'Updating...' : (editingUser ? 'Update Account' : 'Save Account')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccessSetup;
