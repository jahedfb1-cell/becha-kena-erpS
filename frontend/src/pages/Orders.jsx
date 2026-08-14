import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { useCustomers, useProducts, masterDataKeys, productsQueryOptions } from '../hooks/useMasterData';
import { useOrdersList } from '../hooks/useListData';
import { invalidateOrders, invalidateInvoices } from '../api/invalidate';
import { formatCurrency, formatDate } from '../utils/format';
import CustomerModal from '../components/CustomerModal';
import ProductModal from '../components/ProductModal';
import QuotationPrintModal from '../components/QuotationPrintModal';
import AISizeScanModal from '../components/AISizeScanModal';

const Orders = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermission();
  const queryClient = useQueryClient();
  const [view, setView] = useState('list'); // 'list', 'detail', 'form'

  // Confirmed orders come from the shared quotations cache (filtered).
  const { data: orders, isLoading: listLoading, error: ordersError } = useOrdersList();

  // Shared master-data cache — fetched once for the whole app rather than
  // on every form open.
  const { data: customers } = useCustomers({ all: true, enabled: view === 'form' });
  const { data: products } = useProducts({ enabled: view === 'form' });

  // Separate from the list query: covers opening a single order's detail
  // view or loading one into the edit form.
  const [actionLoading, setActionLoading] = useState(false);
  const loading = listLoading || actionLoading;

  const [error, setError] = useState('');
  
  // Selected Order for details view
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Filters & Reporting Period
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [activeTab, setActiveTab] = useState('confirmed');

  // Mobile card view: which row's actions menu is currently open
  const [openActionsId, setOpenActionsId] = useState(null);

  // Print Modal States
  const [printingOrder, setPrintingOrder] = useState(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printType, setPrintType] = useState('detailed');

  // Excel Paste Modal States
  const [excelPasteTargetBlock, setExcelPasteTargetBlock] = useState(null);
  const [excelPasteText, setExcelPasteText] = useState('');

  // AI Size Scan Modal State
  const [aiScanTargetBlock, setAiScanTargetBlock] = useState(null);

  // Edit Mode States
  const [isEditMode, setIsEditMode] = useState(false);
  const [editId, setEditId] = useState(null);

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
  // Refreshes the shared quotations cache after approve/reject/invoice.
  const fetchOrders = useCallback(() => {
    invalidateOrders(queryClient);
  }, [queryClient]);

  useEffect(() => {
    if (ordersError) setError('Failed to retrieve orders list.');
  }, [ordersError]);

  useEffect(() => {
    if (openActionsId === null) return;
    const handleClickOutside = (e) => {
      if (!e.target.closest('.order-mobile-actions-wrap')) {
        setOpenActionsId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openActionsId]);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const q = searchParams.get('search');
    if (q) {
      setFilterSearch(decodeURIComponent(q));
    }
    const tab = searchParams.get('tab');
    if (tab === 'pending') {
      setActiveTab('pending');
    } else if (tab === 'confirmed') {
      setActiveTab('confirmed');
    }
  }, [searchParams]);


  const handleGenerateInvoice = async (orderId, orderNo) => {
    if (!confirm(`Generate Sales Invoice + Delivery Challan for Order ${orderNo}?`)) return;
    try {
      const res = await api.post(`/invoices/generate/${orderId}`, {});
      alert(res.data?.message || 'Invoice and Delivery Challan generated successfully.');
      // The order moves to 'invoiced' and a new invoice exists, so both
      // cached lists are now out of date.
      fetchOrders();
      invalidateInvoices(queryClient);
      navigate(`/invoices?search=${encodeURIComponent(orderNo)}`);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to generate invoice.');
    }
  };

  const loadOrderDetails = async (id) => {
    try {
      setActionLoading(true);
      const response = await api.get(`/quotations/${id}`);
      setSelectedOrder(response.data?.data || response.data);
      setView('detail');
    } catch (err) {
      alert('Failed to retrieve order details.');
    } finally {
      setActionLoading(false);
    }
  };

  // Groups line items so a product with several sizes shows its
  // Product cell once (rowSpan) instead of repeating it per size row.
  const buildOrderLineItemGroups = (items) => {
    const groups = [];
    (items || []).forEach((item) => {
      const sectionName = item.section_name || 'Main Items';
      const optGrpId = item.option_group_id || 'no_opt';
      const prodId = item.product_id;
      const variantName = item.variant?.name || item.product?.product_code || '';
      const isSel = item.is_selected !== false ? 'selected' : 'unselected';
      const optVarId = item.option_variant_id || item.notes || '';

      const key = (optGrpId && optGrpId !== 'no_opt')
        ? `${sectionName}___${optGrpId}___${isSel}___${prodId}___${item.unit_price}___${optVarId}`
        : `${sectionName}___${prodId}-${variantName}___${item.unit_price}`;

      let existing = groups.find(g => g.key === key);
      if (!existing) {
        existing = { key, rows: [] };
        groups.push(existing);
      }
      existing.rows.push(item);
    });
    return groups;
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

  const handleGenerateInvoiceFromDetail = async (id) => {
    try {
      const res = await api.post(`/invoices/generate/${id}`);
      alert(res.data?.message || 'Invoice generated successfully.');
      fetchOrders();
      invalidateInvoices(queryClient);
      navigate('/invoices');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to generate invoice.');
    }
  };

  const filteredOrders = useMemo(() => {
    if (!Array.isArray(orders)) return [];
    return orders.filter(o => {
      if (!o) return false;

      if (activeTab === 'confirmed') {
        if (o.status === 'pending_approval' || o.status === 'pending_reapproval' || o.status === 'quotation' || o.status === 'rejected') return false;
      } else if (activeTab === 'pending') {
        if (o.status !== 'pending_approval' && o.status !== 'pending_reapproval') return false;
      }

      const matchesStatus = filterStatus ? o.status === filterStatus : true;
      const searchQ = (filterSearch || '').toLowerCase().trim();
      const matchesSearch = searchQ
        ? (o.quotation_number && String(o.quotation_number).toLowerCase().includes(searchQ)) ||
          (o.customer?.name && String(o.customer.name).toLowerCase().includes(searchQ)) ||
          (o.customer?.phone && String(o.customer.phone).toLowerCase().includes(searchQ)) ||
          (o.delivery_address && String(o.delivery_address).toLowerCase().includes(searchQ))
        : true;
      return matchesStatus && matchesSearch;
    });
  }, [orders, filterStatus, filterSearch, activeTab]);

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

    // Pcs-unit products (hardware, accessories, remote controls, etc.) have
    // no meaningful width/height — they're billed by piece count instead, so
    // default the dimensions to 1x1 (a valid, invisible placeholder) and
    // start with a single quantity row rather than 4 blank size rows.
    const isPcsProduct = (prod.unit || '').trim().toLowerCase() === 'pcs';

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
      product_size: prod.product_size || null,
      category_name: prod.category?.name || '',
      unit: prod.unit || '',
      product_variant_id: null,
      supplier_id: priorityLink ? priorityLink.supplier_id : '',
      unit_price: defaultUnitPrice,
      cost_price: priorityLink ? (parseFloat(priorityLink.cost_price) || 0) : 0,
      min_billing_sqft: defaultMinSqft,
      notes: defaultNotes,
      // Start with 4 empty size rows so mobile users can fill in
      // multiple window sizes right away; unused rows can be deleted.
      // Pcs-unit products get a single ready-to-use quantity row instead.
      sizes: isPcsProduct
        ? [{
            id: Date.now() + 1,
            width: 1,
            height: 1,
            pcs: 1,
            actual_sqft: 1,
            billed_sqft: 1,
            line_total: defaultUnitPrice,
          }]
        : Array.from({ length: 4 }, (_, i) => ({
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
          const isPcsBlock = (block.unit || '').trim().toLowerCase() === 'pcs';
          return {
            ...block,
            sizes: [
              ...block.sizes,
              {
                id: Date.now() + Math.random(),
                width: isPcsBlock ? 1 : '',
                height: isPcsBlock ? 1 : '',
                pcs: 1,
                actual_sqft: isPcsBlock ? 1 : 0,
                billed_sqft: isPcsBlock ? 1 : 0,
                line_total: isPcsBlock ? (parseFloat(block.unit_price) || 0) : 0
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
            let totalBilledSqft = 0;
            const isPvc = (block.unit || '').toLowerCase().includes('pvc') || (block.category_name || '').toLowerCase().includes('pvc') || (block.product_name || '').toLowerCase().includes('pvc') || (block.product_name || '').toLowerCase().includes('clear water');
            if (isPvc) {
              const slatSize = parseFloat(block.product_size) || 8;
              const slats = Math.ceil(w / 5.85);
              const calcWidth = slats * slatSize;
              totalBilledSqft = Math.round(((calcWidth * h) / 144 * pcs) * 100) / 100;
            } else {
              const sqftPerPiece = Math.max(singlePieceSqft, minSqft);
              totalBilledSqft = Math.round((sqftPerPiece * pcs) * 100) / 100;
            }
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

  /**
   * Applies AI Size Scan rows the same way handleImportExcelSizes() applies
   * pasted Excel rows — same PVC-slats-aware billed_sqft/line_total formula,
   * appended after the block's existing valid sizes — because it is the same
   * size grid, just filled from a photo instead of a paste.
   */
  const handleApplyAiSizes = (parsedRows) => {
    if (!aiScanTargetBlock || !parsedRows || parsedRows.length === 0) return;
    const { sectionId, blockId } = aiScanTargetBlock;

    setSections(prev => prev.map(sec => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        blocks: sec.blocks.map(block => {
          if (block.id !== blockId) return block;

          const unitPrice = parseFloat(block.unit_price) || 0;
          const minSqft = parseFloat(block.min_billing_sqft) || 0;

          const calculatedRows = parsedRows.map(row => {
            const w = parseFloat(row.width) || 0;
            const h = parseFloat(row.height) || 0;
            const pcs = parseInt(row.pcs) || 1;
            const singlePieceSqft = Math.round(((w * h) / 144) * 100) / 100;
            let totalBilledSqft = 0;
            const isPvc = (block.unit || '').toLowerCase().includes('pvc') || (block.category_name || '').toLowerCase().includes('pvc') || (block.product_name || '').toLowerCase().includes('pvc') || (block.product_name || '').toLowerCase().includes('clear water');
            if (isPvc) {
              const slatSize = parseFloat(block.product_size) || 8;
              const slats = Math.ceil(w / 5.85);
              const calcWidth = slats * slatSize;
              totalBilledSqft = Math.round(((calcWidth * h) / 144 * pcs) * 100) / 100;
            } else {
              const sqftPerPiece = Math.max(singlePieceSqft, minSqft);
              totalBilledSqft = Math.round((sqftPerPiece * pcs) * 100) / 100;
            }
            const lineTotal = Math.round((totalBilledSqft * unitPrice) * 100) / 100;

            return {
              id: Date.now() + Math.random(),
              width: w,
              height: h,
              pcs: pcs,
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

    setAiScanTargetBlock(null);
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

            const isPcs = (block.unit || '').trim().toLowerCase() === 'pcs';
            const singlePieceSqft = (w > 0 && h > 0) ? Math.round(((w * h) / 144) * 100) / 100 : 0;
            let billedSqft = 0;
            if (isPcs) {
              billedSqft = pcs;
            } else if (w > 0 && h > 0) {
              const isPvc = (block.unit || '').toLowerCase().includes('pvc') || (block.category_name || '').toLowerCase().includes('pvc') || (block.product_name || '').toLowerCase().includes('pvc') || (block.product_name || '').toLowerCase().includes('clear water');
              if (isPvc) {
                const slatSize = parseFloat(block.product_size) || 8;
                const slats = Math.ceil(w / 5.85);
                const calcWidth = slats * slatSize;
                billedSqft = Math.round(((calcWidth * h) / 144 * pcs) * 100) / 100;
              } else {
                const sqftPerPiece = Math.max(singlePieceSqft, minSqft);
                billedSqft = Math.round((sqftPerPiece * pcs) * 100) / 100;
              }
            }
            const lineTotal = Math.round((billedSqft * unitPrice) * 100) / 100;

            return {
              ...updatedSize,
              actual_sqft: isPcs ? pcs : singlePieceSqft,
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
              const links = prod.supplier_links || prod.supplierLinks || [];
              const priorityLink = links.find(link => link.priority_rank === 1) || links[0];
              const defaultMinSqft = priorityLink ? (parseFloat(priorityLink.min_billing_sqft) || 0) : 0;
              const defaultUnitPrice = parseFloat(prod.default_unit_price) || 0;

              updatedBlock.product_name = prod.name;
              updatedBlock.product_code = prod.product_code || '';
              updatedBlock.product_size = prod.product_size || null;
              updatedBlock.category_name = prod.category?.name || '';
              updatedBlock.unit = prod.unit || '';
              updatedBlock.unit_price = defaultUnitPrice;
              updatedBlock.cost_price = priorityLink ? (parseFloat(priorityLink.cost_price) || 0) : 0;
              updatedBlock.min_billing_sqft = defaultMinSqft;
              updatedBlock.supplier_id = priorityLink ? priorityLink.supplier_id : '';
              updatedBlock.notes = prod.details ||
                `5% Sunscreen Fabrics\nHeavy Duty side clump & Controller\nFittings, Fixing, and installations\nWith all Accessories\nPer Blinds Minimum Quantity ${defaultMinSqft || 20} Sft`;

              // Switching to a Pcs-unit product: width/height are meaningless
              // for it, so fill in the 1x1 placeholder on any rows still
              // missing dimensions instead of leaving them blank (which would
              // otherwise fail the "valid size required" check on submit).
              if ((prod.unit || '').trim().toLowerCase() === 'pcs') {
                updatedBlock.sizes = updatedBlock.sizes.map(size => ({
                  ...size,
                  width: parseFloat(size.width) > 0 ? size.width : 1,
                  height: parseFloat(size.height) > 0 ? size.height : 1,
                }));
              }
            }
          }

          if (field === 'unit_price' || field === 'product_id') {
            const unitPrice = parseFloat(updatedBlock.unit_price) || 0;
            const minSqft = parseFloat(updatedBlock.min_billing_sqft) || 0;
            const isPcs = (updatedBlock.unit || '').trim().toLowerCase() === 'pcs';

            updatedBlock.sizes = updatedBlock.sizes.map(size => {
              const w = parseFloat(size.width) || 0;
              const h = parseFloat(size.height) || 0;
              const pcs = parseInt(size.pcs) || 1;

              const singlePieceSqft = (w > 0 && h > 0) ? Math.round(((w * h) / 144) * 100) / 100 : 0;
              let billedSqft = 0;
              if (isPcs) {
                billedSqft = pcs;
              } else if (w > 0 && h > 0) {
                const isPvc = (updatedBlock.unit || '').toLowerCase().includes('pvc') || (updatedBlock.category_name || '').toLowerCase().includes('pvc') || (updatedBlock.product_name || '').toLowerCase().includes('pvc') || (updatedBlock.product_name || '').toLowerCase().includes('clear water');
                if (isPvc) {
                  const slatSize = parseFloat(updatedBlock.product_size) || 8;
                  const slats = Math.ceil(w / 5.85);
                  const calcWidth = slats * slatSize;
                  billedSqft = Math.round(((calcWidth * h) / 144 * pcs) * 100) / 100;
                } else {
                  const sqftPerPiece = Math.max(singlePieceSqft, minSqft);
                  billedSqft = Math.round((sqftPerPiece * pcs) * 100) / 100;
                }
              }
              const lineTotal = Math.round((billedSqft * unitPrice) * 100) / 100;

              return { ...size, actual_sqft: isPcs ? pcs : singlePieceSqft, billed_sqft: billedSqft, line_total: lineTotal };
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
    setIsEditMode(false);
    setEditId(null);
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

  const handleEditClick = async (o) => {
    try {
      setActionLoading(true);
      let fullQ = o;
      try {
        const res = await api.get(`/quotations/${o.id}`);
        if (res.data && res.data.data) {
          fullQ = res.data.data;
        }
      } catch (e) {
        console.warn('Using list item fallback for order edit:', e);
      }

      setIsEditMode(true);
      setEditId(fullQ.id);
      setDate(fullQ.created_at ? fullQ.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10));
      setSelectedCustomerId(fullQ.customer_id);
      setCustomerSearchQuery(fullQ.customer ? (fullQ.customer.company_name || fullQ.customer.name) : '');
      setDeliveryAddress(fullQ.delivery_address || '');
      setConvenienceCharge(parseFloat(fullQ.convenience_charge) || 0);
      setOtherCharge(parseFloat(fullQ.other_charge) || 0);
      setOtherChargeLabel(fullQ.other_charge_label || '');
      setVatPercentage(parseFloat(fullQ.vat_percentage) || 0);
      setDiscountType(fullQ.discount_type || 'flat');
      setDiscountValue(parseFloat(fullQ.discount_value) || 0);
      setRemark(fullQ.note || '');

      // Products must be resolved before items can be mapped. ensureQueryData
      // returns the cached list, or fetches it once if it isn't loaded yet,
      // and hands back the array directly — the previous code awaited a
      // setState and then read a stale `products` closure.
      const loadedProducts = await queryClient.ensureQueryData(productsQueryOptions()).catch(() => []);

      const sectionMap = new Map();
      (fullQ.items || []).forEach(item => {
        const secName = item.section_name || 'Section A: Main Items';
        if (!sectionMap.has(secName)) {
          sectionMap.set(secName, new Map());
        }
        const blockMap = sectionMap.get(secName);
        const optGrpId = item.option_group_id || null;
        const key = `${optGrpId}_${item.product_id}_${item.unit_price}_${item.notes || ''}`;

        const prod = loadedProducts.find(p => p.id === item.product_id) || item.product;
        const width = parseFloat(item.width) || 0;
        const height = parseFloat(item.height) || 0;
        const pcs = parseInt(item.pcs) || 1;
        const unitPrice = parseFloat(item.unit_price) || 0;
        const minSqft = parseFloat(item.min_billing_sqft) || 0;

        const catName = prod?.category?.name || item.product?.category?.name || item.category_name || '';
        const prodUnit = prod?.unit || item.product?.unit || item.unit || '';
        const prodName = prod?.name || item.product?.name || `Product #${item.product_id}`;
        const isPvc = prodUnit.toLowerCase().includes('pvc') || catName.toLowerCase().includes('pvc') || prodName.toLowerCase().includes('pvc') || prodName.toLowerCase().includes('clear water');
        const actualSqft = Math.round(((width * height) / 144) * 100) / 100;
        let billedSqft = 0;
        if (width > 0 && height > 0) {
          if (isPvc) {
            const slatSize = parseFloat(prod?.product_size || item.product?.product_size) || 8;
            const slats = Math.round(width / 5.85);
            const calcWidth = slats * slatSize;
            billedSqft = Math.round(((calcWidth * height) / 144 * pcs) * 100) / 100;
          } else {
            billedSqft = Math.round((Math.max(actualSqft, minSqft) * pcs) * 100) / 100;
          }
        }
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
            option_group_id: optGrpId,
            is_optional: item.is_optional || false,
            is_selected: item.is_selected !== false,
            is_enabled_for_print: item.is_enabled_for_print !== false,
            product_id: item.product_id,
            product_code: prod?.product_code || item.product?.product_code || '',
            product_name: prodName,
            product_size: prod?.product_size || item.product?.product_size || null,
            category_name: catName,
            unit: prodUnit,
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

      const loadedSections = [];
      let sCounter = 1;
      sectionMap.forEach((blockMap, secName) => {
        const sId = 'sec_' + sCounter++;
        const blocks = Array.from(blockMap.values()).map(b => ({ ...b, section_id: sId }));
        loadedSections.push({
          id: sId,
          name: secName,
          blocks: blocks
        });
      });

      if (loadedSections.length === 0) {
        loadedSections.push({
          id: 'sec_default',
          name: 'Section A: Main Items',
          blocks: []
        });
      }

      setSections(loadedSections);
      setView('form');
    } catch (err) {
      console.error('Error loading order for edit:', err);
      alert('Could not load order details for editing.');
    } finally {
      setActionLoading(false);
    }
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

        const isPcs = (block.unit || '').trim().toLowerCase().includes('pc') ||
                      (block.unit || '').trim().toLowerCase().includes('piece') ||
                      (block.unit || '').trim().toLowerCase().includes('no');

        let validSizeCount = 0;
        block.sizes.forEach((s) => {
          const w = parseFloat(s.width) || 0;
          const h = parseFloat(s.height) || 0;
          const pcs = parseInt(s.pcs) || 1;

          if (isPcs ? (pcs > 0) : (w > 0 && h > 0 && pcs > 0)) {
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
              width: isPcs ? (w > 0 ? w : 1) : w,
              height: isPcs ? (h > 0 ? h : 1) : h,
              pcs: pcs,
              unit_price: parseFloat(block.unit_price) || 0,
              cost_price: block.cost_price || 0,
              min_billing_sqft: block.min_billing_sqft || 0,
              notes: block.notes || '',
            });
          }
        });

        if (validSizeCount === 0) {
          setFormError(`[${sec.name}] Product "${block.product_name}": ${isPcs ? 'At least 1 Pcs quantity is required.' : 'At least 1 valid size (Width & Height greater than 0) is required.'}`);
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
      if (isEditMode && editId) {
        await api.put(`/quotations/${editId}`, payload);
        alert('Order updated successfully!');
      } else {
        await api.post('/quotations', payload);
        alert('Direct Order created & Purchase Entries generated successfully!');
      }
      resetForm();
      setView('list');
      fetchOrders();
    } catch (err) {
      console.error('Error saving direct order:', err);
      setFormError(err.response?.data?.message || 'Failed to save order. Please check all fields.');
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
              <h1>{activeTab === 'confirmed' ? 'Confirmed Orders' : 'Placed / Pending Orders'}</h1>
              <p>Manage {activeTab === 'confirmed' ? 'confirmed sales orders' : 'orders waiting for approval'}</p>
            </div>
            <button className="primary-btn" onClick={() => { resetForm(); setView('form'); }}>
              + Create Order
            </button>
          </div>

          {/* PREMIUM TABS */}
          <div className="no-print" style={{ 
            display: 'flex', 
            gap: '12px', 
            marginBottom: '24px', 
            background: '#f8fafc',
            padding: '6px',
            borderRadius: '12px',
            width: 'fit-content',
            border: '1px solid #e2e8f0',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)'
          }}>
            <button
              onClick={() => { setActiveTab('confirmed'); setFilterStatus(''); setSearchParams({ tab: 'confirmed' }); }}
              style={{
                background: activeTab === 'confirmed' ? '#ffffff' : 'transparent',
                border: 'none',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '600',
                color: activeTab === 'confirmed' ? '#0f172a' : '#64748b',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: activeTab === 'confirmed' ? '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span style={{ fontSize: '16px' }}>✅</span> Confirmed Orders
            </button>
            <button
              onClick={() => { setActiveTab('pending'); setFilterStatus(''); setSearchParams({ tab: 'pending' }); }}
              style={{
                background: activeTab === 'pending' ? '#ffffff' : 'transparent',
                border: 'none',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '600',
                color: activeTab === 'pending' ? '#0f172a' : '#64748b',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: activeTab === 'pending' ? '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span style={{ fontSize: '16px' }}>⏳</span> Placed Orders (Pending)
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
              {activeTab === 'confirmed' ? (
                <>
                  <option value="approved">Approved</option>
                  <option value="invoiced">Invoiced</option>
                </>
              ) : (
                <>
                  <option value="pending_approval">Pending Approval</option>
                  <option value="pending_reapproval">Pending Reapproval</option>
                </>
              )}
            </select>
          </div>

          {loading ? (
            <div className="flex-center" style={{ padding: '40px' }}><div className="spinner"></div></div>
          ) : (
            <>
            <div className="card-table-wrapper orders-desktop-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order Number</th>
                    <th>Customer</th>
                    <th>Delivery Address</th>
                    <th className="hide-mobile-col">Salesman</th>
                    <th>Total Sq.Ft</th>
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
                        <td>
                          <button
                            type="button"
                            className="clickable-link"
                            onClick={() => loadOrderDetails(o.id)}
                            style={{ fontWeight: 800 }}
                          >
                            {o.quotation_number}
                          </button>
                        </td>
                        <td>
                          {o.customer ? (
                            <Link
                              to={`/customers?search=${encodeURIComponent(o.customer.company_name || o.customer.name)}`}
                              className="clickable-link"
                              style={{ fontWeight: 600 }}
                            >
                              {o.customer.company_name || o.customer.name}
                            </Link>
                          ) : (
                            'N/A'
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: '12px', color: '#15803d', fontWeight: 600, maxWidth: '220px', whiteSpace: 'normal', lineHeight: '1.4' }}>
                            {o.delivery_address || o.customer?.address || 'N/A'}
                          </div>
                        </td>
                        <td className="hide-mobile-col">{o.salesman?.name || o.creator?.name || '-'}</td>
                        <td style={{ fontWeight: 'bold', color: '#0f172a' }}>
                          {o.items_sum_billed_sqft ? parseFloat(o.items_sum_billed_sqft).toFixed(2) : '0.00'} sq.ft
                        </td>
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
                            style={{ marginRight: '4px' }}
                          >
                            👁️
                          </button>

                          {/* Purchase Button */}
                          {(o.status === 'approved' || o.status === 'invoiced') && (
                            <button
                              type="button"
                              className="btn-action-circle"
                              onClick={() => navigate(`/purchases?search=${encodeURIComponent(o.quotation_number)}`)}
                              title="Go to Purchase"
                              style={{ marginRight: '4px', background: '#fef08a', border: '1px solid #fde047' }}
                            >
                              🛒
                            </button>
                          )}

                          {/* Sales Button */}
                          {o.status === 'approved' && (
                            <button
                              type="button"
                              className="btn-action-circle"
                              onClick={() => handleGenerateInvoice(o.id, o.quotation_number)}
                              title="Sales — Generate Invoice + Delivery Challan"
                              style={{ marginRight: '4px', background: '#bbf7d0', border: '1px solid #86efac' }}
                            >
                              🧾
                            </button>
                          )}

                          {(user?.role === 'admin' || user?.role === 'manager' || user?.role?.includes('account') || can('orders:edit') || can('quotations:edit')) && (
                            <button
                              type="button"
                              className="btn-action-circle"
                              onClick={() => handleEditClick(o)}
                              title="Edit Order"
                              style={{ marginRight: '4px', background: '#eff6ff', border: '1px solid #93c5fd' }}
                            >
                              ✏️
                            </button>
                          )}
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

            {/* Mobile card list — same data as the desktop table, actions menu beside the order number */}
            <div className="orders-mobile-list">
              {filteredOrders.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-main)', padding: '30px' }}>No confirmed orders found.</div>
              ) : (
                filteredOrders.map((o) => (
                  <div className="order-mobile-card" key={o.id}>
                    <div className="order-mobile-card-header">
                      <div style={{ minWidth: 0 }}>
                        <button
                          type="button"
                          className="clickable-link"
                          onClick={() => loadOrderDetails(o.id)}
                          style={{ fontWeight: 800, display: 'block' }}
                        >
                          {o.quotation_number}
                        </button>
                        <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>
                          {o.customer?.company_name || o.customer?.name || 'N/A'}
                        </span>
                      </div>

                      <div className="order-mobile-actions-wrap">
                        <button
                          type="button"
                          className="order-mobile-kebab-btn"
                          onClick={() => setOpenActionsId(openActionsId === o.id ? null : o.id)}
                          title="Actions"
                        >
                          ⋮
                        </button>
                        {openActionsId === o.id && (
                          <div className="order-mobile-actions-dropdown">
                            <button className="text-btn" onClick={() => { setOpenActionsId(null); loadOrderDetails(o.id); }}>
                              👁️ View Details
                            </button>
                            {(o.status === 'approved' || o.status === 'invoiced') && (
                              <button className="text-btn" style={{ color: '#b45309' }} onClick={() => { setOpenActionsId(null); navigate(`/purchases?search=${encodeURIComponent(o.quotation_number)}`); }}>
                                🛒 Go to Purchase
                              </button>
                            )}
                            {o.status === 'approved' && (
                              <button className="text-btn" style={{ color: '#15803d' }} onClick={() => { setOpenActionsId(null); handleGenerateInvoice(o.id, o.quotation_number); }}>
                                🧾 Generate Sales / Invoice
                              </button>
                            )}
                            {(user?.role === 'admin' || user?.role === 'manager' || user?.role?.includes('account') || can('orders:edit') || can('quotations:edit')) && (
                              <button className="text-btn" style={{ color: '#1d4ed8' }} onClick={() => { setOpenActionsId(null); handleEditClick(o); }}>
                                ✏️ Edit Order
                              </button>
                            )}
                            <button
                              className="text-btn"
                              onClick={async () => {
                                setOpenActionsId(null);
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
                            >
                              🖨️ Print Order
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="order-mobile-card-row">
                      <span>Delivery Address</span>
                      <span style={{ color: '#15803d' }}>{o.delivery_address || o.customer?.address || 'N/A'}</span>
                    </div>
                    <div className="order-mobile-card-row">
                      <span>Salesman</span>
                      <span>{o.salesman?.name || o.creator?.name || '-'}</span>
                    </div>
                    <div className="order-mobile-card-row">
                      <span>Total Sq.Ft</span>
                      <span>{o.items_sum_billed_sqft ? parseFloat(o.items_sum_billed_sqft).toFixed(2) : '0.00'} sq.ft</span>
                    </div>
                    <div className="order-mobile-card-row">
                      <span>Status</span>
                      <span className={`badge ${
                        o.status === 'approved' ? 'badge-success' :
                        o.status === 'invoiced' ? 'badge-info' :
                        o.status === 'pending_approval' ? 'badge-warning' : 'badge-danger'
                      }`}>
                        {o.status?.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="order-mobile-card-row">
                      <span>Date</span>
                      <span>{formatDate(o.created_at || o.date)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            </>
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
                      {buildOrderLineItemGroups(selectedOrder?.items).map((group) => (
                        group.rows.map((item, rowInGroup) => (
                          <tr key={item.id}>
                            {rowInGroup === 0 && (
                              <td rowSpan={group.rows.length} style={{ verticalAlign: 'top' }}>
                                <strong>{item.product?.product_code || item.variant?.name}</strong> - {item.product?.name || 'Blind Item'}
                              </td>
                            )}
                            <td style={{ textAlign: 'center', fontWeight: '600' }}>{item.width} in &nbsp;|&nbsp; {item.height} in</td>
                            <td style={{ textAlign: 'center' }}>{item.pcs}</td>
                            <td style={{ textAlign: 'center', fontWeight: '600' }}>{item.billed_sqft} sqft</td>
                          </tr>
                        ))
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
                    <button type="button" className="primary-btn" onClick={() => handleGenerateInvoiceFromDetail(selectedOrder.id)} style={{ padding: '12px' }}>
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
                                    setLastAddedProductName(`${p.name} (${p.product_code ? p.product_code.toUpperCase() : 'NO CODE'})`);
                                  }}
                                  style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                                >
                                  <div style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a' }}>{p.name}</div>
                                  <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', gap: '6px', marginTop: '2px' }}>
                                    <span>Code: <strong style={{ color: '#475569' }}>{p.product_code ? p.product_code.toUpperCase() : 'N/A'}</strong></span>
                                    {p.unit && <span style={{ color: '#059669', fontWeight: '600' }}>| Unit: {p.unit}</span>}
                                  </div>
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
                      {/* Selected Products Tags List */}
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {(() => {
                          const selectedProductsList = [];
                          const seen = new Set();
                          sections.forEach(sec => {
                            (sec.blocks || []).forEach(block => {
                              if (block.product_id && !seen.has(block.product_id)) {
                                seen.add(block.product_id);
                                selectedProductsList.push({
                                  id: block.product_id,
                                  name: block.product_name,
                                  code: block.product_code,
                                  unit: block.unit
                                });
                              }
                            });
                          });

                          if (selectedProductsList.length === 0) return null;

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                              <div style={{ fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Selected Products ({selectedProductsList.length}):
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {selectedProductsList.map((p, idx) => (
                                  <span
                                    key={p.id || idx}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      background: '#f0fdf4',
                                      border: '1px solid #bbf7d0',
                                      color: '#166534',
                                      padding: '3px 10px',
                                      borderRadius: '20px',
                                      fontSize: '12px',
                                      fontWeight: '600'
                                    }}
                                  >
                                    ✓ {p.name || `Product #${p.id}`} {p.code && <span style={{ color: '#15803d', opacity: 0.8 }}>({p.code.toUpperCase()})</span>}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                </div>

                {/* DELIVERY ADDRESS SECTION MATCHING QUOTATIONS */}
                <div className="form-card-section" style={{ padding: '6px' }}>
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
                  <div key={sec.id} className="form-card-section mobile-simple-section" style={{ marginBottom: '24px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px' }}>
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
                                    <th className="cell-product-th" style={{ width: '250px', minWidth: '220px' }}>Product *</th>
                                    <th style={{ width: '110px', minWidth: '95px' }}>Unit Price</th>
                                    <th style={{ width: '95px', minWidth: '85px', textAlign: 'center' }}>Width</th>
                                    <th style={{ width: '100px', minWidth: '90px', textAlign: 'center' }}>T. Width (in)</th>
                                    <th style={{ width: '95px', minWidth: '85px', textAlign: 'center' }}>Height</th>
                                    <th style={{ width: '75px', minWidth: '65px', textAlign: 'center' }}>Pcs</th>
                                    <th style={{ width: '120px', minWidth: '105px', textAlign: 'center' }}>Sq.Ft</th>
                                    <th className="cell-total-sqft-th" style={{ width: '100px', minWidth: '90px', textAlign: 'center' }}>Total Sq.Ft</th>
                                    <th style={{ width: '130px', minWidth: '110px', textAlign: 'center' }}>Total Price</th>
                                    <th style={{ width: '90px', minWidth: '80px', textAlign: 'center' }}>Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {/* Mobile-only Width/Height/Pcs card (hidden on desktop) */}
                                  <tr className="mobile-size-card-row">
                                    <td colSpan="10" className="mobile-size-card-cell">
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
                                    <tr key={sizeRow.id} className={sIdx > 0 ? 'mobile-subsequent-row' : ''}>
                                      {sIdx === 0 && (
                                        <td rowSpan={block.sizes.length} className="cell-product" style={{ verticalAlign: 'top', paddingTop: '10px' }}>
                                           {productChangeBlockId === block.id ? (
                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '180px' }}>
                                               <select
                                                 value={block.product_id || ''}
                                                 onChange={(e) => {
                                                   if (e.target.value) {
                                                     handleBlockChange(sec.id, block.id, 'product_id', e.target.value);
                                                     setProductChangeBlockId(null);
                                                     setProductChangeQuery('');
                                                   }
                                                 }}
                                                 className="modern-form-control"
                                                 style={{ fontWeight: '600', fontSize: '12px', padding: '6px' }}
                                               >
                                                 <option value="">-- Choose Product --</option>
                                                 {products.map(p => (
                                                   <option key={p.id} value={p.id}>
                                                     {p.name} {p.product_code ? `(${p.product_code.toUpperCase()})` : ''}
                                                   </option>
                                                 ))}
                                               </select>
                                               <div style={{ position: 'relative' }}>
                                                 <input
                                                   type="text"
                                                   placeholder="Or search by name/code..."
                                                   value={productChangeQuery}
                                                   onChange={(e) => setProductChangeQuery(e.target.value)}
                                                   className="modern-form-control"
                                                   style={{ fontSize: '11px', padding: '5px 8px' }}
                                                 />
                                                 {productChangeQuery.trim() !== '' && (
                                                   <div className="search-dropdown-list" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', maxHeight: '200px', overflowY: 'auto' }}>
                                                     {filteredProductsForChange.length === 0 ? (
                                                       <div className="dropdown-item empty" style={{ padding: '8px', fontSize: '12px', color: '#94a3b8' }}>No matching products</div>
                                                     ) : (
                                                       filteredProductsForChange.map(p => (
                                                         <div
                                                           key={p.id}
                                                           className="dropdown-item"
                                                           onMouseDown={(e) => {
                                                             e.preventDefault();
                                                             e.stopPropagation();
                                                             handleBlockChange(sec.id, block.id, 'product_id', p.id);
                                                             setProductChangeBlockId(null);
                                                             setProductChangeQuery('');
                                                           }}
                                                           style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                                                         >
                                                           <div style={{ fontWeight: '700', fontSize: '12px', color: '#0f172a' }}>{p.name}</div>
                                                           <div style={{ fontSize: '10px', color: '#64748b' }}>Code: {p.product_code || 'N/A'} {p.unit ? `| ${p.unit}` : ''}</div>
                                                         </div>
                                                       ))
                                                     )}
                                                   </div>
                                                 )}
                                               </div>
                                               <button
                                                 type="button"
                                                 onClick={() => setProductChangeBlockId(null)}
                                                 style={{ fontSize: '11px', color: '#ef4444', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', alignSelf: 'flex-start' }}
                                               >
                                                 Cancel
                                               </button>
                                             </div>
                                           ) : (
                                            <div style={{ padding: '4px 0' }}>
                                              <div style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a', lineHeight: '1.3' }}>
                                                {block.product_name || '—'}
                                              </div>
                                              <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                                <span style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: '4px', fontWeight: '600', color: '#334155' }}>
                                                  {block.product_code ? block.product_code.toUpperCase() : 'NO CODE'}
                                                </span>
                                                {block.unit && <span style={{ color: '#059669', fontWeight: '600' }}>({block.unit})</span>}
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => { setProductChangeBlockId(block.id); setProductChangeQuery(''); }}
                                                style={{ marginTop: '6px', fontSize: '11px', color: '#4f46e5', background: '#eff6ff', border: '1px solid #c7d2fe', borderRadius: '6px', padding: '3px 9px', cursor: 'pointer', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                title="Click to change to another product"
                                              >
                                                🔄 Change Product
                                              </button>
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

                                      {/* T. Width (in) */}
                                      <td className="cell-size" style={{ padding: '6px' }}>
                                        <input
                                          type="text"
                                          value={(() => {
                                            const w = parseFloat(sizeRow.width) || 0;
                                            if (w <= 0) return '';
                                            const isPvc = (block.unit || '').toLowerCase().includes('pvc') || (block.category_name || '').toLowerCase().includes('pvc') || (block.product_name || '').toLowerCase().includes('pvc') || (block.product_name || '').toLowerCase().includes('clear water');
                                            if (isPvc) {
                                              const slatSize = parseFloat(block.product_size) || 8;
                                              const slats = Math.ceil(w / 5.85);
                                              return slats * slatSize;
                                            }
                                            return w;
                                          })()}
                                          readOnly
                                          placeholder="T. Width"
                                          className="modern-form-control"
                                          style={{ backgroundColor: '#f1f5f9', textAlign: 'center', fontWeight: '600' }}
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
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
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
                                          {parseFloat(sizeRow.width) > 0 && parseFloat(sizeRow.height) > 0 && (
                                            <div style={{ fontSize: '10px', fontWeight: '700', color: '#0284c7', textAlign: 'center', marginTop: '2px' }}>
                                              📏 Row #{sIdx + 1}: {sizeRow.width}" W × {sizeRow.height}" H
                                            </div>
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

                                      <td className={`cell-action ${sIdx > 0 ? 'mobile-hidden-action' : ''}`} style={{ verticalAlign: 'top', paddingTop: '8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                           <button
                                             type="button"
                                             onClick={() => addSizeRowToBlock(sec.id, block.id)}
                                             className="btn-action-circle btn-action-add"
                                             title="Add Size Row"
                                             style={{ width: '28px', height: '28px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                           >
                                             ➕
                                           </button>
                                           <button
                                             type="button"
                                             onClick={() => {
                                               if (block.sizes.length > 1) {
                                                 removeSizeRowFromBlock(sec.id, block.id, sizeRow.id);
                                               } else {
                                                 removeProductBlock(sec.id, block.id);
                                               }
                                             }}
                                             className="btn-action-circle btn-action-delete"
                                             title={block.sizes.length > 1 ? "Delete Size Row" : "Delete Product Block"}
                                             style={{ width: '28px', height: '28px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                           >
                                             🗑️
                                           </button>
                                           {sIdx === 0 && (
                                             <>
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
                                                   borderRadius: '6px',
                                                   padding: '4px 7px',
                                                   fontSize: '11px',
                                                   fontWeight: 'bold',
                                                   cursor: 'pointer'
                                                 }}
                                                 title="Paste Width, Height, Pcs from Excel"
                                               >
                                                 📋 Excel
                                               </button>
                                               <button
                                                 type="button"
                                                 onClick={() => setAiScanTargetBlock({ sectionId: sec.id, blockId: block.id })}
                                                 style={{
                                                   background: '#0891b2',
                                                   color: '#ffffff',
                                                   border: 'none',
                                                   borderRadius: '6px',
                                                   padding: '4px 7px',
                                                   fontSize: '11px',
                                                   fontWeight: 'bold',
                                                   cursor: 'pointer'
                                                 }}
                                                 title="Scan handwritten sizes with AI"
                                               >
                                                 🪄 AI Scan
                                               </button>
                                             </>
                                           )}
                                         </div>
                                       </td>
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
          queryClient.setQueryData(masterDataKeys.customers(true), (prev) => [newCust, ...(prev ?? [])]);
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
          queryClient.setQueryData(masterDataKeys.products(), (prev) => [newProd, ...(prev ?? [])]);
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

      <AISizeScanModal
        isOpen={!!aiScanTargetBlock}
        onClose={() => setAiScanTargetBlock(null)}
        onApply={handleApplyAiSizes}
      />
    </div>
  );
};

export default Orders;
