import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { formatCurrency, formatDate, formatSqft } from '../utils/format';
import CustomerModal from '../components/CustomerModal';
import ProductModal from '../components/ProductModal';
import QuotationPrintModal from '../components/QuotationPrintModal';

const Quotations = () => {
  const { user } = useAuth();
  const { can } = usePermission();
  const [view, setView] = useState('list'); // 'list' or 'form'
  const [quotations, setQuotations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // List Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  // Form State
  const [isEditMode, setIsEditMode] = useState(false);
  const [editId, setEditId] = useState(null);

  // Print & Modal States
  const [printingQuotation, setPrintingQuotation] = useState(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printType, setPrintType] = useState('detailed'); // 'detailed' | 'simplified'
  const [selectedTopProductId, setSelectedTopProductId] = useState('');

  // Simple Confirmation Modals
  const [convertConfirmTarget, setConvertConfirmTarget] = useState(null);
  const [approveConfirmTarget, setApproveConfirmTarget] = useState(null);
  
  const [quotationNo, setQuotationNo] = useState('[Auto Generated]');
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [salesmanId, setSalesmanId] = useState(user?.id || '');
  const [salesmanName, setSalesmanName] = useState(user?.name || '');
  
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [sameAsCustomerAddress, setSameAsCustomerAddress] = useState(false);
  
  const [productBlocks, setProductBlocks] = useState([]);
  const [convenienceCharge, setConvenienceCharge] = useState(0);
  const [otherCharge, setOtherCharge] = useState(0);
  const [otherChargeLabel, setOtherChargeLabel] = useState('');
  const [vatPercentage, setVatPercentage] = useState(0);
  const [discountType, setDiscountType] = useState('flat'); // 'flat' or 'percentage'
  const [discountValue, setDiscountValue] = useState(0);
  
  const [remark, setRemark] = useState('');
  const [terms, setTerms] = useState('');
  
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSupplierPopoverBlockId, setActiveSupplierPopoverBlockId] = useState(null);

  // Modal Dialog States
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);

  // Load basic data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [quotesRes, custRes, prodRes] = await Promise.all([
        api.get('/quotations?all=1'),
        api.get('/customers?all=1'),
        api.get('/products')
      ]);

      const quotesData = quotesRes.data?.data?.data || quotesRes.data?.data || [];
      const custsData = custRes.data?.data?.data || custRes.data?.data || [];
      const prodsData = prodRes.data?.data?.data || prodRes.data?.data || [];

      setQuotations(Array.isArray(quotesData) ? quotesData : []);
      setCustomers(Array.isArray(custsData) ? custsData : []);
      setProducts(Array.isArray(prodsData) ? prodsData : []);
    } catch (err) {
      console.error('Error loading quotation data:', err);
      setError('Failed to retrieve system records. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Ensure customers and products are loaded when opening form view
  useEffect(() => {
    if (view === 'form' && (customers.length === 0 || products.length === 0)) {
      loadData();
    }
  }, [view, customers.length, products.length, loadData]);

  // Selected Customer Details
  const selectedCustomerObj = useMemo(() => {
    return customers.find(c => c.id === parseInt(selectedCustomerId));
  }, [selectedCustomerId, customers]);

  // Sync delivery address if checkbox checked
  useEffect(() => {
    if (sameAsCustomerAddress && selectedCustomerObj) {
      setDeliveryAddress(selectedCustomerObj.address || '');
    }
  }, [sameAsCustomerAddress, selectedCustomerObj]);

  // Filter list view quotations
  const filteredQuotations = useMemo(() => {
    return quotations.filter(q => {
      const matchesStatus = filterStatus ? q.status === filterStatus : true;
      const matchesCustomer = filterCustomer ? q.customer_id === parseInt(filterCustomer) : true;
      const matchesSearch = filterSearch 
        ? (q.quotation_number && q.quotation_number.toLowerCase().includes(filterSearch.toLowerCase())) || 
          (q.customer?.name && q.customer.name.toLowerCase().includes(filterSearch.toLowerCase()))
        : true;
      return matchesStatus && matchesCustomer && matchesSearch;
    });
  }, [quotations, filterStatus, filterCustomer, filterSearch]);

  // Filtered customer list for searchable dropdown (null-safe & display-safe)
  const filteredCustomersDropdown = useMemo(() => {
    if (!customerSearchQuery) return customers;
    
    // If query matches current selected customer's formatted label, show full list
    if (selectedCustomerObj) {
      const selectedDisplay = `${selectedCustomerObj.company_name || selectedCustomerObj.name} ( ${selectedCustomerObj.phone} )`;
      if (customerSearchQuery === selectedDisplay) {
        return customers;
      }
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

  // Callback to handle newly created customer
  const handleCustomerCreated = (newCustomer) => {
    setCustomers(prev => [newCustomer, ...prev]);
    setSelectedCustomerId(newCustomer.id);
    setCustomerSearchQuery(`${newCustomer.company_name || newCustomer.name} ( ${newCustomer.phone} )`);
    if (sameAsCustomerAddress) {
      setDeliveryAddress(newCustomer.address || '');
    }
  };

  // Callback to handle newly created product
  const handleProductCreated = (newProduct) => {
    setProducts(prev => [newProduct, ...prev]);
    if (newProduct && newProduct.id) {
      addProductBlock(newProduct.id);
    }
  };

  // Add Product Block
  const addProductBlock = (targetProductId = null) => {
    const pId = targetProductId || selectedTopProductId;
    if (!pId) return;
    const prod = products.find(p => p.id === parseInt(pId));
    if (!prod) return;

    const priorityLink = prod.supplier_links?.find(link => link.priority_rank === 1);
    const defaultMinSqft = priorityLink ? (parseFloat(priorityLink.min_billing_sqft) || 0) : 0;
    const defaultUnitPrice = parseFloat(prod.default_unit_price) || 0;

    const defaultNotes = prod.details || 
      `5% Sunscreen Fabrics\nHeavy Duty side clump & Controller\nFittings, Fixing, and installations\nWith all Accessories\nPer Blinds Minimum Quantity ${defaultMinSqft || 20} Sft`;

    const newBlock = {
      id: Date.now() + Math.random(),
      product_id: prod.id,
      product_code: prod.product_code || '',
      product_name: prod.name,
      product_variant_id: null,
      supplier_id: priorityLink ? priorityLink.supplier_id : '',
      unit_price: defaultUnitPrice,
      cost_price: priorityLink ? (parseFloat(priorityLink.cost_price) || 0) : 0,
      min_billing_sqft: defaultMinSqft,
      notes: defaultNotes,
      sizes: [
        {
          id: Date.now() + 1,
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

  // Add Size Row to Product Block
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

  // Remove Size Row from Product Block
  const removeSizeRowFromBlock = (blockId, sizeId) => {
    setProductBlocks(prev => prev.map(block => {
      if (block.id !== blockId) return block;
      const updatedSizes = block.sizes.filter(s => s.id !== sizeId);
      if (updatedSizes.length === 0) {
        updatedSizes.push({
          id: Date.now() + Math.random(),
          width: '',
          height: '',
          pcs: 1,
          actual_sqft: 0,
          billed_sqft: 0,
          line_total: 0
        });
      }
      return {
        ...block,
        sizes: updatedSizes
      };
    }));
  };

  // Remove Product Block
  const removeProductBlock = (blockId) => {
    setProductBlocks(prev => prev.filter(b => b.id !== blockId));
  };

  // Handle inner size changes
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

        return {
          ...updatedSize,
          actual_sqft: singlePieceSqft,
          billed_sqft: billedSqft,
          line_total: lineTotal
        };
      });

      return {
        ...block,
        sizes: updatedSizes
      };
    }));
  };

  // Handle block field changes (e.g. unit_price, notes)
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

  // Real-time Financial summary calculations
  const financialSummary = useMemo(() => {
    let subtotal = 0;

    productBlocks.forEach(block => {
      block.sizes.forEach(size => {
        subtotal += parseFloat(size.line_total) || 0;
      });
    });

    subtotal = Math.round(subtotal * 100) / 100;

    let vatAmt = Math.round((subtotal * (parseFloat(vatPercentage) || 0) / 100) * 100) / 100;
    let discAmt = 0;
    const discVal = parseFloat(discountValue) || 0;
    if (discountType === 'percentage') {
      discAmt = Math.round((subtotal * discVal / 100) * 100) / 100;
    } else {
      discAmt = discVal;
    }

    const net = Math.max(0, Math.round((subtotal + parseFloat(convenienceCharge) + parseFloat(otherCharge) + vatAmt - discAmt) * 100) / 100);

    return {
      subtotal,
      vatAmount: vatAmt,
      discountAmount: discAmt,
      netAmount: net,
    };
  }, [productBlocks, convenienceCharge, otherCharge, vatPercentage, discountType, discountValue]);

  // Form Validation & Save
  const saveQuotation = async (statusOverride = null) => {
    setFormError('');
    
    if (!selectedCustomerId) {
      setFormError('Please select a customer.');
      return;
    }

    if (productBlocks.length === 0) {
      setFormError('At least 1 product line item is required.');
      return;
    }

    const items = [];
    for (let i = 0; i < productBlocks.length; i++) {
      const block = productBlocks[i];
      if (!block.product_id) {
        setFormError(`Block #${i + 1}: Product must be selected.`);
        return;
      }
      if (parseFloat(block.unit_price) <= 0) {
        setFormError(`Block #${i + 1} (${block.product_name}): Unit price must be greater than 0.`);
        return;
      }

      let validSizeCount = 0;
      block.sizes.forEach((s) => {
        const w = parseFloat(s.width) || 0;
        const h = parseFloat(s.height) || 0;
        const pcs = parseInt(s.pcs) || 1;

        if (w > 0 && h > 0 && pcs > 0) {
          validSizeCount++;
          items.push({
            product_id: block.product_id,
            product_variant_id: block.product_variant_id || null,
            supplier_id: block.supplier_id || null,
            width: w,
            height: h,
            pcs: pcs,
            unit_price: parseFloat(block.unit_price) || 0,
            cost_price: block.cost_price || 0,
            min_billing_sqft: block.min_billing_sqft || 0,
            notes: block.notes || '',
          });
        }
      });

      if (validSizeCount === 0) {
        setFormError(`Product "${block.product_name}": At least 1 valid size (Length & Height greater than 0) is required.`);
        return;
      }
    }

    setIsSubmitting(true);
    const payload = {
      customer_id: selectedCustomerId,
      salesman_id: salesmanId,
      convenience_charge: convenienceCharge,
      other_charge: otherCharge,
      other_charge_label: otherChargeLabel,
      vat_percentage: vatPercentage,
      discount_type: discountType,
      discount_value: discountValue,
      note: remark,
      delivery_address: deliveryAddress,
      items: items
    };

    if (statusOverride) {
      payload.status = statusOverride;
    }

    try {
      if (isEditMode) {
        await api.put(`/quotations/${editId}`, payload);
      } else {
        await api.post('/quotations', payload);
      }
      setView('list');
      loadData();
      resetForm();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Error occurred while saving quotation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = async (q) => {
    try {
      setLoading(true);
      let fullQ = q;
      try {
        const res = await api.get(`/quotations/${q.id}`);
        if (res.data && res.data.data) {
          fullQ = res.data.data;
        }
      } catch (e) {
        console.warn('Using list item fallback for quotation edit:', e);
      }

      setIsEditMode(true);
      setEditId(fullQ.id);
      setQuotationNo(fullQ.quotation_number);
      setDate(fullQ.created_at ? fullQ.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10));
      setSelectedCustomerId(fullQ.customer_id);
      setCustomerSearchQuery(fullQ.customer ? `${fullQ.customer.company_name || fullQ.customer.name} ( ${fullQ.customer.phone} )` : '');
      setSalesmanId(fullQ.salesman_id);
      setSalesmanName(fullQ.salesman?.name || '');
      setDeliveryAddress(fullQ.delivery_address || '');
      setConvenienceCharge(parseFloat(fullQ.convenience_charge) || 0);
      setOtherCharge(parseFloat(fullQ.other_charge) || 0);
      setOtherChargeLabel(fullQ.other_charge_label || '');
      setVatPercentage(parseFloat(fullQ.vat_percentage) || 0);
      setDiscountType(fullQ.discount_type || 'flat');
      setDiscountValue(parseFloat(fullQ.discount_value) || 0);
      setRemark(fullQ.note || '');

      // Group items by product_id + unit_price + notes
      const blockMap = new Map();

      (fullQ.items || []).forEach(item => {
        const key = `${item.product_id}_${item.unit_price}_${item.notes || ''}`;
        const prod = products.find(p => p.id === item.product_id) || item.product;
        const prodName = prod ? `${prod.name} ${prod.product_code ? `( ${prod.product_code} )` : ''}` : `Product #${item.product_id}`;

        const width = parseFloat(item.width) || 0;
        const height = parseFloat(item.height) || 0;
        const pcs = parseInt(item.pcs) || 1;
        const unitPrice = parseFloat(item.unit_price) || 0;
        const minSqft = parseFloat(item.min_billing_sqft) || 0;

        const actualSqft = Math.round(((width * height) / 144) * 100) / 100;
        const billedSqft = Math.round((Math.max(actualSqft, minSqft) * pcs) * 100) / 100;
        const lineTotal = Math.round((billedSqft * unitPrice) * 100) / 100;

        const sizeObj = {
          id: item.id || Date.now() + Math.random(),
          width: item.width,
          height: item.height,
          pcs: item.pcs,
          actual_sqft: actualSqft,
          billed_sqft: billedSqft,
          line_total: lineTotal
        };

        if (blockMap.has(key)) {
          blockMap.get(key).sizes.push(sizeObj);
        } else {
          blockMap.set(key, {
            id: Date.now() + Math.random(),
            product_id: item.product_id,
            product_code: prod?.product_code || '',
            product_name: prod?.name || `Product #${item.product_id}`,
            product_variant_id: item.product_variant_id || null,
            supplier_id: item.supplier_id || null,
            unit_price: unitPrice,
            cost_price: item.cost_price || 0,
            min_billing_sqft: minSqft,
            notes: item.notes || '',
            sizes: [sizeObj]
          });
        }
      });

      setProductBlocks(Array.from(blockMap.values()));
      setView('form');
    } catch (err) {
      console.error('Error opening quotation edit form:', err);
      alert('Could not open quotation form.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintClick = async (q, type = 'detailed') => {
    setPrintType(type);
    let fullQ = q;
    try {
      const res = await api.get(`/quotations/${q.id}`);
      if (res.data && res.data.data) {
        fullQ = res.data.data;
      }
    } catch (e) {
      console.warn('Using list item fallback for print:', e);
    }
    setPrintingQuotation(fullQ);
    setIsPrintModalOpen(true);
  };

  const resetForm = () => {
    setIsEditMode(false);
    setEditId(null);
    setQuotationNo('[Auto Generated]');
    setDate(new Date().toISOString().substring(0, 10));
    setSelectedCustomerId('');
    setCustomerSearchQuery('');
    setDeliveryAddress('');
    setSameAsCustomerAddress(false);
    setProductBlocks([]);
    setConvenienceCharge(0);
    setOtherCharge(0);
    setVatPercentage(0);
    setDiscountType('flat');
    setDiscountValue(0);
    setRemark('');
    setTerms('');
    setFormError('');
  };

  const handleArchive = async (id) => {
    if (!confirm('Are you sure you want to archive this quotation?')) return;
    try {
      await api.delete(`/quotations/${id}`);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to archive quotation.');
    }
  };

  const handleRestore = async (id) => {
    try {
      await api.post(`/quotations/${id}/restore`);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to restore quotation.');
    }
  };

  const handleConfirmConvert = async () => {
    if (!convertConfirmTarget) return;
    try {
      await api.post(`/quotations/${convertConfirmTarget.id}/convert-to-order`, {});
      setConvertConfirmTarget(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to convert quotation to order.');
    }
  };

  const handleConfirmApprove = async () => {
    if (!approveConfirmTarget) return;
    try {
      await api.post(`/quotations/${approveConfirmTarget.id}/approve`);
      setApproveConfirmTarget(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to approve quotation.');
    }
  };

  return (
    <div className="content-container animate-fade-in">
      {view === 'list' ? (
        <>
          <div className="page-header-row">
            <div>
              <h1>Quotations & Offers</h1>
              <p>Create and edit active customer quotes, price bids, and convert orders</p>
            </div>
            <button className="primary-btn" onClick={() => { resetForm(); setView('form'); }}>
              + Create Quotation
            </button>
          </div>

          {/* Filters Row */}
          <div className="welcome-banner" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '16px', marginBottom: '16px' }}>
            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '12px' }}>Search ID/Customer</label>
              <input type="text" placeholder="Search..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} style={{ padding: '6px 10px', fontSize: '13px' }} />
            </div>

            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '12px' }}>Status</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '6px 10px', fontSize: '13px', width: '100%', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--bg-base)' }}>
                <option value="">All Statuses</option>
                <option value="quotation">Quotation Draft</option>
                <option value="pending_approval">Pending Approval</option>
                <option value="pending_reapproval">Pending Re-Approval</option>
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
                    <th>Quotation Number</th>
                    <th>Customer</th>
                    <th>Salesman</th>
                    <th>Net Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotations.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-main)' }}>No quotations found.</td>
                    </tr>
                  ) : (
                    filteredQuotations.map((q) => (
                      <tr key={q.id}>
                        <td><strong>{q.quotation_number}</strong></td>
                        <td>{q.customer?.name}</td>
                        <td>{q.salesman?.name}</td>
                        <td>{formatCurrency(q.net_amount)}</td>
                        <td>
                          <span className={`badge ${
                            q.status === 'approved' ? 'badge-success' :
                            q.status === 'invoiced' ? 'badge-info' :
                            (q.status === 'pending_approval' || q.status === 'pending_reapproval') ? 'badge-warning' :
                            q.status === 'rejected' ? 'badge-danger' : 'badge-outline'
                          }`}>
                            {q.status === 'pending_reapproval' ? '⚠️ Pending Re-Approval' :
                             q.status === 'pending_approval' ? '⏳ Pending Approval' :
                             q.status === 'approved' ? '✅ Approved' :
                             q.status === 'invoiced' ? '📄 Invoiced' :
                             q.status === 'rejected' ? '❌ Rejected' : q.status}
                          </span>
                        </td>
                        <td>
                          <button className="text-btn" onClick={() => handleEditClick(q)} disabled={q.status === 'invoiced'}>
                            View/Edit
                          </button>

                          <button className="text-btn" onClick={() => handlePrintClick(q, 'detailed')} style={{ marginLeft: '8px', color: '#17a2b8', fontWeight: 600 }}>
                            🖨️ Detailed Print
                          </button>
                          
                          <button className="text-btn" onClick={() => handlePrintClick(q, 'simplified')} style={{ marginLeft: '8px', color: '#0ea5e9', fontWeight: 600 }}>
                            🖨️ View Print
                          </button>

                          <button className="text-btn" onClick={() => handlePrintClick(q, 'pad-detailed')} style={{ marginLeft: '8px', color: '#8b5cf6', fontWeight: 600 }}>
                            📝 Pad Print (Sizes)
                          </button>

                          <button className="text-btn" onClick={() => handlePrintClick(q, 'pad-simplified')} style={{ marginLeft: '8px', color: '#ec4899', fontWeight: 600 }}>
                            📝 Pad Print
                          </button>
                          
                          {q.status === 'quotation' && (
                            <button className="text-btn" onClick={() => setConvertConfirmTarget(q)} style={{ marginLeft: '8px', color: 'var(--accent)', fontWeight: 700 }}>
                              🛒 Convert to Order
                            </button>
                          )}

                          {(q.status === 'pending_approval' || q.status === 'pending_reapproval') && (can('quotations:approve') || user?.role === 'admin') && (
                            <>
                              <button className="text-btn" onClick={() => setApproveConfirmTarget(q)} style={{ marginLeft: '8px', color: 'var(--success)', fontWeight: 700 }}>
                                ✅ Approve
                              </button>
                              <button className="text-btn" onClick={() => handleReject(q.id)} style={{ marginLeft: '8px', color: 'var(--danger)', fontWeight: 700 }}>
                                ❌ Reject
                              </button>
                            </>
                          )}

                          {q.status !== 'invoiced' && (
                            <button className="text-btn" onClick={() => handleArchive(q.id)} style={{ marginLeft: '8px', color: 'var(--danger)' }}>
                              Archive
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        /* Create/Edit Form View matching sample attached screenshot */
        <div className="animate-fade-in">
          <div className="page-header-row">
            <div>
              <h1>{isEditMode ? 'Edit Quotation' : 'New Quotation'}</h1>
              <p>Fill out the quotation details matching the Dhaka Blinds standard order form</p>
            </div>
            <button className="btn-outline-back" onClick={() => { setView('list'); resetForm(); }}>⬅️ Back to List</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '20px', alignItems: 'start' }}>
            <div>
              {/* TOP HEADER SECTION: 3 Columns (Quotation Date, Select Customer, Select Product) */}
              <div className="form-card-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Quotation Date *</label>
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
                        onChange={(e) => {
                          setCustomerSearchQuery(e.target.value);
                          setShowCustomerDropdown(true);
                        }} 
                        onFocus={() => setShowCustomerDropdown(true)}
                        className="modern-form-control"
                      />
                      {showCustomerDropdown && (
                        <div className="search-dropdown-list">
                          {filteredCustomersDropdown.length === 0 ? (
                            <div className="dropdown-item empty">No customers found</div>
                          ) : (
                            filteredCustomersDropdown.map(c => (
                              <div 
                                key={c.id} 
                                className="dropdown-item"
                                onClick={() => {
                                  setSelectedCustomerId(c.id);
                                  setCustomerSearchQuery(`${c.company_name || c.name} ( ${c.phone} )`);
                                  setShowCustomerDropdown(false);
                                }}
                              >
                                <strong>{c.customer_code}</strong> - {c.company_name || c.name} ({c.phone})
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    <button 
                      type="button" 
                      className="btn-icon-square" 
                      onClick={() => setIsCustomerModalOpen(true)} 
                      title="Add New Customer"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Select Product *</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <select 
                      value={selectedTopProductId} 
                      onChange={(e) => {
                        if (e.target.value) addProductBlock(e.target.value);
                      }}
                      className="modern-form-control"
                    >
                      <option value="">Select Product...</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.product_code ? `${p.product_code} - ${p.name}` : p.name}</option>
                      ))}
                    </select>
                    <button 
                      type="button" 
                      className="btn-icon-square" 
                      onClick={() => setIsProductModalOpen(true)} 
                      title="Add New Product"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* DELIVERY ADDRESS SECTION */}
              <div className="form-card-section" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontWeight: '600', fontSize: '13px', margin: 0 }}>Delivery Address</label>
                  <label style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: '#ef4444', fontWeight: '600', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={sameAsCustomerAddress} 
                      onChange={(e) => setSameAsCustomerAddress(e.target.checked)} 
                      style={{ marginRight: '6px', width: 'auto' }}
                    />
                    🔴 Same as Customer Address
                  </label>
                </div>
                <input 
                  type="text" 
                  value={deliveryAddress} 
                  onChange={(e) => setDeliveryAddress(e.target.value)} 
                  placeholder="Delivery Address"
                  className="modern-form-control"
                />
              </div>

              {/* PRODUCT LINE ITEMS TABLE MATCHING SAMPLE ATTACHED SCREENSHOT */}
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
                          No items added yet. Select a product from the <strong>"Select Product *"</strong> dropdown above to add items.
                        </td>
                      </tr>
                    ) : (
                      productBlocks.map((block) => {
                        const totalBilledSqft = block.sizes.reduce((sum, s) => sum + (parseFloat(s.billed_sqft) || 0), 0);
                        const totalPrice = block.sizes.reduce((sum, s) => sum + (parseFloat(s.line_total) || 0), 0);

                        return (
                          <React.Fragment key={block.id}>
                            {/* Main Product Rows & Inner Size Rows */}
                            {block.sizes.map((sizeRow, sIdx) => (
                              <tr key={sizeRow.id} style={{ background: '#fff' }}>
                                {/* Product Code * ONLY (Rowspan across size rows) */}
                                {sIdx === 0 && (
                                  <td rowSpan={block.sizes.length} style={{ verticalAlign: 'top', paddingTop: '12px', background: '#fafafa', borderRight: '1px solid var(--border)', minWidth: '160px', padding: '12px 10px' }}>
                                    <button 
                                      type="button" 
                                      onClick={() => setActiveSupplierPopoverBlockId(prev => prev === block.id ? null : block.id)}
                                      style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', outline: 'none' }}
                                      title="Click to view linked Supplier details"
                                    >
                                      <span style={{ 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        gap: '6px', 
                                        fontWeight: 'bold', 
                                        fontSize: '14px', 
                                        color: 'var(--primary)', 
                                        padding: '4px 8px', 
                                        backgroundColor: 'rgba(37, 99, 235, 0.08)', 
                                        borderRadius: '6px',
                                        border: '1px solid rgba(37, 99, 235, 0.2)'
                                      }}>
                                        🏷️ {block.product_code || block.product_name}
                                      </span>
                                    </button>

                                    {/* Linked Supplier Popover Card */}
                                    {activeSupplierPopoverBlockId === block.id && (
                                      <div style={{ marginTop: '8px', padding: '10px 12px', background: '#ffffff', border: '1px solid #3b82f6', borderRadius: '8px', boxShadow: '0 4px 14px rgba(0,0,0,0.12)', fontSize: '11px', textAlign: 'left', zIndex: 10 }}>
                                        <div style={{ fontWeight: 'bold', color: '#1e40af', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span>🏢 Linked Supplier Info:</span>
                                          <span style={{ cursor: 'pointer', color: '#ef4444' }} onClick={() => setActiveSupplierPopoverBlockId(null)}>✖</span>
                                        </div>
                                        {(() => {
                                          const prod = products.find(p => p.id === block.product_id);
                                          const links = prod?.supplier_links || [];
                                          if (links.length === 0) return <div style={{ color: '#64748b' }}>No direct supplier linked</div>;
                                          return links.map((link, lIdx) => (
                                            <div key={lIdx} style={{ padding: '4px 0', borderBottom: lIdx < links.length - 1 ? '1px dashed #e2e8f0' : 'none' }}>
                                              <div style={{ fontWeight: '600', color: '#0f172a' }}>
                                                Rank #{link.priority_rank}: {link.supplier?.name || `Supplier #${link.supplier_id}`}
                                              </div>
                                              <div style={{ color: '#475569', fontSize: '10px' }}>
                                                Cost Price: <strong>৳{link.cost_price || 0}</strong> | MOQ: <strong>{link.min_billing_sqft || 0} Sq.Ft</strong>
                                              </div>
                                              {link.supplier?.phone && <div style={{ color: '#2563eb', fontSize: '10px' }}>📞 {link.supplier.phone}</div>}
                                            </div>
                                          ));
                                        })()}
                                      </div>
                                    )}
                                  </td>
                                )}

                                {/* Unit Price (Rowspan across size rows) */}
                                {sIdx === 0 && (
                                  <td rowSpan={block.sizes.length} style={{ verticalAlign: 'top', paddingTop: '12px', background: '#fafafa', borderRight: '1px solid var(--border)', minWidth: '120px', padding: '12px 8px' }}>
                                    <input 
                                      type="number" 
                                      value={block.unit_price} 
                                      onChange={(e) => handleBlockChange(block.id, 'unit_price', e.target.value)} 
                                      className="modern-form-control"
                                      style={{ textAlign: 'center', fontWeight: '600', padding: '8px 10px', fontSize: '13px', width: '100%', minWidth: '90px' }}
                                    />
                                  </td>
                                )}

                                {/* Length */}
                                <td style={{ padding: '6px' }}>
                                  <input 
                                    type="number" 
                                    value={sizeRow.width} 
                                    onChange={(e) => handleSizeChange(block.id, sizeRow.id, 'width', e.target.value)} 
                                    placeholder="Length" 
                                    className="modern-form-control"
                                  />
                                </td>

                                {/* Height */}
                                <td style={{ padding: '6px' }}>
                                  <input 
                                    type="number" 
                                    value={sizeRow.height} 
                                    onChange={(e) => handleSizeChange(block.id, sizeRow.id, 'height', e.target.value)} 
                                    placeholder="Height" 
                                    className="modern-form-control"
                                  />
                                </td>

                                {/* Pcs */}
                                <td style={{ padding: '6px' }}>
                                  <input 
                                    type="number" 
                                    value={sizeRow.pcs} 
                                    onChange={(e) => handleSizeChange(block.id, sizeRow.id, 'pcs', e.target.value)} 
                                    className="modern-form-control"
                                    style={{ textAlign: 'center' }}
                                  />
                                </td>

                                {/* Sq.Ft + Delete Size Row button */}
                                <td style={{ padding: '6px' }}>
                                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    <input 
                                      type="text" 
                                      value={sizeRow.billed_sqft ? sizeRow.billed_sqft.toFixed(2) : '0'} 
                                      readOnly 
                                      className="modern-form-control"
                                      style={{ backgroundColor: '#f1f5f9', fontWeight: '600', textAlign: 'center' }}
                                      title={sizeRow.actual_sqft < block.min_billing_sqft ? `MOQ (${block.min_billing_sqft} Sq.Ft/pc) Applied` : `Total Sq.Ft for ${sizeRow.pcs} pcs`}
                                    />
                                    {block.sizes.length > 1 && (
                                      <button 
                                        type="button" 
                                        onClick={() => removeSizeRowFromBlock(block.id, sizeRow.id)}
                                        className="btn-action-circle btn-action-delete"
                                        style={{ padding: '4px 6px', fontSize: '12px' }}
                                        title="Delete Size Line"
                                      >
                                        🗑️
                                      </button>
                                    )}
                                  </div>
                                </td>

                                {/* Quantity / Total Billed Sq.Ft (Rowspan across size rows) */}
                                {sIdx === 0 && (
                                  <td rowSpan={block.sizes.length} style={{ verticalAlign: 'top', paddingTop: '12px', background: '#fafafa', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', minWidth: '120px', padding: '12px 8px' }}>
                                    <input 
                                      type="text" 
                                      value={totalBilledSqft.toFixed(2)} 
                                      readOnly 
                                      className="modern-form-control"
                                      style={{ backgroundColor: '#f1f5f9', fontWeight: '600', textAlign: 'center', padding: '8px 10px', fontSize: '13px', width: '100%', minWidth: '90px' }}
                                    />
                                  </td>
                                )}

                                {/* Total Price (Rowspan across size rows) */}
                                {sIdx === 0 && (
                                  <td rowSpan={block.sizes.length} style={{ verticalAlign: 'top', paddingTop: '12px', background: '#fafafa', borderRight: '1px solid var(--border)', minWidth: '140px', padding: '12px 8px' }}>
                                    <input 
                                      type="text" 
                                      value={totalPrice.toFixed(2)} 
                                      readOnly 
                                      className="modern-form-control"
                                      style={{ backgroundColor: '#f1f5f9', fontWeight: 'bold', color: 'var(--primary)', textAlign: 'center', padding: '8px 10px', fontSize: '14px', width: '100%', minWidth: '110px' }}
                                    />
                                  </td>
                                )}

                                {/* Block Action Buttons (Rowspan across size rows) */}
                                {sIdx === 0 && (
                                  <td rowSpan={block.sizes.length} style={{ verticalAlign: 'top', paddingTop: '12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <button 
                                      type="button" 
                                      onClick={() => removeProductBlock(block.id)} 
                                      className="btn-action-circle btn-action-delete"
                                      title="Delete Product Block"
                                      style={{ marginRight: '6px' }}
                                    >
                                      🗑️
                                    </button>
                                    <button 
                                      type="button" 
                                      onClick={() => addSizeRowToBlock(block.id)} 
                                      className="btn-action-circle btn-action-add"
                                      title="Add Size Measurement Row"
                                    >
                                      ➕
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}

                            {/* Rich Specification / Description Box (Only ONCE per Product Block) */}
                            <tr style={{ background: '#f8fafc' }}>
                              <td colSpan="8" style={{ padding: '10px 14px' }}>
                                <div className="spec-editor-card">
                                  {/* Formatting Toolbar */}
                                  <div className="spec-editor-toolbar">
                                    <span className="spec-editor-btn" title="Undo">↩️</span>
                                    <span className="spec-editor-btn" title="Redo">↪️</span>
                                    <span className="spec-editor-btn" style={{ fontWeight: 'bold' }}>Paragraph ▾</span>
                                    <span className="spec-editor-btn" style={{ fontWeight: 'bold' }}>B</span>
                                    <span className="spec-editor-btn" style={{ fontStyle: 'italic' }}>I</span>
                                    <span className="spec-editor-btn">🔗</span>
                                    <span className="spec-editor-btn">🖼️</span>
                                    <span className="spec-editor-btn">📊</span>
                                    <span className="spec-editor-btn">🎬</span>
                                    <span className="spec-editor-btn">≡ ▾</span>
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
                                <button 
                                  type="button" 
                                  onClick={() => handleBlockChange(block.id, 'notes', '')} 
                                  className="btn-action-circle btn-action-delete"
                                  title="Clear Description"
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* BOTTOM SUMMARY FIELDS MATCHING SAMPLE ATTACHED SCREENSHOT */}
              <div className="form-card-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Total Amount *</label>
                  <input type="text" value={financialSummary.subtotal.toFixed(2)} readOnly className="modern-form-control" style={{ backgroundColor: 'var(--bg-base)', fontWeight: 'bold' }} />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Convence Amount *</label>
                  <input type="number" value={convenienceCharge} onChange={(e) => setConvenienceCharge(parseFloat(e.target.value) || 0)} className="modern-form-control" />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Other Charge Label</label>
                  <input type="text" value={otherChargeLabel} onChange={(e) => setOtherChargeLabel(e.target.value)} placeholder="e.g. old blinds serviceing charge" className="modern-form-control" />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Others Charge</label>
                  <input type="number" value={otherCharge} onChange={(e) => setOtherCharge(parseFloat(e.target.value) || 0)} className="modern-form-control" />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Vat %</label>
                  <input type="number" value={vatPercentage} onChange={(e) => setVatPercentage(parseFloat(e.target.value) || 0)} className="modern-form-control" />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Net Amount *</label>
                  <input type="text" value={financialSummary.netAmount.toFixed(2)} readOnly className="modern-form-control" style={{ backgroundColor: 'var(--bg-base)', fontWeight: '800', color: 'var(--primary)', fontSize: '15px' }} />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 3', margin: 0 }}>
                  <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Remarks</label>
                  <input type="text" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="If have any note" className="modern-form-control" />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 3', margin: 0 }}>
                  <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Note</label>
                  <textarea 
                    value={terms} 
                    onChange={(e) => setTerms(e.target.value)} 
                    rows="3" 
                    placeholder="Payment & delivery terms..." 
                    className="modern-form-control"
                  />
                </div>
              </div>

              {/* BOTTOM ACTION BUTTONS MATCHING SAMPLE ATTACHED SCREENSHOT */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', margin: '24px 0 10px 0' }}>
                <button 
                  type="button" 
                  className="btn-gradient-submit" 
                  onClick={() => saveQuotation()} 
                  disabled={isSubmitting}
                >
                  💾 {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
                <button 
                  type="button" 
                  className="btn-outline-back" 
                  onClick={() => { setView('list'); resetForm(); }}
                >
                  ⬅️ Back
                </button>
              </div>
            </div>

            {/* RIGHT FINANCIAL SUMMARY SIDEBAR (Maintained without changes as specified) */}
            <div>
              <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'stretch', padding: '24px' }}>
                <h3 style={{ margin: '0 0 20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-heading)' }}>
                  Financial Summary
                </h3>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px' }}>
                  <span>Subtotal:</span>
                  <span style={{ fontWeight: '600' }}>{formatCurrency(financialSummary.subtotal)}</span>
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '13px' }}>Convenience Charge</label>
                  <input type="number" value={convenienceCharge} onChange={(e) => setConvenienceCharge(parseFloat(e.target.value) || 0)} />
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '13px' }}>Other Charge Label</label>
                  <input type="text" value={otherChargeLabel} onChange={(e) => setOtherChargeLabel(e.target.value)} placeholder="e.g. old blinds serviceing charge" style={{ fontSize: '12px', marginBottom: '4px' }} />
                  <label style={{ fontSize: '13px' }}>Other Charge Amount</label>
                  <input type="number" value={otherCharge} onChange={(e) => setOtherCharge(parseFloat(e.target.value) || 0)} />
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '13px' }}>VAT (%)</label>
                  <input type="number" value={vatPercentage} onChange={(e) => setVatPercentage(parseFloat(e.target.value) || 0)} />
                  <div style={{ fontSize: '12px', color: 'var(--text-main)', marginTop: '4px', textAlign: 'right' }}>
                    Amt: <strong>{formatCurrency(financialSummary.vatAmount)}</strong>
                  </div>
                </div>

                <div className="form-group" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '13px', margin: 0 }}>Discount</label>
                    <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                      <button 
                        type="button" 
                        className={`text-btn ${discountType === 'flat' ? 'active' : ''}`}
                        onClick={() => setDiscountType('flat')}
                        style={{ padding: '2px 8px', fontSize: '11px', backgroundColor: discountType === 'flat' ? 'var(--primary)' : 'transparent', color: discountType === 'flat' ? '#fff' : 'var(--text-main)' }}
                      >
                        Flat
                      </button>
                      <button 
                        type="button" 
                        className={`text-btn ${discountType === 'percentage' ? 'active' : ''}`}
                        onClick={() => setDiscountType('percentage')}
                        style={{ padding: '2px 8px', fontSize: '11px', backgroundColor: discountType === 'percentage' ? 'var(--primary)' : 'transparent', color: discountType === 'percentage' ? '#fff' : 'var(--text-main)' }}
                      >
                        %
                      </button>
                    </div>
                  </div>
                  <input type="number" value={discountValue} onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)} />
                  {discountType === 'percentage' && (
                    <div style={{ fontSize: '12px', color: 'var(--text-main)', marginTop: '4px', textAlign: 'right' }}>
                      Amt: <strong>{formatCurrency(financialSummary.discountAmount)}</strong>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '2px solid var(--primary)', paddingTop: '16px', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Net Amount</span>
                  <span style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)' }}>
                    {formatCurrency(financialSummary.netAmount)}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '24px' }}>
                  <button type="button" className="primary-btn" onClick={() => saveQuotation()} disabled={isSubmitting} style={{ padding: '12px' }}>
                    💾 {isSubmitting ? 'Saving...' : 'Save as Quotation'}
                  </button>
                  <button type="button" className="logout-btn" onClick={() => saveQuotation('pending_approval')} disabled={isSubmitting} style={{ padding: '10px' }}>
                    Convert to Order
                  </button>
                  <button type="button" className="logout-btn" onClick={() => { setView('list'); resetForm(); }} style={{ padding: '10px' }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal dialog for creating inline customer */}
      <CustomerModal 
        isOpen={isCustomerModalOpen} 
        onClose={() => setIsCustomerModalOpen(false)} 
        onCustomerCreated={handleCustomerCreated}
      />

      {/* Modal dialog for creating inline product */}
      <ProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onProductSaved={handleProductCreated}
      />

      {/* Printable Quotation PDF Modal */}
      <QuotationPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        quotation={printingQuotation}
        printType={printType}
      />
      {/* Simple Convert Confirmation Modal */}
      {convertConfirmTarget && (
        <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && setConvertConfirmTarget(null)}>
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '420px', padding: '24px', textAlign: 'center' }}>
            <div style={{ fontSize: '42px', marginBottom: '8px' }}>🛒</div>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-heading)' }}>Convert to Order?</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-main)', margin: '0 0 20px 0' }}>
              Are you sure you want to convert Quotation <strong>#{convertConfirmTarget.quotation_number}</strong> to a confirmed Sales Order?
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <button type="button" className="logout-btn" onClick={() => setConvertConfirmTarget(null)} style={{ padding: '8px 18px' }}>
                Cancel
              </button>
              <button type="button" className="primary-btn" onClick={handleConfirmConvert} style={{ padding: '8px 20px', fontWeight: 'bold' }}>
                Yes, Convert Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simple Approve Confirmation Modal */}
      {approveConfirmTarget && (
        <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && setApproveConfirmTarget(null)}>
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '420px', padding: '24px', textAlign: 'center' }}>
            <div style={{ fontSize: '42px', marginBottom: '8px' }}>✅</div>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--success)' }}>Approve Order?</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-main)', margin: '0 0 20px 0' }}>
              Are you sure you want to approve Order <strong>#{approveConfirmTarget.quotation_number}</strong>?
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <button type="button" className="logout-btn" onClick={() => setApproveConfirmTarget(null)} style={{ padding: '8px 18px' }}>
                Cancel
              </button>
              <button type="button" className="primary-btn" onClick={handleConfirmApprove} style={{ padding: '8px 20px', fontWeight: 'bold', backgroundColor: 'var(--success)', borderColor: 'var(--success)' }}>
                Yes, Approve Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Quotations;
