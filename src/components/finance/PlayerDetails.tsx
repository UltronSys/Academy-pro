import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Input, Label, Toast, Badge, DataTable } from '../ui';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { getPlayerById, updatePlayer, assignProductToPlayer, removeProductFromPlayer } from '../../services/playerService';
import { getUserById } from '../../services/userService';
import { getReceiptsByUser, updateReceipt, updateDebitReceipt, deleteDebitReceiptWithCreditConversion } from '../../services/receiptService';
import { getProductsByOrganization } from '../../services/productService';
import { getSettingsByOrganization } from '../../services/settingsService';
import { Player, User, Receipt, Product } from '../../types';
import { Timestamp, doc } from 'firebase/firestore';
import { db } from '../../firebase';

interface GroupedReceipts {
  [key: string]: Receipt[];
}

const PlayerDetails: React.FC = () => {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const { selectedOrganization } = useApp();
  const { currentUser } = useAuth();
  const { canWrite } = usePermissions();
  
  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState<Player | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [guardians, setGuardians] = useState<User[]>([]);
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
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');

  // Discount states
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountProductId, setDiscountProductId] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [discountReason, setDiscountReason] = useState<string>('');
  const [savingDiscount, setSavingDiscount] = useState(false);

  // Invoice edit/delete states
  const [editInvoiceModalOpen, setEditInvoiceModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Receipt | null>(null);
  const [editInvoiceForm, setEditInvoiceForm] = useState({
    productName: '',
    amount: 0,
    invoiceDate: '',
    deadline: ''
  });
  const [editInvoiceLoading, setEditInvoiceLoading] = useState(false);

  const [deleteInvoiceModalOpen, setDeleteInvoiceModalOpen] = useState(false);
  const [deletingInvoice, setDeletingInvoice] = useState<Receipt | null>(null);
  const [deleteInvoiceLoading, setDeleteInvoiceLoading] = useState(false);

  useEffect(() => {
    if (playerId && selectedOrganization?.id) {
      loadPlayerDetails();
    }
  }, [playerId, selectedOrganization]); // eslint-disable-line react-hooks/exhaustive-deps

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


      // Load receipts
      const receiptsData = await getReceiptsByUser(playerData.userId);
      
      // Separate debit and credit receipts
      const debits = receiptsData.filter(r => r.type === 'debit');
      const credits = receiptsData.filter(r => r.type === 'credit');
      
      
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
    setProductSearchQuery('');
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

  const handleOpenDiscountModal = (productId: string) => {
    const assignedProduct = player?.assignedProducts?.find(ap => ap.productId === productId);
    if (assignedProduct?.discount) {
      // If discount already exists, pre-fill the form
      setDiscountType(assignedProduct.discount.type);
      setDiscountValue(assignedProduct.discount.value.toString());
      setDiscountReason(assignedProduct.discount.reason || '');
    } else {
      // Reset form for new discount
      setDiscountType('percentage');
      setDiscountValue('');
      setDiscountReason('');
    }
    setDiscountProductId(productId);
    setShowDiscountModal(true);
  };

  const handleCloseDiscountModal = () => {
    setShowDiscountModal(false);
    setDiscountProductId(null);
    setDiscountType('percentage');
    setDiscountValue('');
    setDiscountReason('');
  };

  const handleSaveDiscount = async () => {
    if (!player || !discountProductId || !canWrite('finance')) return;

    const numericValue = parseFloat(discountValue);
    if (isNaN(numericValue) || numericValue < 0) {
      showToast('Please enter a valid discount value', 'error');
      return;
    }

    // Validate percentage is between 0 and 100
    if (discountType === 'percentage' && numericValue > 100) {
      showToast('Percentage discount cannot exceed 100%', 'error');
      return;
    }

    // Validate fixed discount doesn't exceed product price
    const assignedProduct = player.assignedProducts?.find(ap => ap.productId === discountProductId);
    if (discountType === 'fixed' && assignedProduct && numericValue > assignedProduct.price) {
      showToast('Fixed discount cannot exceed product price', 'error');
      return;
    }

    try {
      setSavingDiscount(true);

      // Update the assigned product with discount
      const updatedProducts = player.assignedProducts?.map(ap => {
        // Clean any undefined values from the original object first
        const cleanedAp = Object.fromEntries(
          Object.entries(ap).filter(([_, v]) => v !== undefined)
        ) as typeof ap;

        if (cleanedAp.productId === discountProductId) {
          if (numericValue > 0) {
            // Create discount object, only include reason if it has a value
            const discountObj: { type: 'percentage' | 'fixed'; value: number; reason?: string } = {
              type: discountType,
              value: numericValue
            };
            if (discountReason.trim()) {
              discountObj.reason = discountReason.trim();
            }
            return {
              ...cleanedAp,
              discount: discountObj
            };
          } else {
            // Remove discount if value is 0 - need to explicitly delete the field
            const { discount, ...rest } = cleanedAp;
            return rest;
          }
        }
        return cleanedAp;
      });

      // Update player in database
      await updatePlayer(player.id, {
        assignedProducts: updatedProducts
      });

      // Update unpaid debit receipts for this product with the new discounted price
      if (assignedProduct) {
        try {
          const receipts = await getReceiptsByUser(player.userId);
          const unpaidProductReceipts = receipts.filter(r =>
            r.type === 'debit' &&
            r.status === 'active' && // Only update unpaid receipts
            r.organizationId === selectedOrganization?.id &&
            r.product?.productRef?.id === discountProductId
          );

          // Calculate the new price
          const originalPrice = assignedProduct.price;
          let newPrice = originalPrice;
          if (numericValue > 0) {
            if (discountType === 'percentage') {
              newPrice = originalPrice - (originalPrice * numericValue / 100);
            } else {
              newPrice = originalPrice - numericValue;
            }
          }

          // Update each unpaid receipt
          for (const receipt of unpaidProductReceipts) {
            await updateReceipt(player.userId, receipt.id, {
              amount: newPrice,
              product: {
                ...receipt.product!,
                price: newPrice
              }
            });
          }

          if (unpaidProductReceipts.length > 0) {
            console.log(`Updated ${unpaidProductReceipts.length} unpaid receipt(s) with new discounted price: ${newPrice}`);
          }
        } catch (receiptError) {
          console.error('Error updating receipts with discount:', receiptError);
          // Don't fail the whole operation if receipt update fails
        }
      }

      // Update local state
      setPlayer({
        ...player,
        assignedProducts: updatedProducts
      });

      // Reload receipts to reflect the updated amounts
      await loadPlayerDetails();

      handleCloseDiscountModal();
      showToast(numericValue > 0 ? 'Discount applied successfully' : 'Discount removed successfully', 'success');

    } catch (error) {
      console.error('Error saving discount:', error);
      showToast('Failed to save discount', 'error');
    } finally {
      setSavingDiscount(false);
    }
  };

  const handleRemoveDiscount = async (productId: string) => {
    if (!player || !canWrite('finance')) return;

    const confirmed = window.confirm('Are you sure you want to remove the discount from this product?');
    if (!confirmed) return;

    try {
      setSavingDiscount(true);

      // Update the assigned product to remove discount
      const updatedProducts = player.assignedProducts?.map(ap => {
        // Clean any undefined values from the original object first
        const cleanedAp = Object.fromEntries(
          Object.entries(ap).filter(([_, v]) => v !== undefined)
        ) as typeof ap;

        if (cleanedAp.productId === productId) {
          const { discount, ...rest } = cleanedAp;
          return rest;
        }
        return cleanedAp;
      });

      // Update player in database
      await updatePlayer(player.id, {
        assignedProducts: updatedProducts
      });

      // Restore original prices on unpaid debit receipts for this product
      const assignedProduct = player.assignedProducts?.find(ap => ap.productId === productId);
      if (assignedProduct) {
        try {
          const receipts = await getReceiptsByUser(player.userId);
          const unpaidProductReceipts = receipts.filter(r =>
            r.type === 'debit' &&
            r.status === 'active' && // Only update unpaid receipts
            r.organizationId === selectedOrganization?.id &&
            r.product?.productRef?.id === productId
          );

          // Restore to original price (without discount)
          const originalPrice = assignedProduct.price;

          // Update each unpaid receipt
          for (const receipt of unpaidProductReceipts) {
            await updateReceipt(player.userId, receipt.id, {
              amount: originalPrice,
              product: {
                ...receipt.product!,
                price: originalPrice
              }
            });
          }

          if (unpaidProductReceipts.length > 0) {
            console.log(`Restored ${unpaidProductReceipts.length} unpaid receipt(s) to original price: ${originalPrice}`);
          }
        } catch (receiptError) {
          console.error('Error restoring receipt prices:', receiptError);
          // Don't fail the whole operation if receipt update fails
        }
      }

      // Update local state
      setPlayer({
        ...player,
        assignedProducts: updatedProducts
      });

      // Reload receipts to reflect the updated amounts
      await loadPlayerDetails();

      showToast('Discount removed successfully', 'success');

    } catch (error) {
      console.error('Error removing discount:', error);
      showToast('Failed to remove discount', 'error');
    } finally {
      setSavingDiscount(false);
    }
  };

  // Helper function to calculate discounted price
  const getDiscountedPrice = (price: number, discount?: { type: 'percentage' | 'fixed'; value: number }) => {
    if (!discount) return price;
    if (discount.type === 'percentage') {
      return price - (price * discount.value / 100);
    }
    return price - discount.value;
  };

  // Helper function to format discount display
  const formatDiscount = (discount: { type: 'percentage' | 'fixed'; value: number }) => {
    if (discount.type === 'percentage') {
      return `${discount.value}%`;
    }
    return `${currency} ${discount.value.toFixed(2)}`;
  };

  // Invoice edit handlers
  const handleEditInvoiceClick = (receipt: Receipt) => {
    if (receipt.type !== 'debit') {
      showToast('Only invoices can be edited', 'error');
      return;
    }
    setEditingInvoice(receipt);
    setEditInvoiceForm({
      productName: receipt.product?.name || '',
      amount: receipt.amount,
      invoiceDate: receipt.product?.invoiceDate
        ? receipt.product.invoiceDate.toDate().toISOString().split('T')[0]
        : '',
      deadline: receipt.product?.deadline
        ? receipt.product.deadline.toDate().toISOString().split('T')[0]
        : ''
    });
    setEditInvoiceModalOpen(true);
  };

  const handleEditInvoiceSubmit = async () => {
    if (!editingInvoice || !player || !currentUser) return;

    try {
      setEditInvoiceLoading(true);

      await updateDebitReceipt(player.userId, editingInvoice.id, {
        productName: editInvoiceForm.productName,
        amount: editInvoiceForm.amount,
        invoiceDate: editInvoiceForm.invoiceDate ? new Date(editInvoiceForm.invoiceDate) : undefined,
        deadline: editInvoiceForm.deadline ? new Date(editInvoiceForm.deadline) : undefined
      });

      showToast('Invoice updated successfully', 'success');
      setEditInvoiceModalOpen(false);
      setEditingInvoice(null);
      await loadPlayerDetails();
    } catch (error: any) {
      console.error('Error updating invoice:', error);
      showToast(error.message || 'Failed to update invoice', 'error');
    } finally {
      setEditInvoiceLoading(false);
    }
  };

  // Invoice delete handlers
  const handleDeleteInvoiceClick = (receipt: Receipt) => {
    if (receipt.type !== 'debit') {
      showToast('Only invoices can be deleted', 'error');
      return;
    }
    setDeletingInvoice(receipt);
    setDeleteInvoiceModalOpen(true);
  };

  const handleDeleteInvoiceConfirm = async () => {
    if (!deletingInvoice || !player || !currentUser) return;

    try {
      setDeleteInvoiceLoading(true);
      const userRef = doc(db, 'users', currentUser.uid);

      const result = await deleteDebitReceiptWithCreditConversion(
        player.userId,
        deletingInvoice.id,
        { name: currentUser.displayName || currentUser.email || 'Unknown', userRef }
      );

      if (result.convertedCredits > 0) {
        showToast(
          `Invoice deleted. ${currency} ${result.convertedCredits.toFixed(2)} converted to available credit.`,
          'success'
        );
      } else {
        showToast('Invoice deleted successfully', 'success');
      }

      setDeleteInvoiceModalOpen(false);
      setDeletingInvoice(null);
      await loadPlayerDetails();
    } catch (error: any) {
      console.error('Error deleting invoice:', error);
      showToast(error.message || 'Failed to delete invoice', 'error');
    } finally {
      setDeleteInvoiceLoading(false);
    }
  };

  // Check if invoice has linked payments
  const invoiceHasLinkedPayments = (receipt: Receipt): boolean => {
    return receipt.type === 'debit' &&
      receipt.siblingReceiptRefs &&
      receipt.siblingReceiptRefs.length > 0;
  };

  const invoiceColumns = [
    {
      key: 'date',
      header: 'Invoice Date',
      render: (receipt: Receipt) => (
        <div className={`text-sm ${receipt.status === 'deleted' ? 'line-through text-secondary-400' : ''}`}>
          {receipt.createdAt?.toDate().toLocaleDateString() || 'N/A'}
        </div>
      )
    },
    {
      key: 'product',
      header: 'Product/Service',
      render: (receipt: Receipt) => (
        <div>
          <div className={`font-medium ${receipt.status === 'deleted' ? 'line-through text-secondary-400' : 'text-secondary-900'}`}>
            {receipt.product?.name || receipt.description || 'N/A'}
          </div>
          {receipt.product?.deadline && (
            <div className={`text-xs ${receipt.status === 'deleted' ? 'line-through text-secondary-300' : 'text-secondary-600'}`}>
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
        <div className={`font-medium ${receipt.status === 'deleted' ? 'line-through text-secondary-400' : 'text-error-600'}`}>
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
            case 'deleted':
              return 'secondary';
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
            case 'deleted':
              return 'DELETED';
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
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (receipt: Receipt) => (
        <div className="flex gap-1">
          {receipt.status !== 'deleted' && canWrite('finance') && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEditInvoiceClick(receipt)}
                className="text-xs px-2 py-1"
              >
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeleteInvoiceClick(receipt)}
                className="text-xs px-2 py-1 text-error-600 hover:text-error-700 border-error-300 hover:border-error-400"
              >
                Delete
              </Button>
            </>
          )}
        </div>
      )
    }
  ];

  const paymentColumns = [
    {
      key: 'date',
      header: 'Payment Date',
      render: (receipt: Receipt) => (
        <div className={`text-sm ${receipt.status === 'deleted' ? 'line-through text-secondary-400' : ''}`}>
          {receipt.createdAt?.toDate().toLocaleDateString() || 'N/A'}
        </div>
      )
    },
    {
      key: 'description',
      header: 'Description',
      render: (receipt: Receipt) => (
        <div>
          <div className={`font-medium ${receipt.status === 'deleted' ? 'line-through text-secondary-400' : 'text-secondary-900'}`}>
            {receipt.description || receipt.product?.name || 'Payment'}
          </div>
          {/* Add context for payment types */}
          <div className={`text-xs mt-1 ${receipt.status === 'deleted' ? 'line-through text-secondary-300' : 'text-secondary-500'}`}>
            {(() => {
              if (receipt.status === 'deleted') {
                return '🗑️ This payment was deleted';
              }
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
        <div className={`font-medium ${receipt.status === 'deleted' ? 'line-through text-secondary-400' : 'text-success-600'}`}>
          {currency} {receipt.amount.toFixed(2)}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (receipt: Receipt) => {
        // Override status display for deleted receipts
        if (receipt.status === 'deleted') {
          return (
            <Badge variant="secondary">
              DELETED
            </Badge>
          );
        }
        return (
          <Badge variant={getPaymentStatusColor(receipt)}>
            {getPaymentStatusText(receipt)}
          </Badge>
        );
      }
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
                
                const discountedPrice = getDiscountedPrice(assignedProduct.price, assignedProduct.discount);
                const hasDiscount = assignedProduct.discount && assignedProduct.discount.value > 0;

                return (
                  <div key={assignedProduct.productId} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium text-secondary-900">{assignedProduct.productName}</div>
                        <div className="text-sm text-secondary-600">
                          {hasDiscount ? (
                            <div className="flex items-center gap-2">
                              <span className="line-through text-secondary-400">
                                {currency} {assignedProduct.price.toFixed(2)}
                              </span>
                              <span className="text-success-600 font-medium">
                                {currency} {discountedPrice.toFixed(2)}
                              </span>
                              <Badge variant="success" className="text-xs">
                                -{formatDiscount(assignedProduct.discount!)}
                              </Badge>
                            </div>
                          ) : (
                            <span>Price: {currency} {assignedProduct.price.toFixed(2)}</span>
                          )}
                        </div>
                        {hasDiscount && assignedProduct.discount?.reason && (
                          <div className="text-xs text-secondary-500 mt-1">
                            Discount reason: {assignedProduct.discount.reason}
                          </div>
                        )}

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
                                  onClick={() => handleOpenDiscountModal(assignedProduct.productId)}
                                  className="text-primary-600 hover:text-primary-700 border-primary-300 hover:border-primary-400"
                                >
                                  {hasDiscount ? 'Edit Discount' : 'Add Discount'}
                                </Button>
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
          <div className="w-full max-w-3xl my-8">
            <Card className="w-full">
              <div className="p-6 max-h-[85vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-semibold text-secondary-900">
                      Link Product to {user?.name}
                    </h3>
                    <p className="text-sm text-secondary-500 mt-1">
                      Select a product to assign to this player
                    </p>
                  </div>
                  <button
                    onClick={handleCloseLinkProductModal}
                    disabled={linkingProduct}
                    className="p-2 hover:bg-secondary-100 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5 text-secondary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Search Bar */}
                <div className="relative mb-4">
                  <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-secondary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={productSearchQuery}
                    onChange={(e) => setProductSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>

                {/* Product Cards Grid */}
                {availableProducts.length === 0 ? (
                  <div className="text-center py-12 bg-secondary-50 rounded-lg">
                    <svg className="w-12 h-12 text-secondary-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <p className="text-secondary-600 font-medium">No products available</p>
                    <p className="text-sm text-secondary-500 mt-1">All products are already assigned to this player</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 max-h-[280px] overflow-y-auto pr-1">
                    {availableProducts
                      .filter(product =>
                        productSearchQuery === '' ||
                        product.name.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
                        product.description?.toLowerCase().includes(productSearchQuery.toLowerCase())
                      )
                      .map(product => {
                        const isSelected = selectedProductId === product.id;
                        return (
                          <div
                            key={product.id}
                            onClick={() => setSelectedProductId(product.id)}
                            className={`
                              relative p-4 rounded-lg border-2 cursor-pointer transition-all
                              ${isSelected
                                ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                                : 'border-secondary-200 hover:border-secondary-300 hover:bg-secondary-50'
                              }
                            `}
                          >
                            {/* Selected checkmark */}
                            {isSelected && (
                              <div className="absolute top-2 right-2 w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}

                            {/* Product info */}
                            <div className="flex items-start justify-between pr-6">
                              <div className="flex-1 min-w-0">
                                <h4 className={`font-medium truncate ${isSelected ? 'text-primary-900' : 'text-secondary-900'}`}>
                                  {product.name}
                                </h4>
                                {product.description && (
                                  <p className="text-sm text-secondary-500 mt-0.5 line-clamp-2">
                                    {product.description}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Price and type */}
                            <div className="flex items-center justify-between mt-3">
                              <span className={`text-lg font-semibold ${isSelected ? 'text-primary-700' : 'text-secondary-900'}`}>
                                {currency} {product.price.toFixed(2)}
                              </span>
                              <Badge variant={product.productType === 'recurring' ? 'primary' : 'default'}>
                                {product.productType === 'recurring' ? (
                                  <span className="flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Recurring
                                  </span>
                                ) : 'One-time'}
                              </Badge>
                            </div>

                            {/* Recurring duration info */}
                            {product.productType === 'recurring' && product.recurringDuration && (
                              <p className="text-xs text-secondary-500 mt-2">
                                Billed every {product.recurringDuration.value} {product.recurringDuration.unit}
                              </p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Selected Product Configuration */}
                {selectedProductId && (
                  <div className="border-t border-secondary-200 pt-5 mt-2">
                    <h4 className="text-sm font-medium text-secondary-700 mb-4">Configure Invoice Settings</h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        <p className="text-xs text-secondary-500 mt-1">
                          When the invoice will be created
                        </p>
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
                        <p className="text-xs text-secondary-500 mt-1">
                          Payment must be made by this date
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <Label>Invoice Generation</Label>
                      <div className="flex flex-wrap gap-3 mt-2">
                        <label className={`
                          flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 cursor-pointer transition-all
                          ${linkingInvoiceGeneration === 'immediate'
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-secondary-200 hover:border-secondary-300'
                          }
                        `}>
                          <input
                            type="radio"
                            value="immediate"
                            checked={linkingInvoiceGeneration === 'immediate'}
                            onChange={(e) => setLinkingInvoiceGeneration(e.target.value as 'immediate' | 'scheduled')}
                            className="sr-only"
                          />
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span className="text-sm font-medium">Create immediately</span>
                        </label>
                        <label className={`
                          flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 cursor-pointer transition-all
                          ${linkingInvoiceGeneration === 'scheduled'
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-secondary-200 hover:border-secondary-300'
                          }
                        `}>
                          <input
                            type="radio"
                            value="scheduled"
                            checked={linkingInvoiceGeneration === 'scheduled'}
                            onChange={(e) => setLinkingInvoiceGeneration(e.target.value as 'immediate' | 'scheduled')}
                            className="sr-only"
                          />
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-sm font-medium">Schedule for later</span>
                        </label>
                      </div>
                      <p className="text-xs text-secondary-500 mt-2">
                        {linkingInvoiceGeneration === 'immediate'
                          ? 'A debit receipt will be created immediately for this product.'
                          : availableProducts.find(p => p.id === selectedProductId)?.productType === 'recurring'
                          ? 'Receipt will be created at the start of the billing cycle.'
                          : 'Receipt will be created on the invoice date.'}
                      </p>
                    </div>

                    {/* Summary */}
                    {(() => {
                      const selectedProduct = availableProducts.find(p => p.id === selectedProductId);
                      if (!selectedProduct) return null;
                      return (
                        <div className="mt-5 p-4 bg-secondary-50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-secondary-600">Amount to be invoiced:</span>
                            <span className="text-lg font-bold text-secondary-900">
                              {currency} {selectedProduct.price.toFixed(2)}
                            </span>
                          </div>
                          {linkingInvoiceGeneration === 'immediate' && (
                            <p className="text-xs text-primary-600 mt-2 flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Invoice will be created once you confirm
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Footer Actions */}
                <div className="flex justify-end gap-3 pt-6 mt-4 border-t border-secondary-200">
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
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    {linkingProduct ? 'Linking...' : 'Link Product'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {showDiscountModal && discountProductId && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingDiscount) {
              handleCloseDiscountModal();
            }
          }}
        >
          <div className="w-full max-w-md">
            <Card className="w-full">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-secondary-900 mb-4">
                  {player?.assignedProducts?.find(ap => ap.productId === discountProductId)?.discount
                    ? 'Edit Discount'
                    : 'Add Discount'}
                </h3>

                {(() => {
                  const selectedProduct = player?.assignedProducts?.find(ap => ap.productId === discountProductId);
                  if (!selectedProduct) return null;

                  return (
                    <div className="space-y-4">
                      {/* Product Info */}
                      <div className="bg-secondary-50 rounded-lg p-3">
                        <div className="font-medium text-secondary-900">{selectedProduct.productName}</div>
                        <div className="text-sm text-secondary-600">Original Price: {currency} {selectedProduct.price.toFixed(2)}</div>
                      </div>

                      {/* Discount Type */}
                      <div>
                        <Label>Discount Type</Label>
                        <div className="flex gap-4 mt-2">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name="discountType"
                              value="percentage"
                              checked={discountType === 'percentage'}
                              onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
                              className="form-radio text-primary-600"
                            />
                            <span className="text-sm">Percentage (%)</span>
                          </label>
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name="discountType"
                              value="fixed"
                              checked={discountType === 'fixed'}
                              onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
                              className="form-radio text-primary-600"
                            />
                            <span className="text-sm">Fixed Amount ({currency})</span>
                          </label>
                        </div>
                      </div>

                      {/* Discount Value */}
                      <div>
                        <Label htmlFor="discount-value">
                          Discount Value {discountType === 'percentage' ? '(%)' : `(${currency})`}
                        </Label>
                        <Input
                          id="discount-value"
                          type="number"
                          min="0"
                          max={discountType === 'percentage' ? '100' : selectedProduct.price.toString()}
                          step={discountType === 'percentage' ? '1' : '0.01'}
                          value={discountValue}
                          onChange={(e) => setDiscountValue(e.target.value)}
                          placeholder={discountType === 'percentage' ? 'e.g., 10' : 'e.g., 50.00'}
                          className="mt-1"
                        />
                        {discountValue && parseFloat(discountValue) > 0 && (
                          <div className="text-sm text-success-600 mt-1">
                            Final price: {currency} {getDiscountedPrice(selectedProduct.price, { type: discountType, value: parseFloat(discountValue) || 0 }).toFixed(2)}
                          </div>
                        )}
                      </div>

                      {/* Discount Reason */}
                      <div>
                        <Label htmlFor="discount-reason">Reason (Optional)</Label>
                        <Input
                          id="discount-reason"
                          type="text"
                          value={discountReason}
                          onChange={(e) => setDiscountReason(e.target.value)}
                          placeholder="e.g., Early bird discount, Family member"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  );
                })()}

                <div className="flex justify-between pt-6">
                  <div>
                    {player?.assignedProducts?.find(ap => ap.productId === discountProductId)?.discount && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          handleCloseDiscountModal();
                          handleRemoveDiscount(discountProductId);
                        }}
                        disabled={savingDiscount}
                        className="text-error-600 hover:text-error-700 border-error-300 hover:border-error-400"
                      >
                        Remove Discount
                      </Button>
                    )}
                  </div>
                  <div className="flex space-x-3">
                    <Button
                      variant="outline"
                      onClick={handleCloseDiscountModal}
                      disabled={savingDiscount}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveDiscount}
                      disabled={savingDiscount || !discountValue || parseFloat(discountValue) < 0}
                    >
                      {savingDiscount && (
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                      {savingDiscount ? 'Saving...' : 'Save Discount'}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Edit Invoice Modal */}
      {editInvoiceModalOpen && editingInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md">
            <Card className="w-full">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-secondary-900 mb-4">Edit Invoice</h3>
                <div className="space-y-4">
                  <Input
                    label="Product/Service Name"
                    value={editInvoiceForm.productName}
                    onChange={(e) => setEditInvoiceForm({ ...editInvoiceForm, productName: e.target.value })}
                  />
                  <Input
                    label={`Amount (${currency})`}
                    type="number"
                    step="0.01"
                    value={editInvoiceForm.amount}
                    onChange={(e) => setEditInvoiceForm({ ...editInvoiceForm, amount: parseFloat(e.target.value) || 0 })}
                  />
                  <Input
                    label="Invoice Date"
                    type="date"
                    value={editInvoiceForm.invoiceDate}
                    onChange={(e) => setEditInvoiceForm({ ...editInvoiceForm, invoiceDate: e.target.value })}
                  />
                  <Input
                    label="Due Date"
                    type="date"
                    value={editInvoiceForm.deadline}
                    onChange={(e) => setEditInvoiceForm({ ...editInvoiceForm, deadline: e.target.value })}
                  />
                  <div className="flex justify-end gap-3 mt-6">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditInvoiceModalOpen(false);
                        setEditingInvoice(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleEditInvoiceSubmit}
                      disabled={editInvoiceLoading}
                    >
                      {editInvoiceLoading ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Delete Invoice Modal */}
      {deleteInvoiceModalOpen && deletingInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md">
            <Card className="w-full">
              <div className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-error-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-error-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-secondary-900">Delete Invoice</h3>
                </div>
                <div className="space-y-4">
                  <p className="text-secondary-700">
                    Are you sure you want to delete this invoice?
                  </p>
                  <div className="bg-secondary-50 p-4 rounded-lg">
                    <p className="font-medium">{deletingInvoice.product?.name || 'Unknown Product'}</p>
                    <p className="text-secondary-600">Amount: {currency} {deletingInvoice.amount.toFixed(2)}</p>
                  </div>
                  {invoiceHasLinkedPayments(deletingInvoice) && (
                    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                      <p className="text-yellow-800 font-medium">This invoice has linked payments</p>
                      <p className="text-yellow-700 text-sm mt-1">
                        The payments will be converted to available credit that can be applied to future invoices.
                      </p>
                    </div>
                  )}
                  <div className="flex justify-end gap-3 mt-6">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setDeleteInvoiceModalOpen(false);
                        setDeletingInvoice(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleDeleteInvoiceConfirm}
                      disabled={deleteInvoiceLoading}
                      className="bg-error-600 hover:bg-error-700 text-white border-error-600"
                    >
                      {deleteInvoiceLoading ? 'Deleting...' : 'Delete Invoice'}
                    </Button>
                  </div>
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