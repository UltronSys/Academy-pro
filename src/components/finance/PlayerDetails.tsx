import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Input, Label, Toast, Badge, DataTable } from '../ui';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { getPlayerById, updatePlayer, assignProductToPlayer, removeProductFromPlayer } from '../../services/playerService';
import { getUserById } from '../../services/userService';
import { getReceiptsByUser } from '../../services/receiptService';
import { getProductsByPlayer, getProductsByOrganization } from '../../services/productService';
import { getSettingsByOrganization } from '../../services/settingsService';
import { Player, User, Receipt, Product } from '../../types';
import { Timestamp } from 'firebase/firestore';

interface GroupedReceipts {
  [key: string]: Receipt[];
}

const PlayerDetails: React.FC = () => {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const { selectedOrganization } = useApp();
  const { canWrite } = usePermissions();
  
  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState<Player | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [guardians, setGuardians] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [debitReceipts, setDebitReceipts] = useState<Receipt[]>([]);
  const [creditReceipts, setCreditReceipts] = useState<Receipt[]>([]);
  const [groupedDebitReceipts, setGroupedDebitReceipts] = useState<GroupedReceipts>({});
  const [groupedCreditReceipts, setGroupedCreditReceipts] = useState<GroupedReceipts>({});
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [updatingProduct, setUpdatingProduct] = useState(false);
  const [currency, setCurrency] = useState('USD');
  
  // Product linking states
  const [showLinkProductModal, setShowLinkProductModal] = useState(false);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [linkingInvoiceDate, setLinkingInvoiceDate] = useState<string>('');
  const [linkingDeadlineDate, setLinkingDeadlineDate] = useState<string>('');
  const [linkingInvoiceGeneration, setLinkingInvoiceGeneration] = useState<'immediate' | 'scheduled'>('immediate');
  const [linkingProduct, setLinkingProduct] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [unlinkingProductId, setUnlinkingProductId] = useState<string | null>(null);

  useEffect(() => {
    if (playerId && selectedOrganization?.id) {
      loadPlayerDetails();
    }
  }, [playerId, selectedOrganization]);

  const loadPlayerDetails = async () => {
    if (!playerId || !selectedOrganization?.id) return;

    try {
      setLoading(true);
      
      // Load player data
      const playerData = await getPlayerById(playerId);
      if (!playerData) {
        showToast('Player not found', 'error');
        navigate('/finance/players-guardians');
        return;
      }
      setPlayer(playerData);

      // Load user data
      const userData = await getUserById(playerData.userId);
      if (userData) {
        setUser(userData);
      }

      // Load guardians
      const guardianPromises = (playerData.guardianId || []).map(gId => getUserById(gId));
      const guardiansData = await Promise.all(guardianPromises);
      setGuardians(guardiansData.filter(g => g !== null) as User[]);

      // Load products assigned to player
      if (selectedOrganization.id) {
        const productsData = await getProductsByPlayer(selectedOrganization.id, playerId);
        setProducts(productsData);
      }

      // Load receipts
      const receiptsData = await getReceiptsByUser(playerData.userId);
      
      // Separate debit and credit receipts
      const debits = receiptsData.filter(r => r.type === 'debit');
      const credits = receiptsData.filter(r => r.type === 'credit');
      
      setDebitReceipts(debits);
      setCreditReceipts(credits);
      
      // Group receipts by month
      const debitGroups = groupReceiptsByMonth(debits);
      const creditGroups = groupReceiptsByMonth(credits);
      
      setGroupedDebitReceipts(debitGroups);
      setGroupedCreditReceipts(creditGroups);
      
      // Get all unique months from both debit and credit receipts
      const allMonths = new Set([
        ...Object.keys(debitGroups),
        ...Object.keys(creditGroups)
      ]);
      const sortedMonths = Array.from(allMonths).sort((a, b) => b.localeCompare(a));
      setAvailableMonths(sortedMonths);
      
      // Set current month as default
      if (sortedMonths.length > 0) {
        setSelectedMonth(sortedMonths[0]);
      }

      // Load currency from settings
      const settingsData = await getSettingsByOrganization(selectedOrganization.id);
      if (settingsData?.generalSettings?.currency) {
        setCurrency(settingsData.generalSettings.currency);
      }

    } catch (error) {
      console.error('Error loading player details:', error);
      showToast('Failed to load player details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const groupReceiptsByMonth = (receipts: Receipt[]): GroupedReceipts => {
    const grouped: GroupedReceipts = {};
    
    receipts.forEach(receipt => {
      const date = receipt.createdAt?.toDate() || new Date();
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(receipt);
    });
    
    // Sort receipts within each month by date (newest first)
    Object.keys(grouped).forEach(month => {
      grouped[month].sort((a, b) => {
        const dateA = a.createdAt?.toMillis() || 0;
        const dateB = b.createdAt?.toMillis() || 0;
        return dateB - dateA;
      });
    });
    
    return grouped;
  };

  const formatMonthDisplay = (monthKey: string): string => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (direction === 'prev' && currentIndex < availableMonths.length - 1) {
      setSelectedMonth(availableMonths[currentIndex + 1]);
    } else if (direction === 'next' && currentIndex > 0) {
      setSelectedMonth(availableMonths[currentIndex - 1]);
    }
  };

  const canNavigatePrev = availableMonths.indexOf(selectedMonth) < availableMonths.length - 1;
  const canNavigateNext = availableMonths.indexOf(selectedMonth) > 0;

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const handleEditProduct = (productId: string) => {
    setEditingProductId(productId);
  };

  const handleSaveProductDates = async (productId: string, invoiceDate: string, deadlineDate: string) => {
    if (!player || !canWrite('finance')) return;

    try {
      setUpdatingProduct(true);
      
      // Validate dates
      const invoiceDateObj = new Date(invoiceDate);
      const deadlineDateObj = new Date(deadlineDate);
      
      if (deadlineDateObj <= invoiceDateObj) {
        showToast('Deadline date must be after invoice date', 'error');
        return;
      }

      // Update the assigned product dates
      const updatedProducts = player.assignedProducts?.map(ap => {
        if (ap.productId === productId) {
          return {
            ...ap,
            invoiceDate: Timestamp.fromDate(invoiceDateObj),
            deadlineDate: Timestamp.fromDate(deadlineDateObj)
          };
        }
        return ap;
      });

      // Update player in database
      await updatePlayer(player.id, {
        assignedProducts: updatedProducts
      });

      // Update local state
      setPlayer({
        ...player,
        assignedProducts: updatedProducts
      });

      setEditingProductId(null);
      showToast('Product dates updated successfully', 'success');
      
    } catch (error) {
      console.error('Error updating product dates:', error);
      showToast('Failed to update product dates', 'error');
    } finally {
      setUpdatingProduct(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingProductId(null);
  };

  const handleLinkNewProduct = async () => {
    if (!selectedOrganization?.id) return;
    
    try {
      setLoadingProducts(true);
      
      // Load available products for the organization
      const allProducts = await getProductsByOrganization(selectedOrganization.id);
      
      // Filter out products that are already assigned to this player
      const assignedProductIds = player?.assignedProducts?.map(ap => ap.productId) || [];
      const unassignedProducts = allProducts.filter(product => 
        !assignedProductIds.includes(product.id) && product.isActive
      );
      
      setAvailableProducts(unassignedProducts);
      
      // Set default dates
      const today = new Date();
      const defaultDeadline = new Date();
      defaultDeadline.setDate(today.getDate() + 30); // Default 30 days for deadline
      
      setLinkingInvoiceDate(today.toISOString().split('T')[0]);
      setLinkingDeadlineDate(defaultDeadline.toISOString().split('T')[0]);
      setSelectedProductId('');
      setLinkingInvoiceGeneration('immediate');
      
      setShowLinkProductModal(true);
    } catch (error) {
      console.error('Error loading products:', error);
      showToast('Failed to load available products', 'error');
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleCloseLinkProductModal = () => {
    setShowLinkProductModal(false);
    setSelectedProductId('');
    setLinkingInvoiceDate('');
    setLinkingDeadlineDate('');
    setLinkingInvoiceGeneration('immediate');
  };

  const handleSubmitProductLink = async () => {
    if (!player || !selectedProductId || !selectedOrganization?.id) return;

    // Validate inputs
    if (!linkingInvoiceDate || !linkingDeadlineDate) {
      showToast('Please select both invoice date and deadline date', 'error');
      return;
    }

    const invoiceDateObj = new Date(linkingInvoiceDate);
    const deadlineDateObj = new Date(linkingDeadlineDate);

    if (deadlineDateObj <= invoiceDateObj) {
      showToast('Deadline date must be after invoice date', 'error');
      return;
    }

    const selectedProduct = availableProducts.find(p => p.id === selectedProductId);
    if (!selectedProduct) {
      showToast('Please select a product', 'error');
      return;
    }

    try {
      setLinkingProduct(true);

      // Assign product to player
      await assignProductToPlayer(
        player.id,
        selectedProduct,
        selectedOrganization.id,
        selectedProduct.academyId,
        invoiceDateObj,
        deadlineDateObj,
        linkingInvoiceGeneration
      );

      showToast('Product linked successfully!', 'success');
      handleCloseLinkProductModal();
      
      // Reload player details to show the new product
      await loadPlayerDetails();

    } catch (error) {
      console.error('Error linking product:', error);
      showToast('Failed to link product. Please try again.', 'error');
    } finally {
      setLinkingProduct(false);
    }
  };

  // Helper functions to differentiate payment types
  const getPaymentStatusColor = (receipt: Receipt) => {
    const description = receipt.description?.toLowerCase() || '';
    
    // Don't show as available credit if amount is 0 or negative
    if (receipt.amount <= 0) {
      return 'success'; // Green for applied payments
    }
    
    // Don't show as available credit if it's linked to a debit receipt (already applied)
    if (receipt.siblingReceiptRefs && receipt.siblingReceiptRefs.length > 0) {
      return 'success'; // Green for applied payments
    }
    
    // Check if this creates available credit (excess payment)
    if (description.includes('excess') || description.includes('credit')) {
      return 'primary'; // Blue for available credit
    }
    
    // Check if this was applied to existing invoices
    if (description.includes('applied to') || description.includes('payment')) {
      return 'success'; // Green for payments applied to invoices
    }
    
    // Default for completed payments
    return 'success';
  };

  const getPaymentStatusText = (receipt: Receipt) => {
    const description = receipt.description?.toLowerCase() || '';
    
    // Don't show as available credit if amount is 0 or negative
    if (receipt.amount <= 0) {
      return 'PAYMENT APPLIED';
    }
    
    // Don't show as available credit if it's linked to a debit receipt (already applied)
    if (receipt.siblingReceiptRefs && receipt.siblingReceiptRefs.length > 0) {
      return 'PAYMENT APPLIED';
    }
    
    // Check if this creates available credit
    if (description.includes('excess') || description.includes('credit')) {
      return 'AVAILABLE CREDIT';
    }
    
    // Check if this was applied to existing invoices
    if (description.includes('applied to')) {
      return 'PAYMENT APPLIED';
    }
    
    // General payment completed
    return 'COMPLETED';
  };

  const handleUnlinkProduct = async (productId: string, productName: string) => {
    if (!player || !canWrite('finance')) return;

    // Show confirmation
    const confirmed = window.confirm(
      `Are you sure you want to unlink "${productName}" from ${user?.name}? This will mark the product assignment as cancelled.`
    );

    if (!confirmed) return;

    try {
      setUnlinkingProductId(productId);

      // Remove product from player
      await removeProductFromPlayer(player.id, productId);

      showToast(`Product "${productName}" unlinked successfully!`, 'success');
      
      // Reload player details to show the updated products list
      await loadPlayerDetails();

    } catch (error) {
      console.error('Error unlinking product:', error);
      showToast('Failed to unlink product. Please try again.', 'error');
    } finally {
      setUnlinkingProductId(null);
    }
  };

  const invoiceColumns = [
    {
      key: 'date',
      header: 'Invoice Date',
      render: (receipt: Receipt) => (
        <div className="text-sm">
          {receipt.createdAt?.toDate().toLocaleDateString() || 'N/A'}
        </div>
      )
    },
    {
      key: 'product',
      header: 'Product/Service',
      render: (receipt: Receipt) => (
        <div>
          <div className="font-medium text-secondary-900">
            {receipt.product?.name || receipt.description || 'N/A'}
          </div>
          {receipt.product?.deadline && (
            <div className="text-xs text-secondary-600">
              Due: {receipt.product.deadline.toDate().toLocaleDateString()}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'amount',
      header: 'Amount Due',
      render: (receipt: Receipt) => (
        <div className="font-medium text-error-600">
          {currency} {receipt.amount.toFixed(2)}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (receipt: Receipt) => {
        const getStatusColor = (status: string) => {
          switch (status) {
            case 'completed':
              return 'success';
            case 'paid':
              return 'primary'; // Blue for partially paid
            case 'active':
              return 'warning'; // Yellow for unpaid/active
            case 'pending':
              return 'warning';
            case 'overdue':
              return 'error';
            default:
              return 'secondary';
          }
        };
        
        const getStatusText = (status: string) => {
          switch (status) {
            case 'completed':
              return 'FULLY PAID';
            case 'paid':
              return 'PARTIALLY PAID';
            case 'active':
              return 'UNPAID';
            case 'pending':
              return 'PENDING';
            case 'overdue':
              return 'OVERDUE';
            default:
              return status.toUpperCase();
          }
        };
        
        return (
          <Badge variant={getStatusColor(receipt.status || 'active')}>
            {getStatusText(receipt.status || 'active')}
          </Badge>
        );
      }
    }
  ];

  const paymentColumns = [
    {
      key: 'date',
      header: 'Payment Date',
      render: (receipt: Receipt) => (
        <div className="text-sm">
          {receipt.createdAt?.toDate().toLocaleDateString() || 'N/A'}
        </div>
      )
    },
    {
      key: 'description',
      header: 'Description',
      render: (receipt: Receipt) => (
        <div>
          <div className="font-medium text-secondary-900">
            {receipt.description || receipt.product?.name || 'Payment'}
          </div>
          {/* Add context for payment types */}
          <div className="text-xs text-secondary-500 mt-1">
            {(() => {
              const description = receipt.description?.toLowerCase() || '';
              if (description.includes('excess') || description.includes('credit')) {
                return '💳 Creates available credit for future use';
              } else if (description.includes('applied to')) {
                return '✅ Applied to existing invoices';
              } else {
                return '💰 Payment received';
              }
            })()}
          </div>
        </div>
      )
    },
    {
      key: 'amount',
      header: 'Amount Paid',
      render: (receipt: Receipt) => (
        <div className="font-medium text-success-600">
          {currency} {receipt.amount.toFixed(2)}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (receipt: Receipt) => (
        <Badge variant={getPaymentStatusColor(receipt)}>
          {getPaymentStatusText(receipt)}
        </Badge>
      )
    }
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!player || !user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96">
        <p className="text-secondary-600">Player not found</p>
        <Button 
          variant="outline" 
          onClick={() => navigate('/finance/players-guardians')}
          className="mt-4"
        >
          Back to Players & Guardians
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow-sm rounded-lg p-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
            <p className="text-gray-600 mt-1">{user.email}</p>
            {user.phone && <p className="text-gray-500">{user.phone}</p>}
          </div>
          <Button 
            variant="outline" 
            onClick={() => navigate('/finance/players-guardians')}
          >
            Back to List
          </Button>
        </div>
      </div>

      {/* Guardian Information */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-secondary-900 mb-4">Guardian Information</h2>
          {guardians.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {guardians.map(guardian => (
                <div key={guardian.id} className="border rounded-lg p-4">
                  <div className="font-medium text-secondary-900">{guardian.name}</div>
                  <div className="text-sm text-secondary-600">{guardian.email}</div>
                  {guardian.phone && (
                    <div className="text-sm text-secondary-500">{guardian.phone}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-secondary-500">No guardians assigned</p>
          )}
        </div>
      </Card>

      {/* Assigned Products */}
      <Card>
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-secondary-900">Assigned Products</h2>
            {canWrite('finance') && (
              <Button
                onClick={handleLinkNewProduct}
                size="sm"
                disabled={loadingProducts}
              >
                {loadingProducts && (
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {loadingProducts ? 'Loading Products...' : 'Link New Product'}
              </Button>
            )}
          </div>
          {player.assignedProducts && player.assignedProducts.length > 0 ? (
            <div className="space-y-4">
              {player.assignedProducts.filter(ap => ap.status === 'active').map(assignedProduct => {
                const isEditing = editingProductId === assignedProduct.productId;
                const currentInvoiceDate = assignedProduct.invoiceDate?.toDate().toISOString().split('T')[0] || '';
                const currentDeadlineDate = assignedProduct.deadlineDate?.toDate().toISOString().split('T')[0] || '';
                
                return (
                  <div key={assignedProduct.productId} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium text-secondary-900">{assignedProduct.productName}</div>
                        <div className="text-sm text-secondary-600">Price: {currency} {assignedProduct.price}</div>
                        
                        {isEditing ? (
                          <div className="mt-3 grid grid-cols-2 gap-4 max-w-md">
                            <div>
                              <Label htmlFor={`invoice-${assignedProduct.productId}`}>Invoice Date</Label>
                              <Input
                                id={`invoice-${assignedProduct.productId}`}
                                type="date"
                                defaultValue={currentInvoiceDate}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label htmlFor={`deadline-${assignedProduct.productId}`}>Deadline Date</Label>
                              <Input
                                id={`deadline-${assignedProduct.productId}`}
                                type="date"
                                defaultValue={currentDeadlineDate}
                                className="mt-1"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 text-sm">
                            <div className="text-secondary-600">
                              Invoice Date: {assignedProduct.invoiceDate?.toDate().toLocaleDateString() || 'Not set'}
                            </div>
                            <div className="text-secondary-600">
                              Deadline: {assignedProduct.deadlineDate?.toDate().toLocaleDateString() || 'Not set'}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {canWrite('finance') && (
                          <>
                            {isEditing ? (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    const invoiceInput = document.getElementById(`invoice-${assignedProduct.productId}`) as HTMLInputElement;
                                    const deadlineInput = document.getElementById(`deadline-${assignedProduct.productId}`) as HTMLInputElement;
                                    handleSaveProductDates(assignedProduct.productId, invoiceInput.value, deadlineInput.value);
                                  }}
                                  disabled={updatingProduct}
                                >
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={handleCancelEdit}
                                  disabled={updatingProduct}
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEditProduct(assignedProduct.productId)}
                                >
                                  Edit Dates
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleUnlinkProduct(assignedProduct.productId, assignedProduct.productName)}
                                  disabled={unlinkingProductId === assignedProduct.productId}
                                  className="text-error-600 hover:text-error-700 border-error-300 hover:border-error-400"
                                >
                                  {unlinkingProductId === assignedProduct.productId && (
                                    <svg className="animate-spin -ml-1 mr-2 h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                  )}
                                  {unlinkingProductId === assignedProduct.productId ? 'Unlinking...' : 'Unlink'}
                                </Button>
                              </>
                            )}
                          </>
                        )}
                        <Badge variant={assignedProduct.status === 'active' ? 'success' : 'secondary'}>
                          {assignedProduct.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-secondary-500">No products assigned</p>
          )}
        </div>
      </Card>

      {/* Month Navigation */}
      {availableMonths.length > 0 && (
        <Card>
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-secondary-900">Financial History</h3>
              <div className="flex items-center space-x-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateMonth('prev')}
                  disabled={!canNavigatePrev}
                  className="p-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Button>
                <div className="text-center min-w-[140px]">
                  <div className="font-medium text-secondary-900">
                    {selectedMonth && formatMonthDisplay(selectedMonth)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateMonth('next')}
                  disabled={!canNavigateNext}
                  className="p-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Invoices and Payments Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Invoices (Debit Receipts) Section */}
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold text-secondary-900 mb-4">
              Invoices - {selectedMonth && formatMonthDisplay(selectedMonth)}
            </h2>
            {selectedMonth && groupedDebitReceipts[selectedMonth] && groupedDebitReceipts[selectedMonth].length > 0 ? (
              <DataTable
                data={groupedDebitReceipts[selectedMonth]}
                columns={invoiceColumns}
                emptyMessage="No invoices for this month"
              />
            ) : (
              <p className="text-secondary-500">No invoices for this month</p>
            )}
          </div>
        </Card>

        {/* Payments (Credit Receipts) Section */}
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold text-secondary-900 mb-4">
              Payments - {selectedMonth && formatMonthDisplay(selectedMonth)}
            </h2>
            {selectedMonth && groupedCreditReceipts[selectedMonth] && groupedCreditReceipts[selectedMonth].length > 0 ? (
              <DataTable
                data={groupedCreditReceipts[selectedMonth]}
                columns={paymentColumns}
                emptyMessage="No payments for this month"
              />
            ) : (
              <p className="text-secondary-500">No payments for this month</p>
            )}
          </div>
        </Card>
      </div>

      {/* Link New Product Modal */}
      {showLinkProductModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !linkingProduct) {
              handleCloseLinkProductModal();
            }
          }}
        >
          <div className="w-full max-w-lg my-8">
            <Card className="w-full">
              <div className="p-6 max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-semibold text-secondary-900 mb-4">
                  Link New Product to {user?.name}
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="product-select">Select Product</Label>
                    <select
                      id="product-select"
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      required
                    >
                      <option value="">Choose a product...</option>
                      {availableProducts.map(product => (
                        <option key={product.id} value={product.id}>
                          {product.name} - {currency} {product.price.toFixed(2)} ({product.productType})
                        </option>
                      ))}
                    </select>
                    {availableProducts.length === 0 && (
                      <p className="text-sm text-secondary-500 mt-1">
                        No unassigned products available
                      </p>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="linking-invoice-date">Invoice Date</Label>
                      <Input
                        id="linking-invoice-date"
                        type="date"
                        value={linkingInvoiceDate}
                        onChange={(e) => setLinkingInvoiceDate(e.target.value)}
                        required
                        min={new Date().toISOString().split('T')[0]}
                      />
                      <div className="text-xs text-secondary-600 mt-1">
                        Date when the invoice will be created
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor="linking-deadline-date">Payment Deadline</Label>
                      <Input
                        id="linking-deadline-date"
                        type="date"
                        value={linkingDeadlineDate}
                        onChange={(e) => setLinkingDeadlineDate(e.target.value)}
                        required
                        min={linkingInvoiceDate || new Date().toISOString().split('T')[0]}
                      />
                      <div className="text-xs text-secondary-600 mt-1">
                        Payment must be made by this date
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <Label>Invoice Generation</Label>
                    <div className="space-y-2 mt-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          value="immediate"
                          checked={linkingInvoiceGeneration === 'immediate'}
                          onChange={(e) => setLinkingInvoiceGeneration(e.target.value as 'immediate' | 'scheduled')}
                          className="form-radio text-primary-600"
                        />
                        <span className="text-sm">Create invoice immediately</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          value="scheduled"
                          checked={linkingInvoiceGeneration === 'scheduled'}
                          onChange={(e) => setLinkingInvoiceGeneration(e.target.value as 'immediate' | 'scheduled')}
                          className="form-radio text-primary-600"
                        />
                        <span className="text-sm">
                          {selectedProductId && availableProducts.find(p => p.id === selectedProductId)?.productType === 'recurring'
                            ? 'Wait for next billing cycle' 
                            : 'Wait until invoice date'}
                        </span>
                      </label>
                    </div>
                    <div className="text-xs text-secondary-600 mt-2">
                      {linkingInvoiceGeneration === 'immediate' 
                        ? 'A debit receipt will be created immediately for this product.'
                        : selectedProductId && availableProducts.find(p => p.id === selectedProductId)?.productType === 'recurring'
                        ? `Receipt will be created at the end of the billing cycle.`
                        : 'Receipt will be created on the invoice date specified above.'}
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-3 pt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseLinkProductModal}
                    disabled={linkingProduct}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSubmitProductLink}
                    disabled={linkingProduct || !selectedProductId || availableProducts.length === 0}
                  >
                    {linkingProduct && (
                      <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    {linkingProduct ? 'Linking Product...' : 'Link Product'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default PlayerDetails;