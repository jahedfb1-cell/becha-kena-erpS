import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { useCustomers, useProducts, masterDataKeys } from '../hooks/useMasterData';
import { invalidateOrders } from '../api/invalidate';
import { formatCurrency, formatDate, formatSqft } from '../utils/format';
import { pvcSlatCount, pvcApproxSlats, billableSqft } from '../utils/billing';
import {
  createSection,
  removeSection as removeSectionById,
  renameSection,
  removeBlock,
  selectOptionVariant,
  toggleBlockPrint,
  addSizeRow,
  removeSizeRow,
  appendMeasuredRows,
  createProductBlock,
  appendBlock,
} from '../utils/quotationSections';
import { describeSaveError } from '../utils/apiError';
import NotApplicableCell from '../components/NotApplicableCell';
import ItemLineHeader, { unitKindOf } from '../components/ItemLineHeader';

// The item-builder columns, in render order. The three slat columns only exist
// when a PVC product is somewhere in the section, so there are two variants.
const QUOTE_COLUMNS = ['unit_price', 'width', 'height', 'pcs', 'billing', 'total', 'action'];
const QUOTE_COLUMNS_WITH_PVC = ['unit_price', 'width', 'approx', 'slats', 'twidth', 'height', 'pcs', 'billing', 'total', 'action'];
import CustomerModal from '../components/CustomerModal';
import ProductModal from '../components/ProductModal';
import QuotationPrintModal from '../components/QuotationPrintModal';
import AISizeScanModal from '../components/AISizeScanModal';

