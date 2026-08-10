import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { formatCurrency, formatDate } from '../utils/format';
import CustomerModal from '../components/CustomerModal';
import ProductModal from '../components/ProductModal';
import QuotationPrintModal from '../components/QuotationPrintModal';

const Orders = () => {
  const navigate = useNavigate();
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

  // Filters & Reporting Period
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Print Modal States
  const [printingOrder, setPrintingOrder] = useState(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printType, setPrintType] = useState('detailed');

  // Excel Paste Modal States
  const [excelPasteTargetBlock, setExcelPasteTargetBlock] = useState(null);
  const [excelPasteText, setExcelPasteText] = useState('');

  // -------------------------------------------------------------
  // FORM STATE FOR DIRECT ORDER CREATION (Dynamic Builder)
  // -------------------------------------------------------------
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [sameAsCustomerAddress, setSameAsCustomerAddress] = useState(false);
  const [selectedTopProductId, setSelectedTopProductId] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [lastAddedProductName, setLastAddedProductName] = useState('');

  // Change-product picker (per row, in the item-builder table)
  const [productChangeBlockId, setProductChangeBlockId] = useState(null);
  const [productChangeQuery, setProductChangeQuery] = useState('');

  // Dynamic Section-based Form State
  const [sections, setSections] = useState([
    {
      id: 'sec_default',
      name: 'Section A: Main Items',
      blocks: []
    }
  ]);

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

  // Modals
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);

  // Fetch orders list fast
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/quotations?all=1');
      const allItems = response.data?.data?.data || response.data?.data || [];
      const confirmedOrders = allItems.filter(q => q && q.status !== 'quotation');
      setOrders(confirmedOrders);
    } catch (err) {
      setError('Failed to retrieve orders list.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch customers & basic data for order form fast
  const loadBasicData = useCallback(async () => {
    try {
      const custRes = await api.get('/customers?all=1');
      const custsData = custRes.data?.data?.data || custRes.data?.data || [];
      setCustomers(Array.isArray(custsData) ? custsData : []);
    } catch (err) {
      console.warn('Error loading customers for order form:', err);
    }
  }, []);

  // Lazy load products when user enters form view
  const loadProducts = useCallback(async () => {
    if (products.length > 0) return;
    try {
      const prodRes = await api.get('/products');
      const prodsData = prodRes.data?.data?.data || prodRes.data?.data || [];
      setProducts(Array.isArray(prodsData) ? prodsData : []);
    } catch (err) {
      console.warn('Products lazy load error:', err);
    }
  }, [products.length]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (view === 'form') {
      loadBasicData();
      loadProducts();
    }
  }, [view, loadBasicData, loadProducts]);

  const loadOrderDetails = async (id) => {
    try {
      setLoading(true);
      const response = await api.get(`/quotations/${id}`);
      setSelectedOrder(response.data?.data || response.data);
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
      const res = await api.post(`/invoices/generate/${id}`);
      alert(res.data?.message || 'Invoice generated successfully.');
      navigate('/invoices');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to generate invoice.');
    }
  };

  const filteredOrders = useMemo(() => {
    if (!Array.isArray(orders)) return [];
    return orders.filter(o => {
      if (!o) return false;
      const matchesStatus = filterStatus ? o.status === filterStatus : true;
      const searchQ = (filterSearch || '').toLowerCase().trim();
      const matchesSearch = searchQ
        ? (o.quotation_number && String(o.quotation_number).toLowerCase().includes(searchQ)) ||
          (o.customer?.name && String(o.customer.name).toLowerCase().includes(searchQ)) ||
          (o.customer?.phone && String(o.customer.phone).toLowerCase().includes(searchQ))
        : true;
      return matchesStatus && matchesSearch;
    });
  }, [orders, filterStatus, filterSearch]);

  const selectedCustomerObj = useMemo(() => {
    return customers.find(c => c.id === parseInt(selectedCustomerId));
  }, [selectedCustomerId, customers]);

  useEffect(() => {
    if (sameAsCustomerAddress && selectedCustomerObj) {
      setDeliveryAddress(selectedCustomerObj.address || '');
    }
  }, [sameAsCustomerAddress, selectedCustomerObj]);

  const filteredCustomersDropdown = useMemo(() => {
    if (!customerSearchQuery) return customers;
    if (selectedCustomerObj) {
      const selectedDisplay = selectedCustomerObj.company_name || selectedCustomerObj.name;
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

  const filteredProductsDropdown = useMemo(() => {
    if (!productSearchQuery) return products;
    const q = productSearchQuery.toLowerCase().trim();
    return products.filter(p => {
      const code = p.product_code ? p.product_code.toLowerCase() : '';
      const name = p.name ? p.name.toLowerCase() : '';
      return code.includes(q) || name.includes(q);
    });
  }, [products, productSearchQuery]);

  const filteredProductsForChange = useMemo(() => {
    if (!productChangeQuery) return products;
    const q = productChangeQuery.toLowerCase().trim();
    return products.filter(p => {
      const code = p.product_code ? p.product_code.toLowerCase() : '';
      const name = p.name ? p.name.toLowerCase() : '';
      return code.includes(q) || name.includes(q);
    });
  }, [products, productChangeQuery]);

  // ----------------------------------------------------
  // Dynamic Section & Option Helper Methods (Identical to Quotations)
  // ----------------------------------------------------
  const addSection = () => {
    const char = String.fromCharCode(65 + sections.length);
    const newSec = {
      id: 'sec_' + Date.now() + Math.random(),
      name: `Section ${char}: New Category`,
      blocks: []
    };
    setSections(prev => [...prev, newSec]);
  };

  const removeSection = (sectionId) => {
    if (sections.length <= 1) {
      alert('At least 1 section must remain.');
      return;
    }
    setSections(prev => prev.filter(s => s.id !== sectionId));
  };

  const updateSectionName = (sectionId, newName) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, name: newName } : s));
  };

  const addProductBlockToSection = (sectionId, targetProductId = null, isOptional = false, optionGroupId = null, initialSelected = true) => {
    let pId = targetProductId || selectedTopProductId;
    if (!pId && products.length > 0) {
      pId = products[0].id;
    }
    if (!pId) {
      alert('Please wait for products to load or add a product first.');
      return;
    }
    const prod = products.find(p => p.id === parseInt(pId));
    if (!prod) return;

    const priorityLink = prod.supplier_links?.find(link => link.priority_rank === 1);
    const defaultMinSqft = priorityLink ? (parseFloat(priorityLink.min_billing_sqft) || 0) : 0;
    const defaultUnitPrice = parseFloat(prod.default_unit_price) || 0;

    const defaultNotes = prod.details || 
      `5% Sunscreen Fabrics\nHeavy Duty side clump & Controller\nFittings, Fixing, and installations\nWith all Accessories\nPer Blinds Minimum Quantity ${defaultMinSqft || 20} Sft`;

    const newBlock = {
      id: Date.now() + Math.random(),
      section_id: sectionId,
      option_group_id: optionGroupId,
      is_optional: isOptional,
      is_selected: initialSelected,
      is_enabled_for_print: true,
      product_id: prod.id,
      product_code: prod.product_code || '',
      product_name: prod.name,
      product_variant_id: null,
      supplier_id: priorityLink ? priorityLink.supplier_id : '',
      unit_price: defaultUnitPrice,
      cost_price: priorityLink ? (parseFloat(priorityLink.cost_price) || 0) : 0,
      min_billing_sqft: defaultMinSqft,
      notes: defaultNotes,
      // Start with 4 empty size rows so mobile users can fill in
      // multiple window sizes right away; unused rows can be deleted.
      sizes: Array.from({ length: 4 }, (_, i) => ({
        id: Date.now() + i + 1,
        width: '',
        height: '',
        pcs: 1,
        actual_sqft: 0,
        billed_sqft: 0,
        line_total: 0
      }))
    };

    setSections(prev => prev.map(sec => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        blocks: [...sec.blocks, newBlock]
      };
    }));
    setSelectedTopProductId('');
  };

  const addOptionGroupToSection = (sectionId) => {
    const optGrpId = 'opt_' + Date.now() + Math.random();
    if (products.length > 0) {
      addProductBlockToSection(sectionId, products[0].id, true, optGrpId, true);
    } else {
      alert('Please add products to system first.');
    }
  };

  const addOptionVariantToGroup = (sectionId, optionGroupId) => {
    if (products.length > 0) {
      addProductBlockToSection(sectionId, products[0].id, true, optionGroupId, false);
    }
  };

  const toggleOptionSelected = (sectionId, optionGroupId, targetBlockId) => {
    setSections(prev => prev.map(sec => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        blocks: sec.blocks.map(block => {
          if (block.option_group_id === optionGroupId) {
            return {
              ...block,
              is_selected: block.id === targetBlockId
            };
          }
          return block;
        })
      };
    }));
  };

  const addSizeRowToBlock = (sectionId, blockId) => {
    setSections(prev => prev.map(sec => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        blocks: sec.blocks.map(block => {
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
        })
      };
    }));
  };

  const removeSizeRowFromBlock = (sectionId, blockId, sizeId) => {
    setSections(prev => prev.map(sec => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        blocks: sec.blocks.map(block => {
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
        })
      };
    }));
  };

  const removeProductBlock = (sectionId, blockId) => {
    setSections(prev => prev.map(sec => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        blocks: sec.blocks.filter(b => b.id !== blockId)
      };
    }));
  };

  const handleImportExcelSizes = () => {
    if (!excelPasteTargetBlock || !excelPasteText.trim()) return;
    const { sectionId, blockId } = excelPasteTargetBlock;

    const lines = excelPasteText.split('\n');
    const newSizeRows = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const parts = trimmed.split(/[\t,;\s]+/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const w = parseFloat(parts[0]) || 0;
        const h = parseFloat(parts[1]) || 0;
        const pcs = parts[2] ? (parseInt(parts[2]) || 1) : 1;

        if (w > 0 && h > 0) {
          newSizeRows.push({
            id: Date.now() + Math.random(),
            width: w,
            height: h,
            pcs: pcs,
            actual_sqft: 0,
            billed_sqft: 0,
            line_total: 0
          });
        }
      }
    });

    if (newSizeRows.length === 0) {
      alert('No valid measurements found. Please ensure you copied Width and Height columns (e.g. 60 [Tab] 80 [Tab] 2).');
      return;
    }

    setSections(prev => prev.map(sec => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        blocks: sec.blocks.map(block => {
          if (block.id !== blockId) return block;

          const unitPrice = parseFloat(block.unit_price) || 0;
          const minSqft = parseFloat(block.min_billing_sqft) || 0;

          const calculatedRows = newSizeRows.map(row => {
            const w = parseFloat(row.width) || 0;
            const h = parseFloat(row.height) || 0;
            const pcs = parseInt(row.pcs) || 1;
            const singlePieceSqft = Math.round(((w * h) / 144) * 100) / 100;
            const sqftPerPiece = Math.max(singlePieceSqft, minSqft);
            const totalBilledSqft = Math.round((sqftPerPiece * pcs) * 100) / 100;
            const lineTotal = Math.round((totalBilledSqft * unitPrice) * 100) / 100;

            return {
              ...row,
              actual_sqft: singlePieceSqft,
              billed_sqft: totalBilledSqft,
              line_total: lineTotal
            };
          });

          const existingValidSizes = block.sizes.filter(s => parseFloat(s.width) > 0 && parseFloat(s.height) > 0);
          return {
            ...block,
            sizes: [...existingValidSizes, ...calculatedRows]
          };
        })
      };
    }));

    setExcelPasteTargetBlock(null);
    setExcelPasteText('');
  };

  const handleSizeChange = (sectionId, blockId, sizeId, field, value) => {
    setSections(prev => prev.map(sec => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        blocks: sec.blocks.map(block => {
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

          return { ...block, sizes: updatedSizes };
        })
      };
    }));
  };

  const handleBlockChange = (sectionId, blockId, field, value) => {
    setSections(prev => prev.map(sec => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        blocks: sec.blocks.map(block => {
          if (block.id !== blockId) return block;

          let updatedBlock = { ...block, [field]: value };

          if (field === 'product_id') {
            const prod = products.find(p => p.id === parseInt(value));
            if (prod) {
              const priorityLink = prod.supplier_links?.find(link => link.priority_rank === 1);
              const defaultMinSqft = priorityLink ? (parseFloat(priorityLink.min_billing_sqft) || 0) : 0;
              const defaultUnitPrice = parseFloat(prod.default_unit_price) || 0;

              updatedBlock.product_name = prod.name;
              updatedBlock.product_code = prod.product_code || '';
              updatedBlock.unit_price = defaultUnitPrice;
              updatedBlock.cost_price = priorityLink ? (parseFloat(priorityLink.cost_price) || 0) : 0;
              updatedBlock.min_billing_sqft = defaultMinSqft;
              updatedBlock.supplier_id = priorityLink ? priorityLink.supplier_id : '';
              updatedBlock.notes = prod.details || 
                `5% Sunscreen Fabrics\nHeavy Duty side clump & Controller\nFittings, Fixing, and installations\nWith all Accessories\nPer Blinds Minimum Quantity ${defaultMinSqft || 20} Sft`;
            }
          }

          if (field === 'unit_price' || field === 'product_id') {
            const unitPrice = parseFloat(updatedBlock.unit_price) || 0;
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
        })
      };
    }));
  };

  // Real-time Financial summary calculations
  const financialSummary = useMemo(() => {
    let subtotal = 0;

    sections.forEach(sec => {
      sec.blocks.forEach(block => {
        if (block.is_enabled_for_print !== false && block.is_selected !== false) {
          block.sizes.forEach(size => {
            subtotal += parseFloat(size.line_total) || 0;
          });
        }
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
  }, [sections, convenienceCharge, otherCharge, vatPercentage, discountType, discountValue]);

  const resetForm = () => {
    setDate(new Date().toISOString().substring(0, 10));
    setSelectedCustomerId('');
    setCustomerSearchQuery('');
    setDeliveryAddress('');
    setSameAsCustomerAddress(false);
    setSections([
      {
        id: 'sec_default',
        name: 'Section A: Main Items',
        blocks: []
      }
    ]);
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
    if (e) e.preventDefault();
    setFormError('');

    if (!selectedCustomerId) {
      setFormError('Please select a customer.');
      return;
    }

    let hasBlocks = false;
    sections.forEach(s => {
      if (s.blocks.length > 0) hasBlocks = true;
    });

    if (!hasBlocks) {
      setFormError('Please add at least one product or option block to the order.');
      return;
    }

    // Build items array
    const items = [];
    for (const sec of sections) {
      for (const block of sec.blocks) {
        if (!block.product_id) {
          setFormError(`[${sec.name}] Please select a product for all blocks.`);
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
              section_name: sec.name,
              option_group_id: block.option_group_id || null,
              is_optional: block.is_optional || false,
              is_selected: block.is_selected !== false,
              is_enabled_for_print: block.is_enabled_for_print !== false,
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
          setFormError(`[${sec.name}] Product "${block.product_name}": At least 1 valid size (Width & Height greater than 0) is required.`);
          return;
        }
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
      delivery_address: deliveryAddress || null,
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
          <div className="page-header-row no-print">
            <div>
              <h1>Confirmed Orders</h1>
              <p>Manage confirmed sales orders, manager approvals, and automated supplier routing</p>
            </div>
            <button className="primary-btn" onClick={() => { resetForm(); setView('form'); }}>
              + Create Order
            </button>
          </div>

          <div className="no-print list-filter-row" style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search by order number or customer..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="modern-form-control"
              style={{ width: '280px' }}
            />

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="modern-form-control"
              style={{ width: '200px' }}
            >
              <option value="">All Statuses</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="approved">Approved</option>
              <option value="invoiced">Invoiced</option>
              <option value="rejected">Rejected</option>
            </select>
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
                    <th className="hide-mobile-col">Customer Address</th>
                    <th>Delivery Address</th>
                    <th className="hide-mobile-col">Salesman</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center' }}>No confirmed orders found.</td>
                    </tr>
                  ) : (
                    filteredOrders.map((o) => (
                      <tr key={o.id}>
                        <td><strong>{o.quotation_number}</strong></td>
                        <td>
                          <strong>{o.customer?.name || 'N/A'}</strong>
                        </td>
                        <td className="hide-mobile-col">
                          <div style={{ fontSize: '12px', color: 'var(--text-main)', maxWidth: '180px', whiteSpace: 'normal', lineHeight: '1.4' }}>
                            {o.customer?.address || 'N/A'}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: '12px', color: '#15803d', fontWeight: 600, maxWidth: '180px', whiteSpace: 'normal', lineHeight: '1.4' }}>
                            {o.delivery_address || o.customer?.address || 'N/A'}
                          </div>
                        </td>
                        <td className="hide-mobile-col">{o.salesman?.name || o.creator?.name || '-'}</td>
                        <td>
                          <span className={`badge ${
                            o.status === 'approved' ? 'badge-success' :
                            o.status === 'invoiced' ? 'badge-info' :
                            o.status === 'pending_approval' ? 'badge-warning' : 'badge-danger'
                          }`}>
                            {o.status?.replace('_', ' ')}
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDate(o.created_at || o.date)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="btn-action-circle"
                            onClick={() => loadOrderDetails(o.id)}
                            title="View Order Details"
                            style={{ marginRight: '6px' }}
                          >
                            👁️
                          </button>
                          <button
                            type="button"
                            className="btn-action-circle"
                            onClick={async () => {
                              try {
                                const res = await api.get(`/quotations/${o.id}`);
                                const fullOrder = res.data?.data || res.data || o;
                                setPrintingOrder(fullOrder);
                                setIsPrintModalOpen(true);
                              } catch (err) {
                                setPrintingOrder(o);
                                setIsPrintModalOpen(true);
                              }
                            }}
                            title="Print Order"
                          >
                            🖨️
                          </button>
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
              <h1>Order #{selectedOrder?.quotation_number}</h1>
              <p>Confirmed Sales Order Details &amp; Automated Supplier Routing</p>
            </div>
            <button className="logout-btn" onClick={() => setView('list')}>⬅️ Back to Orders List</button>
          </div>

          <div className="form-layout-grid" style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '20px', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Customer & Info Card */}
              <div className="form-card-section detail-info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '12px', textTransform: 'uppercase', color: '#64748b' }}>Customer Name</span>
                  <div style={{ fontWeight: 'bold', fontSize: '15px', marginTop: '4px' }}>{selectedOrder?.customer?.name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-main)' }}>{selectedOrder?.customer?.phone}</div>
                </div>
                <div>
                  <span style={{ fontSize: '12px', textTransform: 'uppercase', color: '#64748b' }}>Delivery Address</span>
                  <div style={{ fontSize: '14px', marginTop: '4px' }}>{selectedOrder?.delivery_address || selectedOrder?.customer?.address || 'N/A'}</div>
                </div>
                <div>
                  <span style={{ fontSize: '12px', textTransform: 'uppercase', color: '#64748b' }}>Status</span>
                  <div style={{ marginTop: '4px' }}>
                    <span className={`badge ${
                      selectedOrder?.status === 'approved' ? 'badge-success' :
                      selectedOrder?.status === 'invoiced' ? 'badge-info' :
                      selectedOrder?.status === 'pending_approval' ? 'badge-warning' : 'badge-danger'
                    }`} style={{ textTransform: 'uppercase' }}>
                      {selectedOrder?.status?.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <div style={{ borderLeft: '2px solid #fecdd3', paddingLeft: '12px' }}>
                  <span style={{ fontSize: '12px', color: '#e11d48', fontWeight: 'bold', display: 'block' }}>Order Reference Info:</span>
                  <div style={{ fontSize: '13px', color: '#e11d48', fontWeight: 600, marginTop: '2px' }}>
                    Order Ref By: <strong>{selectedOrder?.salesman?.name || selectedOrder?.salesman_name || selectedOrder?.creator?.name || 'System Admin'}</strong>
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="welcome-banner" style={{ padding: '20px' }}>
                <h3 style={{ margin: '0 0 16px', color: 'var(--text-heading)' }}>Product Line Items</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th style={{ textAlign: 'center' }}>
                          Dimensions<br />
                          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>widht &nbsp;|&nbsp; Height</span>
                        </th>
                        <th style={{ textAlign: 'center' }}>Pcs</th>
                        <th style={{ textAlign: 'center' }}>Billed Sqft</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder?.items?.map((item) => (
                        <tr key={item.id}>
                          <td><strong>{item.product?.product_code || item.variant?.name}</strong> - {item.product?.name || 'Blind Item'}</td>
                          <td style={{ textAlign: 'center', fontWeight: '600' }}>{item.width} in &nbsp;|&nbsp; {item.height} in</td>
                          <td style={{ textAlign: 'center' }}>{item.pcs}</td>
                          <td style={{ textAlign: 'center', fontWeight: '600' }}>{item.billed_sqft} sqft</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Side Actions */}
            <div>
              <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'stretch', padding: '24px' }}>
                <h3 style={{ margin: '0 0 20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-heading)' }}>
                  Order Status &amp; Actions
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(selectedOrder?.status === 'pending_approval' || selectedOrder?.status === 'pending_reapproval') && (can('quotations:approve') || user?.role === 'admin') && (
                    <>
                      <button type="button" className="primary-btn" onClick={() => handleApprove(selectedOrder.id)} style={{ padding: '12px' }}>
                        Approve Order &amp; Route Purchase Entry
                      </button>
                      <button type="button" className="logout-btn" onClick={() => handleReject(selectedOrder.id)} style={{ padding: '10px', color: 'var(--danger)', borderColor: 'var(--danger-bg)' }}>
                        Reject Order
                      </button>
                    </>
                  )}

                  {selectedOrder?.status === 'approved' && (user?.role === 'admin') && (
                    <button type="button" className="primary-btn" onClick={() => handleGenerateInvoice(selectedOrder.id)} style={{ padding: '12px' }}>
                      Generate Invoice
                    </button>
                  )}

                  <button
                    type="button"
                    className="logout-btn"
                    onClick={() => {
                      setPrintingOrder(selectedOrder);
                      setIsPrintModalOpen(true);
                    }}
                    style={{ padding: '10px', marginTop: '10px' }}
                  >
                    🖨️ Print Order View
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Direct Order Creation Form View (Dynamic Section & Option Builder) */
        <div className="animate-fade-in">
          <div className="page-header-row">
            <div className="page-header-title-row">
              <h1>Create Order</h1>
              <button className="btn-outline-back mobile-only-btn" onClick={() => { setView('list'); resetForm(); }}>⬅️ Back to List</button>
            </div>
            <button className="btn-outline-back desktop-only-btn" onClick={() => { setView('list'); resetForm(); }}>⬅️ Back to Orders List</button>
          </div>

          <form onSubmit={handleCreateDirectOrder}>
            {formError && (
              <div style={{ padding: '12px 16px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                ⚠️ {formError}
              </div>
            )}

            <div className="form-layout-grid" style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '20px', alignItems: 'start' }}>
              <div>
                {/* TOP HEADER SECTION MATCHING QUOTATIONS */}
                <div className="form-card-section grid-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
                  <div className="form-group mobile-inline-field" style={{ margin: 0 }}>
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
                                    setCustomerSearchQuery(c.company_name || c.name);
                                    setShowCustomerDropdown(false);
                                  }}
                                >
                                  {c.company_name || c.name}
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

                  <div className="form-group" style={{ margin: 0, position: 'relative' }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Select Product *</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <input
                          type="text"
                          placeholder="Search product by code or name..."
                          value={productSearchQuery}
                          onChange={(e) => {
                            setProductSearchQuery(e.target.value);
                            setShowProductDropdown(true);
                          }}
                          onFocus={() => setShowProductDropdown(true)}
                          className="modern-form-control"
                        />
                        {showProductDropdown && (
                          <div className="search-dropdown-list">
                            {filteredProductsDropdown.length === 0 ? (
                              <div className="dropdown-item empty">No products found</div>
                            ) : (
                              filteredProductsDropdown.map(p => (
                                <div
                                  key={p.id}
                                  className="dropdown-item"
                                  onClick={() => {
                                    if (sections.length > 0) {
                                      addProductBlockToSection(sections[0].id, p.id);
                                    }
                                    setSelectedTopProductId('');
                                    setProductSearchQuery('');
                                    setShowProductDropdown(false);
                                    setLastAddedProductName(p.product_code ? p.product_code.toUpperCase() : p.name);
                                  }}
                                >
                                  <strong>{p.product_code ? p.product_code.toUpperCase() : (p.name || '—')}</strong>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn-icon-square"
                        onClick={() => setIsProductModalOpen(true)}
                        title="Add New Product"
                      >
                        +
                      </button>
                    </div>
                    {lastAddedProductName && (
                      <div style={{ marginTop: '6px', fontSize: '12px', fontWeight: '600', color: '#16a34a' }}>
                        ✓ Added: {lastAddedProductName}
                      </div>
                    )}
                  </div>
                </div>

                {/* DELIVERY ADDRESS SECTION MATCHING QUOTATIONS */}
                <div className="form-card-section" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', margin: 0 }}>Delivery Address</label>
                    <label className="hide-mobile-text" style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: '#ef4444', fontWeight: '600', cursor: 'pointer' }}>
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

                {/* TOP BUILDER BUTTONS */}
                <div className="form-btn-row" style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={addSection}
                    style={{
                      background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '10px 18px',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(15,23,42,0.2)'
                    }}
                  >
                    ➕ Add Section / Group
                  </button>
                </div>

                {/* DYNAMIC SECTIONS & PRODUCT BLOCKS */}
                {sections.map((sec) => (
                  <div key={sec.id} className="form-card-section mobile-simple-section" style={{ marginBottom: '24px', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '16px' }}>
                    <div className="section-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px' }}>
                      <input
                        type="text"
                        value={sec.name}
                        onChange={(e) => updateSectionName(sec.id, e.target.value)}
                        className="section-name-input"
                        style={{
                          fontSize: '16px',
                          fontWeight: 'bold',
                          color: '#0f172a',
                          border: 'none',
                          borderBottom: '2px dashed #94a3b8',
                          background: 'transparent',
                          padding: '2px 6px',
                          width: '320px'
                        }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => addProductBlockToSection(sec.id)}
                          style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                        >
                          ➕ Add Item
                        </button>
                        <button
                          type="button"
                          onClick={() => addOptionGroupToSection(sec.id)}
                          style={{ background: '#7c3aed', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                        >
                          🔀 Add Option Group
                        </button>
                        {sections.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSection(sec.id)}
                            style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
                          >
                            🗑️ Section
                          </button>
                        )}
                      </div>
                    </div>

                    {sec.blocks.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px', background: '#f8fafc', borderRadius: '8px', color: '#64748b', fontSize: '13px' }}>
                        No items in this section. Click <strong>"+ Add Item"</strong> or <strong>"+ Add Option Group"</strong> above.
                      </div>
                    ) : (
                      sec.blocks.map((block) => {
                        const totalBilledSqft = block.sizes.reduce((sum, s) => sum + (parseFloat(s.billed_sqft) || 0), 0);
                        const totalPrice = block.sizes.reduce((sum, s) => sum + (parseFloat(s.line_total) || 0), 0);
                        const isOptionGroup = Boolean(block.option_group_id);
                        const isSelected = block.is_selected !== false;

                        return (
                          <div key={block.id} style={{ marginBottom: '16px', background: isOptionGroup ? (isSelected ? '#faf5ff' : '#f8fafc') : '#ffffff', border: isOptionGroup ? (isSelected ? '1px solid #c084fc' : '1px dashed #cbd5e1') : '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                            {/* Option Header Bar if Option Group */}
                            {isOptionGroup && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '6px 10px', background: isSelected ? '#f3e8ff' : '#f1f5f9', borderRadius: '6px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', color: isSelected ? '#6b21a8' : '#475569' }}>
                                  <input
                                    type="radio"
                                    name={`opt_group_${sec.id}_${block.option_group_id}`}
                                    checked={isSelected}
                                    onChange={() => toggleOptionSelected(sec.id, block.option_group_id, block.id)}
                                    style={{ accentColor: '#7c3aed', width: '16px', height: '16px' }}
                                  />
                                  🔀 Option Variation Choice
                                </label>
                                <button
                                  type="button"
                                  onClick={() => addOptionVariantToGroup(sec.id, block.option_group_id)}
                                  style={{ background: '#7c3aed', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                  ➕ Add Option Variation
                                </button>
                              </div>
                            )}

                            {/* Table of sizes */}
                            <div style={{ overflowX: 'auto' }}>
                              <table className="data-table item-builder-table" style={{ width: '100%', margin: 0 }}>
                                <thead>
                                  <tr>
                                    <th style={{ width: '220px' }}>Product *</th>
                                    <th style={{ width: '110px' }}>Unit Price</th>
                                    <th style={{ width: '90px' }}>Width</th>
                                    <th style={{ width: '90px' }}>Height</th>
                                    <th style={{ width: '65px' }}>Pcs</th>
                                    <th style={{ width: '120px' }}>Sq.Ft</th>
                                    <th className="cell-total-sqft-th" style={{ width: '90px' }}>Total Sq.Ft</th>
                                    <th style={{ width: '130px' }}>Total Price</th>
                                    <th style={{ width: '110px', textAlign: 'center' }}>Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {/* Mobile-only Width/Height/Pcs card (hidden on desktop) */}
                                  <tr className="mobile-size-card-row">
                                    <td colSpan="9" className="mobile-size-card-cell">
                                      <div className="mobile-size-card">
                                        <div className="mobile-size-header-bar">
                                          <div className="mobile-size-header-item">
                                            <span className="mobile-size-header-icon icon-width">↔</span>
                                            <span>WIDTH (INCH)</span>
                                          </div>
                                          <div className="mobile-size-header-item">
                                            <span className="mobile-size-header-icon icon-height">↕</span>
                                            <span>HEIGHT (INCH)</span>
                                          </div>
                                          <div className="mobile-size-header-item">
                                            <span className="mobile-size-header-icon icon-pcs">📦</span>
                                            <span>PCS/NOS</span>
                                          </div>
                                        </div>
                                        <div className="mobile-size-rows">
                                          {block.sizes.map((sz, szIdx) => (
                                            <div className="mobile-size-row" key={sz.id}>
                                              <input
                                                type="number"
                                                inputMode="decimal"
                                                className="mobile-size-box"
                                                value={sz.width}
                                                onChange={(e) => handleSizeChange(sec.id, block.id, sz.id, 'width', e.target.value)}
                                              />
                                              <input
                                                type="number"
                                                inputMode="decimal"
                                                className="mobile-size-box"
                                                value={sz.height}
                                                onChange={(e) => handleSizeChange(sec.id, block.id, sz.id, 'height', e.target.value)}
                                              />
                                              <input
                                                type="number"
                                                inputMode="numeric"
                                                className="mobile-size-box"
                                                value={sz.pcs}
                                                onChange={(e) => handleSizeChange(sec.id, block.id, sz.id, 'pcs', e.target.value)}
                                              />
                                              {szIdx === block.sizes.length - 1 && (
                                                <button
                                                  type="button"
                                                  className="mobile-size-add-btn"
                                                  onClick={() => addSizeRowToBlock(sec.id, block.id)}
                                                  title="Add Row"
                                                >
                                                  +
                                                </button>
                                              )}
                                              <button
                                                type="button"
                                                className="mobile-size-del-btn"
                                                onClick={() => removeSizeRowFromBlock(sec.id, block.id, sz.id)}
                                                disabled={block.sizes.length <= 1}
                                                title="Remove Row"
                                              >
                                                −
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                        <div className="mobile-size-totals-bar">
                                          <div className="mobile-size-total-pill">
                                            <span className="mobile-size-total-icon">▦</span>
                                            <span className="mobile-size-total-text">
                                              <span className="mobile-size-total-label">Total Pcs</span>
                                              <span className="mobile-size-total-value">{block.sizes.reduce((sum, s) => sum + (parseInt(s.pcs) || 0), 0)}</span>
                                            </span>
                                          </div>
                                          <div className="mobile-size-total-pill">
                                            <span className="mobile-size-total-icon">▦</span>
                                            <span className="mobile-size-total-text">
                                              <span className="mobile-size-total-label">Total Sqft</span>
                                              <span className="mobile-size-total-value">{totalBilledSqft.toFixed(1)} sqft</span>
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                  {block.sizes.map((sizeRow, sIdx) => (
                                    <tr key={sizeRow.id}>
                                      {sIdx === 0 && (
                                        <td rowSpan={block.sizes.length} className="cell-product" style={{ verticalAlign: 'top', paddingTop: '10px' }}>
                                          {productChangeBlockId === block.id ? (
                                            <div style={{ position: 'relative' }}>
                                              <input
                                                type="text"
                                                autoFocus
                                                placeholder="Search product by code or name..."
                                                value={productChangeQuery}
                                                onChange={(e) => setProductChangeQuery(e.target.value)}
                                                onBlur={() => setTimeout(() => setProductChangeBlockId(null), 200)}
                                                className="modern-form-control"
                                                style={{ fontWeight: 'bold', fontSize: '13px' }}
                                              />
                                              <div className="search-dropdown-list">
                                                {filteredProductsForChange.length === 0 ? (
                                                  <div className="dropdown-item empty">No products found</div>
                                                ) : (
                                                  filteredProductsForChange.map(p => (
                                                    <div
                                                      key={p.id}
                                                      className="dropdown-item"
                                                      onMouseDown={() => {
                                                        handleBlockChange(sec.id, block.id, 'product_id', p.id);
                                                        setProductChangeBlockId(null);
                                                        setProductChangeQuery('');
                                                      }}
                                                    >
                                                      <strong>{p.product_code ? p.product_code.toUpperCase() : p.name}</strong>
                                                    </div>
                                                  ))
                                                )}
                                              </div>
                                            </div>
                                          ) : (
                                            <div
                                              onClick={() => { setProductChangeBlockId(block.id); setProductChangeQuery(''); }}
                                              style={{ cursor: 'pointer', padding: '9px 12px', border: '1px solid var(--border, #cbd5e1)', borderRadius: '8px', background: 'var(--bg-base, #ffffff)' }}
                                              title="Click to change product"
                                            >
                                              <strong style={{ fontSize: '13px' }}>{block.product_code ? block.product_code.toUpperCase() : (block.product_name || '—')}</strong>
                                              <div style={{ marginTop: '4px', fontSize: '11px', fontWeight: '600', color: '#16a34a' }}>
                                                ✓ {block.product_code ? block.product_code.toUpperCase() : ''} <span style={{ color: '#94a3b8', fontWeight: '500' }}>(tap to change)</span>
                                              </div>
                                            </div>
                                          )}
                                        </td>
                                      )}

                                      {sIdx === 0 && (
                                        <td rowSpan={block.sizes.length} className="cell-unitprice" style={{ verticalAlign: 'top', paddingTop: '10px' }}>
                                          <input
                                            type="number"
                                            value={block.unit_price}
                                            onChange={(e) => handleBlockChange(sec.id, block.id, 'unit_price', e.target.value)}
                                            className="modern-form-control"
                                            style={{ textAlign: 'center', fontWeight: '600' }}
                                          />
                                        </td>
                                      )}

                                      <td className="cell-size" style={{ padding: '6px' }}>
                                        <input
                                          type="number"
                                          inputMode="decimal"
                                          value={sizeRow.width}
                                          onChange={(e) => handleSizeChange(sec.id, block.id, sizeRow.id, 'width', e.target.value)}
                                          placeholder="Width"
                                          className="modern-form-control"
                                        />
                                      </td>

                                      <td className="cell-size" style={{ padding: '6px' }}>
                                        <input
                                          type="number"
                                          inputMode="decimal"
                                          value={sizeRow.height}
                                          onChange={(e) => handleSizeChange(sec.id, block.id, sizeRow.id, 'height', e.target.value)}
                                          placeholder="Height"
                                          className="modern-form-control"
                                        />
                                      </td>

                                      <td className="cell-size" style={{ padding: '6px' }}>
                                        <input
                                          type="number"
                                          inputMode="numeric"
                                          value={sizeRow.pcs}
                                          onChange={(e) => handleSizeChange(sec.id, block.id, sizeRow.id, 'pcs', e.target.value)}
                                          placeholder="Pcs"
                                          className="modern-form-control"
                                          style={{ textAlign: 'center' }}
                                        />
                                      </td>

                                      <td className="cell-sqft" style={{ padding: '6px' }}>
                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                          <input
                                            type="text"
                                            value={sizeRow.billed_sqft ? sizeRow.billed_sqft.toFixed(2) : '0'}
                                            readOnly
                                            className="modern-form-control"
                                            style={{ backgroundColor: '#f1f5f9', fontWeight: '600', textAlign: 'center', padding: '9px 4px', minWidth: 0 }}
                                          />
                                          {block.sizes.length > 1 && (
                                            <button
                                              type="button"
                                              onClick={() => removeSizeRowFromBlock(sec.id, block.id, sizeRow.id)}
                                              className="btn-action-circle btn-action-delete"
                                              style={{ padding: '4px 6px', fontSize: '12px' }}
                                            >
                                              🗑️
                                            </button>
                                          )}
                                        </div>
                                      </td>

                                      {/* Total Sq.Ft (block total, desktop-only - hidden on mobile via .cell-total-sqft CSS) */}
                                      {sIdx === 0 && (
                                        <td rowSpan={block.sizes.length} className="cell-total-sqft" style={{ verticalAlign: 'top', padding: '6px' }}>
                                          <input
                                            type="text"
                                            value={totalBilledSqft.toFixed(2)}
                                            readOnly
                                            className="modern-form-control"
                                            style={{ padding: '9px 12px', fontSize: '13px', borderRadius: '8px', backgroundColor: '#f1f5f9', fontWeight: '600', textAlign: 'center' }}
                                          />
                                        </td>
                                      )}

                                      {sIdx === 0 && (
                                        <td rowSpan={block.sizes.length} className="cell-total" style={{ verticalAlign: 'top', paddingTop: '10px' }}>
                                          <input
                                            type="text"
                                            value={isSelected ? `৳${totalPrice.toFixed(2)}` : '৳0.00 (Unselected)'}
                                            readOnly
                                            className="modern-form-control"
                                            style={{ textAlign: 'center', background: '#f1f5f9', fontWeight: 'bold', color: isSelected ? '#7c3aed' : '#94a3b8' }}
                                          />
                                        </td>
                                      )}

                                      {sIdx === 0 && (
                                        <td rowSpan={block.sizes.length} className="cell-action" style={{ verticalAlign: 'top', paddingTop: '10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                          <button
                                            type="button"
                                            onClick={() => removeProductBlock(sec.id, block.id)}
                                            className="btn-action-circle btn-action-delete"
                                            style={{ marginRight: '6px' }}
                                            title="Remove Block"
                                          >
                                            🗑️
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => addSizeRowToBlock(sec.id, block.id)}
                                            className="btn-action-circle btn-action-add"
                                            title="Add Size Row"
                                          >
                                            ➕
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setExcelPasteTargetBlock({ sectionId: sec.id, blockId: block.id });
                                              setExcelPasteText('');
                                            }}
                                            style={{
                                              background: '#059669',
                                              color: '#ffffff',
                                              border: 'none',
                                              borderRadius: '4px',
                                              padding: '4px 8px',
                                              fontSize: '11px',
                                              fontWeight: 'bold',
                                              cursor: 'pointer',
                                              marginLeft: '6px'
                                            }}
                                            title="Paste Width, Height, Pcs from Excel"
                                          >
                                            📋 Excel
                                          </button>
                                        </td>
                                      )}
                                    </tr>
                                  ))}

                                  <tr style={{ background: '#f8fafc' }}>
                                    <td colSpan="8" style={{ padding: '8px 14px' }}>
                                      <textarea
                                        className="product-notes-textarea"
                                        value={block.notes || ''}
                                        onChange={(e) => handleBlockChange(sec.id, block.id, 'notes', e.target.value)}
                                        rows="2"
                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', resize: 'vertical', background: '#fff' }}
                                        placeholder="Enter specification details..."
                                      />
                                    </td>
                                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                                      <button
                                        type="button"
                                        onClick={() => handleBlockChange(sec.id, block.id, 'notes', '')}
                                        className="btn-action-circle btn-action-delete"
                                      >
                                        🗑️
                                      </button>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                ))}

                {/* BOTTOM SUMMARY FIELDS MATCHING QUOTATIONS */}
                <div className="form-card-section grid-3col" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                  <div className="form-group" style={{ margin: 0, flex: '1 1 150px' }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Total Amount *</label>
                    <input type="text" value={financialSummary.subtotal.toFixed(2)} readOnly className="modern-form-control" style={{ backgroundColor: 'var(--bg-base)', fontWeight: 'bold' }} />
                  </div>

                  <div className="form-group" style={{ margin: 0, flex: '1 1 150px' }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Convence Amount *</label>
                    <input type="number" value={convenienceCharge} onChange={(e) => setConvenienceCharge(parseFloat(e.target.value) || 0)} className="modern-form-control" />
                  </div>

                  <div className="form-group hide-mobile-text" style={{ margin: 0, flex: '1 1 150px' }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Other Charge Label</label>
                    <input type="text" value={otherChargeLabel} onChange={(e) => setOtherChargeLabel(e.target.value)} placeholder="e.g. old blinds serviceing charge" className="modern-form-control" />
                  </div>

                  <div className="form-group hide-mobile-text" style={{ margin: 0, flex: '1 1 150px' }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Others Charge</label>
                    <input type="number" value={otherCharge} onChange={(e) => setOtherCharge(parseFloat(e.target.value) || 0)} className="modern-form-control" />
                  </div>

                  <div className="form-group" style={{ margin: 0, flex: '1 1 150px' }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Vat %</label>
                    <input type="number" value={vatPercentage} onChange={(e) => setVatPercentage(parseFloat(e.target.value) || 0)} className="modern-form-control" />
                  </div>

                  <div className="form-group" style={{ margin: 0, flex: '1 1 150px' }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Net Amount *</label>
                    <input type="text" value={financialSummary.netAmount.toFixed(2)} readOnly className="modern-form-control" style={{ backgroundColor: 'var(--bg-base)', fontWeight: '800', color: 'var(--primary)', fontSize: '15px' }} />
                  </div>

                  <div className="form-group hide-mobile-text" style={{ margin: 0, flex: '1 1 100%' }}>
                    <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Remarks</label>
                    <input type="text" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="If have any note" className="modern-form-control" />
                  </div>

                  <div className="form-group" style={{ margin: 0, flex: '1 1 100%' }}>
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

                <div className="form-btn-row" style={{ display: 'flex', justifyContent: 'center', gap: '16px', margin: '24px 0 10px 0', flexWrap: 'wrap' }}>
                  <button
                    type="submit"
                    className="btn-gradient-submit"
                    disabled={isSubmitting}
                  >
                    💾 {isSubmitting ? 'Submitting...' : 'Save Direct Order'}
                  </button>
                  <span className="mobile-page-label hide-mobile-text">Create Order</span>
                  <button
                    type="button"
                    className="btn-outline-back hide-mobile-text"
                    onClick={() => { setView('list'); resetForm(); }}
                  >
                    ⬅️ Back
                  </button>
                </div>
              </div>

              {/* FINANCIAL SUMMARY SIDEBAR */}
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
                    <button type="submit" className="primary-btn" disabled={isSubmitting} style={{ padding: '12px' }}>
                      💾 {isSubmitting ? 'Creating Order...' : 'Save Direct Order'}
                    </button>
                    <button type="button" className="logout-btn" onClick={() => { setView('list'); resetForm(); }} style={{ padding: '10px' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Modals for Quick Add Customer and Product */}
      <CustomerModal 
        isOpen={isCustomerModalOpen} 
        onClose={() => setIsCustomerModalOpen(false)} 
        onCustomerCreated={(newCust) => {
          setCustomers(prev => [newCust, ...prev]);
          setSelectedCustomerId(newCust.id);
          setCustomerSearchQuery(newCust.company_name || newCust.name);
          if (sameAsCustomerAddress) {
            setDeliveryAddress(newCust.address || '');
          }
        }} 
      />

      <ProductModal 
        isOpen={isProductModalOpen} 
        onClose={() => setIsProductModalOpen(false)} 
        onProductSaved={(newProd) => {
          setProducts(prev => [newProd, ...prev]);
          if (newProd && newProd.id && sections.length > 0) {
            addProductBlockToSection(sections[0].id, newProd.id);
          }
        }} 
      />

      <QuotationPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        quotation={printingOrder}
        printType={printType}
      />

      {/* Excel Paste Modal */}
      {excelPasteTargetBlock && (
        <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && setExcelPasteTargetBlock(null)}>
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '540px' }}>
            <div className="custom-modal-header">
              <h3 className="custom-modal-title">
                <span>📋</span> Import Measurement Sizes (Excel)
              </h3>
              <button
                type="button"
                className="custom-modal-close"
                onClick={() => setExcelPasteTargetBlock(null)}
              >
                ✕
              </button>
            </div>

            <div className="custom-modal-form">
              <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.5' }}>
                Copy <strong>Width</strong>, <strong>Height</strong>, and <strong>Pcs</strong> columns from your Excel sheet and paste (Ctrl+V) below:
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px 16px', borderRadius: '10px', fontSize: '12px', color: '#38bdf8', border: '1px dashed rgba(56, 189, 248, 0.3)' }}>
                <strong>Expected Format:</strong><br />
                <code>Width [Tab] Height [Tab] Pcs</code><br />
                <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Example:<br />65 &nbsp;&nbsp; 90 &nbsp;&nbsp; 1<br />45 &nbsp;&nbsp; 60 &nbsp;&nbsp; 2</span>
              </div>

              <textarea
                rows={6}
                value={excelPasteText}
                onChange={(e) => setExcelPasteText(e.target.value)}
                placeholder="Paste Excel cells here (Ctrl + V)..."
                className="custom-form-input"
                style={{ fontFamily: 'monospace', fontSize: '13px', resize: 'vertical' }}
              />

              <div className="custom-modal-footer" style={{ padding: 0, background: 'transparent', border: 'none', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setExcelPasteTargetBlock(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-modal-submit"
                  onClick={handleImportExcelSizes}
                >
                  ✅ Import Sizes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
