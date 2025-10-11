import React, { useState, useEffect } from 'react';
import { Card, Select, Button } from '../ui';
import { useApp } from '../../contexts/AppContext';
import { getTransactionsByOrganization } from '../../services/transactionService';
import { getPlayersByOrganization } from '../../services/playerService';
import { getReceiptsByOrganization } from '../../services/receiptService';
import { getProductsByOrganization } from '../../services/productService';
import { getUserById } from '../../services/userService';
import { getSettingsByOrganization } from '../../services/settingsService';
import { Transaction, Player, Receipt, Product, User } from '../../types';


const Stats: React.FC = () => {
  const { selectedAcademy, selectedOrganization } = useApp();
  const [timeRange, setTimeRange] = useState('month');
  const [chartType, setChartType] = useState('revenue');
  const [loading, setLoading] = useState(true);
  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');
  
  // Real data state
  const [products, setProducts] = useState<Product[]>([]);
  
  // Calculated metrics
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    revenueGrowth: 0,
    activeSubscriptions: 0,
    avgRevenuePerPlayer: 0,
    collectionRate: 0,
    outstandingAmount: 0,
    totalPlayers: 0,
    paidReceipts: 0,
    pendingReceipts: 0
  });
  
  const [topProducts, setTopProducts] = useState<Array<{
    name: string;
    revenue: number;
    count: number;
    percentage: number;
  }>>([]);
  
  const [paymentMethods, setPaymentMethods] = useState<Array<{
    method: string;
    amount: number;
    percentage: number;
    count: number;
  }>>([]);

  useEffect(() => {
    if (selectedOrganization?.id) {
      loadFinancialData();
    }
  }, [selectedOrganization, selectedAcademy]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFinancialData = async () => {
    if (!selectedOrganization?.id) {
      console.log('🚫 No organization selected for stats');
      return;
    }
    
    try {
      console.log('📊 Loading financial data for stats page, org:', selectedOrganization.name);
      setLoading(true);
      
      // Load settings for currency
      try {
        const settings = await getSettingsByOrganization(selectedOrganization.id);
        if (settings?.generalSettings?.currency) {
          setDefaultCurrency(settings.generalSettings.currency);
          console.log('💰 Currency set to:', settings.generalSettings.currency);
        }
      } catch (error) {
        console.warn('Could not load settings:', error);
      }

      // Load all financial data in parallel
      const [transactionsData, playersData, receiptsData, productsData] = await Promise.all([
        getTransactionsByOrganization(selectedOrganization.id),
        getPlayersByOrganization(selectedOrganization.id),
        getReceiptsByOrganization(selectedOrganization.id),
        getProductsByOrganization(selectedOrganization.id)
      ]);
      
      console.log('📊 Stats data loaded:', {
        transactions: transactionsData.length,
        players: playersData.length,
        receipts: receiptsData.length,
        products: productsData.length
      });
      
      setProducts(productsData);
      
      // Load player users for names
      const userIds = playersData.map(p => p.userId);
      const userMap = new Map<string, User>();
      
      await Promise.all(
        userIds.map(async (userId) => {
          try {
            const user = await getUserById(userId);
            if (user) userMap.set(userId, user);
          } catch (error) {
            console.warn(`Could not load user ${userId}:`, error);
          }
        })
      );
      
      // Calculate metrics
      calculateMetrics(transactionsData, playersData, receiptsData, productsData, userMap);
      
    } catch (error) {
      console.error('Error loading financial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateMetrics = (
    transactionsData: Transaction[], 
    playersData: Player[], 
    receiptsData: Receipt[], 
    productsData: Product[],
    userMap: Map<string, User>
  ) => {
    // Filter by academy if selected
    const filteredPlayers = selectedAcademy 
      ? playersData.filter(p => p.academyId?.includes(selectedAcademy.id))
      : playersData;
    
    const filteredReceipts = selectedAcademy
      ? receiptsData.filter(r => r.academyId === selectedAcademy.id)
      : receiptsData;
    
    const filteredTransactions = selectedAcademy
      ? transactionsData.filter(t => t.academyId === selectedAcademy.id)
      : transactionsData;

    // Calculate total revenue from income transactions
    const totalRevenue = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    // Calculate outstanding amounts from unpaid debit receipts
    const debitReceipts = filteredReceipts.filter(r => r.type === 'debit');
    let outstandingAmount = 0;
    let paidReceipts = 0;
    let pendingReceipts = 0;
    
    debitReceipts.forEach(debit => {
      // Check if debit has payment (sibling credit receipts)
      const linkedCredits = filteredReceipts.filter(credit =>
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

    // Product revenue analysis
    const productRevenue = new Map<string, { revenue: number; count: number; }>();
    
    // Calculate from debit receipts (invoices)
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

    const topProductsData = Array.from(productRevenue.entries())
      .map(([name, data]) => ({
        name,
        revenue: data.revenue,
        count: data.count,
        percentage: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Payment methods analysis from income transactions
    const paymentMethodMap = new Map<string, { amount: number; count: number; }>();
    
    filteredTransactions
      .filter(t => t.type === 'income')
      .forEach(transaction => {
        const method = transaction.paymentMethod || 'Unknown';
        const current = paymentMethodMap.get(method) || { amount: 0, count: 0 };
        paymentMethodMap.set(method, {
          amount: current.amount + Math.abs(transaction.amount),
          count: current.count + 1
        });
      });

    const paymentMethodsData = Array.from(paymentMethodMap.entries())
      .map(([method, data]) => ({
        method,
        amount: data.amount,
        count: data.count,
        percentage: totalRevenue > 0 ? (data.amount / totalRevenue) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    // Calculate growth (simple month-over-month for now)
    const currentMonth = new Date().getMonth();
    const currentMonthTransactions = filteredTransactions.filter(t => {
      const transactionDate = t.date?.toDate() || t.createdAt.toDate();
      return transactionDate.getMonth() === currentMonth && t.type === 'income';
    });
    const currentMonthRevenue = currentMonthTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    const lastMonthTransactions = filteredTransactions.filter(t => {
      const transactionDate = t.date?.toDate() || t.createdAt.toDate();
      return transactionDate.getMonth() === (currentMonth - 1) && t.type === 'income';
    });
    const lastMonthRevenue = lastMonthTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    const revenueGrowth = lastMonthRevenue > 0 
      ? ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 
      : 0;

    setMetrics({
      totalRevenue,
      revenueGrowth,
      activeSubscriptions: filteredPlayers.length,
      avgRevenuePerPlayer: filteredPlayers.length > 0 ? totalRevenue / filteredPlayers.length : 0,
      collectionRate,
      outstandingAmount,
      totalPlayers: filteredPlayers.length,
      paidReceipts,
      pendingReceipts
    });

    setTopProducts(topProductsData);
    setPaymentMethods(paymentMethodsData);
  };

  const timeRangeOptions = [
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'quarter', label: 'This Quarter' },
    { value: 'year', label: 'This Year' },
    { value: 'all', label: 'All Time' },
  ];

  const chartTypeOptions = [
    { value: 'revenue', label: 'Revenue Overview' },
    { value: 'products', label: 'Product Performance' },
    { value: 'growth', label: 'Player Growth' },
    { value: 'comparison', label: 'Academy Comparison' },
  ];

  const renderChart = () => {
    // In a real implementation, you would use a charting library like Chart.js or Recharts
    return (
      <div className="h-64 flex items-center justify-center bg-secondary-50 rounded-lg">
        <div className="text-center">
          <p className="text-secondary-500">Chart visualization would go here</p>
          <p className="text-xs text-secondary-400 mt-2">
            Showing data for {selectedAcademy?.name || 'All Academies'}
          </p>
        </div>
      </div>
    );
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
      {/* Debug Info */}
      {loading && (
        <div className="text-center text-secondary-500">
          Loading financial statistics...
        </div>
      )}
      
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
        <Button variant="outline">
          Download Report
        </Button>
      </div>

      {/* Key Metrics */}
      {loading ? (
        <div className="flex justify-center items-center min-h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="p-4">
            <div className="text-sm text-secondary-600">Total Revenue</div>
            <div className="text-2xl font-bold text-secondary-900">
              {defaultCurrency} {metrics.totalRevenue.toLocaleString()}
            </div>
            <div className={`text-sm mt-1 ${
              metrics.revenueGrowth >= 0 ? 'text-success-600' : 'text-error-600'
            }`}>
              {metrics.revenueGrowth >= 0 ? '+' : ''}{metrics.revenueGrowth.toFixed(1)}% from last month
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-secondary-600">Total Players</div>
            <div className="text-2xl font-bold text-secondary-900">
              {metrics.totalPlayers}
            </div>
            <div className="text-sm text-secondary-500 mt-1">
              Active registrations
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-secondary-600">Avg Revenue/Player</div>
            <div className="text-2xl font-bold text-secondary-900">
              {defaultCurrency} {Math.round(metrics.avgRevenuePerPlayer).toLocaleString()}
            </div>
            <div className="text-sm text-secondary-500 mt-1">
              Total revenue divided by players
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-secondary-600">Collection Rate</div>
            <div className={`text-2xl font-bold ${
              metrics.collectionRate >= 90 ? 'text-success-600' : 
              metrics.collectionRate >= 75 ? 'text-warning-600' : 'text-error-600'
            }`}>
              {metrics.collectionRate.toFixed(1)}%
            </div>
            <div className="text-sm text-secondary-500 mt-1">
              {metrics.paidReceipts} of {metrics.paidReceipts + metrics.pendingReceipts} receipts paid
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-secondary-600">Outstanding</div>
            <div className="text-2xl font-bold text-error-600">
              {defaultCurrency} {metrics.outstandingAmount.toLocaleString()}
            </div>
            <div className="text-sm text-secondary-500 mt-1">
              {metrics.pendingReceipts} pending receipts
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-secondary-600">Products Offered</div>
            <div className="text-2xl font-bold text-primary-600">
              {products.length}
            </div>
            <div className="text-sm text-secondary-500 mt-1">
              Active product catalog
            </div>
          </Card>
        </div>
      )}

      {/* Main Chart */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-secondary-900 mb-4">
          {chartTypeOptions.find(opt => opt.value === chartType)?.label}
        </h3>
        {renderChart()}
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
              No product data available yet
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
              No payment method data available yet
            </div>
          )}
        </Card>
      </div>

      {/* Academy Comparison (if multiple academies) */}
      {selectedAcademy === null && (
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
                {[
                  { name: 'Main Academy', revenue: 45000, players: 60, growth: 12.5 },
                  { name: 'North Branch', revenue: 32000, players: 42, growth: 18.2 },
                  { name: 'South Branch', revenue: 16000, players: 23, growth: -5.1 },
                ].map((academy, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-secondary-900">
                      {academy.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">
                      ${academy.revenue.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">
                      {academy.players}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">
                      ${(academy.revenue / academy.players).toFixed(0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={academy.growth >= 0 ? 'text-success-600' : 'text-error-600'}>
                        {academy.growth >= 0 ? '+' : ''}{academy.growth}%
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