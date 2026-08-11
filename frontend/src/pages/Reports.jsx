import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import api from '../api/axios';
import { formatCurrency, formatDate } from '../utils/format';

const Reports = () => {
  const [searchParams] = useSearchParams();
  const { reportKey } = useParams();

  // Extract active report type from URL parameter or query parameter if available
  const urlReport = reportKey || searchParams.get('type') || searchParams.get('report');

  // Overview Summary Metrics for all 22 cards
  const [overview, setOverview] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(true);

  // Active Selected Report Card Key
  const [activeReport, setActiveReport] = useState(urlReport || 'sales-report');

  // Control visibility of Overview Reports Hub card grid (Hidden when specific report is opened in new page/tab)
  const [showOverviewHub, setShowOverviewHub] = useState(!urlReport);

  // Sync active report and hub visibility if URL param changes
  useEffect(() => {
    if (urlReport) {
      if (urlReport !== activeReport) {
        setActiveReport(urlReport);
      }
      setShowOverviewHub(false);
    } else {
      setShowOverviewHub(true);
    }
  }, [urlReport]);

  // Scroll to report detail section when opening specific report via URL
  useEffect(() => {
    if (urlReport) {
      setTimeout(() => {
        const detailElement = document.getElementById('report-detail-section');
        if (detailElement) {
          detailElement.scrollIntoView({ behavior: 'smooth' });
        }
      }, 300);
    }
  }, [urlReport]);

  // Filter States
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedSalesperson, setSelectedSalesperson] = useState('');

  // Dropdown Master Data
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [salespeople, setSalespeople] = useState([]);

  // Detailed Report Data & Loading States
  const [reportData, setReportData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');

  // 1. Fetch Overview (Populates all 22 cards)
  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await api.get('/reports/overview', {
        params: { from_date: fromDate, to_date: toDate }
      });
      setOverview(res.data?.data || null);
    } catch (err) {
      console.error('Failed to load report overview metrics', err);
    } finally {
      setLoadingOverview(false);
    }
  }, [fromDate, toDate]);

  // 2. Fetch Master Dropdowns
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const [custRes, suppRes, salesRes] = await Promise.all([
          api.get('/customers').catch(() => ({ data: { data: [] } })),
          api.get('/suppliers').catch(() => ({ data: { data: [] } })),
          api.get('/reports/salesperson-performance').catch(() => ({ data: { data: [] } })),
        ]);

        const customerList = custRes.data?.data?.data || custRes.data?.data || (Array.isArray(custRes.data) ? custRes.data : []);
        const supplierList = suppRes.data?.data?.data || suppRes.data?.data || (Array.isArray(suppRes.data) ? suppRes.data : []);
        const salesList = salesRes.data?.data || (Array.isArray(salesRes.data) ? salesRes.data : []);

        setCustomers(Array.isArray(customerList) ? customerList : []);
        setSuppliers(Array.isArray(supplierList) ? supplierList : []);
        setSalespeople(Array.isArray(salesList) ? salesList : []);
      } catch (err) {
        console.error('Failed to load filter dropdowns', err);
      }
    };
    fetchMasterData();
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // 3. Fetch Specific Active Report Details
  const fetchActiveReportData = useCallback(async () => {
    setLoadingDetail(true);
    setError('');
    setReportData(null);

    const params = {};
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    if (selectedCustomer) params.customer_id = selectedCustomer;
    if (selectedSupplier) params.supplier_id = selectedSupplier;
    if (selectedSalesperson) params.salesman_id = selectedSalesperson;

    try {
      let endpoint = '';
      switch (activeReport) {
        case 'sales-report':
          endpoint = '/reports/sales';
          break;
        case 'purchase-report':
          endpoint = '/reports/purchase';
          break;
        case 'profit-loss-report':
        case 'profit-loss-invoice-wise':
        case 'sale-purchase-profit':
          endpoint = '/reports/profit-loss';
          break;
        case 'customer-report':
          endpoint = '/reports/customer-report';
          break;
        case 'customer-ledger':
          endpoint = '/reports/customer-ledger';
          break;
        case 'supplier-report':
        case 'supplier-ledger':
          endpoint = '/reports/supplier-ledger';
          break;
        case 'stock-report':
          endpoint = '/reports/stock-summary';
          break;
        case 'voucher-report':
        case 'expense-report':
          endpoint = '/reports/expenses-vouchers';
          break;
        case 'daily-report':
          endpoint = '/reports/daily';
          break;
        case 'order-report':
          endpoint = '/reports/order-conversion';
          break;
        case 'sales-due-report':
          endpoint = '/reports/sales-due';
          break;
        case 'sale-due-pay-reports':
          endpoint = '/reports/collection-history';
          break;
        case 'purchase-due-report':
        case 'purchase-due-pay-reports':
          endpoint = '/reports/supplier-dues';
          break;
        case 'cash-book':
          endpoint = '/reports/cash-book';
          break;
        case 'bank-book':
          endpoint = '/reports/bank-book';
          break;
        case 'mobile-book':
          endpoint = '/reports/mobile-book';
          break;
        case 'sales-convence-reports':
          endpoint = '/reports/sales-convenience';
          break;
        default:
          endpoint = '/reports/sales';
      }

      const response = await api.get(endpoint, { params });
      setReportData(response.data?.data || null);
    } catch (err) {
      console.error('Failed to load active report details', err);
      setError(err.response?.data?.message || 'Failed to retrieve report data.');
    } finally {
      setLoadingDetail(false);
    }
  }, [activeReport, fromDate, toDate, selectedCustomer, selectedSupplier, selectedSalesperson]);

  useEffect(() => {
    fetchActiveReportData();
  }, [fetchActiveReportData]);

  // Card click handler
  const handleCardClick = (cardKey) => {
    setActiveReport(cardKey);
    // Smooth scroll down to table view
    const detailElement = document.getElementById('report-detail-section');
    if (detailElement) {
      detailElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Filter Reset Handler
  const handleResetFilters = () => {
    setFromDate('');
    setToDate('');
    setSelectedCustomer('');
    setSelectedSupplier('');
    setSelectedSalesperson('');
  };

  // Smart Export CSV Handler
  const handleExportCSV = () => {
    if (!reportData) return;
    let csvRows = [];
    const filename = `${activeReport}_${new Date().toISOString().split('T')[0]}.csv`;

    csvRows.push(['Report Key', activeReport]);
    csvRows.push(['Export Date', new Date().toLocaleString()]);
    if (fromDate) csvRows.push(['From Date', fromDate]);
    if (toDate) csvRows.push(['To Date', toDate]);
    csvRows.push([]);

    // Determine target list to export
    let listToExport = [];
    if (Array.isArray(reportData)) {
      listToExport = reportData;
    } else if (typeof reportData === 'object' && reportData !== null) {
      if (Array.isArray(reportData.invoices)) listToExport = reportData.invoices;
      else if (Array.isArray(reportData.purchases)) listToExport = reportData.purchases;
      else if (Array.isArray(reportData.products)) listToExport = reportData.products;
      else if (Array.isArray(reportData.invoice_breakdown)) listToExport = reportData.invoice_breakdown;
      else if (Array.isArray(reportData.quotations)) listToExport = reportData.quotations;
      else if (Array.isArray(reportData.details)) listToExport = reportData.details;
      else if (Array.isArray(reportData.payments)) listToExport = reportData.payments;
    }

    if (activeReport === 'purchase-report' && reportData?.purchases && Array.isArray(reportData.purchases)) {
      csvRows.push(['#PN.', 'Order No.', 'Date', 'Supplier Company Name', 'Customer Company Name & Address', 'Product Code', 'Purchase Price', 'Paid', 'Due']);
      
      const map = new Map();
      reportData.purchases.forEach((p) => {
        const key = p.quotation_id ? `q_${p.quotation_id}` : (p.purchase_number ? `p_${p.purchase_number}` : `i_${p.id}`);
        if (!map.has(key)) {
          map.set(key, { ...p, raw_entries: p.raw_entries || [p] });
        } else {
          const existing = map.get(key);
          existing.total_cost = (parseFloat(existing.total_cost) || 0) + (parseFloat(p.total_cost) || 0);
          if (p.raw_entries) {
            existing.raw_entries = [...existing.raw_entries, ...p.raw_entries];
          } else {
            existing.raw_entries.push(p);
          }
        }
      });

      Array.from(map.values()).forEach((p, idx) => {
        const paidVal = p.paid_amount || 0;
        const dueVal = p.due_amount !== undefined && p.due_amount !== null ? p.due_amount : Math.max(0, (p.total_cost || 0) - paidVal);
        const custCompName = p.quotation?.customer?.company_name || p.quotation?.customer?.name || 'N/A';
        const custAddress = p.quotation?.customer?.address || p.quotation?.delivery_address || 'N/A';
        
        const prodCodes = Array.from(
          new Set(
            (p.raw_entries || [p]).map(item => {
              const pCode = item.product?.product_code || item.product?.name || '';
              const vName = item.variant?.variant_name ? ` (${item.variant.variant_name})` : '';
              return `${pCode}${vName}`;
            }).filter(Boolean)
          )
        ).join(', ');

        csvRows.push([
          idx + 1,
          p.quotation?.quotation_number || p.purchase_number || 'N/A',
          p.purchase_date || p.created_at || '',
          p.supplier?.company_name || p.supplier?.name || 'N/A',
          `${custCompName} (${custAddress})`,
          prodCodes,
          p.total_cost || 0,
          paidVal,
          dueVal
        ]);
      });
    } else if (activeReport === 'customer-report' && Array.isArray(reportData)) {
      csvRows.push(['#SN.', 'ID', 'Company', 'Name', 'Mobile', 'Opening balance', 'Sales', 'Paid', 'Payment', 'Due']);
      reportData.forEach((c, idx) => {
        csvRows.push([
          idx + 1,
          c.customer_code || '',
          c.company_name || '',
          c.name || '',
          c.mobile || '',
          c.opening_balance || 0,
          c.total_sales || 0,
          c.total_paid || 0,
          c.total_payment || 0,
          c.due_balance || 0,
        ]);
      });
    } else if (listToExport.length > 0) {
      // Export tabular array
      const headers = Object.keys(listToExport[0]);
      csvRows.push(headers);
      listToExport.forEach(row => {
        csvRows.push(headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          if (typeof val === 'object') return val.name || val.company_name || val.quotation_number || JSON.stringify(val);
          return val;
        }));
      });
    } else if (typeof reportData === 'object' && reportData !== null) {
      // Export key-value pairs
      csvRows.push(['Key', 'Value']);
      Object.entries(reportData).forEach(([k, v]) => {
        if (typeof v !== 'object') {
          csvRows.push([k, v]);
        }
      });
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 22 Cards Config Definitions (Matching Sample Image Colors, Icons & Titles)
  const cardsConfig = [
    {
      key: 'sales-report',
      title: 'Sales Report',
      val: overview ? formatCurrency(overview.sales_report) : '...',
      bg: '#17a2b8', // Teal
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
      )
    },
    {
      key: 'purchase-report',
      title: 'Purchase Report',
      val: overview ? formatCurrency(overview.purchase_report) : '...',
      bg: '#28a745', // Green
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      )
    },
    {
      key: 'profit-loss-report',
      title: 'Profit / Loss Report',
      val: overview ? formatCurrency(overview.profit_loss_report) : '...',
      bg: '#ffc107', // Amber / Gold
      color: '#212529',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
        </svg>
      )
    },
    {
      key: 'profit-loss-invoice-wise',
      title: 'Profit/Loss Report (Invoice Wise)',
      val: overview ? `${overview.profit_loss_invoice_wise_count || 0} Invoices` : 'View Details',
      bg: '#007bff', // Electric Blue
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      )
    },
    {
      key: 'sale-purchase-profit',
      title: 'Sale / Purchase Profit',
      val: overview ? formatCurrency(overview.sale_purchase_profit) : '...',
      bg: '#dc3545', // Crimson Red
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
        </svg>
      )
    },
    {
      key: 'customer-report',
      title: 'Customer Report',
      val: overview ? `${overview.customer_report_count || 0} Customers` : '...',
      bg: '#17a2b8', // Teal
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    },
    {
      key: 'customer-ledger',
      title: 'Customer Ledger',
      val: overview ? `${overview.customer_ledger_count || 0} Accounts` : '...',
      bg: '#28a745', // Green
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
      )
    },
    {
      key: 'supplier-report',
      title: 'Supplier Report',
      val: overview ? `${overview.supplier_report_count || 0} Suppliers` : '...',
      bg: '#ffc107', // Amber
      color: '#212529',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        </svg>
      )
    },
    {
      key: 'supplier-ledger',
      title: 'Supplier Ledger',
      val: overview ? `${overview.supplier_ledger_count || 0} Accounts` : '...',
      bg: '#dc3545', // Red
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
      )
    },
    {
      key: 'stock-report',
      title: 'Stock Report',
      val: overview ? `${overview.stock_report_sqft || 0} Sq.Ft` : '...',
      bg: '#17a2b8', // Teal
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
        </svg>
      )
    },
    {
      key: 'voucher-report',
      title: 'Voucher Report',
      val: overview ? formatCurrency(overview.voucher_report_total) : '...',
      bg: '#28a745', // Green
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" /><path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      )
    },
    {
      key: 'daily-report',
      title: 'Daily Report',
      val: overview ? formatCurrency(overview.daily_report_total) : '...',
      bg: '#ffc107', // Amber
      color: '#212529',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      )
    },
    {
      key: 'order-report',
      title: 'Order Report',
      val: overview ? formatCurrency(overview.order_report_total) : '...',
      bg: '#dc3545', // Red
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" strokeWidth="2" />
        </svg>
      )
    },
    {
      key: 'expense-report',
      title: 'Expense Report',
      val: overview ? formatCurrency(overview.expense_report_total) : '...',
      bg: '#17a2b8', // Teal
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
        </svg>
      )
    },
    {
      key: 'sales-due-report',
      title: 'Sales Due Report',
      val: overview ? formatCurrency(overview.sales_due_report_total) : '...',
      bg: '#28a745', // Green
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
      )
    },
    {
      key: 'sale-due-pay-reports',
      title: 'Sale Due Pay Reports',
      val: overview ? formatCurrency(overview.sale_due_pay_reports_total) : '...',
      bg: '#ffc107', // Amber
      color: '#212529',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      )
    },
    {
      key: 'purchase-due-report',
      title: 'Purchase Due Report',
      val: overview ? formatCurrency(overview.purchase_due_report_total) : '...',
      bg: '#dc3545', // Red
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      )
    },
    {
      key: 'purchase-due-pay-reports',
      title: 'Purchase Due Pay Reports',
      val: overview ? formatCurrency(overview.purchase_due_pay_reports_total) : '...',
      bg: '#17a2b8', // Teal
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      )
    },
    {
      key: 'cash-book',
      title: 'Cash Book',
      val: overview ? formatCurrency(overview.cash_book_balance) : 'View Statement',
      bg: '#dc3545', // Red
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" />
        </svg>
      )
    },
    {
      key: 'bank-book',
      title: 'Bank Book',
      val: overview ? formatCurrency(overview.bank_book_balance) : 'View Statement',
      bg: '#007bff', // Electric Blue
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 21h18M3 10h18M5 10v11M9 10v11M15 10v11M19 10v11M12 3L2 10h20L12 3z" />
        </svg>
      )
    },
    {
      key: 'mobile-book',
      title: 'Mobile Book',
      val: overview ? formatCurrency(overview.mobile_book_balance) : 'View Statement',
      bg: '#28a745', // Green
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3" />
        </svg>
      )
    },
    {
      key: 'sales-convence-reports',
      title: 'Sales Convence Reports',
      val: overview ? formatCurrency(overview.sales_convenience_total) : '...',
      bg: '#28a745', // Green
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" /><path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      )
    }
  ];

  // Helper flags for table filter dropdown visibility
  const showCustomerFilter = ['sales-report', 'customer-report', 'customer-ledger', 'sales-due-report', 'profit-loss-report', 'profit-loss-invoice-wise', 'sale-purchase-profit', 'order-report', 'sales-convence-reports'].includes(activeReport);
  const showSupplierFilter = ['purchase-report', 'supplier-report', 'supplier-ledger', 'purchase-due-report', 'purchase-due-pay-reports'].includes(activeReport);
  const showSalespersonFilter = ['sales-report', 'order-report', 'sales-convence-reports', 'sales-due-report'].includes(activeReport);

  return (
    <div className="content-container animate-fade-in" style={{ padding: '20px', background: '#f4f6f9', minHeight: '100vh' }}>
      
      {/* Print Specific CSS */}
      <style>{`
        @media print {
          body { background: #fff !important; color: #000 !important; }
          .no-print, button, input, select { display: none !important; }
          .content-container { padding: 0 !important; background: transparent !important; }
          #report-detail-section { box-shadow: none !important; border: none !important; padding: 0 !important; }
          .data-table { width: 100% !important; border-collapse: collapse !important; }
          .data-table th, .data-table td { border: 1px solid #ccc !important; padding: 6px 8px !important; }
        }
      `}</style>

      {/* 1. Header / Breadcrumb */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#333', margin: 0 }}>
            {urlReport ? (cardsConfig.find(c => c.key === activeReport)?.title || 'Report') : 'Report'}
          </h1>
          {urlReport && <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '2px' }}>Detailed Statement View</div>}
        </div>
        <div style={{ fontSize: '14px', color: '#6c757d', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <a href="/dashboard" style={{ color: '#007bff', textDecoration: 'none' }}>Dashboard</a> / <a href="/reports" style={{ color: '#007bff', textDecoration: 'none' }}>Report</a>
          {urlReport && <span> / <span style={{ color: '#6c757d', fontWeight: '600' }}>{cardsConfig.find(c => c.key === activeReport)?.title}</span></span>}
        </div>
      </div>

      {/* 2. Main Card Container (Hidden when specific report is opened in new page/tab) */}
      {showOverviewHub && (
        <div className="no-print animate-fade-in" style={{ background: '#fff', borderRadius: '4px', boxShadow: '0 0 1px rgba(0,0,0,.125), 0 1px 3px rgba(0,0,0,.2)', padding: '20px', marginBottom: '24px' }}>
          
          {/* Inner Header Title */}
          <div style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '20px', borderBottom: '1px solid #dee2e6', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Overview Reports Hub</span>
            <span style={{ fontSize: '12px', color: '#6c757d', fontWeight: 'normal' }}>Click any card to open report in a new tab</span>
          </div>

          {/* Global Date Filter Bar */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', alignItems: 'flex-end', background: '#e9ecef', padding: '12px 16px', borderRadius: '6px' }}>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#495057' }}>From Date</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '4px', border: '1px solid #ced4da' }} />
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#495057' }}>To Date</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '4px', border: '1px solid #ced4da' }} />
            </div>
            <button onClick={fetchOverview} style={{ background: '#007bff', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', fontWeight: '600', cursor: 'pointer' }}>
              🔍 Filter Overview
            </button>
            <button onClick={handleResetFilters} style={{ background: '#6c757d', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', fontWeight: '600', cursor: 'pointer' }}>
              🔄 Reset
            </button>
          </div>

          {/* 3. 22 Color-Coded Card Grid (4 Columns) */}
          {loadingOverview ? (
            <div style={{ textAlign: 'center', padding: '40px', display: 'flex', justifyContent: 'center' }}>
              <div className="spinner"></div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
              {cardsConfig.map((c) => {
                const isSelected = activeReport === c.key;
                const textColor = c.color || '#ffffff';

                return (
                  <a
                    key={c.key}
                    href={`/reports?type=${c.key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleCardClick(c.key)}
                    style={{
                      textDecoration: 'none',
                      background: c.bg,
                      color: textColor,
                      borderRadius: '8px',
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      cursor: 'pointer',
                      boxShadow: isSelected ? '0 0 0 4px #000, 0 8px 16px rgba(0,0,0,0.3)' : '0 4px 6px rgba(0,0,0,0.1)',
                      transform: isSelected ? 'scale(1.02)' : 'none',
                      transition: 'all 0.2s ease-in-out',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Left Icon Container */}
                    <div style={{ width: '48px', height: '48px', minWidth: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.9 }}>
                      {React.cloneElement(c.icon, { width: 36, height: 36, stroke: textColor })}
                    </div>

                    {/* Right Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', opacity: 0.95, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.title}
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: '800', marginTop: '4px', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.val}
                      </div>
                    </div>

                    {/* Active Indicator & New Tab badge */}
                    <div style={{ position: 'absolute', top: 6, right: 8, display: 'flex', gap: '4px', alignItems: 'center' }}>
                      {isSelected && (
                        <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.3)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                          ACTIVE
                        </span>
                      )}
                      <span title="Open in New Tab" style={{ fontSize: '11px', background: 'rgba(0,0,0,0.25)', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                        ↗
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. Detailed Data Table View for Selected Report Card */}
      <div id="report-detail-section" style={{ background: '#fff', borderRadius: '4px', boxShadow: '0 0 1px rgba(0,0,0,.125), 0 1px 3px rgba(0,0,0,.2)', padding: '20px' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '2px solid #007bff', paddingBottom: '10px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: 0 }}>
              📄 {cardsConfig.find(c => c.key === activeReport)?.title || 'Report Statement'}
            </h2>
            <span style={{ fontSize: '12px', color: '#6c757d' }}>Live filtered table records</span>
          </div>

          <div className="no-print" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowOverviewHub(!showOverviewHub)}
              style={{ background: '#6c757d', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              {showOverviewHub ? '🙈 Hide Overview Hub' : '📊 Show Overview Hub'}
            </button>
            <a
              href={`/reports?type=${activeReport}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: '#6f42c1', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', fontSize: '13px', fontWeight: '600', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              ↗️ Open in New Tab
            </a>
            <button onClick={handleExportCSV} disabled={!reportData} style={{ background: '#28a745', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
              📥 Export CSV
            </button>
            <button onClick={() => window.print()} style={{ background: '#17a2b8', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
              🖨️ Print / PDF
            </button>
          </div>
        </div>

        {/* Table Specific Filter Bar (Date Filters + Customer / Supplier / Salesperson) */}
        <div className="no-print" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>From Date</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
          </div>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>To Date</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
          </div>

          {showCustomerFilter && (
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Select Customer</label>
              <select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                <option value="">All Customers</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.phone || c.company_name || 'N/A'})</option>
                ))}
              </select>
            </div>
          )}

          {showSupplierFilter && (
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Select Supplier</label>
              <select value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                <option value="">All Suppliers</option>
                {suppliers.map(s => {
                  let comp = s.company_name || '';
                  let human = s.name || '';
                  const isHumanComp = /blinds|ltd|inc|corp|company|enterprise|trader|store|shop|supplier|factory|group|brosan|hardware|bd|solutions|decor|interior/i.test(human);
                  const isCompPerson = /^[a-zA-Z\s]+$/.test(comp) && !/blinds|ltd|inc|corp|company|enterprise|trader|store|shop|supplier|factory|group|brosan|hardware|bd|solutions|decor|interior/i.test(comp);

                  if ((!comp && isHumanComp) || (isHumanComp && isCompPerson)) {
                    comp = human;
                  }
                  const compName = comp || human || 'Supplier';

                  return (
                    <option key={s.id} value={s.id}>
                      {compName}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {showSalespersonFilter && (
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Select Salesperson</label>
              <select value={selectedSalesperson} onChange={(e) => setSelectedSalesperson(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                <option value="">All Salespeople</option>
                {salespeople.map(u => (
                  <option key={u.salesperson_id || u.id} value={u.salesperson_id || u.id}>{u.salesperson_name || u.name}</option>
                ))}
              </select>
            </div>
          )}

          <button onClick={handleResetFilters} style={{ background: '#94a3b8', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '4px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
            🔄 Reset
          </button>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {loadingDetail ? (
          <div style={{ textAlign: 'center', padding: '40px' }}><div className="spinner"></div></div>
        ) : (
          <div className="table-responsive">

            {/* 1. Sales Report */}
            {activeReport === 'sales-report' && reportData?.invoices && (
              <div>
                {reportData.summary && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>TOTAL INVOICES</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#007bff', marginTop: '2px' }}>{reportData.summary.total_invoices}</div>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>GRAND TOTAL</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#28a745', marginTop: '2px' }}>{formatCurrency(reportData.summary.grand_total)}</div>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>TOTAL PAID</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#17a2b8', marginTop: '2px' }}>{formatCurrency(reportData.summary.paid_total)}</div>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>OUTSTANDING DUE</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#dc3545', marginTop: '2px' }}>{formatCurrency(reportData.summary.due_total)}</div>
                    </div>
                  </div>
                )}
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Customer</th>
                      <th>Salesperson</th>
                      <th>Date</th>
                      <th>Subtotal</th>
                      <th>Discount</th>
                      <th>VAT</th>
                      <th>Grand Total</th>
                      <th>Paid</th>
                      <th>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.invoices.map(inv => (
                      <tr key={inv.id}>
                        <td><a href={`/invoices/print/${inv.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#007bff', fontWeight: '700', textDecoration: 'none' }}>{inv.invoice_number} ↗</a></td>
                        <td>{inv.customer?.name || 'N/A'}</td>
                        <td>{inv.salesman?.name || 'N/A'}</td>
                        <td>{formatDate(inv.invoice_date)}</td>
                        <td>{formatCurrency(inv.subtotal)}</td>
                        <td>{formatCurrency(inv.discount_amount)}</td>
                        <td>{formatCurrency(inv.vat_amount)}</td>
                        <td><strong>{formatCurrency(inv.grand_total)}</strong></td>
                        <td style={{ color: '#28a745', fontWeight: 700 }}>{formatCurrency(inv.paid_amount)}</td>
                        <td style={{ color: inv.due_amount > 0 ? '#dc3545' : 'inherit', fontWeight: inv.due_amount > 0 ? 700 : 'normal' }}>{formatCurrency(inv.due_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 2. Purchase Report */}
            {activeReport === 'purchase-report' && reportData?.purchases && (
              <div>
                {reportData.summary && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>TOTAL PURCHASES</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#007bff', marginTop: '2px' }}>{reportData.summary.total_purchases}</div>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>TOTAL PURCHASE PRICE</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#28a745', marginTop: '2px' }}>{formatCurrency(reportData.summary.total_cost)}</div>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>TOTAL PAID</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#17a2b8', marginTop: '2px' }}>{formatCurrency(reportData.summary.total_paid || 0)}</div>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>OUTSTANDING DUE</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#dc3545', marginTop: '2px' }}>{formatCurrency(reportData.summary.total_due || 0)}</div>
                    </div>
                  </div>
                )}
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px', textAlign: 'center' }}>#PN.</th>
                      <th>Order No.</th>
                      <th>Date</th>
                      <th>Supplier Company Name</th>
                      <th>Customer Company Name</th>
                      <th>Product Code</th>
                      <th style={{ textAlign: 'right' }}>Purchase Price</th>
                      <th style={{ textAlign: 'right' }}>Paid</th>
                      <th style={{ textAlign: 'right' }}>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const map = new Map();
                      (reportData.purchases || []).forEach((p) => {
                        const key = p.quotation_id ? `q_${p.quotation_id}` : (p.purchase_number ? `p_${p.purchase_number}` : `i_${p.id}`);
                        if (!map.has(key)) {
                          map.set(key, { ...p, raw_entries: p.raw_entries || [p] });
                        } else {
                          const existing = map.get(key);
                          existing.total_cost = (parseFloat(existing.total_cost) || 0) + (parseFloat(p.total_cost) || 0);
                          if (p.raw_entries) {
                            existing.raw_entries = [...existing.raw_entries, ...p.raw_entries];
                          } else {
                            existing.raw_entries.push(p);
                          }
                        }
                      });
                      const uniquePurchases = Array.from(map.values());

                      if (uniquePurchases.length === 0) {
                        return (
                          <tr>
                            <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontStyle: 'italic' }}>
                              No purchase records found matching selected date or supplier criteria.
                            </td>
                          </tr>
                        );
                      }

                      return uniquePurchases.map((p, idx) => {
                        const paidVal = p.paid_amount || 0;
                        const dueVal = p.due_amount !== undefined && p.due_amount !== null ? p.due_amount : Math.max(0, (p.total_cost || 0) - paidVal);
                        const orderNo = p.quotation?.quotation_number;

                        let supplierCompName = p.supplier?.company_name || '';
                        let supplierPersonName = p.supplier?.name || '';

                        const isNameCompany = /blinds|ltd|inc|corp|company|enterprise|trader|store|shop|supplier|factory|group|brosan|hardware|bd|solutions|decor|interior/i.test(supplierPersonName);
                        const isCompPerson = /^[a-zA-Z\s]+$/.test(supplierCompName) && !/blinds|ltd|inc|corp|company|enterprise|trader|store|shop|supplier|factory|group|brosan|hardware|bd|solutions|decor|interior/i.test(supplierCompName);

                        if ((!supplierCompName && isNameCompany) || (isNameCompany && isCompPerson)) {
                          supplierCompName = supplierPersonName;
                        }
                        if (!supplierCompName) {
                          supplierCompName = supplierPersonName || 'N/A';
                        }

                        const customerCompName = p.quotation?.customer?.company_name || p.quotation?.customer?.name || 'N/A';
                        const cust = p.quotation?.customer;
                        const mainAddr = cust?.address || p.quotation?.delivery_address || '';
                        const altAddr = (p.quotation?.delivery_address && p.quotation?.delivery_address !== mainAddr) ? p.quotation.delivery_address : '';
                        const fullCustomerAddr = [mainAddr, altAddr].filter(Boolean).join('\n') || 'Dhaka, Bangladesh';

                        return (
                          <tr key={p.id}>
                            <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#64748b' }}>{idx + 1}</td>
                            <td>
                              {p.quotation?.id ? (
                                <a href={`/quotations/print/${p.quotation.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#007bff', fontWeight: 700, textDecoration: 'none' }}>
                                  {orderNo} ↗
                                </a>
                              ) : (
                                <span>{orderNo || p.purchase_number || 'N/A'}</span>
                              )}
                            </td>
                            <td>{formatDate(p.purchase_date || p.created_at)}</td>
                            <td>
                              <strong style={{ color: '#0f172a' }}>{supplierCompName}</strong>
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '2px' }}>{customerCompName}</div>
                              <div style={{ fontSize: '11px', color: '#475569', lineHeight: '1.4', whiteSpace: 'pre-line' }}>
                                📍 {fullCustomerAddr}
                              </div>
                            </td>
                            <td>
                              {(() => {
                                const uniqueProducts = Array.from(
                                  new Map(
                                    (p.raw_entries || [p]).map((item) => {
                                      const pCode = item.product?.product_code || item.product?.name || 'Product';
                                      const vName = item.variant?.variant_name ? ` (${item.variant.variant_name})` : '';
                                      const fullLabel = `${pCode}${vName}`;
                                      return [fullLabel, { pCode, vName }];
                                    })
                                  ).values()
                                );

                                return uniqueProducts.map((obj, i) => (
                                  <div key={i} style={{ marginBottom: i < uniqueProducts.length - 1 ? '3px' : 0 }}>
                                    <strong style={{ color: '#2563eb' }}>{obj.pCode}</strong>
                                    {obj.vName && <span style={{ fontSize: '11px', color: '#64748b' }}>{obj.vName}</span>}
                                  </div>
                                ));
                              })()}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#007bff' }}>{formatCurrency(p.total_cost)}</td>
                            <td style={{ textAlign: 'right', color: '#28a745', fontWeight: 700 }}>{formatCurrency(paidVal)}</td>
                            <td style={{ textAlign: 'right', color: dueVal > 0 ? '#dc3545' : 'inherit', fontWeight: dueVal > 0 ? 700 : 'normal' }}>
                              {formatCurrency(dueVal)}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            )}

            {/* 3. Profit / Loss Reports */}
            {['profit-loss-report', 'profit-loss-invoice-wise', 'sale-purchase-profit'].includes(activeReport) && reportData?.net_summary && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>TOTAL SALES REVENUE</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#007bff', marginTop: '4px' }}>{formatCurrency(reportData.net_summary.total_revenue)}</div>
                  </div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>TOTAL PURCHASE COST</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#f39c12', marginTop: '4px' }}>{formatCurrency(reportData.net_summary.total_purchase_cost)}</div>
                  </div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>OPERATIONAL EXPENSES</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#dc3545', marginTop: '4px' }}>{formatCurrency(reportData.net_summary.total_expenses)}</div>
                  </div>
                  <div style={{ background: reportData.net_summary.net_profit >= 0 ? '#d4edda' : '#f8d7da', border: '1px solid ' + (reportData.net_summary.net_profit >= 0 ? '#c3e6cb' : '#f5c6cb'), padding: '16px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: reportData.net_summary.net_profit >= 0 ? '#155724' : '#721c24', fontWeight: 800, textTransform: 'uppercase' }}>NET PROFIT / LOSS</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: reportData.net_summary.net_profit >= 0 ? '#28a745' : '#dc3545', marginTop: '4px' }}>{formatCurrency(reportData.net_summary.net_profit)}</div>
                  </div>
                </div>

                <h4 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 700, color: '#2c3e50' }}>
                  Invoice-wise Profit Breakdown &amp; Margins
                </h4>

                {!reportData.invoice_breakdown || reportData.invoice_breakdown.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontStyle: 'italic', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                    No invoice transactions recorded for the selected filter date range.
                  </div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Invoice #</th>
                        <th>Invoice Date</th>
                        <th>Customer</th>
                        <th style={{ textAlign: 'right' }}>Selling Price</th>
                        <th style={{ textAlign: 'right' }}>Purchase Cost</th>
                        <th style={{ textAlign: 'right' }}>Gross Profit</th>
                        <th style={{ textAlign: 'right' }}>Margin %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.invoice_breakdown.map((inv, idx) => (
                        <tr key={inv.invoice_id || idx}>
                          <td><a href={`/invoices/print/${inv.invoice_id || inv.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#007bff', fontWeight: '700', textDecoration: 'none' }}>{inv.invoice_number} ↗</a></td>
                          <td>{formatDate(inv.invoice_date)}</td>
                          <td>{inv.customer_name}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#007bff' }}>{formatCurrency(inv.selling_price)}</td>
                          <td style={{ textAlign: 'right', color: '#6c757d' }}>{formatCurrency(inv.purchase_cost)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: inv.gross_profit >= 0 ? '#28a745' : '#dc3545' }}>
                            {formatCurrency(inv.gross_profit)}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span className={`badge ${inv.margin_pct >= 0 ? 'badge-success' : 'badge-danger'}`} style={{ fontWeight: 700 }}>
                              {inv.margin_pct}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* 4. Stock Report */}
            {activeReport === 'stock-report' && reportData?.products && (
              <div>
                {reportData.summary && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>TOTAL PRODUCTS</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#007bff', marginTop: '2px' }}>{reportData.summary.total_products}</div>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>TOTAL PCS</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#17a2b8', marginTop: '2px' }}>{reportData.summary.total_pcs}</div>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>TOTAL SQ.FT</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#6f42c1', marginTop: '2px' }}>{reportData.summary.total_sqft}</div>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>PROCUREMENT COST</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#28a745', marginTop: '2px' }}>{formatCurrency(reportData.summary.total_cost)}</div>
                    </div>
                  </div>
                )}
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Total Pcs</th>
                      <th>Total Billed Sq.Ft</th>
                      <th>Total Procurement Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.products.map(p => (
                      <tr key={p.product_id || p.product_name}>
                        <td><strong>{p.product_name}</strong></td>
                        <td>{p.total_pcs} Pcs</td>
                        <td><strong>{p.total_sqft} Sq.Ft</strong></td>
                        <td>{formatCurrency(p.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 5. Order Report / Order Conversion */}
            {activeReport === 'order-report' && reportData?.summary && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>TOTAL QUOTATIONS</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#007bff', marginTop: '4px' }}>{reportData.summary.total_quotations}</div>
                  </div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>CONVERTED ORDERS</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#28a745', marginTop: '4px' }}>{reportData.summary.converted_count}</div>
                  </div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>CONVERSION RATE</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#17a2b8', marginTop: '4px' }}>{reportData.summary.conversion_rate_pct}%</div>
                  </div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>CONVERTED VALUE</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#6f42c1', marginTop: '4px' }}>{formatCurrency(reportData.summary.converted_order_value)}</div>
                  </div>
                </div>

                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Quotation #</th>
                      <th>Customer</th>
                      <th>Salesperson</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Net Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportData.quotations || []).map((q) => (
                      <tr key={q.id}>
                        <td><a href={`/quotations/print/${q.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#007bff', fontWeight: '700', textDecoration: 'none' }}>{q.quotation_number} ↗</a></td>
                        <td>{q.customer?.name || 'N/A'}</td>
                        <td>{q.salesman?.name || 'N/A'}</td>
                        <td>{formatDate(q.created_at)}</td>
                        <td>
                          <span className={`badge ${['approved', 'invoiced'].includes(q.status) ? 'badge-success' : 'badge-warning'}`} style={{ textTransform: 'uppercase' }}>
                            {q.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(q.net_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 6. Sales Convenience Reports */}
            {activeReport === 'sales-convence-reports' && reportData?.summary && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>TOTAL CONVENIENCE CHARGES</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#17a2b8', marginTop: '4px' }}>{formatCurrency(reportData.summary.total_convenience)}</div>
                  </div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>OTHER CHARGES</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#f39c12', marginTop: '4px' }}>{formatCurrency(reportData.summary.total_other_charges)}</div>
                  </div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>COMBINED EXTRA CHARGES</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#28a745', marginTop: '4px' }}>{formatCurrency(reportData.summary.combined_extra_charges)}</div>
                  </div>
                </div>

                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ref #</th>
                      <th>Customer</th>
                      <th>Salesperson</th>
                      <th>Date</th>
                      <th style={{ textAlign: 'right' }}>Convenience Charge</th>
                      <th style={{ textAlign: 'right' }}>Other Charge</th>
                      <th style={{ textAlign: 'right' }}>Total Extra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportData.details || []).map((d) => (
                      <tr key={d.id}>
                        <td><strong>{d.quotation_number}</strong></td>
                        <td>{d.customer?.name || 'N/A'}</td>
                        <td>{d.salesman?.name || 'N/A'}</td>
                        <td>{formatDate(d.created_at)}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(d.convenience_charge || 0)}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(d.other_charge || 0)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#28a745' }}>
                          {formatCurrency((d.convenience_charge || 0) + (d.other_charge || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 7. Sale Due Pay Reports (Collection History) */}
            {activeReport === 'sale-due-pay-reports' && reportData?.payments && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: '#d4edda', border: '1px solid #c3e6cb', padding: '16px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#155724', fontWeight: 800 }}>TOTAL COLLECTED DUES</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#28a745', marginTop: '4px' }}>{formatCurrency(reportData.total_collected)}</div>
                  </div>
                  {(reportData.method_breakdown || []).map((m, idx) => (
                    <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '10px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>{m.method} ({m.count})</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#007bff', marginTop: '4px' }}>{formatCurrency(m.total_amount)}</div>
                    </div>
                  ))}
                </div>

                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Customer</th>
                      <th>Payment Date</th>
                      <th>Payment Method</th>
                      <th style={{ textAlign: 'right' }}>Amount Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportData.payments || []).map((p) => (
                      <tr key={p.id}>
                        <td>{p.invoice_id || p.invoice?.id ? <a href={`/invoices/print/${p.invoice_id || p.invoice?.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#007bff', fontWeight: '700', textDecoration: 'none' }}>{p.invoice?.invoice_number || `#${p.invoice_id}`} ↗</a> : (p.invoice?.invoice_number || 'N/A')}</td>
                        <td>{p.customer?.name || 'N/A'}</td>
                        <td>{formatDate(p.payment_date)}</td>
                        <td><span className="badge badge-info" style={{ textTransform: 'uppercase' }}>{p.payment_method}</span></td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#28a745' }}>{formatCurrency(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 8. Daily Report */}
            {activeReport === 'daily-report' && reportData?.date && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>DAILY SALES</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#007bff', marginTop: '4px' }}>{formatCurrency(reportData.daily_sales)}</div>
                  </div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>DAILY COLLECTION</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#28a745', marginTop: '4px' }}>{formatCurrency(reportData.daily_collection)}</div>
                  </div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>DAILY PURCHASES</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#f39c12', marginTop: '4px' }}>{formatCurrency(reportData.daily_purchases)}</div>
                  </div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>DAILY EXPENSES</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#dc3545', marginTop: '4px' }}>{formatCurrency(reportData.daily_expenses)}</div>
                  </div>
                  <div style={{ background: reportData.net_cash_movement >= 0 ? '#d4edda' : '#f8d7da', border: '1px solid ' + (reportData.net_cash_movement >= 0 ? '#c3e6cb' : '#f5c6cb'), padding: '16px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: reportData.net_cash_movement >= 0 ? '#155724' : '#721c24', fontWeight: 800 }}>NET CASH MOVEMENT</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: reportData.net_cash_movement >= 0 ? '#28a745' : '#dc3545', marginTop: '4px' }}>{formatCurrency(reportData.net_cash_movement)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* 9. Mobile Book Statement */}
            {activeReport === 'mobile-book' && Array.isArray(reportData) && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Entry Date</th>
                    <th>Mobile Provider</th>
                    <th>Acc / Txn ID</th>
                    <th>Description</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((m, idx) => (
                    <tr key={m.id || idx}>
                      <td>{formatDate(m.entry_date)}</td>
                      <td><span className="badge badge-outline" style={{ textTransform: 'uppercase', fontWeight: 700 }}>{m.provider || 'bKash'}</span></td>
                      <td>{m.transaction_id || m.account_number || 'N/A'}</td>
                      <td>{m.description}</td>
                      <td>
                        <span className={`badge ${m.entry_type === 'in' ? 'badge-success' : 'badge-danger'}`}>
                          {m.entry_type === 'in' ? '➕ IN' : '➖ OUT'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: m.entry_type === 'in' ? 'var(--success)' : 'var(--danger)' }}>
                        {formatCurrency(m.amount)}
                      </td>
                      <td style={{ fontWeight: 700 }}>{formatCurrency(m.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* 10. Bank Book Statement */}
            {activeReport === 'bank-book' && Array.isArray(reportData) && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Entry Date</th>
                    <th>Bank Name</th>
                    <th>Cheque / Ref No</th>
                    <th>Description</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((b, idx) => (
                    <tr key={b.id || idx}>
                      <td>{formatDate(b.entry_date)}</td>
                      <td><strong>{b.bank_name || 'Bank'}</strong></td>
                      <td>{b.cheque_number || b.reference_id || 'N/A'}</td>
                      <td>{b.description}</td>
                      <td>
                        <span className={`badge ${b.entry_type === 'in' ? 'badge-success' : 'badge-danger'}`}>
                          {b.entry_type === 'in' ? '➕ IN' : '➖ OUT'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: b.entry_type === 'in' ? 'var(--success)' : 'var(--danger)' }}>
                        {formatCurrency(b.amount)}
                      </td>
                      <td style={{ fontWeight: 700 }}>{formatCurrency(b.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* 11. Cash Book Statement */}
            {activeReport === 'cash-book' && Array.isArray(reportData) && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Entry Date</th>
                    <th>Description</th>
                    <th>Reference</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((c, idx) => (
                    <tr key={c.id || idx}>
                      <td>{formatDate(c.entry_date)}</td>
                      <td>{c.description}</td>
                      <td>{c.reference_type ? `${c.reference_type.split('\\').pop()} #${c.reference_id}` : 'N/A'}</td>
                      <td>
                        <span className={`badge ${c.entry_type === 'in' ? 'badge-success' : 'badge-danger'}`}>
                          {c.entry_type === 'in' ? '➕ IN' : '➖ OUT'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: c.entry_type === 'in' ? 'var(--success)' : 'var(--danger)' }}>
                        {formatCurrency(c.amount)}
                      </td>
                      <td style={{ fontWeight: 700 }}>{formatCurrency(c.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* 12. Voucher & Expense Statements */}
            {['voucher-report', 'expense-report', 'vouchers-expenses'].includes(activeReport) && Array.isArray(reportData) && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Ref / Voucher #</th>
                    <th>Category</th>
                    <th>Payment Method</th>
                    <th>Amount</th>
                    <th>Notes / Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((e, idx) => (
                    <tr key={e.id || idx}>
                      <td>{formatDate(e.expense_date || e.created_at)}</td>
                      <td><strong>{e.voucher_number || e.expense_number || `#${e.id}`}</strong></td>
                      <td><span className="badge badge-outline">{e.category?.name || e.category || 'General Expense'}</span></td>
                      <td><span className="badge badge-info" style={{ textTransform: 'uppercase' }}>{e.payment_method || 'Cash'}</span></td>
                      <td style={{ fontWeight: 700, color: 'var(--danger)' }}>{formatCurrency(e.amount)}</td>
                      <td>{e.notes || e.description || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* 13. Sales Due Report */}
            {activeReport === 'sales-due-report' && reportData && (
              (() => {
                const duesList = Array.isArray(reportData) ? reportData : (reportData?.customer_dues || []);
                const totalDue = reportData?.total_due_amount ?? duesList.reduce((sum, inv) => sum + (parseFloat(inv.due_amount || inv.total_due) || 0), 0);
                return (
                  <div>
                    <div style={{ background: '#fff3cd', border: '1px solid #ffeeba', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
                      <span style={{ fontSize: '12px', color: '#856404', fontWeight: 700, textTransform: 'uppercase' }}>TOTAL OUTSTANDING SALES DUES: </span>
                      <span style={{ fontSize: '18px', fontWeight: 800, color: '#dc3545', marginLeft: '8px' }}>
                        {formatCurrency(totalDue)}
                      </span>
                    </div>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Ref / Invoice Number</th>
                          <th>Customer Name</th>
                          <th>Date</th>
                          <th>Grand Total</th>
                          <th>Paid Amount</th>
                          <th>Outstanding Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {duesList.map((inv, idx) => (
                          <tr key={inv.id || inv.customer_id || idx}>
                            <td>{inv.id ? <a href={`/invoices/print/${inv.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#007bff', fontWeight: '700', textDecoration: 'none' }}>{inv.invoice_number || `#${inv.id}`} ↗</a> : (inv.invoice_number || inv.customer_code || 'N/A')}</td>
                            <td>{inv.customer?.name || inv.customer_name || 'N/A'}</td>
                            <td>{formatDate(inv.invoice_date || inv.created_at)}</td>
                            <td>{formatCurrency(inv.grand_total || inv.total_grand || 0)}</td>
                            <td style={{ color: 'var(--success)' }}>{formatCurrency(inv.paid_amount || inv.total_paid || 0)}</td>
                            <td style={{ fontWeight: 700, color: 'var(--danger)' }}>{formatCurrency(inv.due_amount || inv.total_due || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            )}

            {/* 14. Purchase Due Report */}
            {['purchase-due-report', 'purchase-due-pay-reports'].includes(activeReport) && Array.isArray(reportData) && (
              <div>
                <div style={{ background: '#f8d7da', border: '1px solid #f5c6cb', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '12px', color: '#721c24', fontWeight: 700, textTransform: 'uppercase' }}>TOTAL SUPPLIER PAYABLE DUES: </span>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: '#dc3545', marginLeft: '8px' }}>
                    {formatCurrency(reportData.reduce((sum, p) => sum + (parseFloat(p.due_amount || p.balance || p.total_cost) || 0), 0))}
                  </span>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Purchase Ref / Supplier</th>
                      <th>Supplier Name</th>
                      <th>Date</th>
                      <th>Total Cost</th>
                      <th>Paid Amount</th>
                      <th>Outstanding Payable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((p, idx) => (
                      <tr key={p.id || idx}>
                        <td><strong>{p.purchase_number || p.company_name || `#${p.id}`}</strong></td>
                        <td>{p.supplier?.company_name || p.supplier?.name || p.name || 'N/A'}</td>
                        <td>{formatDate(p.purchase_date || p.created_at)}</td>
                        <td>{formatCurrency(p.total_cost || p.amount || 0)}</td>
                        <td style={{ color: 'var(--success)' }}>{formatCurrency(p.paid_amount || p.debit || 0)}</td>
                        <td style={{ fontWeight: 700, color: 'var(--danger)' }}>{formatCurrency(p.due_amount || p.balance || p.total_cost || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 15. Customer Summary Report */}
            {activeReport === 'customer-report' && Array.isArray(reportData) && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center' }}>#SN.</th>
                    <th>ID</th>
                    <th>Company</th>
                    <th>Name</th>
                    <th>Mobile</th>
                    <th style={{ textAlign: 'right' }}>Opening balance</th>
                    <th style={{ textAlign: 'right' }}>Sales</th>
                    <th style={{ textAlign: 'right' }}>Paid</th>
                    <th style={{ textAlign: 'right' }}>Payment</th>
                    <th style={{ textAlign: 'right' }}>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.length === 0 ? (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontStyle: 'italic' }}>
                        No customer report records found matching selected criteria.
                      </td>
                    </tr>
                  ) : (
                    reportData.map((c, idx) => (
                      <tr key={c.id || idx}>
                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#64748b' }}>{idx + 1}</td>
                        <td><strong style={{ color: '#2563eb' }}>{c.customer_code}</strong></td>
                        <td><strong style={{ color: '#0f172a' }}>{c.company_name}</strong></td>
                        <td>{c.name}</td>
                        <td>{c.mobile}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(c.opening_balance || 0)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#2563eb' }}>{formatCurrency(c.total_sales || 0)}</td>
                        <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>{formatCurrency(c.total_paid || 0)}</td>
                        <td style={{ textAlign: 'right', color: '#0ea5e9', fontWeight: 700 }}>{formatCurrency(c.total_payment || 0)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: (c.due_balance > 0) ? '#dc2626' : '#16a34a' }}>
                          {formatCurrency(c.due_balance || 0)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* 15.5 Customer Ledger Statement */}
            {activeReport === 'customer-ledger' && Array.isArray(reportData) && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Customer Name</th>
                    <th>Transaction Type</th>
                    <th>Debit (Billed)</th>
                    <th>Credit (Paid)</th>
                    <th>Balance</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((l, idx) => (
                    <tr key={l.id || idx}>
                      <td>{formatDate(l.transaction_date || l.entry_date || l.created_at)}</td>
                      <td>{l.customer?.name || 'N/A'}</td>
                      <td><span className="badge badge-outline" style={{ textTransform: 'uppercase' }}>{l.transaction_type}</span></td>
                      <td style={{ color: 'var(--danger)' }}>{formatCurrency(l.debit || 0)}</td>
                      <td style={{ color: 'var(--success)' }}>{formatCurrency(l.credit || 0)}</td>
                      <td style={{ fontWeight: 700 }}>{formatCurrency(l.balance || 0)}</td>
                      <td>{l.description || l.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* 16. Supplier Ledger Statement */}
            {['supplier-report', 'supplier-ledger'].includes(activeReport) && Array.isArray(reportData) && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center' }}>#SN.</th>
                    <th>Date</th>
                    <th>Supplier Company Name</th>
                    <th>Payment / Trans. Type</th>
                    <th style={{ textAlign: 'right' }}>Paid (Debit)</th>
                    <th style={{ textAlign: 'right' }}>Purchased (Credit)</th>
                    <th style={{ textAlign: 'right' }}>Balance</th>
                    <th>Note / Description</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontStyle: 'italic' }}>
                        No supplier ledger transactions found.
                      </td>
                    </tr>
                  ) : (
                    reportData.map((l, idx) => {
                      const supCompName = l.supplier?.company_name || l.supplier?.name || 'N/A';
                      const txDate = l.transaction_date || l.entry_date || l.purchase_date || l.created_at;

                      return (
                        <tr key={l.id || idx}>
                          <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#64748b' }}>{idx + 1}</td>
                          <td><strong>{formatDate(txDate)}</strong></td>
                          <td><strong style={{ color: '#0f172a' }}>{supCompName}</strong></td>
                          <td>
                            <span className="badge badge-outline" style={{ textTransform: 'uppercase', fontWeight: 700, color: (l.debit > 0 || l.transaction_type === 'payment') ? '#16a34a' : '#2563eb' }}>
                              {l.transaction_type || 'Transaction'}
                            </span>
                          </td>
                          <td style={{ color: '#16a34a', fontWeight: 700, textAlign: 'right' }}>{formatCurrency(l.debit || 0)}</td>
                          <td style={{ color: '#dc2626', fontWeight: 700, textAlign: 'right' }}>{formatCurrency(l.credit || 0)}</td>
                          <td style={{ fontWeight: 800, textAlign: 'right', color: (l.balance > 0) ? '#dc2626' : '#0f172a' }}>
                            {formatCurrency(l.balance || 0)}
                          </td>
                          <td style={{ fontSize: '12px', color: '#334155' }}>{l.description || l.notes || '-'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

            {/* 17. Generic Clean Structured Table Fallback */}
            {Array.isArray(reportData) && ![
              'sales-report', 'purchase-report', 'stock-report', 'mobile-book', 'bank-book',
              'cash-book', 'voucher-report', 'expense-report', 'vouchers-expenses',
              'sales-due-report', 'purchase-due-report', 'purchase-due-pay-reports',
              'customer-ledger', 'supplier-ledger'
            ].includes(activeReport) && (
              <table className="data-table">
                <thead>
                  <tr>
                    {reportData.length > 0 && Object.keys(reportData[0]).slice(0, 7).map((k) => (
                      <th key={k} style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((row, idx) => (
                    <tr key={idx}>
                      {Object.entries(row).slice(0, 7).map(([k, val], valIdx) => (
                        <td key={valIdx}>
                          {val === null || val === undefined ? '-' :
                           typeof val === 'object' ? (val.name || val.company_name || JSON.stringify(val)) :
                           typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;