const Quotations = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermission();
  const queryClient = useQueryClient();
  const [view, setView] = useState('list'); // 'list' or 'form'
  const [quotations, setQuotations] = useState([]);

  // Customers/products come from the shared master-data cache, so they are
  // fetched once for the whole app instead of on every form open.
  const { data: customers } = useCustomers({ all: true });
  const { data: products } = useProducts({ enabled: view === 'form' });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // List Filters & Reporting Period
  const [reportPeriodType, setReportPeriodType] = useState('monthly');
  const [filterDate, setFilterDate] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filterSearch, setFilterSearch] = useState('');
  const [employees, setEmployees] = useState([]);

  // Pagination & Display Limit
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Form State
  const [isEditMode, setIsEditMode] = useState(false);
  const [editId, setEditId] = useState(null);

  // Print & Modal States
  const [printingQuotation, setPrintingQuotation] = useState(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printType, setPrintType] = useState('detailed');
  const [selectedTopProductId, setSelectedTopProductId] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [lastAddedProductName, setLastAddedProductName] = useState('');

  // Change-product picker (per row, in the item-builder table)
  const [productChangeBlockId, setProductChangeBlockId] = useState(null);
  const [productChangeQuery, setProductChangeQuery] = useState('');

  // Confirmation Modals
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
  
  // Dynamic Section-based Form State
  const [sections, setSections] = useState([
    {
      id: 'sec_default',
      name: 'Section A: Main Items',
      blocks: []
    }
  ]);

  const [convenienceCharge, setConvenienceCharge] = useState(0);
  const [otherCharge, setOtherCharge] = useState(0);
  const [otherChargeLabel, setOtherChargeLabel] = useState('');
  const [vatPercentage, setVatPercentage] = useState(0);
  // VAT challan (Mushak 6.3). Separate from vatPercentage above, which
  // drives this order's own totals; these two only decide what the VAT
  // challan says. Default rate is 10 and only applies once ticked.
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState(10);
  const [vatInclusive, setVatInclusive] = useState(false);
  const [discountType, setDiscountType] = useState('flat');
  const [discountValue, setDiscountValue] = useState(0);
  
  const [remark, setRemark] = useState('');
  const [terms, setTerms] = useState('');
  
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSupplierPopoverBlockId, setActiveSupplierPopoverBlockId] = useState(null);

  // Modal Dialog States
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [excelPasteTargetBlock, setExcelPasteTargetBlock] = useState(null);
  const [excelPasteText, setExcelPasteText] = useState('');
  const [aiScanTargetBlock, setAiScanTargetBlock] = useState(null);

  // Load basic list data fast
  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [quotesRes, empRes] = await Promise.all([
        api.get('/quotations?all=1').catch(err => { console.warn('Quotations load error:', err); return { data: { data: [] } }; }),
        api.get('/users').catch(err => { console.warn('Users load error:', err); return { data: { data: [] } }; })
      ]);

      const quotesData = quotesRes.data?.data?.data || quotesRes.data?.data || [];
      const empRaw = empRes.data?.data || (Array.isArray(empRes.data) ? empRes.data : []);
      const empData = Array.isArray(empRaw) ? empRaw.filter(u => u.role === 'salesman' || u.role === 'manager' || u.role === 'admin') : [];

      setQuotations(Array.isArray(quotesData) ? quotesData : []);
      setEmployees(empData);
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

  const [searchParams] = useSearchParams();

  useEffect(() => {
    const q = searchParams.get('search');
    if (q) {
      setFilterSearch(decodeURIComponent(q));
    }
  }, [searchParams]);

  const selectedCustomerObj = useMemo(() => {
    return customers.find(c => c.id === parseInt(selectedCustomerId));
  }, [selectedCustomerId, customers]);

  useEffect(() => {
    if (sameAsCustomerAddress && selectedCustomerObj) {
      const combinedAddr = [selectedCustomerObj.address, selectedCustomerObj.address_2].filter(Boolean).join(', ');
      setDeliveryAddress(combinedAddr || selectedCustomerObj.address || '');
    }
  }, [sameAsCustomerAddress, selectedCustomerObj]);

  // Filter list view quotations safely
  const filteredQuotations = useMemo(() => {
    if (!Array.isArray(quotations)) return [];
    return quotations.filter(q => {
      if (!q) return false;
      const matchesStatus = filterStatus ? q.status === filterStatus : true;
      const matchesCustomer = filterCustomer ? q.customer_id === parseInt(filterCustomer) : true;
      const matchesEmployee = filterEmployee ? q.salesman_id === parseInt(filterEmployee) : true;

      let matchesPeriod = true;
      const qDateStr = q.created_at || q.date || '';

      if (qDateStr) {
        const qDate = new Date(qDateStr);
        if (!isNaN(qDate.getTime())) {
          if (reportPeriodType === 'daily' && filterDate) {
            const dateOnly = qDateStr.substring(0, 10);
            matchesPeriod = (dateOnly === filterDate);
          } else if (reportPeriodType === 'monthly') {
            const qYear = String(qDate.getFullYear());
            const qMonth = String(qDate.getMonth() + 1).padStart(2, '0');
            const matchY = filterYear ? qYear === String(filterYear) : true;
            const matchM = filterMonth ? qMonth === String(filterMonth).padStart(2, '0') : true;
            matchesPeriod = matchY && matchM;
          } else if (reportPeriodType === 'yearly') {
            const qYear = String(qDate.getFullYear());
            matchesPeriod = filterYear ? qYear === String(filterYear) : true;
          }
        }
      }

      const searchQ = (filterSearch || '').toLowerCase().trim();
      const matchesSearch = searchQ 
        ? (q.quotation_number && String(q.quotation_number).toLowerCase().includes(searchQ)) || 
          (q.customer?.name && String(q.customer.name).toLowerCase().includes(searchQ)) ||
          (q.customer?.phone && String(q.customer.phone).toLowerCase().includes(searchQ)) ||
          (q.salesman?.name && String(q.salesman.name).toLowerCase().includes(searchQ)) ||
          (q.status && String(q.status).toLowerCase().includes(searchQ))
        : true;

      return matchesStatus && matchesCustomer && matchesEmployee && matchesPeriod && matchesSearch;
    });
  }, [quotations, filterStatus, filterCustomer, filterEmployee, reportPeriodType, filterDate, filterMonth, filterYear, filterSearch]);

  const paginatedQuotations = useMemo(() => {
    const startIndex = (currentPage - 1) * entriesPerPage;
    return filteredQuotations.slice(startIndex, startIndex + entriesPerPage);
  }, [filteredQuotations, currentPage, entriesPerPage]);

  const totalPages = Math.ceil(filteredQuotations.length / entriesPerPage) || 1;

  const filteredCustomersDropdown = useMemo(() => {
    if (!customerSearchQuery) return customers;
    if (selectedCustomerObj) {
      const selectedDisplay = selectedCustomerObj.company_name || selectedCustomerObj.name;
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

  const handleCustomerCreated = (newCustomer) => {
    // Push straight into the shared cache so the new customer appears
    // instantly here and on every other page, with no refetch.
    queryClient.setQueryData(masterDataKeys.customers(true), (prev) => [newCustomer, ...(prev ?? [])]);
    setSelectedCustomerId(newCustomer.id);
    setCustomerSearchQuery(newCustomer.company_name || newCustomer.name);
    if (sameAsCustomerAddress) {
      setDeliveryAddress(newCustomer.address || '');
    }
  };

  const handleProductCreated = (newProduct) => {
    queryClient.setQueryData(masterDataKeys.products(), (prev) => [newProduct, ...(prev ?? [])]);
    if (newProduct && newProduct.id) {
      // Add to first section by default
      if (sections.length > 0) {
        addProductBlockToSection(sections[0].id, newProduct.id);
      }
    }
  };

  // ----------------------------------------------------
  // Dynamic Section & Option Helper Methods
  // ----------------------------------------------------

  const addSection = () => {
    const newSec = createSection(sections.length);
    setSections(prev => [...prev, newSec]);
  };

  const removeSection = (sectionId) => {
    if (sections.length <= 1) {
      alert('At least 1 section must remain.');
      return;
    }
    setSections(prev => removeSectionById(prev, sectionId));
  };

  const updateSectionName = (sectionId, newName) => {
    setSections(prev => renameSection(prev, sectionId, newName));
  };

  /**
   * Returns the new block's id so callers can immediately open its inline
   * product picker (see the "+ Add Item" button) — without that, adding a
   * block to any section other than Section A silently fell back to
   * whatever the top-level search box last held, or products[0] with no
   * search at all, and "change" was the only way to fix it after the fact.
   */
  const addProductBlockToSection = (sectionId, targetProductId = null, isOptional = false, optionGroupId = null, initialSelected = true) => {
    let pId = targetProductId || selectedTopProductId;
    if (!pId && products.length > 0) {
      pId = products[0].id;
    }
    if (!pId) {
      alert('Please wait for products to load or add a product first.');
      return null;
    }
    const prod = products.find(p => p.id === parseInt(pId));
    if (!prod) return null;

    const newBlock = createProductBlock(prod, {
      sectionId,
      optionGroupId,
      isOptional,
      isSelected: initialSelected,
    });

    setSections(prev => appendBlock(prev, sectionId, newBlock));
    setSelectedTopProductId('');
    return newBlock.id;
  };

  /**
   * "+ Add Item" for a specific section: adds a placeholder block, then
   * immediately opens that block's inline product search (the same one
   * "🔄 Change Product" uses) so the user picks the real product right
   * away — this is what "add a product to Section B" actually means, since
   * the top Select Product search only ever targets Section A.
   */
  const addItemToSectionAndPick = (sectionId) => {
    const newBlockId = addProductBlockToSection(sectionId);
    if (newBlockId) {
      setProductChangeBlockId(newBlockId);
      setProductChangeQuery('');
    }
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

  const toggleOptionSelected = (sectionId, optionGroupId, blockId) => {
    setSections(prev => selectOptionVariant(prev, sectionId, optionGroupId, blockId));
  };

  const toggleBlockPrintEnabled = (sectionId, blockId) => {
    setSections(prev => toggleBlockPrint(prev, sectionId, blockId));
  };

  const addSizeRowToBlock = (sectionId, blockId) => {
    setSections(prev => addSizeRow(prev, sectionId, blockId));
  };

  const removeSizeRowFromBlock = (sectionId, blockId, sizeId) => {
    setSections(prev => removeSizeRow(prev, sectionId, blockId, sizeId));
  };

  const removeProductBlock = (sectionId, blockId) => {
    setSections(prev => removeBlock(prev, sectionId, blockId));
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

    setSections(prev => appendMeasuredRows(prev, sectionId, blockId, newSizeRows));

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

    setSections(prev => appendMeasuredRows(prev, sectionId, blockId, parsedRows));

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
            let approxSlats = '';
            let slatsCount = updatedSize.slats !== undefined && updatedSize.slats !== null ? updatedSize.slats : '';

            if (isPcs) {
              billedSqft = pcs;
            } else if (w > 0 && h > 0) {
              const isPvc = (block.unit || '').toLowerCase().includes('pvc') || (block.category_name || '').toLowerCase().includes('pvc') || (block.product_name || '').toLowerCase().includes('pvc') || (block.product_name || '').toLowerCase().includes('clear water');
              if (isPvc) {
                const slatSize = parseFloat(block.product_size) || 8;
                approxSlats = pvcApproxSlats(w);
                if (field === 'slats') {
                  slatsCount = value !== '' ? (parseInt(value) || 0) : '';
                } else if (field === 'width' || slatsCount === '' || slatsCount === 0) {
                  slatsCount = pvcSlatCount(w);
                }
                const actualSlats = parseInt(slatsCount) || 0;
                const calcWidth = actualSlats * slatSize;
                billedSqft = Math.round(((calcWidth * h) / 144 * pcs) * 100) / 100;
              } else {
                const sqftPerPiece = Math.max(singlePieceSqft, minSqft);
                billedSqft = billableSqft(sqftPerPiece, pcs);
              }
            }
            const lineTotal = Math.round((billedSqft * unitPrice) * 100) / 100;

            return {
              ...updatedSize,
              slats: slatsCount,
              approx_slats: approxSlats,
              actual_sqft: isPcs ? pcs : singlePieceSqft,
              billed_sqft: billedSqft,
              line_total: lineTotal
            };
          });

          return {
            ...block,
            sizes: updatedSizes
          };
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
              updatedBlock.product_name = prod.name;
              updatedBlock.product_code = prod.product_code || '';
              updatedBlock.product_size = prod.product_size || null;
              updatedBlock.category_name = prod.category?.name || '';
              updatedBlock.unit = prod.unit || '';
              updatedBlock.unit_price = parseFloat(prod.default_unit_price) || 0;
              updatedBlock.min_billing_sqft = priorityLink ? (parseFloat(priorityLink.min_billing_sqft) || 0) : 0;
              updatedBlock.cost_price = priorityLink ? (parseFloat(priorityLink.cost_price) || 0) : 0;
              updatedBlock.supplier_id = priorityLink ? priorityLink.supplier_id : '';

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
                  const slats = pvcSlatCount(w);
                  const calcWidth = slats * slatSize;
                  billedSqft = Math.round(((calcWidth * h) / 144 * pcs) * 100) / 100;
                } else {
                  const sqftPerPiece = Math.max(singlePieceSqft, minSqft);
                  billedSqft = billableSqft(sqftPerPiece, pcs);
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

  // Save Quotation
  const saveQuotation = async (statusOverride = null) => {
    setFormError('');
    
    if (!selectedCustomerId) {
      setFormError('Please select a customer.');
      return;
    }

    let totalBlockCount = 0;
    sections.forEach(s => totalBlockCount += s.blocks.length);

    if (totalBlockCount === 0) {
      setFormError('At least 1 product line item is required.');
      return;
    }

    const items = [];
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const sec = sections[sIdx];
      for (let i = 0; i < sec.blocks.length; i++) {
        const block = sec.blocks[i];
        if (!block.product_id) {
          setFormError(`[${sec.name}] Block #${i + 1}: Product must be selected.`);
          return;
        }
        if (parseFloat(block.unit_price) <= 0) {
          setFormError(`[${sec.name}] Product "${block.product_name}": Unit price must be greater than 0.`);
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
              slats: s.slats !== undefined && s.slats !== null && s.slats !== '' ? parseInt(s.slats) : (w > 0 ? pvcSlatCount(w) : null),
              approx_slats: w > 0 ? pvcApproxSlats(w) : null,
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

    setIsSubmitting(true);
    const payload = {
      customer_id: selectedCustomerId,
      salesman_id: salesmanId,
      convenience_charge: convenienceCharge,
      other_charge: otherCharge,
      other_charge_label: otherChargeLabel,
      vat_percentage: vatPercentage,
      vat_enabled: vatEnabled,
      vat_rate: vatEnabled ? (parseFloat(vatRate) || 0) : null,
      vat_inclusive: vatEnabled ? vatInclusive : false,
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
      
      // Saving either creates/updates a row in the same /quotations feed the
      // Orders page caches, so refresh it either way.
      invalidateOrders(queryClient);

      if (statusOverride === 'pending_approval') {
        navigate('/orders?tab=pending');
      } else {
        setView('list');
        loadData();
        resetForm();
      }
    } catch (err) {
      setFormError(describeSaveError(err, 'Error occurred while saving quotation.'));
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
      setCustomerSearchQuery(fullQ.customer ? (fullQ.customer.company_name || fullQ.customer.name) : '');
      setSalesmanId(fullQ.salesman_id);
      setSalesmanName(fullQ.salesman?.name || '');
      setDeliveryAddress(fullQ.delivery_address || '');
      setConvenienceCharge(parseFloat(fullQ.convenience_charge) || 0);
      setOtherCharge(parseFloat(fullQ.other_charge) || 0);
      setOtherChargeLabel(fullQ.other_charge_label || '');
      setVatPercentage(parseFloat(fullQ.vat_percentage) || 0);
      setVatEnabled(!!fullQ.vat_enabled);
      setVatRate(fullQ.vat_rate == null ? 10 : parseFloat(fullQ.vat_rate));
      setVatInclusive(!!fullQ.vat_inclusive);
      setDiscountType(fullQ.discount_type || 'flat');
      setDiscountValue(parseFloat(fullQ.discount_value) || 0);
      setRemark(fullQ.note || '');

      // Group items by section_name -> option_group_id / product_id / unit_price / notes
      const sectionMap = new Map();

      (fullQ.items || []).forEach(item => {
        const secName = item.section_name || 'Section A: Main Items';
        if (!sectionMap.has(secName)) {
          sectionMap.set(secName, new Map());
        }
        const blockMap = sectionMap.get(secName);
        const optGrpId = item.option_group_id || null;
        const key = `${optGrpId}_${item.product_id}_${item.unit_price}_${item.notes || ''}`;

        const prod = products.find(p => p.id === item.product_id) || item.product;
        const width = parseFloat(item.width) || 0;
        const height = parseFloat(item.height) || 0;
        const pcs = parseInt(item.pcs) || 1;
        const unitPrice = parseFloat(item.unit_price) || 0;
        const minSqft = parseFloat(item.min_billing_sqft) || 0;

        const catName = prod?.category?.name || item.product?.category?.name || item.category_name || '';
        const prodUnit = prod?.unit || item.product?.unit || item.unit || '';
        const prodName = prod?.name || item.product?.name || `Product #${item.product_id}`;
        const isPvc = prodUnit.toLowerCase().includes('pvc') || catName.toLowerCase().includes('pvc') || prodName.toLowerCase().includes('pvc') || prodName.toLowerCase().includes('clear water');
        const isPcs = prodUnit.trim().toLowerCase() === 'pcs';
        const actualSqft = Math.round(((width * height) / 144) * 100) / 100;

        const slatsCount = item.slats !== undefined && item.slats !== null && item.slats !== '' ? parseInt(item.slats) : (width > 0 ? pvcSlatCount(width) : '');
        const approxSlats = item.approx_slats || (width > 0 ? pvcApproxSlats(width) : '');

        let billedSqft = 0;
        if (isPcs) {
          billedSqft = pcs;
        } else if (width > 0 && height > 0) {
          if (isPvc) {
            const slatSize = parseFloat(prod?.product_size || item.product?.product_size) || 8;
            const actualSlats = parseInt(slatsCount) || pvcSlatCount(width);
            const calcWidth = actualSlats * slatSize;
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
          slats: slatsCount,
          approx_slats: approxSlats,
          actual_sqft: isPcs ? pcs : actualSqft,
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
      console.error('Error opening quotation edit form:', err);
      alert('Could not open quotation form.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintClick = (q, type = 'detailed') => {
    let typeParam = type;
    if (type === 'pad-detailed') typeParam = 'pad-sizes';
    if (type === 'pad-simplified') typeParam = 'pad';
    navigate(`/quotations/print/${q.id}?type=${typeParam}`);
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
    setSections([
      {
        id: 'sec_default',
        name: 'Section A: Main Items',
        blocks: []
      }
    ]);
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
      invalidateOrders(queryClient);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to archive quotation.');
    }
  };

  const handleRestore = async (id) => {
    try {
      await api.post(`/quotations/${id}/restore`);
      loadData();
      invalidateOrders(queryClient);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to restore quotation.');
    }
  };

  const handleConfirmConvert = async () => {
    if (!convertConfirmTarget) return;
    try {
      await api.post(`/quotations/${convertConfirmTarget.id}/convert-to-order`, {});
      setConvertConfirmTarget(null);
      // Must run before navigating, otherwise the Orders page renders a
      // cached list that doesn't contain the order just created.
      invalidateOrders(queryClient);
      navigate('/orders?tab=pending');
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
      invalidateOrders(queryClient);
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
              <p className="quotation-subtitle-text">Create and edit active customer quotes, price bids, and convert orders</p>
            </div>
            <div className="page-header-actions">
              <Link to="/price-lists" className="secondary-btn">
                📑 Price Lists
              </Link>
              <button className="primary-btn" onClick={() => { resetForm(); setView('form'); }}>
                + Create Quotation
              </button>
            </div>
          </div>

          {/* Top Filter Card Section */}
          <div style={{
            background: 'var(--bg-card, #ffffff)',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            padding: '20px',
            marginBottom: '20px',
            border: '1px solid var(--border, #e2e8f0)'
          }}>
            <div className="filter-toggle-bar" style={{ marginBottom: filtersOpen ? '18px' : 0 }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-heading, #0f172a)' }}>📋 Report Filters</span>
              <button
                type="button"
                className="filter-toggle-btn"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
              >
                🔍 Filters
                {[filterDate, filterMonth, filterYear, filterCustomer, filterEmployee, filterStatus].filter(Boolean).length > 0 && (
                  <span className="filter-active-badge">
                    {[filterDate, filterMonth, filterYear, filterCustomer, filterEmployee, filterStatus].filter(Boolean).length}
                  </span>
                )}
                <span className={`filter-toggle-chevron${filtersOpen ? ' open' : ''}`}>▼</span>
              </button>
            </div>

            {filtersOpen && (
            <div className="filter-panel-body">
            <div style={{ display: 'flex', gap: '28px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', color: 'var(--text-main, #2d3748)' }}>
                <input
                  type="radio"
                  name="reportPeriodType"
                  value="daily"
                  checked={reportPeriodType === 'daily'}
                  onChange={() => setReportPeriodType('daily')}
                  style={{ width: '16px', height: '16px', accentColor: '#00a699', cursor: 'pointer' }}
                />
                Daily Reports
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', color: 'var(--text-main, #2d3748)' }}>
                <input
                  type="radio"
                  name="reportPeriodType"
                  value="monthly"
                  checked={reportPeriodType === 'monthly'}
                  onChange={() => setReportPeriodType('monthly')}
                  style={{ width: '16px', height: '16px', accentColor: '#00a699', cursor: 'pointer' }}
                />
                Monthly Reports
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', color: 'var(--text-main, #2d3748)' }}>
                <input
                  type="radio"
                  name="reportPeriodType"
                  value="yearly"
                  checked={reportPeriodType === 'yearly'}
                  onChange={() => setReportPeriodType('yearly')}
                  style={{ width: '16px', height: '16px', accentColor: '#00a699', cursor: 'pointer' }}
                />
                Yearly Reports
              </label>
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {reportPeriodType === 'daily' && (
                <div style={{ flex: '1 1 160px', minWidth: '150px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-main, #1a202c)', marginBottom: '6px', display: 'block' }}>
                    Select Date *
                  </label>
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: '14px', border: '1px solid var(--border, #cbd5e1)', borderRadius: '6px', background: 'var(--bg-base, #fff)', color: 'var(--text-main)' }}
                  />
                </div>
              )}

              {reportPeriodType === 'monthly' && (
                <>
                  <div style={{ flex: '1 1 160px', minWidth: '140px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-main, #1a202c)', marginBottom: '6px', display: 'block' }}>
                      Select Month *
                    </label>
                    <select
                      value={filterMonth}
                      onChange={(e) => setFilterMonth(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', fontSize: '14px', border: '1px solid var(--border, #cbd5e1)', borderRadius: '6px', background: 'var(--bg-base, #fff)', color: 'var(--text-main)' }}
                    >
                      <option value="">Select One</option>
                      <option value="01">01 - January</option>
                      <option value="02">02 - February</option>
                      <option value="03">03 - March</option>
                      <option value="04">04 - April</option>
                      <option value="05">05 - May</option>
                      <option value="06">06 - June</option>
                      <option value="07">07 - July</option>
                      <option value="08">08 - August</option>
                      <option value="09">09 - September</option>
                      <option value="10">10 - October</option>
                      <option value="11">11 - November</option>
                      <option value="12">12 - December</option>
                    </select>
                  </div>

                  <div style={{ flex: '1 1 140px', minWidth: '130px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-main, #1a202c)', marginBottom: '6px', display: 'block' }}>
                      Select Year *
                    </label>
                    <select
                      value={filterYear}
                      onChange={(e) => setFilterYear(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', fontSize: '14px', border: '1px solid var(--border, #cbd5e1)', borderRadius: '6px', background: 'var(--bg-base, #fff)', color: 'var(--text-main)' }}
                    >
                      <option value="">Select One</option>
                      <option value="2024">2024</option>
                      <option value="2025">2025</option>
                      <option value="2026">2026</option>
                      <option value="2027">2027</option>
                      <option value="2028">2028</option>
                    </select>
                  </div>
                </>
              )}

              {reportPeriodType === 'yearly' && (
                <div style={{ flex: '1 1 160px', minWidth: '140px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-main, #1a202c)', marginBottom: '6px', display: 'block' }}>
                    Select Year *
                  </label>
                  <select
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: '14px', border: '1px solid var(--border, #cbd5e1)', borderRadius: '6px', background: 'var(--bg-base, #fff)', color: 'var(--text-main)' }}
                  >
                    <option value="">Select One</option>
                    <option value="2024">2024</option>
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                    <option value="2027">2027</option>
                    <option value="2028">2028</option>
                  </select>
                </div>
              )}

              <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-main, #1a202c)', marginBottom: '6px', display: 'block' }}>
                  Select Customer *
                </label>
                <select
                  value={filterCustomer}
                  onChange={(e) => setFilterCustomer(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '14px', border: '1px solid var(--border, #cbd5e1)', borderRadius: '6px', background: 'var(--bg-base, #fff)', color: 'var(--text-main)' }}
                >
                  <option value="">All Customer</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone || c.company_name || 'N/A'})</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-main, #1a202c)', marginBottom: '6px', display: 'block' }}>
                  Select Employee *
                </label>
                <select
                  value={filterEmployee}
                  onChange={(e) => setFilterEmployee(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '14px', border: '1px solid var(--border, #cbd5e1)', borderRadius: '6px', background: 'var(--bg-base, #fff)', color: 'var(--text-main)' }}
                >
                  <option value="">All Employee</option>
                  {employees.map(e => (
                    <option key={e.salesperson_id || e.id} value={e.salesperson_id || e.id}>{e.salesperson_name || e.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: '1 1 160px', minWidth: '140px' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-main, #1a202c)', marginBottom: '6px', display: 'block' }}>
                  Status
                </label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '14px', border: '1px solid var(--border, #cbd5e1)', borderRadius: '6px', background: 'var(--bg-base, #fff)', color: 'var(--text-main)' }}
                >
                  <option value="">All Statuses</option>
                  <option value="quotation">Quotation Draft</option>
                  <option value="pending_approval">Pending Approval</option>
                  <option value="pending_reapproval">Pending Re-Approval</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="invoiced">Invoiced</option>
                </select>
              </div>

              <div style={{ flex: '0 0 auto' }}>
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  style={{
                    background: '#00a699',
                    color: '#ffffff',
                    border: 'none',
                    padding: '9px 20px',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 4px rgba(0,166,153,0.3)'
                  }}
                >
                  🔍 Search
                </button>
              </div>

              <div style={{ flex: '0 0 auto' }}>
                <button
                  type="button"
                  onClick={() => {
                    setFilterDate('');
                    setFilterMonth('');
                    setFilterYear('');
                    setFilterCustomer('');
                    setFilterEmployee('');
                    setFilterStatus('');
                    setFilterSearch('');
                    setCurrentPage(1);
                  }}
                  style={{
                    background: '#64748b',
                    color: '#ffffff',
                    border: 'none',
                    padding: '9px 16px',
                    borderRadius: '6px',
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  🔄 Reset
                </button>
              </div>

            </div>
            </div>
            )}
          </div>

          <div className="entries-search-row mobile-entries-search-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-main, #475569)' }}>
              <span>Show</span>
              <select
                value={entriesPerPage}
                onChange={(e) => {
                  setEntriesPerPage(parseInt(e.target.value));
                  setCurrentPage(1);
                }}
                style={{ padding: '5px 10px', borderRadius: '4px', border: '1px solid var(--border, #cbd5e1)', fontSize: '14px', background: 'var(--bg-base, #fff)', color: 'var(--text-main)' }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>entries</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-main, #475569)' }}>
              <span>Search:</span>
              <input
                type="text"
                placeholder="Type to filter..."
                value={filterSearch}
                onChange={(e) => {
                  setFilterSearch(e.target.value);
                  setCurrentPage(1);
                }}
                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border, #cbd5e1)', fontSize: '14px', width: '220px', background: 'var(--bg-base, #fff)', color: 'var(--text-main)' }}
              />
            </div>
          </div>

          {loading ? (
            <div className="flex-center" style={{ padding: '40px' }}><div className="spinner"></div></div>
          ) : (
            <>
              <div className="card-table-wrapper quotations-desktop-table">
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
                  {paginatedQuotations.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-main)' }}>No quotations found.</td>
                    </tr>
                  ) : (
                    paginatedQuotations.map((q) => (
                      <tr key={q.id}>
                        <td>
                          <button
                            type="button"
                            className="clickable-link"
                            onClick={() => handleEditClick(q)}
                            disabled={q.status === 'invoiced'}
                            style={{ fontWeight: 800 }}
                          >
                            {q.quotation_number}
                          </button>
                        </td>
                        <td>
                          {q.customer ? (
                            <Link
                              to={`/customers?search=${encodeURIComponent(q.customer.company_name || q.customer.name)}`}
                              className="clickable-link"
                              style={{ fontWeight: 600 }}
                            >
                              {q.customer.company_name || q.customer.name}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
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
                            🖨️ <span className="btn-label-text">Detailed Print</span>
                          </button>

                          <button className="text-btn" onClick={() => handlePrintClick(q, 'simplified')} style={{ marginLeft: '8px', color: '#0ea5e9', fontWeight: 600 }}>
                            🖨️ <span className="btn-label-text">View Print</span>
                          </button>

                          <button className="text-btn" onClick={() => handlePrintClick(q, 'pad-detailed')} style={{ marginLeft: '8px', color: '#8b5cf6', fontWeight: 600 }}>
                            📝 <span className="btn-label-text">Pad Print (Sizes)</span>
                          </button>

                          <button className="text-btn" onClick={() => handlePrintClick(q, 'pad-simplified')} style={{ marginLeft: '8px', color: '#ec4899', fontWeight: 600 }}>
                            📝 <span className="btn-label-text">Pad Print</span>
                          </button>
                          
                          {q.status === 'quotation' && (
                            <button className="text-btn" onClick={() => setConvertConfirmTarget(q)} style={{ marginLeft: '8px', color: '#000000', fontWeight: 700 }}>
                              🛒 Convert to Order
                            </button>
                          )}

                          {(q.status === 'pending_approval' || q.status === 'pending_reapproval') && (can('quotations:approve') || user?.role === 'admin') && (
                            <>
                              <button className="text-btn" onClick={() => setApproveConfirmTarget(q)} style={{ marginLeft: '8px', color: 'var(--success)', fontWeight: 700 }}>
                                ✅ Approve
                              </button>
                              <button className="text-btn" onClick={() => handleArchive(q.id)} style={{ marginLeft: '8px', color: 'var(--danger)', fontWeight: 700 }}>
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

            {/* Mobile card list for Quotations */}
            <div className="quotations-mobile-list">
                {paginatedQuotations.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-main)', padding: '30px' }}>No quotations found.</div>
                ) : (
                  paginatedQuotations.map((q, idx) => (
                    <div className="invoice-mobile-card" key={q.id}>
                      {/* Horizontal Action Pills Bar matching reference screenshot */}
                      <div className="mobile-card-actions-scroll">
                        <button
                          type="button"
                          className="mobile-action-pill pill-purple"
                          onClick={() => handleEditClick(q)}
                          disabled={q.status === 'invoiced'}
                        >
                          👁 View / Edit
                        </button>
                        <button
                          type="button"
                          className="mobile-action-pill pill-cyan"
                          onClick={() => handlePrintClick(q, 'detailed')}
                        >
                          🖨 Print
                        </button>
                        <button
                          type="button"
                          className="mobile-action-pill pill-indigo"
                          onClick={() => handlePrintClick(q, 'pad-detailed')}
                        >
                          📝 Pad Print
                        </button>
                        {q.status === 'quotation' && (
                          <button
                            type="button"
                            className="mobile-action-pill pill-green"
                            onClick={() => setConvertConfirmTarget(q)}
                          >
                            🛒 Convert to Order
                          </button>
                        )}
                        {(q.status === 'pending_approval' || q.status === 'pending_reapproval') && (can('quotations:approve') || user?.role === 'admin') && (
                          <button
                            type="button"
                            className="mobile-action-pill pill-green"
                            onClick={() => setApproveConfirmTarget(q)}
                          >
                            ✅ Approve
                          </button>
                        )}
                        {q.status !== 'invoiced' && (
                          <button
                            type="button"
                            className="mobile-action-pill pill-red"
                            onClick={() => handleArchive(q.id)}
                          >
                            🗑 Archive
                          </button>
                        )}
                      </div>

                      <div className="invoice-mobile-card-header">
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>#{(currentPage - 1) * entriesPerPage + idx + 1}</span>
                          <strong style={{ color: '#0f172a', display: 'block', fontSize: '15px' }}>
                            {q.customer?.company_name || q.customer?.name || 'Walk-in Customer'}
                          </strong>
                          {q.customer?.name && q.customer?.name !== q.customer?.company_name && (
                            <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>👤 {q.customer.name}</span>
                          )}
                        </div>
                      </div>

                      <div className="invoice-mobile-card-body">
                        <div className="invoice-mobile-card-row">
                          <span>Quotation No</span>
                          <button
                            type="button"
                            className="clickable-link"
                            onClick={() => handleEditClick(q)}
                            style={{ fontWeight: 800, color: '#007bff' }}
                          >
                            {q.quotation_number} ↗
                          </button>
                        </div>
                        <div className="invoice-mobile-card-row">
                          <span>Date</span>
                          <span>{formatDate(q.date || q.created_at)}</span>
                        </div>
                        <div className="invoice-mobile-card-row">
                          <span>Salesman</span>
                          <span>{q.salesman?.name || q.creator?.name || '-'}</span>
                        </div>
                        <div className="invoice-mobile-card-row">
                          <span>Total</span>
                          <span style={{ fontWeight: 800 }}>{formatCurrency(q.net_amount || q.grand_total || 0)}</span>
                        </div>
                        <div className="invoice-mobile-card-row">
                          <span>Status</span>
                          <span className={`badge ${
                            q.status === 'approved' ? 'badge-success' :
                            q.status === 'invoiced' ? 'badge-info' :
                            (q.status === 'pending_approval' || q.status === 'pending_reapproval') ? 'badge-warning' :
                            q.status === 'rejected' ? 'badge-danger' : 'badge-outline'
                          }`}>
                            {q.status === 'pending_reapproval' ? 'Pending Re-Approval' :
                             q.status === 'pending_approval' ? 'Pending Approval' :
                             q.status === 'approved' ? 'Approved' :
                             q.status === 'invoiced' ? 'Invoiced' :
                             q.status === 'rejected' ? 'Rejected' : q.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '12px 16px', borderTop: '1px solid var(--border, #e2e8f0)', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-muted, #64748b)' }}>
                  Showing {filteredQuotations.length === 0 ? 0 : (currentPage - 1) * entriesPerPage + 1} to {Math.min(currentPage * entriesPerPage, filteredQuotations.length)} of {filteredQuotations.length} entries
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    style={{ padding: '6px 14px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--border, #cbd5e1)', background: currentPage === 1 ? 'var(--bg-subtle, #f1f5f9)' : 'var(--bg-base, #fff)', color: 'var(--text-main)', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2)).map(p => (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '13px',
                        borderRadius: '4px',
                        border: '1px solid var(--border, #cbd5e1)',
                        background: p === currentPage ? '#00a699' : 'var(--bg-base, #fff)',
                        color: p === currentPage ? '#ffffff' : 'var(--text-main)',
                        fontWeight: p === currentPage ? 'bold' : 'normal',
                        cursor: 'pointer'
                      }}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    disabled={currentPage === totalPages || filteredQuotations.length === 0}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    style={{ padding: '6px 14px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--border, #cbd5e1)', background: currentPage === totalPages || filteredQuotations.length === 0 ? 'var(--bg-subtle, #f1f5f9)' : 'var(--bg-base, #fff)', color: 'var(--text-main)', cursor: currentPage === totalPages || filteredQuotations.length === 0 ? 'not-allowed' : 'pointer' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        /* Create/Edit Form View */
        <div className="animate-fade-in">
          <div className="page-header-row">
            <div className="page-header-title-row">
              <h1>{isEditMode ? 'Edit Quotation' : <>New Quotation <span className="hide-mobile-text">(Dynamic Builder)</span></>}</h1>
              <button className="btn-outline-back mobile-only-btn" onClick={() => { setView('list'); resetForm(); }}>⬅️ Back to List</button>
              <p className="hide-mobile-text">Organize items into dynamic sections, options variations, and print toggles</p>
            </div>
            <div className="form-btn-row" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="primary-btn"
                onClick={addSection}
                style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#fff', fontWeight: 'bold' }}
              >
                ➕ Add Section / Group
              </button>
              <button className="btn-outline-back desktop-only-btn" onClick={() => { setView('list'); resetForm(); }}>⬅️ Back to List</button>
            </div>
          </div>

          {formError && (
            <div className="alert alert-danger" style={{ marginBottom: '16px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '12px 16px', borderRadius: '8px' }}>
              <strong>⚠️ Validation Error:</strong> {formError}
            </div>
          )}

          <div className="form-layout-grid" style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '20px', alignItems: 'start' }}>
            <div>
              {/* TOP HEADER SECTION */}
              <div className="form-card-section grid-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
                <div className="form-group mobile-inline-field" style={{ margin: 0 }}>
                  <label style={{ fontWeight: '600', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Qut. Date *</label>
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

              {/* DYNAMIC SECTIONS BUILDER LIST */}
              {sections.map((sec, secIdx) => {
                // Group blocks in section by option_group_id
                const normalBlocks = sec.blocks.filter(b => !b.option_group_id);
                const optionGroups = {};
                sec.blocks.filter(b => b.option_group_id).forEach(b => {
                  if (!optionGroups[b.option_group_id]) optionGroups[b.option_group_id] = [];
                  optionGroups[b.option_group_id].push(b);
                });

                return (
                  <div key={sec.id} className="form-card-section mobile-simple-section" style={{ border: '2px solid var(--border, #e2e8f0)', borderRadius: '8px', padding: '6px', marginBottom: '24px', position: 'relative' }}>
                    {/* Section Card Header */}
                    <div className="section-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', background: 'var(--bg-subtle, #f8fafc)', padding: '12px 16px', borderRadius: '8px', borderLeft: '4px solid #0284c7' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                        <span style={{ fontSize: '18px' }}>📂</span>
                        <input
                          type="text"
                          value={sec.name}
                          onChange={(e) => updateSectionName(sec.id, e.target.value)}
                          className="section-name-input"
                          style={{ fontSize: '16px', fontWeight: 'bold', border: '1px solid transparent', background: 'transparent', padding: '4px 8px', borderRadius: '4px', color: 'var(--text-main)', width: '320px' }}
                          onFocus={(e) => e.target.style.border = '1px solid #0284c7'}
                          onBlur={(e) => e.target.style.border = '1px solid transparent'}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => addItemToSectionAndPick(sec.id)}
                          style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          ➕ Add Item
                        </button>
                        <button
                          type="button"
                          onClick={() => addOptionGroupToSection(sec.id)}
                          style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          🔀 Add Option Group
                        </button>
                        {sections.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSection(sec.id)}
                            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '7px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                          >
                            🗑️ Delete Section
                          </button>
                        )}
                      </div>
                    </div>

                    {sec.blocks.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic', background: 'var(--bg-base)', borderRadius: '8px' }}>
                        No items in this section yet. Click <strong>"+ Add Item"</strong> or <strong>"+ Add Option Group"</strong> above.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        
                        {/* 1. Normal Standard Items (Per-Block Table) */}
                        {normalBlocks.length > 0 && normalBlocks.map((block, bIdx) => {
                          const isPcsBlock = (block.unit || '').trim().toLowerCase() === 'pcs' ||
                                             (block.unit || '').trim().toLowerCase() === 'pieces' ||
                                             (block.unit || '').trim().toLowerCase() === 'piece' ||
                                             (block.unit || '').trim().toLowerCase() === 'box' ||
                                             (block.unit || '').trim().toLowerCase() === 'set';
                          
                          const isPvcBlock = (block.unit || '').toLowerCase().includes('pvc') ||
                                             (block.category_name || '').toLowerCase().includes('pvc') ||
                                             (block.product_name || '').toLowerCase().includes('pvc') ||
                                             (block.product_name || '').toLowerCase().includes('clear water');
                          
                          const totalBilledSqft = block.sizes.reduce((sum, s) => sum + (parseFloat(s.billed_sqft) || 0), 0);
                          const totalPcs = block.sizes.reduce((sum, s) => sum + (parseInt(s.pcs) || 0), 0);
                          const totalPrice = block.sizes.reduce((sum, s) => sum + (parseFloat(s.line_total) || 0), 0);

                          const columnTitles = isPvcBlock ? QUOTE_COLUMNS_WITH_PVC : QUOTE_COLUMNS;

                          const changeProductUI = productChangeBlockId === block.id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                                style={{ fontWeight: '600', fontSize: '12px', padding: '6px', minWidth: '150px' }}
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
                                  placeholder="Search name/code..."
                                  value={productChangeQuery}
                                  onChange={(e) => setProductChangeQuery(e.target.value)}
                                  className="modern-form-control"
                                  style={{ fontSize: '11px', padding: '5px 8px', width: '130px' }}
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
                                style={{ fontSize: '11px', color: '#ef4444', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setProductChangeBlockId(block.id); setProductChangeQuery(''); }}
                              style={{ fontSize: '11px', color: '#4f46e5', background: '#eff6ff', border: '1px solid #c7d2fe', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}
                              title="Click to change to another product"
                            >
                              🔄 Change Product
                            </button>
                          );

                          return (
                            <div key={block.id} style={{ overflowX: 'auto', marginBottom: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                              <table className="data-table item-builder-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, margin: 0 }}>
                                <colgroup>
                                  <col style={{ width: '100px' }} />
                                  <col style={{ width: '85px' }} />
                                  {isPvcBlock && <col style={{ width: '70px' }} />}
                                  {isPvcBlock && <col style={{ width: '70px' }} />}
                                  {isPvcBlock && <col style={{ width: '70px' }} />}
                                  <col style={{ width: '85px' }} />
                                  <col style={{ width: '60px' }} />
                                  <col style={{ width: '95px' }} />
                                  <col style={{ width: '120px' }} />
                                  {/* Wide enough for the first row's full button set:
                                      add row, delete, Excel paste and AI Scan. */}
                                  <col style={{ width: '200px' }} />
                                </colgroup>
                                <tbody>
                                  <ItemLineHeader
                                    productCode={block.product_code}
                                    productName={block.product_name}
                                    kind={unitKindOf({ isPcsBlock, isPvcBlock })}
                                    columns={columnTitles}
                                    changeProductUI={changeProductUI}
                                  />

                                  {/* Mobile-only Width/Height/Pcs card (hidden on desktop) */}
                                  <tr className="mobile-size-card-row">
                                    <td colSpan={columnTitles.length} className="mobile-size-card-cell">
                                      <div className="mobile-size-card">
                                        <div className="mobile-size-header-bar">
                                          {!isPcsBlock && (
                                            <>
                                              <div className="mobile-size-header-item">
                                                <span className="mobile-size-header-icon icon-width">↔</span>
                                                <span>WIDTH (INCH)</span>
                                              </div>
                                              <div className="mobile-size-header-item">
                                                <span className="mobile-size-header-icon icon-height">↕</span>
                                                <span>HEIGHT (INCH)</span>
                                              </div>
                                            </>
                                          )}
                                          <div className="mobile-size-header-item">
                                            <span className="mobile-size-header-icon icon-pcs">📦</span>
                                            <span>{isPcsBlock ? 'PCS / SET' : 'PCS/NOS'}</span>
                                          </div>
                                        </div>
                                        <div className="mobile-size-rows">
                                          {block.sizes.map((sz, szIdx) => (
                                            <div className="mobile-size-row" key={sz.id}>
                                              {!isPcsBlock && (
                                                <>
                                                  <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    className="mobile-size-box"
                                                    value={sz.width}
                                                    placeholder="Width"
                                                    onChange={(e) => handleSizeChange(sec.id, block.id, sz.id, 'width', e.target.value)}
                                                  />
                                                  <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    className="mobile-size-box"
                                                    value={sz.height}
                                                    placeholder="Height"
                                                    onChange={(e) => handleSizeChange(sec.id, block.id, sz.id, 'height', e.target.value)}
                                                  />
                                                </>
                                              )}
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
                                              <span className="mobile-size-total-value">{totalPcs}</span>
                                            </span>
                                          </div>
                                          <div className="mobile-size-total-pill">
                                            <span className="mobile-size-total-icon">▦</span>
                                            <span className="mobile-size-total-text">
                                              <span className="mobile-size-total-label">Total Billing</span>
                                              <span className="mobile-size-total-value">{isPcsBlock ? `${totalPcs} pcs` : `${totalBilledSqft.toFixed(1)} sqft`}</span>
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                  {block.sizes.map((sizeRow, sIdx) => (
                                    <tr key={sizeRow.id} className={sIdx > 0 ? 'mobile-subsequent-row' : ''} style={{ background: '#fff' }}>

                                      {/* Product Details Header Column was removed and moved to ItemLineHeader top row */}

                                      {/* Unit Price */}
                                      {sIdx === 0 && (
                                        <td rowSpan={block.sizes.length} className="cell-unitprice" style={{ verticalAlign: 'top', paddingTop: '12px', background: '#fafafa', borderRight: '1px solid var(--border)', padding: '12px 8px' }}>
                                          <input
                                            type="number"
                                            value={block.unit_price}
                                            onChange={(e) => handleBlockChange(sec.id, block.id, 'unit_price', e.target.value)}
                                            className="modern-form-control"
                                            style={{ textAlign: 'center', fontWeight: '600', padding: '8px 10px', fontSize: '13px' }}
                                          />
                                        </td>
                                      )}

                                      {/* Measurement Columns: Dynamic Row Pattern */}
                                      {isPcsBlock ? (
                                        // colSpan 4, not 3: absorbs the old separate "Total Pcs"
                                        // readonly cell below, which always repeated this exact
                                        // number since a Pcs-unit block only ever has one row.
                                        <td colSpan={4} className="cell-size cell-pcs-unified" style={{ padding: '8px 12px', textAlign: 'center' }}>
                                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '6px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#0369a1' }}>Quantity:</span>
                                            <input
                                              type="number"
                                              inputMode="numeric"
                                              min="1"
                                              value={sizeRow.pcs}
                                              onChange={(e) => handleSizeChange(sec.id, block.id, sizeRow.id, 'pcs', e.target.value)}
                                              placeholder="Pcs"
                                              className="modern-form-control"
                                              style={{ width: '80px', textAlign: 'center', fontWeight: '700', fontSize: '13px', padding: '5px' }}
                                            />
                                            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>PCS</span>
                                          </div>
                                        </td>
                                      ) : (
                                        <>
                                          {/* Width */}
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

                                          {/* Approx Pcs */}
                                          {isPvcBlock && (
                                            <td className="cell-size" style={{ padding: '6px' }}>
                                              <input
                                                type="text"
                                                value={pvcApproxSlats(sizeRow.width)}
                                                readOnly
                                                placeholder="Approx"
                                                className="modern-form-control"
                                                style={{ backgroundColor: '#f0f9ff', color: '#0284c7', textAlign: 'center', fontWeight: '700', fontSize: '12px', border: '1px solid #bae6fd' }}
                                              />
                                            </td>
                                          )}

                                          {/* pcs of Slats */}
                                          {isPvcBlock && (
                                            <td className="cell-size" style={{ padding: '6px' }}>
                                              <input
                                                type="number"
                                                inputMode="numeric"
                                                value={(() => {
                                                  const w = parseFloat(sizeRow.width) || 0;
                                                  if (w <= 0) return '';
                                                  if (sizeRow.slats !== undefined && sizeRow.slats !== null && sizeRow.slats !== '') {
                                                    return sizeRow.slats;
                                                  }
                                                  return pvcSlatCount(w);
                                                })()}
                                                onChange={(e) => handleSizeChange(sec.id, block.id, sizeRow.id, 'slats', e.target.value)}
                                                placeholder="Slats"
                                                className="modern-form-control"
                                                style={{ textAlign: 'center', fontWeight: '700', border: '1.5px solid #0ea5e9', color: '#0369a1' }}
                                              />
                                            </td>
                                          )}

                                          {/* T. Width (in) */}
                                          {isPvcBlock && (
                                            <td className="cell-size" style={{ padding: '6px' }}>
                                              <input
                                                type="text"
                                                value={(() => {
                                                  const w = parseFloat(sizeRow.width) || 0;
                                                  if (w <= 0) return '';
                                                  const slatSize = parseFloat(block.product_size) || 8;
                                                  const slatsCount = sizeRow.slats !== undefined && sizeRow.slats !== null && sizeRow.slats !== '' ? parseInt(sizeRow.slats) : pvcSlatCount(w);
                                                  return (slatsCount || 0) * slatSize;
                                                })()}
                                                readOnly
                                                placeholder="T. Width"
                                                className="modern-form-control"
                                                style={{ backgroundColor: '#f1f5f9', textAlign: 'center', fontWeight: '700', color: '#0f172a' }}
                                              />
                                            </td>
                                          )}

                                          {/* Height */}
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

                                          {/* Pcs */}
                                          <td className="cell-size" style={{ padding: '6px' }}>
                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                              <input
                                                type="number"
                                                inputMode="numeric"
                                                value={sizeRow.pcs}
                                                onChange={(e) => handleSizeChange(sec.id, block.id, sizeRow.id, 'pcs', e.target.value)}
                                                placeholder="Pcs"
                                                className="modern-form-control"
                                                style={{ textAlign: 'center' }}
                                              />
                                              </div>
                                            </td>
                                          </>
                                          )}

                                          {/* Total Billing (desktop-only) - skipped for Pcs blocks,
                                              whose Quantity cell above already covers this column
                                              (see its colSpan) since Total Pcs always equals
                                              Quantity there and doesn't need its own cell. */}
                                          {sIdx === 0 && !isPcsBlock && (
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

                                          {/* Total Price */}
                                          {sIdx === 0 && (
                                            <td rowSpan={block.sizes.length} className="cell-total" style={{ verticalAlign: 'top', paddingTop: '12px', background: '#fafafa', borderRight: '1px solid var(--border)', padding: '12px 8px' }}>
                                              <input
                                                type="text"
                                                value={totalPrice.toFixed(2)}
                                                readOnly
                                                className="modern-form-control"
                                                style={{ backgroundColor: '#f1f5f9', fontWeight: 'bold', color: 'var(--primary)', textAlign: 'center', padding: '8px 10px', fontSize: '13px' }}
                                              />
                                            </td>
                                          )}

                                          {/* Block Actions */}
                                          <td className={`cell-action ${sIdx > 0 ? 'mobile-hidden-action' : ''}`} style={{ verticalAlign: 'top', paddingTop: '8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                              {!isPcsBlock && (
                                                <button
                                                  type="button"
                                                  onClick={() => addSizeRowToBlock(sec.id, block.id)}
                                                  className="btn-action-circle btn-action-add"
                                                  title="Add Size Row"
                                                  style={{ width: '28px', height: '28px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                >
                                                  ➕
                                                </button>
                                              )}
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  if (!isPcsBlock && block.sizes.length > 1) {
                                                    removeSizeRowFromBlock(sec.id, block.id, sizeRow.id);
                                                  } else {
                                                    removeProductBlock(sec.id, block.id);
                                                  }
                                                }}
                                                className="btn-action-circle btn-action-delete"
                                                title={(!isPcsBlock && block.sizes.length > 1) ? "Delete Size Row" : "Delete Product Block"}
                                                style={{ width: '28px', height: '28px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                              >
                                                🗑️
                                              </button>
                                              {sIdx === 0 && !isPcsBlock && (
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
                                                    title="AI Measure (OCR Bill/Slip Scan)"
                                                  >
                                                    📷 AI Scan
                                                  </button>
                                                </>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                        ))}

                                      {/* Product Specification Box */}
                                      <tr style={{ background: '#f8fafc' }}>
                                        <td colSpan={columnTitles.length - 1} style={{ padding: '8px 14px' }}>
                                          <textarea
                                            className="product-notes-textarea"
                                            value={block.notes || ''}
                                            onChange={(e) => handleBlockChange(sec.id, block.id, 'notes', e.target.value)}
                                            rows="2"
                                            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', resize: 'vertical', background: '#fff' }}
                                            placeholder="Enter specification details..."
                                          />
                                        </td>
                                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                                          <button 
                                            type="button" 
                                            onClick={() => handleBlockChange(sec.id, block.id, 'notes', '')} 
                                            className="btn-action-circle btn-action-delete"
                                            title="Clear Specification"
                                          >
                                            🗑️
                                          </button>
                                        </td>
                                      </tr>
                                </tbody>
                              </table>
                            </div>
                          );
                        })}

                        {/* 2. Option Groups Cards (Variations Selector) */}
                        {Object.keys(optionGroups).map((ogId, ogIdx) => {
                          const optionBlocks = optionGroups[ogId];

                          return (
                            <div key={ogId} style={{ border: '2px dashed #8b5cf6', borderRadius: '10px', padding: '16px', background: 'rgba(139, 92, 246, 0.03)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#7c3aed', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span>🔀 Option Group #{ogIdx + 1}</span>
                                  <span style={{ fontSize: '11px', color: '#6b21a8', background: '#f3e8ff', padding: '2px 8px', borderRadius: '12px' }}>
                                    Customer selects 1 Option
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => addOptionVariantToGroup(sec.id, ogId)}
                                  style={{ background: '#7c3aed', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                  ➕ Add Option Variation
                                </button>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                {optionBlocks.map((b, optIdx) => {
                                  const isSelected = b.is_selected;
                                  const isEnabled = b.is_enabled_for_print !== false;
                                  const totalSqft = b.sizes.reduce((sum, s) => sum + (parseFloat(s.billed_sqft) || 0), 0);
                                  const totalPrice = b.sizes.reduce((sum, s) => sum + (parseFloat(s.line_total) || 0), 0);

                                  return (
                                    <div 
                                      key={b.id} 
                                      style={{
                                        border: isSelected ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                                        borderRadius: '8px',
                                        padding: '14px',
                                        background: isSelected ? '#ffffff' : '#f8fafc',
                                        boxShadow: isSelected ? '0 2px 8px rgba(124, 58, 237, 0.15)' : 'none',
                                        transition: 'all 0.2s'
                                      }}
                                    >
                                      {/* Option Variant Header Bar */}
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', color: isSelected ? '#7c3aed' : '#475569' }}>
                                          <input
                                            type="radio"
                                            name={`opt_radio_${ogId}`}
                                            checked={isSelected}
                                            onChange={() => toggleOptionSelected(sec.id, ogId, b.id)}
                                            style={{ width: '16px', height: '16px', accentColor: '#7c3aed', cursor: 'pointer' }}
                                          />
                                          Option {optIdx + 1}: {b.product_name} {isSelected ? '(Active Selected)' : ''}
                                        </label>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                          <button
                                            type="button"
                                            onClick={() => removeProductBlock(sec.id, b.id)}
                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' }}
                                            title="Delete Option"
                                          >
                                            🗑️
                                          </button>
                                        </div>
                                      </div>

                                      {/* Option Product Selector & Inputs */}
                                      <div className="option-grid-4col" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                                        <div>
                                          <label style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Product Variant</label>
                                          <select
                                            value={b.product_id}
                                            onChange={(e) => handleBlockChange(sec.id, b.id, 'product_id', e.target.value)}
                                            className="modern-form-control"
                                            style={{ fontSize: '13px', fontWeight: 'bold' }}
                                          >
                                            {products.map(p => (
                                              <option key={p.id} value={p.id}>{p.product_code ? p.product_code.toUpperCase() : p.name}</option>
                                            ))}
                                          </select>
                                        </div>

                                        <div>
                                          <label style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Unit Price (৳)</label>
                                          <input
                                            type="number"
                                            value={b.unit_price}
                                            onChange={(e) => handleBlockChange(sec.id, b.id, 'unit_price', e.target.value)}
                                            className="modern-form-control"
                                            style={{ textAlign: 'center' }}
                                          />
                                        </div>

                                        <div>
                                          <label style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Total Sq.Ft</label>
                                          <input
                                            type="text"
                                            value={totalSqft.toFixed(2)}
                                            readOnly
                                            className="modern-form-control"
                                            style={{ textAlign: 'center', background: '#f1f5f9', fontWeight: 'bold' }}
                                          />
                                        </div>

                                        <div>
                                          <label style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Option Total Price</label>
                                          <input
                                            type="text"
                                            value={isSelected ? `৳${totalPrice.toFixed(2)}` : '৳0.00 (Unselected)'}
                                            readOnly
                                            className="modern-form-control"
                                            style={{ textAlign: 'center', background: '#f1f5f9', fontWeight: 'bold', color: isSelected ? '#7c3aed' : '#94a3b8' }}
                                          />
                                        </div>
                                      </div>

                                      {/* Mobile-only Width/Height/Pcs card (hidden on desktop) */}
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
                                          {b.sizes.map((sz, szIdx) => (
                                            <div className="mobile-size-row" key={sz.id}>
                                              <input
                                                type="number"
                                                inputMode="decimal"
                                                className="mobile-size-box"
                                                value={sz.width}
                                                onChange={(e) => handleSizeChange(sec.id, b.id, sz.id, 'width', e.target.value)}
                                              />
                                              <input
                                                type="number"
                                                inputMode="decimal"
                                                className="mobile-size-box"
                                                value={sz.height}
                                                onChange={(e) => handleSizeChange(sec.id, b.id, sz.id, 'height', e.target.value)}
                                              />
                                              <input
                                                type="number"
                                                inputMode="numeric"
                                                className="mobile-size-box"
                                                value={sz.pcs}
                                                onChange={(e) => handleSizeChange(sec.id, b.id, sz.id, 'pcs', e.target.value)}
                                              />
                                              {szIdx === b.sizes.length - 1 && (
                                                <button
                                                  type="button"
                                                  className="mobile-size-add-btn"
                                                  onClick={() => addSizeRowToBlock(sec.id, b.id)}
                                                  title="Add Row"
                                                >
                                                  +
                                                </button>
                                              )}
                                              <button
                                                type="button"
                                                className="mobile-size-del-btn"
                                                onClick={() => removeSizeRowFromBlock(sec.id, b.id, sz.id)}
                                                disabled={b.sizes.length <= 1}
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
                                              <span className="mobile-size-total-value">{b.sizes.reduce((sum, s) => sum + (parseInt(s.pcs) || 0), 0)}</span>
                                            </span>
                                          </div>
                                          <div className="mobile-size-total-pill">
                                            <span className="mobile-size-total-icon">▦</span>
                                            <span className="mobile-size-total-text">
                                              <span className="mobile-size-total-label">Total Sqft</span>
                                              <span className="mobile-size-total-value">{totalSqft.toFixed(1)} sqft</span>
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Option Size Rows (desktop) */}
                                      {b.sizes.map((sz, szIdx) => (
                                        <div key={sz.id} className="option-size-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr 40px', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                                          <input
                                            type="number"
                                            inputMode="decimal"
                                            placeholder="Width"
                                            value={sz.width}
                                            onChange={(e) => handleSizeChange(sec.id, b.id, sz.id, 'width', e.target.value)}
                                            className="modern-form-control"
                                            style={{ fontSize: '12px' }}
                                          />
                                          <input
                                            type="number"
                                            inputMode="decimal"
                                            placeholder="Height"
                                            value={sz.height}
                                            onChange={(e) => handleSizeChange(sec.id, b.id, sz.id, 'height', e.target.value)}
                                            className="modern-form-control"
                                            style={{ fontSize: '12px' }}
                                          />
                                          <input
                                            type="number"
                                            inputMode="numeric"
                                            placeholder="Pcs"
                                            value={sz.pcs}
                                            onChange={(e) => handleSizeChange(sec.id, b.id, sz.id, 'pcs', e.target.value)}
                                            className="modern-form-control"
                                            style={{ fontSize: '12px', textAlign: 'center' }}
                                          />
                                          <input
                                            type="text"
                                            value={`${sz.billed_sqft.toFixed(2)} sqft`}
                                            readOnly
                                            className="modern-form-control"
                                            style={{ fontSize: '12px', background: '#f1f5f9', textAlign: 'center' }}
                                          />
                                          {szIdx === 0 ? (
                                            <button
                                              type="button"
                                              onClick={() => addSizeRowToBlock(sec.id, b.id)}
                                              className="btn-action-circle btn-action-add"
                                              title="Add Size"
                                            >
                                              ➕
                                            </button>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => removeSizeRowFromBlock(sec.id, b.id, sz.id)}
                                              className="btn-action-circle btn-action-delete"
                                              title="Delete Size"
                                            >
                                              🗑️
                                            </button>
                                          )}
                                        </div>
                                      ))}

                                      <textarea
                                        placeholder="Option notes/specifications..."
                                        value={b.notes || ''}
                                        onChange={(e) => handleBlockChange(sec.id, b.id, 'notes', e.target.value)}
                                        rows="2"
                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', marginTop: '6px' }}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}

                      </div>
                    )}
                  </div>
                );
              })}

              {/* BOTTOM SUMMARY FIELDS — Remarks/Note only. The charge, VAT, discount,
                  and total/net amount fields used to be repeated here AND in the
                  Financial Summary sidebar below (same state, two inputs) - on
                  mobile the sidebar stacks directly under this section, so it read
                  as the same numbers typed twice on one page. Sidebar is now the
                  only place to edit them. */}
              <div className="form-card-section grid-3col" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
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
                  type="button"
                  className="btn-gradient-submit"
                  onClick={() => saveQuotation()} 
                  disabled={isSubmitting}
                >
                  💾 {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
                <span className="mobile-page-label hide-mobile-text">{isEditMode ? 'Edit Quotation' : 'New Quotation'}</span>
                <button
                  type="button"
                  className="btn-outline-back hide-mobile-text"
                  onClick={() => { setView('list'); resetForm(); }}
                >
                  ⬅️ Back
                </button>
              </div>
            </div>

            {/* RIGHT FINANCIAL SUMMARY SIDEBAR */}
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
                  <input type="text" value={otherChargeLabel} onChange={(e) => setOtherChargeLabel(e.target.value)} placeholder="e.g. service charge" />
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '13px' }}>Other Charge Amount</label>
                  <input type="number" value={otherCharge} onChange={(e) => setOtherCharge(parseFloat(e.target.value) || 0)} />
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '13px' }}>VAT (%)</label>
                  <input type="number" value={vatPercentage} onChange={(e) => setVatPercentage(parseFloat(e.target.value) || 0)} />
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={vatEnabled}
                      onChange={(e) => setVatEnabled(e.target.checked)}
                      style={{ width: 'auto', margin: 0 }}
                    />
                    VAT applicable
                  </label>
                  {vatEnabled && (
                    <>
                      <input
                        type="number"
                        value={vatRate}
                        min="0"
                        max="100"
                        step="0.01"
                        onChange={(e) => setVatRate(e.target.value === '' ? '' : parseFloat(e.target.value))}
                        placeholder="VAT rate (%)"
                        style={{ marginTop: '6px' }}
                      />
                      {/* Which way the quoted price was struck. Exclusive adds
                          VAT on top of it; inclusive means the price already
                          contains the VAT and the challan has to extract it
                          back out. */}
                      <select
                        value={vatInclusive ? 'inclusive' : 'exclusive'}
                        onChange={(e) => setVatInclusive(e.target.value === 'inclusive')}
                        style={{ width: '100%', padding: '6px', marginTop: '6px' }}
                      >
                        <option value="exclusive">Price excludes VAT — add on top</option>
                        <option value="inclusive">Price includes VAT — extract from it</option>
                      </select>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', marginTop: '4px' }}>
                        {vatInclusive
                          ? 'Customer pays the quoted price; the VAT challan splits it.'
                          : 'VAT is charged above the quoted price.'}
                      </div>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '12px' }}>Discount Type</label>
                    <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} style={{ width: '100%', padding: '6px' }}>
                      <option value="flat">Flat (৳)</option>
                      <option value="percentage">Percentage (%)</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '12px' }}>Value</label>
                    <input type="number" value={discountValue} onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '6px' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', paddingTop: '12px', borderTop: '2px solid var(--border)', fontSize: '16px', fontWeight: 'bold', color: 'var(--primary)' }}>
                  <span>Net Amount:</span>
                  <span>{formatCurrency(financialSummary.netAmount)}</span>
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

      <CustomerModal 
        isOpen={isCustomerModalOpen} 
        onClose={() => setIsCustomerModalOpen(false)} 
        onCustomerCreated={handleCustomerCreated}
      />

      <ProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onProductSaved={handleProductCreated}
      />

      <QuotationPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        quotation={printingQuotation}
        printType={printType}
      />

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

      {convertConfirmTarget && (
        <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && setConvertConfirmTarget(null)}>
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '440px' }}>
            <div className="custom-modal-header">
              <h3 className="custom-modal-title">
                <span>🛒</span> Convert Quotation to Order
              </h3>
              <button type="button" className="custom-modal-close" onClick={() => setConvertConfirmTarget(null)}>✕</button>
            </div>
            <div className="custom-modal-form" style={{ textAlign: 'center', gap: '16px', padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: '56px', lineHeight: 1, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))', marginBottom: '8px' }}>🛍️</div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#1e293b', fontWeight: 'bold' }}>Ready to Convert?</h4>
              <div style={{ fontSize: '14px', color: '#475569', lineHeight: '1.5', maxWidth: '320px' }}>
                You are about to convert the quotation for <strong style={{ color: '#0ea5e9', fontWeight: '700' }}>{convertConfirmTarget.customer?.company_name || convertConfirmTarget.customer?.name || `Quotation #${convertConfirmTarget.quotation_number}`}</strong> into a Confirmed Direct Order.
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '24px', width: '100%' }}>
                <button type="button" onClick={() => setConvertConfirmTarget(null)} style={{ flex: 1, padding: '10px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#64748b', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s' }}>
                  Cancel
                </button>
                <button type="button" onClick={handleConfirmConvert} style={{ flex: 1, padding: '10px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#ffffff', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 6px rgba(14, 165, 233, 0.2)', transition: 'all 0.2s' }}>
                  Confirm & Convert
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {approveConfirmTarget && (
        <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && setApproveConfirmTarget(null)}>
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '440px' }}>
            <div className="custom-modal-header">
              <h3 className="custom-modal-title">
                <span>✅</span> Approve Sales Order
              </h3>
              <button type="button" className="custom-modal-close" onClick={() => setApproveConfirmTarget(null)}>✕</button>
            </div>
            <div className="custom-modal-form" style={{ textAlign: 'center', gap: '16px', padding: '24px' }}>
              <div style={{ fontSize: '48px', lineHeight: 1 }}>⚡</div>
              <div style={{ fontSize: '15px', color: '#cbd5e1' }}>
                Are you sure you want to approve Sales Order <strong style={{ color: '#34d399' }}>#{approveConfirmTarget.quotation_number}</strong>?
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="btn-modal-cancel" onClick={() => setApproveConfirmTarget(null)}>
                  Cancel
                </button>
                <button type="button" className="btn-modal-submit" onClick={handleConfirmApprove} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff' }}>
                  Approve Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Quotations;
