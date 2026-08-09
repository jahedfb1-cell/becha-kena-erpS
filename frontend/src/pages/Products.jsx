import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

  // Filters
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterPriceMin, setFilterPriceMin] = useState('');
  const [filterPriceMax, setFilterPriceMax] = useState('');

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

  // Preferred supplier link (priority_rank === 1, else first link)
  const getPreferredLink = (product) => {
    const links = product.supplierLinks || product.supplier_links || [];
    return links.find((l) => parseInt(l.priority_rank) === 1) || links[0];
  };

  // Unique category / supplier lists derived from the loaded products,
  // so the filter dropdowns only ever show options that actually exist.
  const categories = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      if (p.category?.id) map.set(p.category.id, p.category.name);
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [products]);

  const suppliers = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      const link = getPreferredLink(p);
      if (link?.supplier?.id) map.set(link.supplier.id, link.supplier.name);
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [products]);

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.product_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.name?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = filterCategory
      ? String(p.category?.id) === filterCategory
      : true;

    const prefLink = getPreferredLink(p);
    const matchesSupplier = filterSupplier
      ? String(prefLink?.supplier?.id) === filterSupplier
      : true;

    const price = parseFloat(p.default_unit_price) || 0;
    const matchesMinPrice = filterPriceMin ? price >= parseFloat(filterPriceMin) : true;
    const matchesMaxPrice = filterPriceMax ? price <= parseFloat(filterPriceMax) : true;

    return matchesSearch && matchesCategory && matchesSupplier && matchesMinPrice && matchesMaxPrice;
  });

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterCategory('');
    setFilterSupplier('');
    setFilterPriceMin('');
    setFilterPriceMax('');
  };

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
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, textTransform: 'uppercase', color: '#333' }}>
          PRODUCT LIST
        </h3>

        {/* Filter & Search Bar */}
        <div className="list-filter-row" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '10px', marginBottom: '18px' }}>
          <div style={{ minWidth: '170px', flex: '1 1 170px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px' }}>Category</label>
            <select
              className="custom-form-input"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              style={{ width: '100%', padding: '7px 10px' }}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: '170px', flex: '1 1 170px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px' }}>Supplier</label>
            <select
              className="custom-form-input"
              value={filterSupplier}
              onChange={(e) => setFilterSupplier(e.target.value)}
              style={{ width: '100%', padding: '7px 10px' }}
            >
              <option value="">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: '110px', flex: '1 1 110px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px' }}>Price Min (৳)</label>
            <input
              type="number"
              className="custom-form-input"
              placeholder="Min"
              value={filterPriceMin}
              onChange={(e) => setFilterPriceMin(e.target.value)}
              style={{ width: '100%', padding: '7px 10px' }}
            />
          </div>

          <div style={{ minWidth: '110px', flex: '1 1 110px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px' }}>Price Max (৳)</label>
            <input
              type="number"
              className="custom-form-input"
              placeholder="Max"
              value={filterPriceMax}
              onChange={(e) => setFilterPriceMax(e.target.value)}
              style={{ width: '100%', padding: '7px 10px' }}
            />
          </div>

          <div style={{ minWidth: '200px', flex: '2 1 200px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px' }}>Search (Code or Name)</label>
            <input
              type="text"
              className="custom-form-input"
              placeholder="Code or Name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '7px 10px' }}
            />
          </div>

          <button
            onClick={handleResetFilters}
            className="logout-btn"
            style={{ padding: '8px 16px', height: '36px', whiteSpace: 'nowrap' }}
          >
            Reset Filters
          </button>
        </div>

        <div style={{ fontSize: '13px', color: '#888', marginBottom: '10px' }}>
          Showing {filteredProducts.length} of {products.length} products
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
                const prefLink = getPreferredLink(product);
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
