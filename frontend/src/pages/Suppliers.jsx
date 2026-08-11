import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import SupplierModal from '../components/SupplierModal';

const Suppliers = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [isViewOnlyMode, setIsViewOnlyMode] = useState(false);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/suppliers');
      setSuppliers(response.data.data || []);
    } catch (err) {
      setError('Failed to retrieve supplier list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const handleOpenAddModal = () => {
    setEditingSupplier(null);
    setIsViewOnlyMode(false);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (supplier) => {
    setEditingSupplier(supplier);
    setIsViewOnlyMode(false);
    setIsModalOpen(true);
  };

  const handleOpenViewModal = (supplier) => {
    setEditingSupplier(supplier);
    setIsViewOnlyMode(true);
    setIsModalOpen(true);
  };

  const handleArchiveSupplier = async (id, name) => {
    if (!window.confirm(`Are you sure you want to archive supplier "${name}"?`)) {
      return;
    }
    try {
      await api.delete(`/suppliers/${id}`, {
        data: { archive_reason: 'Archived via Admin interface' },
      });
      fetchSuppliers();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to archive supplier.');
    }
  };

  const handleSupplierSaved = () => {
    fetchSuppliers();
  };

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.supplier_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.phone?.includes(searchQuery)
  );

  return (
    <div className="content-container">
      {/* Header & Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--text-heading)' }}>
            Supplier
          </h1>
          <span style={{ fontSize: '13px', color: '#888' }}>Dashboard / Supplier</span>
        </div>

        {isAdmin && (
          <button
            className="btn-modal-submit"
            onClick={handleOpenAddModal}
            style={{ padding: '10px 18px', fontSize: '14px', borderRadius: '6px' }}
          >
            + New Supplier
          </button>
        )}
      </div>

      {/* Main Card / Table Wrapper */}
      <div className="card-table-wrapper" style={{ padding: '20px', background: '#fff', borderRadius: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#333' }}>
            Supplier List
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: '#555' }}>Search:</label>
            <input
              type="text"
              className="custom-form-input"
              placeholder="Search supplier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '200px', padding: '6px 10px' }}
            />
          </div>
        </div>

        {error && <div className="alert alert-danger mb-3">{error}</div>}

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading suppliers...</div>
        ) : filteredSuppliers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontStyle: 'italic' }}>
            No suppliers found.
          </div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                <th style={{ padding: '12px', width: '50px' }}>#SN.</th>
                <th style={{ padding: '12px' }}>ID</th>
                <th style={{ padding: '12px' }}>Company Name</th>
                <th style={{ padding: '12px' }}>Supplier H Name</th>
                <th style={{ padding: '12px' }}>Mobile</th>
                <th style={{ padding: '12px' }}>Address</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map((supplier, index) => {
                const compName = supplier.company_name || supplier.name || '-';
                const humanName = (supplier.company_name && supplier.name !== supplier.company_name) ? supplier.name : '-';

                return (
                  <tr key={supplier.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{index + 1}</td>
                    <td style={{ padding: '12px', fontWeight: 700, color: '#007bff' }}>
                      {supplier.supplier_code}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{compName}</td>
                    <td style={{ padding: '12px', color: '#555' }}>{humanName}</td>
                  <td style={{ padding: '12px', color: '#333' }}>{supplier.phone || '-'}</td>
                  <td style={{ padding: '12px', color: '#666', fontSize: '13px' }}>
                    {supplier.address || '-'}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <button
                        onClick={() => handleOpenViewModal(supplier)}
                        style={{
                          background: '#17a2b8',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                        title="View Supplier"
                      >
                        👁️
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(supplier)}
                        style={{
                          background: '#007bff',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                        title="Edit Supplier"
                      >
                        ✏️
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handleArchiveSupplier(supplier.id, supplier.name)}
                          style={{
                            background: '#dc3545',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                          title="Archive Supplier"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Supplier Information Modal */}
      <SupplierModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSupplierSaved={handleSupplierSaved}
        initialData={editingSupplier}
        isViewOnly={isViewOnlyMode}
      />
    </div>
  );
};

export default Suppliers;
