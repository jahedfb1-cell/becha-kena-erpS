import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';

const AccessSetup = () => {
  const { user } = useAuth();

  const [roles, setRoles] = useState(['admin', 'manager', 'salesman', 'supplier', 'customer']);
  const [selectedRole, setSelectedRole] = useState('salesman');
  const [matrixStructure, setMatrixStructure] = useState([]);
  const [rolePermissions, setRolePermissions] = useState({});
  const [currentPermissions, setCurrentPermissions] = useState([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Load access setup data from API
  const fetchAccessSetup = useCallback(async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const response = await api.get('/access-setup');
      const data = response.data?.data || {};
      
      setRoles(data.roles || ['admin', 'manager', 'salesman', 'supplier', 'customer']);
      setMatrixStructure(data.matrix_structure || []);
      setRolePermissions(data.role_permissions || {});

      // Set initial selected role's permissions
      const initialPerms = data.role_permissions?.[selectedRole] || [];
      setCurrentPermissions(initialPerms);
    } catch (err) {
      console.error('Error loading Access Setup data:', err);
      setMessage({ type: 'danger', text: 'Failed to load Access Setup permissions matrix.' });
    } finally {
      setLoading(false);
    }
  }, [selectedRole]);

  useEffect(() => {
    fetchAccessSetup();
  }, []);

  // When selectedRole changes, update currentPermissions from rolePermissions state
  const handleRoleChange = (newRole) => {
    setSelectedRole(newRole);
    const perms = rolePermissions[newRole] || [];
    setCurrentPermissions(perms);
    setMessage({ type: '', text: '' });
  };

  // Toggle individual function permission
  const handlePermissionToggle = (permKey) => {
    setCurrentPermissions(prev => {
      if (prev.includes(permKey)) {
        return prev.filter(k => k !== permKey);
      } else {
        return [...prev, permKey];
      }
    });
  };

  // Check if all functions in a module are selected
  const isModuleFullySelected = (moduleItem) => {
    const keys = moduleItem.functions.map(f => f.key);
    return keys.every(k => currentPermissions.includes(k));
  };

  // Toggle all permissions in a module (Page level checkbox)
  const handleModulePageToggle = (moduleItem) => {
    const keys = moduleItem.functions.map(f => f.key);
    const isAllSelected = isModuleFullySelected(moduleItem);

    if (isAllSelected) {
      // Remove all module keys
      setCurrentPermissions(prev => prev.filter(k => !keys.includes(k)));
    } else {
      // Add all missing module keys
      setCurrentPermissions(prev => Array.from(new Set([...prev, ...keys])));
    }
  };

  // Save updated permissions to backend
  const handleSavePermissions = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const response = await api.post('/access-setup/update', {
        role: selectedRole,
        permissions: currentPermissions,
      });

      // Update local rolePermissions state
      setRolePermissions(prev => ({
        ...prev,
        [selectedRole]: currentPermissions,
      }));

      setMessage({ type: 'success', text: response.data?.message || `Permissions for ${selectedRole.toUpperCase()} updated successfully!` });
    } catch (err) {
      console.error('Error saving access setup:', err);
      setMessage({ type: 'danger', text: err.response?.data?.message || 'Failed to update access setup permissions.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="content-container animate-fade-in">
      {/* Top Section Header */}
      <div className="page-header-row" style={{ marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a' }}>Access Setup Information</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>Configure granular page & function permissions per user role / staff type</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            type="button"
            className="primary-btn"
            onClick={handleSavePermissions}
            disabled={saving || loading}
            style={{ padding: '10px 20px', fontWeight: 'bold', fontSize: '14px', backgroundColor: '#2563eb' }}
          >
            💾 {saving ? 'Saving...' : 'Save Permission Matrix'}
          </button>
        </div>
      </div>

      {/* Role Selection Tabs / Selector Bar */}
      <div className="welcome-banner" style={{ padding: '16px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: '700', fontSize: '14px', color: '#1e293b' }}>User Type / Staff Role:</span>
          <div style={{ display: 'flex', gap: '6px', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
            {roles.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => handleRoleChange(r)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: '700',
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                  backgroundColor: selectedRole === r ? '#2563eb' : 'transparent',
                  color: selectedRole === r ? '#ffffff' : '#475569',
                  boxShadow: selectedRole === r ? '0 2px 4px rgba(37,99,235,0.2)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                {r === 'salesman' ? 'Staff / Salesman' : r}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', color: '#64748b' }}>Status:</span>
          <span className="badge badge-success" style={{ textTransform: 'uppercase', padding: '4px 10px' }}>Active</span>
        </div>
      </div>

      {message.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '13px',
          fontWeight: '600',
          backgroundColor: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${message.type === 'success' ? '#86efac' : '#fca5a5'}`,
          color: message.type === 'success' ? '#166534' : '#991b1b',
        }}>
          {message.type === 'success' ? '✅' : '⚠️'} {message.text}
        </div>
      )}

      {/* Subtitle Banner matching Reference Screenshot */}
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.3px' }}>
          List of Pages And Functions
        </h3>
        <span style={{ fontSize: '12px', color: '#64748b' }}>
          Configuring permissions for role: <strong style={{ textTransform: 'uppercase', color: '#2563eb' }}>{selectedRole}</strong> ({currentPermissions.length} functions active)
        </span>
      </div>

      {loading ? (
        <div className="flex-center" style={{ padding: '60px' }}><div className="spinner"></div></div>
      ) : (
        /* 3-Column Responsive Grid of Module Cards matching reference screenshot */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '20px',
          alignItems: 'start',
        }}>
          {matrixStructure.map((mod) => {
            const isPageChecked = isModuleFullySelected(mod);

            return (
              <div
                key={mod.id}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                  overflow: 'hidden',
                }}
              >
                {/* Blue Header Banner matching Reference Screenshot */}
                <div style={{
                  backgroundColor: '#0070f3',
                  color: '#ffffff',
                  padding: '10px 16px',
                  fontWeight: '700',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <span>{mod.icon}</span>
                  <span>{mod.name}</span>
                </div>

                {/* Card Table Content with Page vs Function columns */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                  <div style={{ padding: '8px 12px', fontWeight: '700', fontSize: '12px', color: '#475569', borderRight: '1px solid #e2e8f0' }}>
                    Page
                  </div>
                  <div style={{ padding: '8px 12px', fontWeight: '700', fontSize: '12px', color: '#475569' }}>
                    Function
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', minHeight: '120px' }}>
                  {/* Left Column: Page Toggle */}
                  <div style={{
                    padding: '12px',
                    borderRight: '1px solid #e2e8f0',
                    backgroundColor: '#fafafa',
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '700', color: '#0f172a', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isPageChecked}
                        onChange={() => handleModulePageToggle(mod)}
                        style={{ width: '16px', height: '16px', accentColor: '#0070f3', cursor: 'pointer' }}
                      />
                      <span>{mod.name}</span>
                    </label>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', paddingLeft: '24px' }}>
                      {isPageChecked ? 'All active' : 'Partial / Off'}
                    </div>
                  </div>

                  {/* Right Column: List of Function Checkboxes */}
                  <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#ffffff' }}>
                    {mod.functions.map((fn) => {
                      const isChecked = currentPermissions.includes(fn.key);

                      return (
                        <label
                          key={fn.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '12.5px',
                            color: isChecked ? '#0f172a' : '#64748b',
                            fontWeight: isChecked ? '600' : 'normal',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handlePermissionToggle(fn.key)}
                            style={{ width: '15px', height: '15px', accentColor: '#0070f3', cursor: 'pointer' }}
                          />
                          <span>{fn.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AccessSetup;
