import React, { useState, useEffect, useMemo } from 'react';
import { Card, Select, Button } from '../ui';
import { useApp } from '../../contexts/AppContext';
import { getTransactionsByOrganization } from '../../services/transactionService';
import { getPlayersByOrganization } from '../../services/playerService';
import { getReceiptsByOrganization } from '../../services/receiptService';
import { getProductsByOrganization } from '../../services/productService';
import { getAcademiesByOrganization } from '../../services/academyService';
import { getSettingsByOrganization } from '../../services/settingsService';
import { getUserById } from '../../services/userService';
import { Transaction, Player, Receipt, Product, Academy, User } from '../../types';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const Stats: React.FC = () => {
  const { selectedAcademy, selectedOrganization } = useApp();
  const [timeRange, setTimeRange] = useState('month');
  const [chartType, setChartType] = useState('revenue');
  const [loading, setLoading] = useState(true);
  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');

  // Raw data state
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [allReceipts, setAllReceipts] = useState<Receipt[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [userMap, setUserMap] = useState<Map<string, User>>(new Map());

  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [reportStatus, setReportStatus] = useState('all');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportFields, setReportFields] = useState({
    playerName: true,
    email: true,
    academy: true,
    totalCharged: true,
    totalPaid: true,
    outstandingBalance: true,
    status: true,
  });

  // Generate last 6 months options
  const monthOptions = useMemo(() => {
    const options: { value: string; label: string; startDate: Date; endDate: Date }[] = [];
    const now = new Date();

    for (let i = 0; i < 6; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      options.push({ value, label, startDate: date, endDate });
    }

    return options;
  }, []);

  useEffect(() => {
    if (selectedOrganization?.id) {
      loadFinancialData();
    }
  }, [selectedOrganization, selectedAcademy]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFinancialData = async () => {
    if (!selectedOrganization?.id) {
      console.log('No organization selected for stats');
      return;
    }

    try {
      console.log('Loading financial data for stats page, org:', selectedOrganization.name);
      setLoading(true);

      // Load settings for currency
      try {
        const settings = await getSettingsByOrganization(selectedOrganization.id);
        if (settings?.generalSettings?.currency) {
          setDefaultCurrency(settings.generalSettings.currency);
        }
      } catch (error) {
        console.warn('Could not load settings:', error);
      }

      // Load all financial data in parallel
      const [transactionsData, playersData, receiptsData, productsData, academiesData] = await Promise.all([
        getTransactionsByOrganization(selectedOrganization.id),
        getPlayersByOrganization(selectedOrganization.id),
        getReceiptsByOrganization(selectedOrganization.id),
        getProductsByOrganization(selectedOrganization.id),
        getAcademiesByOrganization(selectedOrganization.id),
      ]);

      console.log('Stats data loaded:', {
        transactions: transactionsData.length,
        players: playersData.length,
        receipts: receiptsData.length,
        products: productsData.length,
        academies: academiesData.length,
      });

      setAllTransactions(transactionsData);
      setAllPlayers(playersData);
      setAllReceipts(receiptsData);
      setProducts(productsData);
      setAcademies(academiesData);

      // Load user data for player names
      const userIds = Array.from(new Set(playersData.map(p => p.userId)));
      const users = new Map<string, User>();
      await Promise.all(
        userIds.map(async (userId) => {
          try {
            const user = await getUserById(userId);
            if (user) users.set(userId, user);
          } catch (error) {
            console.warn(`Could not load user ${userId}:`, error);
          }
        })
      );
      setUserMap(users);

    } catch (error) {
      console.error('Error loading financial data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get date range based on selected time range
  const getDateRange = () => {
    const now = new Date();
    const startDate = new Date();

    switch (timeRange) {
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case 'all':
      default:
        startDate.setFullYear(2000); // Far in the past
        break;
    }

    return { startDate, endDate: now };
  };

  // Filter data by time range and academy
  const filteredData = useMemo(() => {
    const { startDate, endDate } = getDateRange();

    // Filter by academy if selected
    let transactions = selectedAcademy
      ? allTransactions.filter(t => t.academyId === selectedAcademy.id)
      : allTransactions;

    let players = selectedAcademy
      ? allPlayers.filter(p => p.academyId?.includes(selectedAcademy.id))
      : allPlayers;

    let receipts = selectedAcademy
      ? allReceipts.filter(r => r.academyId === selectedAcademy.id)
      : allReceipts;

    // Filter by time range
    transactions = transactions.filter(t => {
      const date = t.date?.toDate() || t.createdAt?.toDate();
      return date && date >= startDate && date <= endDate;
    });

    receipts = receipts.filter(r => {
      const date = r.createdAt?.toDate();
      return date && date >= startDate && date <= endDate;
    });

    return { transactions, players, receipts };
  }, [allTransactions, allPlayers, allReceipts, selectedAcademy, timeRange]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate all metrics
  const metrics = useMemo(() => {
    const { transactions, players, receipts } = filteredData;

    // Filter out deleted receipts first
    const activeReceipts = receipts.filter(r => r.status !== 'deleted');

    // Expected Revenue (total from all debit receipts/invoices, excluding deleted)
    const debitReceipts = activeReceipts.filter(r => r.type === 'debit');
    const expectedRevenue = debitReceipts.reduce((sum, r) => sum + r.amount, 0);

    // Collected Revenue (income transactions)
    const collectedRevenue = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // Expenses (expense transactions)
    const totalExpenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // Profit (collected revenue - expenses)
    const profit = collectedRevenue - totalExpenses;

    // Outstanding amounts from unpaid debit receipts
    let outstandingAmount = 0;
    let paidReceipts = 0;
    let pendingReceipts = 0;

    debitReceipts.forEach(debit => {
      const linkedCredits = activeReceipts.filter(credit =>
        credit.type === 'credit' &&
        credit.siblingReceiptRefs &&
        credit.siblingReceiptRefs.some(ref => ref.id === debit.id)
      );

      const totalCreditsApplied = linkedCredits.reduce((sum, credit) => sum + credit.amount, 0);
      const remainingDebt = debit.amount - totalCreditsApplied;

      if (remainingDebt > 0) {
        outstandingAmount += remainingDebt;
        pendingReceipts++;
      } else if (totalCreditsApplied > 0) {
        paidReceipts++;
      }
    });

    // Collection rate
    const totalReceiptsWithStatus = paidReceipts + pendingReceipts;
    const collectionRate = totalReceiptsWithStatus > 0
      ? (paidReceipts / totalReceiptsWithStatus) * 100
      : 100;

    return {
      expectedRevenue,
      collectedRevenue,
      outstandingAmount,
      totalExpenses,
      profit,
      collectionRate,
      totalPlayers: players.length,
      paidReceipts,
      pendingReceipts,
    };
  }, [filteredData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Top products calculation
  const topProducts = useMemo(() => {
    const { receipts } = filteredData;
    // Filter out deleted receipts
    const activeReceipts = receipts.filter(r => r.status !== 'deleted');
    const debitReceipts = activeReceipts.filter(r => r.type === 'debit');
    const productRevenue = new Map<string, { revenue: number; count: number; }>();

    debitReceipts.forEach(receipt => {
      if (receipt.product) {
        const productName = receipt.product.name;
        const current = productRevenue.get(productName) || { revenue: 0, count: 0 };
        productRevenue.set(productName, {
          revenue: current.revenue + receipt.amount,
          count: current.count + 1
        });
      }
    });

    return Array.from(productRevenue.entries())
      .map(([name, data]) => ({
        name,
        revenue: data.revenue,
        count: data.count,
        percentage: metrics.expectedRevenue > 0 ? (data.revenue / metrics.expectedRevenue) * 100 : 0
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [filteredData, metrics.expectedRevenue]);

  // Payment methods calculation
  const paymentMethods = useMemo(() => {
    const { transactions } = filteredData;
    const paymentMethodMap = new Map<string, { amount: number; count: number; }>();

    transactions
      .filter(t => t.type === 'income')
      .forEach(transaction => {
        const method = transaction.paymentMethod || 'Unknown';
        const current = paymentMethodMap.get(method) || { amount: 0, count: 0 };
        paymentMethodMap.set(method, {
          amount: current.amount + Math.abs(transaction.amount),
          count: current.count + 1
        });
      });

    return Array.from(paymentMethodMap.entries())
      .map(([method, data]) => ({
        method,
        amount: data.amount,
        count: data.count,
        percentage: metrics.collectedRevenue > 0 ? (data.amount / metrics.collectedRevenue) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredData, metrics.collectedRevenue]);

  // Revenue over time chart data
  const revenueChartData = useMemo(() => {
    const { transactions } = filteredData;
    const dataMap = new Map<string, { revenue: number; expenses: number; }>();

    // Determine grouping based on time range
    const getGroupKey = (date: Date) => {
      if (timeRange === 'week') {
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      } else if (timeRange === 'month' || timeRange === 'quarter') {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      }
    };

    transactions.forEach(t => {
      const date = t.date?.toDate() || t.createdAt?.toDate();
      if (!date) return;

      const key = getGroupKey(date);
      const current = dataMap.get(key) || { revenue: 0, expenses: 0 };

      if (t.type === 'income') {
        current.revenue += Math.abs(t.amount);
      } else if (t.type === 'expense') {
        current.expenses += Math.abs(t.amount);
      }

      dataMap.set(key, current);
    });

    return Array.from(dataMap.entries())
      .map(([name, data]) => ({
        name,
        revenue: data.revenue,
        expenses: data.expenses,
      }))
      .slice(-12); // Last 12 data points
  }, [filteredData, timeRange]);

  // Collection pie chart data
  const collectionChartData = useMemo(() => {
    return [
      { name: 'Paid', value: metrics.paidReceipts, color: '#10B981' },
      { name: 'Pending', value: metrics.pendingReceipts, color: '#F59E0B' },
    ].filter(item => item.value > 0);
  }, [metrics.paidReceipts, metrics.pendingReceipts]);

  // Academy performance data (real data)
  const academyPerformance = useMemo(() => {
    if (selectedAcademy) return []; // Don't show when single academy selected

    return academies.map(academy => {
      // Filter transactions for this academy
      const { startDate, endDate } = getDateRange();

      const academyTransactions = allTransactions.filter(t => {
        const date = t.date?.toDate() || t.createdAt?.toDate();
        return t.academyId === academy.id && date && date >= startDate && date <= endDate;
      });

      const academyPlayers = allPlayers.filter(p => p.academyId?.includes(academy.id));

      const revenue = academyTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      const expenses = academyTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      // Calculate growth
      const periodLength = endDate.getTime() - startDate.getTime();
      const previousStartDate = new Date(startDate.getTime() - periodLength);
      const previousEndDate = new Date(startDate.getTime());

      const previousTransactions = allTransactions.filter(t => {
        const date = t.date?.toDate() || t.createdAt?.toDate();
        return t.academyId === academy.id && date && date >= previousStartDate && date < previousEndDate;
      });

      const previousRevenue = previousTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      const growth = previousRevenue > 0
        ? ((revenue - previousRevenue) / previousRevenue) * 100
        : 0;

      return {
        id: academy.id,
        name: academy.name,
        revenue,
        expenses,
        netProfit: revenue - expenses,
        players: academyPlayers.length,
        avgPerPlayer: academyPlayers.length > 0 ? revenue / academyPlayers.length : 0,
        growth,
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [academies, allTransactions, allPlayers, selectedAcademy]); // eslint-disable-line react-hooks/exhaustive-deps

  const timeRangeOptions = [
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'quarter', label: 'This Quarter' },
    { value: 'year', label: 'This Year' },
    { value: 'all', label: 'All Time' },
  ];

  const chartTypeOptions = [
    { value: 'revenue', label: 'Revenue Over Time' },
    { value: 'comparison', label: 'Income vs Expenses' },
    { value: 'collection', label: 'Collection Status' },
  ];

  const reportStatusOptions = [
    { value: 'all', label: 'All Players' },
    { value: 'outstanding', label: 'With Outstanding Balance' },
    { value: 'paid', label: 'Fully Paid' },
  ];

  // Generate and download CSV report
  const generateReport = () => {
    setGeneratingReport(true);

    try {
      // Get selected months sorted by date (newest first)
      const selectedMonthData = monthOptions
        .filter(m => selectedMonths.includes(m.value))
        .sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

      // Field configuration
      const fieldConfig: { key: keyof typeof reportFields; header: string; getValue: (p: { playerName: string; email: string; academy: string; totalCharged: number; totalPaid: number; outstandingBalance: number; status: string }) => string }[] = [
        { key: 'playerName', header: 'Player Name', getValue: (p) => p.playerName },
        { key: 'email', header: 'Email', getValue: (p) => p.email },
        { key: 'academy', header: 'Academy', getValue: (p) => p.academy },
        { key: 'totalCharged', header: 'Total Charged', getValue: (p) => p.totalCharged.toFixed(2) },
        { key: 'totalPaid', header: 'Total Paid', getValue: (p) => p.totalPaid.toFixed(2) },
        { key: 'outstandingBalance', header: 'Outstanding Balance', getValue: (p) => p.outstandingBalance.toFixed(2) },
        { key: 'status', header: 'Status', getValue: (p) => p.status },
      ];

      const selectedFields = fieldConfig.filter(f => reportFields[f.key]);
      const headers = selectedFields.map(f => f.header);

      // Build CSV content with sections for each month
      const csvRows: string[] = [];

      // Report Title
      const orgName = selectedOrganization?.name || 'Organization';
      csvRows.push(`"${orgName} - Player Financial Report"`);
      csvRows.push(`"Generated on:","${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}"`);
      csvRows.push('');

      // Process each month separately
      selectedMonthData.forEach((month, monthIndex) => {
        // Filter receipts for this month (excluding deleted)
        const monthReceipts = allReceipts.filter(r => {
          if (r.status === 'deleted') return false;
          const date = r.createdAt?.toDate();
          if (!date) return false;
          return date >= month.startDate && date <= month.endDate;
        });

        // Calculate player data for this month
        const monthPlayerData = allPlayers.map(player => {
          const user = userMap.get(player.userId);
          const playerReceipts = monthReceipts.filter(r => r.userRef?.id === player.userId);

          const debitReceipts = playerReceipts.filter(r => r.type === 'debit');
          const creditReceipts = playerReceipts.filter(r => r.type === 'credit');

          const totalCharged = debitReceipts.reduce((sum, r) => sum + r.amount, 0);
          const totalPaid = creditReceipts.reduce((sum, r) => sum + r.amount, 0);
          const outstandingBalance = totalCharged - totalPaid;

          const status = outstandingBalance > 0 ? 'Outstanding' : outstandingBalance < 0 ? 'Credit' : 'Paid';

          const playerAcademyIds = player.academyId || [];
          const playerAcademyNames = academies
            .filter(a => playerAcademyIds.includes(a.id))
            .map(a => a.name)
            .join(', ') || 'No Academy';

          return {
            playerName: user?.name || user?.email || player.userId,
            email: user?.email || '',
            academy: playerAcademyNames,
            totalCharged,
            totalPaid,
            outstandingBalance,
            status,
          };
        });

        // Filter by status
        let monthReportData = monthPlayerData;
        if (reportStatus === 'outstanding') {
          monthReportData = monthPlayerData.filter(p => p.outstandingBalance > 0);
        } else if (reportStatus === 'paid') {
          monthReportData = monthPlayerData.filter(p => p.outstandingBalance <= 0);
        }

        // Filter out players with no activity
        monthReportData = monthReportData.filter(p => p.totalCharged > 0 || p.totalPaid > 0);

        // Sort by outstanding balance (highest first)
        monthReportData.sort((a, b) => b.outstandingBalance - a.outstandingBalance);

        // Calculate month totals
        const monthTotalCharged = monthReportData.reduce((sum, p) => sum + p.totalCharged, 0);
        const monthTotalPaid = monthReportData.reduce((sum, p) => sum + p.totalPaid, 0);
        const monthTotalOutstanding = monthReportData.reduce((sum, p) => sum + p.outstandingBalance, 0);

        // Month Section Header
        csvRows.push('');
        csvRows.push(`"--- ${month.label.toUpperCase()} ---"`);
        csvRows.push('');

        if (monthReportData.length > 0) {
          // Column headers
          csvRows.push(headers.map(h => `"${h}"`).join(','));

          // Data rows
          monthReportData.forEach(p => {
            const row = selectedFields.map(f => `"${f.getValue(p)}"`).join(',');
            csvRows.push(row);
          });

          // Empty row before totals
          csvRows.push('');

          // Month summary
          csvRows.push(`"Month Summary:","${month.label}"`);
          csvRows.push(`"Players:","${monthReportData.length}"`);
          csvRows.push(`"Total Charged:","${defaultCurrency} ${monthTotalCharged.toFixed(2)}"`);
          csvRows.push(`"Total Paid:","${defaultCurrency} ${monthTotalPaid.toFixed(2)}"`);
          csvRows.push(`"Outstanding:","${defaultCurrency} ${monthTotalOutstanding.toFixed(2)}"`);
        } else {
          csvRows.push(`"No data for this month"`);
        }

        // Add spacing between months
        if (monthIndex < selectedMonthData.length - 1) {
          csvRows.push('');
        }
      });

      // Grand Total Section (if multiple months)
      if (selectedMonthData.length > 1) {
        // Calculate grand totals across all months (excluding deleted)
        const allMonthReceipts = allReceipts.filter(r => {
          if (r.status === 'deleted') return false;
          const date = r.createdAt?.toDate();
          if (!date) return false;
          return selectedMonthData.some(m => date >= m.startDate && date <= m.endDate);
        });

        const grandPlayerData = allPlayers.map(player => {
          const playerReceipts = allMonthReceipts.filter(r => r.userRef?.id === player.userId);
          const debitReceipts = playerReceipts.filter(r => r.type === 'debit');
          const creditReceipts = playerReceipts.filter(r => r.type === 'credit');
          const totalCharged = debitReceipts.reduce((sum, r) => sum + r.amount, 0);
          const totalPaid = creditReceipts.reduce((sum, r) => sum + r.amount, 0);
          return { totalCharged, totalPaid, outstandingBalance: totalCharged - totalPaid };
        }).filter(p => p.totalCharged > 0 || p.totalPaid > 0);

        const grandTotalCharged = grandPlayerData.reduce((sum, p) => sum + p.totalCharged, 0);
        const grandTotalPaid = grandPlayerData.reduce((sum, p) => sum + p.totalPaid, 0);
        const grandTotalOutstanding = grandPlayerData.reduce((sum, p) => sum + p.outstandingBalance, 0);

        csvRows.push('');
        csvRows.push('');
        csvRows.push(`"=== GRAND TOTAL (${selectedMonthData.length} MONTHS) ==="`);
        csvRows.push(`"Total Charged:","${defaultCurrency} ${grandTotalCharged.toFixed(2)}"`);
        csvRows.push(`"Total Paid:","${defaultCurrency} ${grandTotalPaid.toFixed(2)}"`);
        csvRows.push(`"Total Outstanding:","${defaultCurrency} ${grandTotalOutstanding.toFixed(2)}"`);
      }

      const csvContent = csvRows.join('\n');

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      // Generate period label from selected months
      const periodLabel = selectedMonths.length === 1
        ? monthOptions.find(m => m.value === selectedMonths[0])?.label || selectedMonths[0]
        : `${selectedMonths.length}-months`;
      const statusLabel = reportStatusOptions.find(o => o.value === reportStatus)?.label || reportStatus;
      const dateStr = new Date().toISOString().split('T')[0];

      link.setAttribute('href', url);
      link.setAttribute('download', `Player-Financial-Report_${periodLabel}_${statusLabel}_${dateStr}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setShowReportModal(false);
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setGeneratingReport(false);
    }
  };

  const renderChart = () => {
    switch (chartType) {
      case 'revenue':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={revenueChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value) => [`${defaultCurrency} ${Number(value || 0).toLocaleString()}`, '']}
              />
              <Legend />
              <Bar dataKey="revenue" name="Revenue" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'comparison':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={revenueChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value) => [`${defaultCurrency} ${Number(value || 0).toLocaleString()}`, '']}
              />
              <Legend />
              <Line type="monotone" dataKey="revenue" name="Income" stroke="#10B981" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#EF4444" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'collection':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={collectionChartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
                label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
              >
                {collectionChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`${value} receipts`, '']} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  if (!selectedOrganization) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="text-center">
          <p className="text-secondary-500">No organization selected</p>
          <p className="text-sm text-secondary-400">Please select an organization to view stats</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center space-x-3">
          <Select
            value={chartType}
            onChange={(e) => setChartType(e.target.value)}
            className="w-48"
          >
            {chartTypeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
          <Select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="w-40"
          >
            {timeRangeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </div>
        <Button variant="outline" onClick={() => setShowReportModal(true)}>
          Download Report
        </Button>
      </div>

      {/* Report Download Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md p-6 m-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-secondary-900">Download Player Financial Report</h3>
              <button
                onClick={() => setShowReportModal(false)}
                className="text-secondary-400 hover:text-secondary-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Month Selection */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-secondary-700">
                    Select Months
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedMonths.length === monthOptions.length) {
                        setSelectedMonths([]);
                      } else {
                        setSelectedMonths(monthOptions.map(m => m.value));
                      }
                    }}
                    className="text-xs text-primary-600 hover:text-primary-700"
                  >
                    {selectedMonths.length === monthOptions.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="bg-secondary-50 rounded-lg p-3 grid grid-cols-2 gap-2">
                  {monthOptions.map(month => (
                    <label key={month.value} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedMonths.includes(month.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedMonths(prev => [...prev, month.value]);
                          } else {
                            setSelectedMonths(prev => prev.filter(m => m !== month.value));
                          }
                        }}
                        className="w-4 h-4 text-primary-600 border-secondary-300 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm text-secondary-700">{month.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Player Status
                </label>
                <Select
                  value={reportStatus}
                  onChange={(e) => setReportStatus(e.target.value)}
                  className="w-full"
                >
                  {reportStatusOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </div>

              {/* Customizable Fields */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-2">
                  Fields to Include
                </label>
                <div className="bg-secondary-50 rounded-lg p-3 space-y-2">
                  {[
                    { key: 'playerName', label: 'Player Name' },
                    { key: 'email', label: 'Email' },
                    { key: 'academy', label: 'Academy' },
                    { key: 'totalCharged', label: 'Total Charged' },
                    { key: 'totalPaid', label: 'Total Paid' },
                    { key: 'outstandingBalance', label: 'Outstanding Balance' },
                    { key: 'status', label: 'Payment Status' },
                  ].map(field => (
                    <label key={field.key} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reportFields[field.key as keyof typeof reportFields]}
                        onChange={(e) => setReportFields(prev => ({
                          ...prev,
                          [field.key]: e.target.checked
                        }))}
                        className="w-4 h-4 text-primary-600 border-secondary-300 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm text-secondary-700">{field.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowReportModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={generateReport}
                  disabled={generatingReport || !Object.values(reportFields).some(v => v) || selectedMonths.length === 0}
                >
                  {generatingReport ? 'Generating...' : 'Download CSV'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Key Metrics - 6 Cards */}
      {loading ? (
        <div className="flex justify-center items-center min-h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Expected Revenue */}
          <Card className="p-4">
            <div className="text-sm text-secondary-600">Expected Revenue</div>
            <div className="text-2xl font-bold text-primary-600">
              {defaultCurrency} {metrics.expectedRevenue.toLocaleString()}
            </div>
            <div className="text-sm text-secondary-500 mt-1">
              Total invoiced amount
            </div>
          </Card>

          {/* Collected Revenue */}
          <Card className="p-4">
            <div className="text-sm text-secondary-600">Collected Revenue</div>
            <div className="text-2xl font-bold text-success-600">
              {defaultCurrency} {metrics.collectedRevenue.toLocaleString()}
            </div>
            <div className="text-sm text-secondary-500 mt-1">
              Total payments received
            </div>
          </Card>

          {/* Outstanding Balance */}
          <Card className="p-4">
            <div className="text-sm text-secondary-600">Outstanding Balance</div>
            <div className="text-2xl font-bold text-warning-600">
              {defaultCurrency} {metrics.outstandingAmount.toLocaleString()}
            </div>
            <div className="text-sm text-secondary-500 mt-1">
              {metrics.pendingReceipts} pending receipts
            </div>
          </Card>

          {/* Expenses */}
          <Card className="p-4">
            <div className="text-sm text-secondary-600">Expenses</div>
            <div className="text-2xl font-bold text-error-600">
              {defaultCurrency} {metrics.totalExpenses.toLocaleString()}
            </div>
            <div className="text-sm text-secondary-500 mt-1">
              Total expense transactions
            </div>
          </Card>

          {/* Profit */}
          <Card className="p-4">
            <div className="text-sm text-secondary-600">Profit</div>
            <div className={`text-2xl font-bold ${
              metrics.profit >= 0 ? 'text-success-600' : 'text-error-600'
            }`}>
              {defaultCurrency} {metrics.profit.toLocaleString()}
            </div>
            <div className="text-sm text-secondary-500 mt-1">
              Collected revenue - Expenses
            </div>
          </Card>

          {/* Collection Rate */}
          <Card className="p-4">
            <div className="text-sm text-secondary-600">Collection Rate</div>
            <div className={`text-2xl font-bold ${
              metrics.collectionRate >= 90 ? 'text-success-600' :
              metrics.collectionRate >= 75 ? 'text-warning-600' : 'text-error-600'
            }`}>
              {metrics.collectionRate.toFixed(1)}%
            </div>
            <div className="text-sm text-secondary-500 mt-1">
              {metrics.paidReceipts} of {metrics.paidReceipts + metrics.pendingReceipts} paid
            </div>
          </Card>
        </div>
      )}

      {/* Main Chart */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-secondary-900 mb-4">
          {chartTypeOptions.find(opt => opt.value === chartType)?.label}
        </h3>
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : revenueChartData.length > 0 || collectionChartData.length > 0 ? (
          renderChart()
        ) : (
          <div className="h-64 flex items-center justify-center bg-secondary-50 rounded-lg">
            <div className="text-center">
              <p className="text-secondary-500">No data available for selected period</p>
              <p className="text-xs text-secondary-400 mt-2">
                Try selecting a different time range
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Additional Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">Top Products</h3>
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
            </div>
          ) : topProducts.length > 0 ? (
            <div className="space-y-3">
              {topProducts.map((product, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-secondary-900">{product.name}</div>
                    <div className="text-sm text-secondary-600">{product.count} invoiced</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-secondary-900">
                      {defaultCurrency} {product.revenue.toLocaleString()}
                    </div>
                    <div className="text-sm text-secondary-600">
                      {product.percentage.toFixed(1)}% of total
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-secondary-500">
              No product data available for this period
            </div>
          )}
        </Card>

        {/* Payment Methods */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">Payment Methods</h3>
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
            </div>
          ) : paymentMethods.length > 0 ? (
            <div className="space-y-3">
              {paymentMethods.map((method, index) => (
                <div key={index}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-secondary-900">{method.method}</span>
                    <span className="text-sm text-secondary-600">
                      {defaultCurrency} {method.amount.toLocaleString()} ({method.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-secondary-500 mb-2">
                    <span>{method.count} transactions</span>
                    <span>Avg: {defaultCurrency} {(method.amount / method.count).toFixed(0)}</span>
                  </div>
                  <div className="w-full bg-secondary-200 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full"
                      style={{ width: `${method.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-secondary-500">
              No payment method data available for this period
            </div>
          )}
        </Card>
      </div>

      {/* Academy Comparison (if multiple academies and no academy selected) */}
      {!selectedAcademy && academyPerformance.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">Academy Performance</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-secondary-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                    Academy
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                    Revenue
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                    Expenses
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                    Net Profit
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                    Players
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                    Avg/Player
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                    Growth
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-secondary-200">
                {academyPerformance.map((academy) => (
                  <tr key={academy.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-secondary-900">
                      {academy.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-success-600">
                      {defaultCurrency} {academy.revenue.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-error-600">
                      {defaultCurrency} {academy.expenses.toLocaleString()}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                      academy.netProfit >= 0 ? 'text-success-600' : 'text-error-600'
                    }`}>
                      {defaultCurrency} {academy.netProfit.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">
                      {academy.players}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">
                      {defaultCurrency} {academy.avgPerPlayer.toFixed(0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={academy.growth >= 0 ? 'text-success-600' : 'text-error-600'}>
                        {academy.growth >= 0 ? '+' : ''}{academy.growth.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default Stats;
