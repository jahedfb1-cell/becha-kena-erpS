import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import ProductModal from '../components/ProductModal';

const Products = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isViewOnlyMode, setIsViewOnlyMode] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/products');
      setProducts(response.data.data || []);
    } catch (err) {
      setError('Failed to retrieve products list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setIsViewOnlyMode(false);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product) => {
    setEditingProduct(product);
    setIsViewOnlyMode(false);
    setIsModalOpen(true);
  };

  const handleOpenViewModal = (product) => {
    setEditingProduct(product);
    setIsViewOnlyMode(true);
    setIsModalOpen(true);
  };

  const handleArchiveProduct = async (id, name) => {
    if (!window.confirm(`Are you sure you want to archive product "${name}"?`)) {
      return;
    }
    try {
      await api.delete(`/products/${id}`, {
        data: { archive_reason: 'Archived via Admin interface' },
      });
      fetchProducts();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to archive product.');
    }
  };

  const handleProductSaved = () => {
    fetchProducts();
  };

  const filteredProducts = products.filter(
    (p) =>
      p.product_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="content-container">
      {/* Header & Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--text-heading)' }}>
            Product
          </h1>
          <span style={{ fontSize: '13px', color: '#888' }}>Dashboard / Product</span>
        </div>

        {isAdmin && (
          <button
            className="btn-modal-submit"
            onClick={handleOpenAddModal}
            style={{ padding: '10px 18px', fontSize: '14px', borderRadius: '6px' }}
          >
            + New Product
          </button>
        )}
      </div>

      {/* Main Card / Table Wrapper */}
      <div className="card-table-wrapper" style={{ padding: '20px', background: '#fff', borderRadius: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, textTransform: 'uppercase', color: '#333' }}>
            PRODUCT LIST
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: '#555' }}>Search:</label>
            <input
              type="text"
              className="custom-form-input"
              placeholder="Code or Name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '200px', padding: '6px 10px' }}
            />
          </div>
        </div>

        {error && <div className="alert alert-danger mb-3">{error}</div>}

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading products...</div>
        ) : filteredProducts.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontStyle: 'italic' }}>
            No products found.
          </div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                <th style={{ padding: '12px', width: '50px' }}>SN</th>
                <th style={{ padding: '12px' }}>CODE</th>
                <th style={{ padding: '12px' }}>Name</th>
                <th style={{ padding: '12px' }}>Category</th>
                <th style={{ padding: '12px' }}>Priority Supplier</th>
                <th style={{ padding: '12px' }}>Unit</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>BUY (Cost)</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>SALES (Price)</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product, index) => {
                // Find preferred supplier link (priority_rank === 1 or first link)
                const links = product.supplierLinks || product.supplier_links || [];
                const prefLink =
                  links.find((l) => parseInt(l.priority_rank) === 1) || links[0];
                const prefSupplierName = prefLink?.supplier?.name || '-';
                const rawCost = prefLink?.cost_price;
                const buyPrice = (rawCost !== undefined && rawCost !== null && rawCost !== '')
                  ? parseFloat(rawCost).toFixed(2)
                  : '-';

                return (
                  <tr key={product.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{index + 1}</td>
                    <td style={{ padding: '12px', fontWeight: 700, color: '#007bff' }}>
                      {product.product_code}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{product.name}</td>
                    <td style={{ padding: '12px', color: '#555' }}>
                      {product.category?.name ? (
                        <span className="badge badge-secondary" style={{ fontSize: '11px', background: '#6c757d', color: '#fff', padding: '3px 7px', borderRadius: '3px' }}>
                          {product.category.name}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span className="badge badge-info" style={{ fontSize: '11px' }}>
                        {prefSupplierName}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>{product.unit || 'Square feet'}</td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#28a745', fontWeight: 600 }}>
                      {buyPrice !== '-' ? `৳ ${buyPrice}` : '-'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#007bff', fontWeight: 700 }}>
                      ৳ {parseFloat(product.default_unit_price).toFixed(2)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          onClick={() => handleOpenViewModal(product)}
                          style={{
                            background: '#17a2b8',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                          title="View Product Details"
                        >
                          👁️
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(product)}
                          style={{
                            background: '#007bff',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                          title="Edit Product"
                        >
                          ✏️
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleArchiveProduct(product.id, product.name)}
                            style={{
                              background: '#dc3545',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                            title="Archive Product"
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

      {/* Product Information Modal */}
      <ProductModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onProductSaved={handleProductSaved}
        initialData={editingProduct}
        isViewOnly={isViewOnlyMode}
      />
    </div>
  );
};

export default Products;
