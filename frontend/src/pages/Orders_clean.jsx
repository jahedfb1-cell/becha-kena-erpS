import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { formatCurrency, formatDate } from '../utils/format';
import CustomerModal from '../components/CustomerModal';
import ProductModal from '../components/ProductModal';

const Orders = () => {
  const { user } = useAuth();
  const { can } = usePermission();
  const [view, setView] = useState('list'); // 'list', 'detail', 'form'
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Selected Order for details view
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Filters
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // -------------------------------------------------------------
  // FORM STATE FOR DIRECT ORDER CREATION
  // -------------------------------------------------------------
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [sameAsCustomerAddress, setSameAsCustomerAddress] = useState(false);
  const [selectedTopProductId, setSelectedTopProductId] = useState('');
  
  // Product Blocks
  const [productBlocks, setProductBlocks] = useState([]);

  // Charges & Financial Summary
  const [convenienceCharge, setConvenienceCharge] = useState(0);
  const [otherCharge, setOtherCharge] = useState(0);
  const [otherChargeLabel, setOtherChargeLabel] = useState('');
  const [vatPercentage, setVatPercentage] = useState(0);
  const [discountType, setDiscountType] = useState('flat');
  const [discountValue, setDiscountValue] = useState(0);
  const [remark, setRemark] = useState('');
  const [terms, setTerms] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Supplier Details Popover State
  const [activeSupplierPopover, setActiveSupplierPopover] = useState(null);

  // Modals
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);

  // Fetch orders list
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/quotations?all=1');
      const allItems = response.data?.data?.data || response.data?.data || [];
      const confirmedOrders = allItems.filter(q => q.status !== 'quotation');
      setOrders(confirmedOrders);
    } catch (err) {
      setError('Failed to retrieve orders list.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch customers & products for direct order form
  const loadBasicData = useCallback(async () => {
    try {
      const [custRes, prodRes] = await Promise.all([
        api.get('/customers?all=1'),
        api.get('/products')
      ]);
      const custsData = custRes.data?.data?.data || custRes.data?.data || [];
      const prodsData = prodRes.data?.data?.data || prodRes.data?.data || [];
      setCustomers(Array.isArray(custsData) ? custsData : []);
      setProducts(Array.isArray(prodsData) ? prodsData : []);
    } catch (err) {
      console.warn('Error loading basic data for direct order:', err);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (view === 'form') {
      loadBasicData();
    }
  }, [view, loadBasicData]);

  const loadOrderDetails = async (id) => {
    try {
      setLoading(true);
      const response = await api.get(`/quotations/${id}`);
      setSelectedOrder(response.data.data);
      setView('detail');
    } catch (err) {
      alert('Failed to retrieve order details.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await api.post(`/quotations/${id}/approve`);
      alert('Order approved successfully. Supplier Purchase Entries created.');
      loadOrderDetails(id);
      fetchOrders();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to approve order.');
    }
  };

  const handleReject = async (id) => {
    try {
      await api.post(`/quotations/${id}/reject`);
      alert('Order rejected.');
      loadOrderDetails(id);
      fetchOrders();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reject order.');
    }
  };

  const handleGenerateInvoice = async (id) => {
    try {
      await api.post(`/invoices/generate/${id}`);
      alert('Invoice generated successfully.');
      loadOrderDetails(id);
      fetchOrders();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to generate invoice.');
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesStatus = filterStatus ? o.status === filterStatus : true;
      const matchesSearch = filterSearch
        ? (o.quotation_number && o.quotation_number.toLowerCase().includes(filterSearch.toLowerCase())) ||
          (o.customer?.name && o.customer.name.toLowerCase().includes(filterSearch.toLowerCase()))
        : true;
      return matchesStatus && matchesSearch;
    });
  }, [orders, filterStatus, filterSearch]);

  const isEdited = (order) => {
    if (!order.approved_at) return false;
    const approved = new Date(order.approved_at).getTime();
    const updated = new Date(order.updated_at).getTime();
    return updated - approved > 5000;
  };

  // -------------------------------------------------------------
  // DIRECT ORDER FORM HELPERS & CALCULATIONS
  // -------------------------------------------------------------
  const selectedCustomerObj = useMemo(() => {
    return customers.find(c => c.id === parseInt(selectedCustomerId));
  }, [selectedCustomerId, customers]);

  useEffect(() => {
    if (sameAsCustomerAddress && selectedCustomerObj) {
      const combinedAddr = [selectedCustomerObj.address, selectedCustomerObj.address_2].filter(Boolean).join(', ');
      setDeliveryAddress(combinedAddr || selectedCustomerObj.address || '');
    }
  }, [sameAsCustomerAddress, selectedCustomerObj]);

  const filteredCustomersDropdown = useMemo(() => {
    if (!customerSearchQuery) return customers;
    if (selectedCustomerObj) {
      const selectedDisplay = `${selectedCustomerObj.company_name || selectedCustomerObj.name} ( ${selectedCustomerObj.phone} )`;
      if (customerSearchQuery === selectedDisplay) return customers;
    }
    const q = customerSearchQuery.toLowerCase().trim();
    return customers.filter(c => {
      const name = c.name ? c.name.toLowerCase() : '';
      const compName = c.company_name ? c.company_name.toLowerCase() : '';
      const code = c.customer_code ? c.customer_code.toLowerCase() : '';
      const phone = c.phone ? c.phone.toLowerCase() : '';
      return name.includes(q) || compName.includes(q) || code.includes(q) || phone.includes(q);
    });
  }, [customers, customerSearchQuery, selectedCustomerObj]);

  const addProductBlock = (productId) => {
    const prod = products.find(p => p.id === parseInt(productId));
    if (!prod) return;

    const priorityLink = prod.supplier_links?.find(l => l.priority_rank === 1) || prod.supplier_links?.[0];
    const defaultUnitPrice = parseFloat(prod.default_unit_price) || 0;
    const minSqft = priorityLink ? parseFloat(priorityLink.min_billing_sqft) || 0 : 0;

    const defaultNotes = prod.details ||
      `5% Sunscreen Fabrics\nHeavy Duty side clump & Controller\nFittings, Fixing, and installations\nWith all Accessories\nPer Blinds Minimum Quantity ${minSqft || 20} Sft`;

    const newBlock = {
      id: Date.now() + Math.random(),
      product_id: prod.id,
      product_code: prod.product_code || '',
      product_name: prod.name,
      product: prod,
      unit_price: defaultUnitPrice,
      cost_price: priorityLink ? (parseFloat(priorityLink.cost_price) || 0) : 0,
      min_billing_sqft: minSqft,
      preferred_supplier: priorityLink ? priorityLink.supplier : null,
      preferred_link: priorityLink,
      notes: defaultNotes,
      sizes: [
        {
          id: Date.now() + Math.random() + 1,
          width: '',
          height: '',
          pcs: 1,
          actual_sqft: 0,
          billed_sqft: 0,
          line_total: 0
        }
      ]
    };

    setProductBlocks(prev => [...prev, newBlock]);
    setSelectedTopProductId('');
  };

  const addSizeRowToBlock = (blockId) => {
    setProductBlocks(prev => prev.map(block => {
      if (block.id !== blockId) return block;
      return {
        ...block,
        sizes: [
          ...block.sizes,
          {
            id: Date.now() + Math.random(),
            width: '',
            height: '',
            pcs: 1,
            actual_sqft: 0,
            billed_sqft: 0,
            line_total: 0
          }
        ]
      };
    }));
  };

  const removeSizeRowFromBlock = (blockId, sizeId) => {
    setProductBlocks(prev => prev.map(block => {
      if (block.id !== blockId) return block;
      const updatedSizes = block.sizes.filter(s => s.id !== sizeId);
      return {
        ...block,
        sizes: updatedSizes.length > 0 ? updatedSizes : [{ id: Date.now(), width: '', height: '', pcs: 1, actual_sqft: 0, billed_sqft: 0, line_total: 0 }]
      };
    }));
  };

  const removeProductBlock = (blockId) => {
    setProductBlocks(prev => prev.filter(b => b.id !== blockId));
  };

  const handleSizeChange = (blockId, sizeId, field, value) => {
    setProductBlocks(prev => prev.map(block => {
      if (block.id !== blockId) return block;
      const unitPrice = parseFloat(block.unit_price) || 0;
      const minSqft = parseFloat(block.min_billing_sqft) || 0;

      const updatedSizes = block.sizes.map(size => {
        if (size.id !== sizeId) return size;
        const updatedSize = { ...size, [field]: value };
        const w = parseFloat(updatedSize.width) || 0;
        const h = parseFloat(updatedSize.height) || 0;
        const pcs = parseInt(updatedSize.pcs) || 1;

        const singlePieceSqft = (w > 0 && h > 0) ? Math.round(((w * h) / 144) * 100) / 100 : 0;
        const sqftPerPiece = Math.max(singlePieceSqft, minSqft);
        const billedSqft = (w > 0 && h > 0) ? Math.round((sqftPerPiece * pcs) * 100) / 100 : 0;
        const lineTotal = Math.round((billedSqft * unitPrice) * 100) / 100;

        return { ...updatedSize, actual_sqft: singlePieceSqft, billed_sqft: billedSqft, line_total: lineTotal };
      });

      return { ...block, sizes: updatedSizes };
    }));
  };

  const handleBlockChange = (blockId, field, value) => {
    setProductBlocks(prev => prev.map(block => {
      if (block.id !== blockId) return block;
      const updatedBlock = { ...block, [field]: value };

      if (field === 'unit_price') {
        const unitPrice = parseFloat(value) || 0;
        const minSqft = parseFloat(updatedBlock.min_billing_sqft) || 0;
        updatedBlock.sizes = updatedBlock.sizes.map(size => {
          const w = parseFloat(size.width) || 0;
          const h = parseFloat(size.height) || 0;
          const pcs = parseInt(size.pcs) || 1;
          const singlePieceSqft = (w > 0 && h > 0) ? Math.round(((w * h) / 144) * 100) / 100 : 0;
          const sqftPerPiece = Math.max(singlePieceSqft, minSqft);
          const billedSqft = (w > 0 && h > 0) ? Math.round((sqftPerPiece * pcs) * 100) / 100 : 0;
          const lineTotal = Math.round((billedSqft * unitPrice) * 100) / 100;
          return { ...size, actual_sqft: singlePieceSqft, billed_sqft: billedSqft, line_total: lineTotal };
        });
      }

      return updatedBlock;
    }));
  };

  // Summary Totals
  const subtotal = useMemo(() => {
    return productBlocks.reduce((sum, b) => {
      const blockTotal = b.sizes.reduce((bSum, s) => bSum + (parseFloat(s.line_total) || 0), 0);
      return sum + blockTotal;
    }, 0);
  }, [productBlocks]);

  const discountAmount = useMemo(() => {
    if (discountType === 'percentage') {
      return Math.round((subtotal * (parseFloat(discountValue) || 0) / 100) * 100) / 100;
    }
    return parseFloat(discountValue) || 0;
  }, [subtotal, discountType, discountValue]);

  const vatAmount = useMemo(() => {
    return Math.round((subtotal * (parseFloat(vatPercentage) || 0) / 100) * 100) / 100;
  }, [subtotal, vatPercentage]);

  const netAmount = useMemo(() => {
    const total = subtotal + (parseFloat(convenienceCharge) || 0) + (parseFloat(otherCharge) || 0) + vatAmount - discountAmount;
    return Math.max(0, Math.round(total * 100) / 100);
  }, [subtotal, convenienceCharge, otherCharge, vatAmount, discountAmount]);

  const resetForm = () => {
    setDate(new Date().toISOString().substring(0, 10));
    setSelectedCustomerId('');
    setCustomerSearchQuery('');
    setDeliveryAddress('');
    setSameAsCustomerAddress(false);
    setProductBlocks([]);
    setConvenienceCharge(0);
    setOtherCharge(0);
    setOtherChargeLabel('');
    setVatPercentage(0);
    setDiscountType('flat');
    setDiscountValue(0);
    setRemark('');
    setTerms('');
    setFormError('');
  };

  const handleCreateDirectOrder = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!selectedCustomerId) {
      setFormError('Please select a customer.');
      return;
    }

    if (productBlocks.length === 0) {
      setFormError('Please add at least one product to the order.');
      return;
    }

    // Build items array
    const items = [];
    for (const block of productBlocks) {
      for (const s of block.sizes) {
        if (!s.width || !s.height) {
          setFormError(`Please enter valid width and height for ${block.product.name}.`);
          return;
        }
        items.push({
          product_id: block.product_id,
          product_variant_id: block.variant_id || null,
          width: parseFloat(s.width),
          height: parseFloat(s.height),
          pcs: parseInt(s.pcs) || 1,
          unit_price: parseFloat(block.unit_price) || 0,
          notes: block.notes || ''
        });
      }
    }

    const payload = {
      customer_id: parseInt(selectedCustomerId),
      status: 'approved', // Direct Confirmed Order!
      convenience_charge: parseFloat(convenienceCharge) || 0,
      other_charge: parseFloat(otherCharge) || 0,
      other_charge_label: otherChargeLabel || null,
      vat_percentage: parseFloat(vatPercentage) || 0,
      discount_type: discountType,
      discount_value: parseFloat(discountValue) || 0,
      note: remark || null,
      items: items
    };

    try {
      setIsSubmitting(true);
      await api.post('/quotations', payload);
      alert('Direct Order created & Purchase Entries generated successfully!');
      resetForm();
      setView('list');
      fetchOrders();
    } catch (err) {
      console.error('Error creating direct order:', err);
      setFormError(err.response?.data?.message || 'Failed to create direct order. Please check all fields.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="content-container animate-fade-in">
      {view === 'list' ? (
        <>
          <div className="page-header-row">
            <div>
              <h1>Confirmed Orders</h1>
              <p>View pipeline sales orders, conversions, and direct order entries</p>
            </div>
            <button 
              className="primary-btn" 
              onClick={() => { resetForm(); setView('form'); }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              ➕ Create Direct Order
            </button>
          </div>

          {/* Filters */}
          <div className="welcome-banner" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '16px', marginBottom: '16px' }}>
            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '12px' }}>Search Order/Customer</label>
              <input type="text" placeholder="Search..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} style={{ padding: '6px 10px', fontSize: '13px' }} />
            </div>
            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '12px' }}>Order Status</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '6px 10px', fontSize: '13px', width: '100%', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--bg-base)' }}>
                <option value="">All Statuses</option>
                <option value="pending_approval">Pending Approval</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="invoiced">Invoiced</option>
              </select>
            </div>
            <button className="logout-btn" onClick={() => { setFilterSearch(''); setFilterStatus(''); }} style={{ alignSelf: 'flex-end', height: '34px' }}>
              Reset Filters
            </button>
          </div>

          {loading ? (
            <div className="flex-center" style={{ padding: '40px' }}><div className="spinner"></div></div>
          ) : (
            <div className="card-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order Number</th>
                    <th>Customer</th>
                    <th>Salesperson</th>
                    <th>Net Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-main)' }}>No orders found.</td>
                    </tr>
                  ) : (
                    filteredOrders.map((o) => (
                      <tr key={o.id}>
                        <td><strong>{o.quotation_number}</strong></td>
                        <td>{o.customer?.company_name || o.customer?.name}</td>
                        <td>{o.salesman?.name}</td>
                        <td>{formatCurrency(o.net_amount)}</td>
                        <td>
                          <span className={`badge ${
                            o.status === 'approved' ? 'badge-success' :
                            o.status === 'invoiced' ? 'badge-info' :
                            o.status === 'pending_approval' ? 'badge-warning' : 'badge-danger'
                          }`}>
                            {o.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <button className="text-btn" onClick={() => loadOrderDetails(o.id)}>Details</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : view === 'detail' ? (
        /* Order Details View */
        <div className="animate-fade-in">
          <div className="page-header-row">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1>Order #{selectedOrder?.quotation_number}</h1>
                {isEdited(selectedOrder) && (
                  <span className="badge badge-warning" style={{ fontSize: '11px', textTransform: 'uppercase' }}>Edited</span>
                )}
              </div>
              <p>Track delivery routing, purchase entries, and billing statuses</p>
            </div>
            <button className="logout-btn" onClick={() => setView('list')}>⬅️ Back to Orders List</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.2fr', gap: '20px', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="welcome-banner" style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                <div>
                  <span style={{ fontSize: '12px', textTransform: 'uppercase' }}>Client Name</span>
                  <h4 style={{ margin: '4px 0 0', color: 'var(--text-heading)' }}>{selectedOrder?.customer?.company_name || selectedOrder?.customer?.name}</h4>
                  <span style={{ fontSize: '13px' }}>{selectedOrder?.customer?.phone}</span>
                </div>
                <div>
                  <span style={{ fontSize: '12px', textTransform: 'uppercase' }}>Order Placed Date</span>
                  <h4 style={{ margin: '4px 0 0', color: 'var(--text-heading)' }}>{formatDate(selectedOrder?.created_at)}</h4>
                </div>
                <div>
                  <span style={{ fontSize: '12px', textTransform: 'uppercase' }}>Sales Rep</span>
                  <h4 style={{ margin: '4px 0 0', color: 'var(--text-heading)' }}>{selectedOrder?.salesman?.name}</h4>
                </div>
                <div>
                  <span style={{ fontSize: '12px', textTransform: 'uppercase' }}>Status</span>
                  <div style={{ marginTop: '4px' }}>
                    <span className={`badge ${
                      selectedOrder?.status === 'approved' ? 'badge-success' :
                      selectedOrder?.status === 'invoiced' ? 'badge-info' :
                      selectedOrder?.status === 'pending_approval' ? 'badge-warning' : 'badge-danger'
                    }`} style={{ textTransform: 'uppercase' }}>
                      {selectedOrder?.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="welcome-banner" style={{ padding: '20px' }}>
                <h3 style={{ margin: '0 0 16px', color: 'var(--text-heading)' }}>Product Line Items</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Dimensions</th>
                      <th>Pcs</th>
                      <th>Billed Sqft</th>
                      <th>Unit Price</th>
                      <th>Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder?.items?.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.product?.product_code}</strong> - {item.product?.name}</td>
                        <td>{item.width} &times; {item.height} in</td>
                        <td>{item.pcs}</td>
                        <td>{item.billed_sqft} sqft</td>
                        <td>{formatCurrency(item.unit_price)}</td>
                        <td style={{ fontWeight: '600' }}>{formatCurrency(item.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="welcome-banner" style={{ padding: '20px' }}>
                <h3 style={{ margin: '0 0 16px', color: 'var(--text-heading)' }}>Automated Supplier Purchase Entries</h3>
                {selectedOrder?.purchase_entries?.length === 0 ? (
                  <p style={{ margin: 0, fontStyle: 'italic' }}>No purchase entries generated yet. (Requires manager order approval)</p>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Purchase Code</th>
                        <th>Supplier</th>
                        <th>Billed Area</th>
                        <th>Total Cost Price</th>
                        <th>Routing Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder?.purchase_entries?.map((pe) => (
                        <tr key={pe.id}>
                          <td><strong>{pe.purchase_number}</strong></td>
                          <td>{pe.supplier?.name}</td>
                          <td>{pe.billed_sqft} sqft</td>
                          <td style={{ fontWeight: '600' }}>{formatCurrency(pe.total_cost_price)}</td>
                          <td><span className="badge badge-success" style={{ textTransform: 'uppercase' }}>Routed</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div>
              <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'stretch', padding: '24px' }}>
                <h3 style={{ margin: '0 0 20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-heading)' }}>
                  Order Workflow & Timelines
                </h3>
                <div className="timeline" style={{ position: 'relative', paddingLeft: '20px', borderLeft: '2px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '-27px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--primary)' }}></div>
                    <span style={{ fontSize: '11px', color: 'var(--text-main)' }}>{formatDate(selectedOrder?.created_at)}</span>
                    <h5 style={{ margin: '2px 0 0', color: 'var(--text-heading)' }}>Order Converted</h5>
                  </div>
                  {selectedOrder?.approved_at && (
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', left: '-27px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--success)' }}></div>
                      <span style={{ fontSize: '11px', color: 'var(--text-main)' }}>{formatDate(selectedOrder?.approved_at)}</span>
                      <h5 style={{ margin: '2px 0 0', color: 'var(--text-heading)' }}>Manager Approved</h5>
                    </div>
                  )}
                  {selectedOrder?.status === 'invoiced' && (
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', left: '-27px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--info)' }}></div>
                      <span style={{ fontSize: '11px', color: 'var(--text-main)' }}>Invoiced Status</span>
                      <h5 style={{ margin: '2px 0 0', color: 'var(--text-heading)' }}>Billing Generated</h5>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '32px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                  {selectedOrder?.status === 'pending_approval' && (can('quotations:approve') || user?.role === 'admin') && (
                    <>
                      <button type="button" className="primary-btn" onClick={() => handleApprove(selectedOrder.id)} style={{ padding: '12px' }}>Approve Order</button>
                      <button type="button" className="logout-btn" onClick={() => handleReject(selectedOrder.id)} style={{ padding: '10px', color: 'var(--danger)', borderColor: 'var(--danger-bg)' }}>Reject Order</button>
                    </>
                  )}
                  {selectedOrder?.status === 'approved' && user?.role === 'admin' && (
                    <button type="button" className="primary-btn" onClick={() => handleGenerateInvoice(selectedOrder.id)} style={{ padding: '12px' }}>Generate Invoice</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Create Direct Confirmed Order Form */
        <div className="animate-fade-in">
          <div className="page-header-row">
            <div>
              <h1>Create Direct Confirmed Order</h1>
              <p>Directly record a confirmed sales order with full product measurement & supplier routing</p>
            </div>
            <button className="btn-outline-back" onClick={() => { setView('list'); resetForm(); }}>⬅️ Back to Orders List</button>
          </div>

          <form onSubmit={handleCreateDirectOrder}>
            {formError && (
              <div style={{ padding: '12px 16px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                ⚠️ {formError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '20px', alignItems: 'start' }}>
              <div>
                {/* TOP 3-COLUMN HEADER */}
                <div className="form-card-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Order Date *</label>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="modern-form-control" />
                  </div>

                  <div className="form-group" style={{ margin: 0, position: 'relative' }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Select Customer *</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <input 
                          type="text" 
                          placeholder="Search customer..." 
                          value={customerSearchQuery} 
                          onChange={(e) => { setCustomerSearchQuery(e.target.value); setShowCustomerDropdown(true); }} 
                          onFocus={() => setShowCustomerDropdown(true)}
                          className="modern-form-control"
                        />
                        {showCustomerDropdown && (
                          <div className="search-dropdown-list">
                            {filteredCustomersDropdown.length === 0 ? (
                              <div className="dropdown-item empty">No customers found</div>
                            ) : (
                              filteredCustomersDropdown.map(c => (
                                <div key={c.id} className="dropdown-item" onClick={() => {
                                  setSelectedCustomerId(c.id);
                                  setCustomerSearchQuery(`${c.company_name || c.name} ( ${c.phone} )`);
                                  setShowCustomerDropdown(false);
                                }}>
                                  <strong>{c.customer_code}</strong> - {c.company_name || c.name} ({c.phone})
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      <button type="button" className="btn-icon-square" onClick={() => setIsCustomerModalOpen(true)} title="Add New Customer">+</button>
                    </div>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Select Product *</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <select 
                        value={selectedTopProductId} 
                        onChange={(e) => { if (e.target.value) addProductBlock(e.target.value); }}
                        className="modern-form-control"
                      >
                        <option value="">Select Product...</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.product_code ? `${p.product_code} - ${p.name}` : p.name}</option>
                        ))}
                      </select>
                      <button type="button" className="btn-icon-square" onClick={() => setIsProductModalOpen(true)} title="Add New Product">+</button>
                    </div>
                  </div>
                </div>

                {/* DELIVERY ADDRESS */}
                <div className="form-card-section" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', margin: 0 }}>Delivery Address</label>
                    <label style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: '#ef4444', fontWeight: '600', cursor: 'pointer' }}>
                      <input type="checkbox" checked={sameAsCustomerAddress} onChange={(e) => setSameAsCustomerAddress(e.target.checked)} style={{ marginRight: '6px', width: 'auto' }} />
                      🔴 Same as Customer Address
                    </label>
                  </div>
                  <input type="text" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Delivery Address" className="modern-form-control" />
                </div>

                {/* PRODUCT TABLE — Color/Variant column REMOVED */}
                <div className="form-card-section" style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ width: '180px', minWidth: '160px' }}>Product Code *</th>
                        <th style={{ width: '130px', minWidth: '120px' }}>Unit Price</th>
                        <th style={{ width: '90px', minWidth: '85px' }}>Length</th>
                        <th style={{ width: '90px', minWidth: '85px' }}>Height</th>
                        <th style={{ width: '70px', minWidth: '65px' }}>Pcs</th>
                        <th style={{ width: '120px', minWidth: '110px' }}>Sq.Ft</th>
                        <th style={{ width: '130px', minWidth: '120px' }}>Quantity</th>
                        <th style={{ width: '150px', minWidth: '140px' }}>Total Price</th>
                        <th style={{ width: '100px', minWidth: '90px', textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productBlocks.length === 0 ? (
                        <tr>
                          <td colSpan="9" style={{ textAlign: 'center', padding: '28px', color: 'var(--text-main)' }}>
                            No items added yet. Select a product from the <strong>"Select Product *"</strong> dropdown above.
                          </td>
                        </tr>
                      ) : (
                        productBlocks.map((block) => {
                          const totalBilledSqft = block.sizes.reduce((sum, s) => sum + (parseFloat(s.billed_sqft) || 0), 0);
                          const totalPrice = block.sizes.reduce((sum, s) => sum + (parseFloat(s.line_total) || 0), 0);
                          return (
                            <React.Fragment key={block.id}>
                              {block.sizes.map((sizeRow, sIdx) => (
                                <tr key={sizeRow.id} style={{ background: '#fff' }}>

                                  {/* Product Code (rowspan) */}
                                  {sIdx === 0 && (
                                    <td rowSpan={block.sizes.length} style={{ verticalAlign: 'top', background: '#fafafa', borderRight: '1px solid var(--border)', minWidth: '160px', padding: '12px 10px' }}>
                                      <button 
                                        type="button" 
                                        onClick={() => setActiveSupplierPopover(activeSupplierPopover === block.id ? null : block.id)}
                                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', outline: 'none', textAlign: 'left' }}
                                        title="Click to view linked Supplier"
                                      >
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', fontSize: '14px', color: 'var(--primary)', padding: '4px 8px', backgroundColor: 'rgba(37, 99, 235, 0.08)', borderRadius: '6px', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
                                          🏷️ {block.product_code || block.product_name}
                                        </span>
                                      </button>
                                      {activeSupplierPopover === block.id && (
                                        <div style={{ marginTop: '8px', padding: '10px 12px', background: '#fff', border: '1px solid #3b82f6', borderRadius: '8px', boxShadow: '0 4px 14px rgba(0,0,0,0.12)', fontSize: '11px', zIndex: 10 }}>
                                          <div style={{ fontWeight: 'bold', color: '#1e40af', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>🏢 Linked Supplier Info:</span>
                                            <span style={{ cursor: 'pointer', color: '#ef4444' }} onClick={() => setActiveSupplierPopover(null)}>✖</span>
                                          </div>
                                          {(() => {
                                            const prod = products.find(p => p.id === block.product_id);
                                            const links = prod?.supplier_links || [];
                                            if (!links.length) return <div style={{ color: '#64748b' }}>No supplier linked</div>;
                                            return links.map((link, lIdx) => (
                                              <div key={lIdx} style={{ padding: '4px 0', borderBottom: lIdx < links.length - 1 ? '1px dashed #e2e8f0' : 'none' }}>
                                                <div style={{ fontWeight: '600', color: '#0f172a' }}>Rank #{link.priority_rank}: {link.supplier?.name}</div>
                                                <div style={{ color: '#475569', fontSize: '10px' }}>Cost: <strong>৳{link.cost_price || 0}</strong> | MOQ: <strong>{link.min_billing_sqft || 0} Sq.Ft</strong></div>
                                                {link.supplier?.phone && <div style={{ color: '#2563eb', fontSize: '10px' }}>📞 {link.supplier.phone}</div>}
                                              </div>
                                            ));
                                          })()}
                                        </div>
                                      )}
                                    </td>
                                  )}

                                  {/* Unit Price (rowspan) */}
                                  {sIdx === 0 && (
                                    <td rowSpan={block.sizes.length} style={{ verticalAlign: 'top', background: '#fafafa', borderRight: '1px solid var(--border)', minWidth: '120px', padding: '12px 8px' }}>
                                      <input type="number" value={block.unit_price} onChange={(e) => handleBlockChange(block.id, 'unit_price', e.target.value)} className="modern-form-control" style={{ textAlign: 'center', fontWeight: '600', padding: '8px 10px', fontSize: '13px', width: '100%' }} />
                                    </td>
                                  )}

                                  <td style={{ padding: '6px' }}>
                                    <input type="number" step="0.01" value={sizeRow.width} onChange={(e) => handleSizeChange(block.id, sizeRow.id, 'width', e.target.value)} placeholder="Length" className="modern-form-control" />
                                  </td>
                                  <td style={{ padding: '6px' }}>
                                    <input type="number" step="0.01" value={sizeRow.height} onChange={(e) => handleSizeChange(block.id, sizeRow.id, 'height', e.target.value)} placeholder="Height" className="modern-form-control" />
                                  </td>
                                  <td style={{ padding: '6px' }}>
                                    <input type="number" value={sizeRow.pcs} onChange={(e) => handleSizeChange(block.id, sizeRow.id, 'pcs', e.target.value)} className="modern-form-control" style={{ textAlign: 'center' }} />
                                  </td>

                                  <td style={{ padding: '6px' }}>
                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                      <input type="text" value={sizeRow.billed_sqft ? sizeRow.billed_sqft.toFixed(2) : '0'} readOnly className="modern-form-control" style={{ backgroundColor: '#f1f5f9', fontWeight: '600', textAlign: 'center' }} />
                                      {block.sizes.length > 1 && (
                                        <button type="button" onClick={() => removeSizeRowFromBlock(block.id, sizeRow.id)} className="btn-action-circle btn-action-delete" style={{ padding: '4px 6px', fontSize: '12px' }}>🗑️</button>
                                      )}
                                    </div>
                                  </td>

                                  {sIdx === 0 && (
                                    <td rowSpan={block.sizes.length} style={{ verticalAlign: 'top', background: '#fafafa', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', minWidth: '120px', padding: '12px 8px' }}>
                                      <input type="text" value={totalBilledSqft.toFixed(2)} readOnly className="modern-form-control" style={{ backgroundColor: '#f1f5f9', fontWeight: '600', textAlign: 'center', padding: '8px 10px', fontSize: '13px', width: '100%' }} />
                                    </td>
                                  )}
                                  {sIdx === 0 && (
                                    <td rowSpan={block.sizes.length} style={{ verticalAlign: 'top', background: '#fafafa', borderRight: '1px solid var(--border)', minWidth: '140px', padding: '12px 8px' }}>
                                      <input type="text" value={totalPrice.toFixed(2)} readOnly className="modern-form-control" style={{ backgroundColor: '#f1f5f9', fontWeight: 'bold', color: 'var(--primary)', textAlign: 'center', padding: '8px 10px', fontSize: '14px', width: '100%' }} />
                                    </td>
                                  )}
                                  {sIdx === 0 && (
                                    <td rowSpan={block.sizes.length} style={{ verticalAlign: 'top', paddingTop: '12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                      <button type="button" onClick={() => removeProductBlock(block.id)} className="btn-action-circle btn-action-delete" title="Delete" style={{ marginRight: '6px' }}>🗑️</button>
                                      <button type="button" onClick={() => addSizeRowToBlock(block.id)} className="btn-action-circle btn-action-add" title="Add Size Row">➕</button>
                                    </td>
                                  )}
                                </tr>
                              ))}

                              {/* Spec Editor Row */}
                              <tr style={{ background: '#f8fafc' }}>
                                <td colSpan="8" style={{ padding: '10px 14px' }}>
                                  <div className="spec-editor-card">
                                    <div className="spec-editor-toolbar">
                                      <span className="spec-editor-btn">↩️</span>
                                      <span className="spec-editor-btn">↪️</span>
                                      <span className="spec-editor-btn" style={{ fontWeight: 'bold' }}>Paragraph ▾</span>
                                      <span className="spec-editor-btn" style={{ fontWeight: 'bold' }}>B</span>
                                      <span className="spec-editor-btn" style={{ fontStyle: 'italic' }}>I</span>
                                      <span className="spec-editor-btn">🔗</span>
                                      <span className="spec-editor-btn">🖼️</span>
                                      <span className="spec-editor-btn">📊</span>
                                    </div>
                                    <textarea 
                                      value={block.notes || ''} 
                                      onChange={(e) => handleBlockChange(block.id, 'notes', e.target.value)}
                                      rows="4"
                                      style={{ width: '100%', border: 'none', padding: '10px 14px', fontSize: '13px', lineHeight: '1.5', resize: 'vertical', background: '#fff' }}
                                      placeholder="Enter product specification details..."
                                    />
                                  </div>
                                </td>
                                <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '14px' }}>
                                  <button type="button" onClick={() => handleBlockChange(block.id, 'notes', '')} className="btn-action-circle btn-action-delete" title="Clear">🗑️</button>
                                </td>
                              </tr>
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* BOTTOM FINANCIAL SUMMARY GRID */}
                <div className="form-card-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Total Amount *</label>
                    <input type="text" value={subtotal.toFixed(2)} readOnly className="modern-form-control" style={{ backgroundColor: 'var(--bg-base)', fontWeight: 'bold' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Convenience Amount</label>
                    <input type="number" value={convenienceCharge} onChange={(e) => setConvenienceCharge(parseFloat(e.target.value) || 0)} className="modern-form-control" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Other Charge Label</label>
                    <input type="text" value={otherChargeLabel} onChange={(e) => setOtherChargeLabel(e.target.value)} placeholder="e.g. Fitting Charge" className="modern-form-control" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Others Charge</label>
                    <input type="number" value={otherCharge} onChange={(e) => setOtherCharge(parseFloat(e.target.value) || 0)} className="modern-form-control" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>VAT %</label>
                    <input type="number" value={vatPercentage} onChange={(e) => setVatPercentage(parseFloat(e.target.value) || 0)} className="modern-form-control" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Net Amount *</label>
                    <input type="text" value={netAmount.toFixed(2)} readOnly className="modern-form-control" style={{ backgroundColor: 'var(--bg-base)', fontWeight: '800', color: 'var(--primary)', fontSize: '15px' }} />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 3', margin: 0 }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Remarks</label>
                    <input type="text" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="If have any note" className="modern-form-control" />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 3', margin: 0 }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Terms & Notes</label>
                    <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows="3" placeholder="Payment & delivery terms..." className="modern-form-control" />
                  </div>
                </div>

                {/* BOTTOM ACTION BUTTONS */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', margin: '24px 0 10px 0' }}>
                  <button type="submit" className="btn-gradient-submit" disabled={isSubmitting}>
                    ✅ {isSubmitting ? 'Creating Order...' : 'Save Direct Order'}
                  </button>
                  <button type="button" className="btn-outline-back" onClick={() => { setView('list'); resetForm(); }}>
                    ⬅️ Back
                  </button>
                </div>
              </div>

              {/* RIGHT FINANCIAL SUMMARY SIDEBAR */}
              <div>
                <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'stretch', padding: '24px', position: 'sticky', top: '20px' }}>
                  <h3 style={{ margin: '0 0 20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-heading)' }}>
                    Financial Summary
                  </h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px' }}>
                    <span>Subtotal:</span>
                    <span style={{ fontWeight: '600' }}>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '13px' }}>Convenience Charge</label>
                    <input type="number" value={convenienceCharge} onChange={(e) => setConvenienceCharge(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '13px' }}>Other Charge Label</label>
                    <input type="text" value={otherChargeLabel} onChange={(e) => setOtherChargeLabel(e.target.value)} placeholder="e.g. Fitting Charge" style={{ fontSize: '12px', marginBottom: '4px' }} />
                    <label style={{ fontSize: '13px' }}>Other Charge Amount</label>
                    <input type="number" value={otherCharge} onChange={(e) => setOtherCharge(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '13px' }}>VAT (%)</label>
                    <input type="number" value={vatPercentage} onChange={(e) => setVatPercentage(parseFloat(e.target.value) || 0)} />
                    <div style={{ fontSize: '12px', color: 'var(--text-main)', marginTop: '4px', textAlign: 'right' }}>
                      Amt: <strong>{formatCurrency(vatAmount)}</strong>
                    </div>
                  </div>
                  <div className="form-group" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '13px', margin: 0 }}>Discount</label>
                      <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                        <button type="button" onClick={() => setDiscountType('flat')} style={{ padding: '2px 8px', fontSize: '11px', border: 'none', cursor: 'pointer', backgroundColor: discountType === 'flat' ? 'var(--primary)' : 'transparent', color: discountType === 'flat' ? '#fff' : 'var(--text-main)' }}>Flat</button>
                        <button type="button" onClick={() => setDiscountType('percentage')} style={{ padding: '2px 8px', fontSize: '11px', border: 'none', cursor: 'pointer', backgroundColor: discountType === 'percentage' ? 'var(--primary)' : 'transparent', color: discountType === 'percentage' ? '#fff' : 'var(--text-main)' }}>%</button>
                      </div>
                    </div>
                    <input type="number" value={discountValue} onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)} />
                    {discountType === 'percentage' && (
                      <div style={{ fontSize: '12px', color: 'var(--text-main)', marginTop: '4px', textAlign: 'right' }}>
                        Amt: <strong>{formatCurrency(discountAmount)}</strong>
                      </div>
                    )}
                  </div>
                  <div style={{ borderTop: '2px solid var(--primary)', paddingTop: '16px', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Net Amount</span>
                    <span style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)' }}>{formatCurrency(netAmount)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '24px' }}>
                    <button type="submit" className="primary-btn" disabled={isSubmitting} style={{ padding: '12px' }}>
                      ✅ {isSubmitting ? 'Creating...' : 'Save Direct Order'}
                    </button>
                    <button type="button" className="logout-btn" onClick={() => { setView('list'); resetForm(); }} style={{ padding: '10px' }}>Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      <CustomerModal 
        isOpen={isCustomerModalOpen} 
        onClose={() => setIsCustomerModalOpen(false)} 
        onCustomerCreated={(newCust) => {
          setCustomers(prev => [newCust, ...prev]);
          setSelectedCustomerId(newCust.id);
          setCustomerSearchQuery(`${newCust.company_name || newCust.name} ( ${newCust.phone} )`);
        }} 
      />

      <ProductModal 
        isOpen={isProductModalOpen} 
        onClose={() => setIsProductModalOpen(false)} 
        onProductCreated={(newProd) => {
          setProducts(prev => [newProd, ...prev]);
          if (newProd && newProd.id) addProductBlock(newProd.id);
        }} 
      />
    </div>
  );
};

export default Orders;
