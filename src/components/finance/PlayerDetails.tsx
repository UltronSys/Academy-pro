import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Input, Label, Toast, Badge, DataTable } from '../ui';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { getPlayerById, updatePlayer, assignProductToPlayer, removeProductFromPlayer } from '../../services/playerService';
import { getUserById, recalculateAndUpdateUserOutstandingAndCredits } from '../../services/userService';
import { getReceiptsByUser, updateReceipt, updateDebitReceipt, deleteDebitReceiptWithCreditConversion } from '../../services/receiptService';
import { getProductsByOrganization } from '../../services/productService';
import { getSettingsByOrganization } from '../../services/settingsService';
import { Player, User, Receipt, Product } from '../../types';
import { Timestamp, doc, deleteField } from 'firebase/firestore';
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
  const [linkingDeadlineDays, setLinkingDeadlineDays] = useState<number>(30); // Days after invoice for payment
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

  // Unlink product confirmation modal states
  const [unlinkProductModalOpen, setUnlinkProductModalOpen] = useState(false);
  const [productToUnlink, setProductToUnlink] = useState<{ productId: string; productName: string } | null>(null);

  // Invoice discount modal states
  const [invoiceDiscountModalOpen, setInvoiceDiscountModalOpen] = useState(false);
  const [invoiceToDiscount, setInvoiceToDiscount] = useState<Receipt | null>(null);
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState<string>('');
  const [invoiceDiscountReason, setInvoiceDiscountReason] = useState<string>('');
  const [savingInvoiceDiscount, setSavingInvoiceDiscount] = useState(false);

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
        navigate('/finance?tab=2');
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

      // Recalculate and sync user balance to ensure it's up-to-date
      try {
        await recalculateAndUpdateUserOutstandingAndCredits(playerData.userId, selectedOrganization.id);
        // Reload user to get updated balance
        const updatedUser = await getUserById(playerData.userId);
        if (updatedUser) {
          setUser(updatedUser);
        }
      } catch (balanceError) {
        console.error('Error recalculating user balance:', balanceError);
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

    // Helper to get the relevant date for a receipt
    const getReceiptDate = (receipt: Receipt): Date => {
      if (receipt.type === 'debit' && receipt.product?.invoiceDate) {
        return receipt.product.invoiceDate.toDate();
      } else if (receipt.type === 'credit' && receipt.paymentDate) {
        return receipt.paymentDate.toDate();
      }
      return receipt.createdAt?.toDate() || new Date();
    };

    receipts.forEach(receipt => {
      const date = getReceiptDate(receipt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(receipt);
    });

    // Sort receipts within each month by date (newest first)
    Object.keys(grouped).forEach(month => {
      grouped[month].sort((a, b) => {
        const dateA = getReceiptDate(a).getTime();
        const dateB = getReceiptDate(b).getTime();
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

  const handleSaveProductDates = async (productId: string, _invoiceDate: string, deadlineDate: string) => {
    if (!player || !canWrite('finance')) return;

    try {
      setUpdatingProduct(true);

      // Validate deadline date is not in the past
      const deadlineDateObj = new Date(deadlineDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (deadlineDateObj < today) {
        showToast('Deadline date cannot be in the past', 'error');
        return;
      }

      // Update only the deadline date (invoice date is not editable)
      const updatedProducts = player.assignedProducts?.map(ap => {
        if (ap.productId === productId) {
          return {
            ...ap,
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
      showToast('Deadline date updated successfully', 'success');

    } catch (error) {
      console.error('Error updating deadline date:', error);
      showToast('Failed to update deadline date', 'error');
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
      
      // Filter out products that are already actively assigned to this player
      // (cancelled/unlinked products should be available for re-linking)
      const activeAssignedProductIds = player?.assignedProducts
        ?.filter(ap => ap.status === 'active')
        .map(ap => ap.productId) || [];
      const unassignedProducts = allProducts.filter(product =>
        !activeAssignedProductIds.includes(product.id) && product.isActive
      );
      
      setAvailableProducts(unassignedProducts);
      
      // Set default dates
      const today = new Date();
      const defaultDeadline = new Date();
      defaultDeadline.setDate(today.getDate() + 30); // Default 30 days for deadline
      
      setLinkingInvoiceDate(today.toISOString().split('T')[0]);
      setLinkingDeadlineDate(defaultDeadline.toISOString().split('T')[0]);
      setLinkingDeadlineDays(30);
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
    setLinkingDeadlineDays(30);
    setLinkingInvoiceGeneration('immediate');
    setProductSearchQuery('');
  };

  const handleSubmitProductLink = async () => {
    if (!player || !selectedProductId || !selectedOrganization?.id) return;

    const selectedProduct = availableProducts.find(p => p.id === selectedProductId);
    if (!selectedProduct) {
      showToast('Please select a product', 'error');
      return;
    }

    const isRecurringProduct = selectedProduct.productType === 'recurring';

    // Validate inputs based on product type and generation option
    let invoiceDateObj: Date;
    let deadlineDateObj: Date;
    let effectiveInvoiceGeneration: 'immediate' | 'scheduled' = linkingInvoiceGeneration;

    // All products now use date picker + deadline days
    if (!linkingInvoiceDate) {
      showToast('Please select the invoice date', 'error');
      return;
    }
    invoiceDateObj = new Date(linkingInvoiceDate);
    invoiceDateObj.setHours(0, 0, 0, 0);
    deadlineDateObj = new Date(invoiceDateObj);
    deadlineDateObj.setDate(deadlineDateObj.getDate() + linkingDeadlineDays);

    // If the selected date is today or in the past, treat as immediate
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    effectiveInvoiceGeneration = invoiceDateObj <= today ? 'immediate' : 'scheduled';

    try {
      setLinkingProduct(true);

      // Get the day of the month from the selected invoice date
      const invoiceDayNumber = invoiceDateObj.getDate();

      // Assign product to player
      await assignProductToPlayer(
        player.id,
        selectedProduct,
        selectedOrganization.id,
        selectedProduct.academyId,
        invoiceDateObj,
        deadlineDateObj,
        effectiveInvoiceGeneration,
        invoiceDayNumber,
        linkingDeadlineDays
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

  const handleUnlinkProduct = (productId: string, productName: string) => {
    if (!player || !canWrite('finance')) return;

    // Show confirmation modal
    setProductToUnlink({ productId, productName });
    setUnlinkProductModalOpen(true);
  };

  const handleUnlinkProductConfirm = async () => {
    if (!player || !productToUnlink) return;

    try {
      setUnlinkingProductId(productToUnlink.productId);

      // Remove product from player
      await removeProductFromPlayer(player.id, productToUnlink.productId);

      showToast(`Product "${productToUnlink.productName}" unlinked successfully!`, 'success');

      // Close modal and reset state
      setUnlinkProductModalOpen(false);
      setProductToUnlink(null);

      // Reload player details to show the updated products list
      await loadPlayerDetails();

    } catch (error) {
      console.error('Error unlinking product:', error);
      showToast('Failed to unlink product. Please try again.', 'error');
    } finally {
      setUnlinkingProductId(null);
    }
  };

  const handleCloseUnlinkProductModal = () => {
    if (unlinkingProductId) return; // Don't allow closing while unlinking
    setUnlinkProductModalOpen(false);
    setProductToUnlink(null);
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

      // Note: Discounts only apply to NEW receipts going forward
      // Existing receipts can be discounted individually via the invoice table

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

      // Note: Removing discount only affects NEW receipts going forward
      // Existing receipts keep their current amounts

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

  // Invoice discount handlers
  const handleOpenInvoiceDiscountModal = (receipt: Receipt) => {
    if (receipt.type !== 'debit' || receipt.status !== 'active') {
      showToast('Only unpaid invoices can be discounted', 'error');
      return;
    }
    setInvoiceToDiscount(receipt);
    setInvoiceDiscountType('percentage');
    setInvoiceDiscountValue('');
    setInvoiceDiscountReason('');
    setInvoiceDiscountModalOpen(true);
  };

  const handleCloseInvoiceDiscountModal = () => {
    if (savingInvoiceDiscount) return;
    setInvoiceDiscountModalOpen(false);
    setInvoiceToDiscount(null);
    setInvoiceDiscountType('percentage');
    setInvoiceDiscountValue('');
    setInvoiceDiscountReason('');
  };

  const handleSaveInvoiceDiscount = async () => {
    if (!invoiceToDiscount || !player) return;

    const numericValue = parseFloat(invoiceDiscountValue);
    if (isNaN(numericValue) || numericValue <= 0) {
      showToast('Please enter a valid discount value', 'error');
      return;
    }

    const originalAmount = invoiceToDiscount.amount;

    // Validate percentage is between 0 and 100
    if (invoiceDiscountType === 'percentage' && numericValue > 100) {
      showToast('Percentage discount cannot exceed 100%', 'error');
      return;
    }

    // Validate fixed discount doesn't exceed invoice amount
    if (invoiceDiscountType === 'fixed' && numericValue > originalAmount) {
      showToast('Discount cannot exceed invoice amount', 'error');
      return;
    }

    try {
      setSavingInvoiceDiscount(true);

      // Calculate the new price
      let newAmount = originalAmount;
      if (invoiceDiscountType === 'percentage') {
        newAmount = originalAmount - (originalAmount * numericValue / 100);
      } else {
        newAmount = originalAmount - numericValue;
      }

      // Build description with discount info
      const discountInfo = invoiceDiscountType === 'percentage'
        ? `${numericValue}% discount`
        : `${currency} ${numericValue.toFixed(2)} discount`;
      const reasonText = invoiceDiscountReason.trim() ? ` (${invoiceDiscountReason.trim()})` : '';

      // Update the receipt with the discounted amount
      await updateReceipt(player.userId, invoiceToDiscount.id, {
        amount: newAmount,
        product: invoiceToDiscount.product ? {
          ...invoiceToDiscount.product,
          price: newAmount,
          originalPrice: invoiceToDiscount.product.originalPrice || originalAmount,
          discountApplied: discountInfo + reasonText
        } : undefined
      });

      showToast(`Discount applied successfully! New amount: ${currency} ${newAmount.toFixed(2)}`, 'success');
      handleCloseInvoiceDiscountModal();
      await loadPlayerDetails();

    } catch (error) {
      console.error('Error applying invoice discount:', error);
      showToast('Failed to apply discount', 'error');
    } finally {
      setSavingInvoiceDiscount(false);
    }
  };

  // Calculate discounted amount for preview
  const getInvoiceDiscountedAmount = () => {
    if (!invoiceToDiscount || !invoiceDiscountValue) return null;
    const numericValue = parseFloat(invoiceDiscountValue);
    if (isNaN(numericValue) || numericValue <= 0) return null;

    const originalAmount = invoiceToDiscount.amount;
    if (invoiceDiscountType === 'percentage') {
      return originalAmount - (originalAmount * numericValue / 100);
    }
    return originalAmount - numericValue;
  };

  const handleRemoveInvoiceDiscount = async () => {
    if (!invoiceToDiscount || !player) return;

    // Check if there's a discount to remove
    if (!invoiceToDiscount.product?.originalPrice) {
      showToast('No discount to remove', 'error');
      return;
    }

    try {
      setSavingInvoiceDiscount(true);

      const originalPrice = invoiceToDiscount.product.originalPrice;

      // Build a clean product object without the discount fields
      const cleanProduct: Record<string, any> = {
        productRef: invoiceToDiscount.product.productRef,
        name: invoiceToDiscount.product.name,
        price: originalPrice,
        invoiceDate: invoiceToDiscount.product.invoiceDate,
        deadline: invoiceToDiscount.product.deadline
      };

      // Update the receipt to restore original amount and remove discount info
      // Using deleteField() to properly remove nested fields
      await updateReceipt(player.userId, invoiceToDiscount.id, {
        amount: originalPrice,
        product: cleanProduct,
        'product.originalPrice': deleteField(),
        'product.discountApplied': deleteField()
      } as any);

      showToast(`Discount removed. Amount restored to ${currency} ${originalPrice.toFixed(2)}`, 'success');
      handleCloseInvoiceDiscountModal();
      await loadPlayerDetails();

    } catch (error) {
      console.error('Error removing invoice discount:', error);
      showToast('Failed to remove discount', 'error');
    } finally {
      setSavingInvoiceDiscount(false);
    }
  };

  const invoiceColumns = [
    {
      key: 'date',
      header: 'Invoice Date',
      render: (receipt: Receipt) => (
        <div className={`text-sm ${receipt.status === 'deleted' ? 'line-through text-secondary-400' : ''}`}>
          {receipt.product?.invoiceDate?.toDate().toLocaleDateString() || receipt.createdAt?.toDate().toLocaleDateString() || 'N/A'}
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
        <div>
          {receipt.product?.discountApplied ? (
            <>
              <div className={`font-medium ${receipt.status === 'deleted' ? 'line-through text-secondary-400' : 'text-success-600'}`}>
                {currency} {receipt.amount.toFixed(2)}
              </div>
              {receipt.product.originalPrice && (
                <div className="text-xs text-secondary-400 line-through">
                  {currency} {receipt.product.originalPrice.toFixed(2)}
                </div>
              )}
              <div className="text-xs text-primary-600">
                {receipt.product.discountApplied}
              </div>
            </>
          ) : (
            <div className={`font-medium ${receipt.status === 'deleted' ? 'line-through text-secondary-400' : 'text-error-600'}`}>
              {currency} {receipt.amount.toFixed(2)}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (receipt: Receipt) => {
        // Calculate effective status - handle legacy receipts without status field
        const getEffectiveStatus = (): string => {
          // If status is explicitly set and valid, use it
          if (receipt.status && receipt.status !== 'active') {
            return receipt.status;
          }

          // For debit receipts without explicit status or with 'active' status,
          // check sibling refs to determine if paid
          if (receipt.type === 'debit') {
            const hasSiblings = receipt.siblingReceiptRefs && receipt.siblingReceiptRefs.length > 0;

            if (hasSiblings) {
              // Has payment(s) linked - for legacy data without status,
              // assume it's at least partially paid
              // The exact status (paid vs completed) should have been set by linkSiblingReceipts
              // but for backward compatibility, default to 'paid' if there are siblings
              return receipt.status || 'paid';
            }

            // Check if overdue (past deadline and no payments)
            if (receipt.product?.deadline) {
              const deadline = receipt.product.deadline.toDate();
              if (deadline < new Date()) {
                return 'overdue';
              }
            }

            return 'active'; // Unpaid
          }

          return receipt.status || 'active';
        };

        const effectiveStatus = getEffectiveStatus();

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
          <Badge variant={getStatusColor(effectiveStatus)}>
            {getStatusText(effectiveStatus)}
          </Badge>
        );
      }
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (receipt: Receipt) => {
        // Check if invoice is truly unpaid (no sibling refs = no payments)
        const isUnpaid = receipt.type === 'debit' &&
          (!receipt.siblingReceiptRefs || receipt.siblingReceiptRefs.length === 0) &&
          receipt.status !== 'completed' &&
          receipt.status !== 'paid';

        return (
          <div className="flex gap-1 flex-wrap">
            {receipt.status !== 'deleted' && canWrite('finance') && (
              <>
                {isUnpaid && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenInvoiceDiscountModal(receipt)}
                      className="text-xs px-2 py-1 text-primary-600 hover:text-primary-700 border-primary-300 hover:border-primary-400"
                    >
                      Discount
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditInvoiceClick(receipt)}
                      className="text-xs px-2 py-1"
                    >
                      Edit
                    </Button>
                  </>
                )}
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
        );
      }
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
          onClick={() => navigate('/finance?tab=2')}
          className="mt-4"
        >
          Back to Players
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
            onClick={() => navigate('/finance?tab=2')}
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
                const currentDeadlineDate = assignedProduct.deadlineDate?.toDate().toISOString().split('T')[0] || '';
                
                const discountedPrice = getDiscountedPrice(assignedProduct.price, assignedProduct.discount);
                const hasDiscount = assignedProduct.discount && assignedProduct.discount.value > 0;

                return (
                  <div key={assignedProduct.productId} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-secondary-900">{assignedProduct.productName}</span>
                          {/* Product Type Badge */}
                          <Badge
                            variant={assignedProduct.productType === 'recurring' ? 'primary' : 'secondary'}
                            className="text-xs"
                          >
                            {assignedProduct.productType === 'recurring' ? 'Recurring' : 'One-time'}
                          </Badge>
                          {/* Show recurring duration if available */}
                          {assignedProduct.productType === 'recurring' && assignedProduct.recurringDuration && (
                            <span className="text-xs text-secondary-500">
                              (Every {assignedProduct.recurringDuration.value} {assignedProduct.recurringDuration.unit})
                            </span>
                          )}
                        </div>
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
                          <div className="mt-3 max-w-xs">
                            <div>
                              <Label htmlFor={`deadline-${assignedProduct.productId}`}>Deadline Date</Label>
                              <Input
                                id={`deadline-${assignedProduct.productId}`}
                                type="date"
                                defaultValue={currentDeadlineDate}
                                min={new Date().toISOString().split('T')[0]}
                                className="mt-1"
                              />
                              <p className="text-xs text-secondary-500 mt-1">Cannot be in the past</p>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 text-sm space-y-1">
                            <div className="text-secondary-600">
                              Next Invoice Date: {assignedProduct.invoiceDate?.toDate().toLocaleDateString() || 'Not set'}
                            </div>
                            <div className="text-secondary-600">
                              Next Due Date: {assignedProduct.deadlineDate?.toDate().toLocaleDateString() || 'Not set'}
                            </div>
                            {assignedProduct.receiptStatus === 'scheduled' && !assignedProduct.invoiceDate && (
                              <div className="text-warning-600 text-xs">
                                Receipt scheduled (date pending)
                              </div>
                            )}
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
                                    const deadlineInput = document.getElementById(`deadline-${assignedProduct.productId}`) as HTMLInputElement;
                                    handleSaveProductDates(assignedProduct.productId, '', deadlineInput.value);
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
                                  Edit Deadline
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

      {/* Financial Summary */}
      {(() => {
        // Use pre-calculated balance from user document (synced on page load)
        const outstandingBalance = user.outstandingBalance?.[selectedOrganization?.id || ''] || 0;
        const availableCredits = user.availableCredits?.[selectedOrganization?.id || ''] || 0;
        const hasDebt = outstandingBalance > 0;
        const hasCredit = availableCredits > 0 && outstandingBalance === 0;

        const label = hasDebt ? 'Total Amount Owed' : hasCredit ? 'Total Credit Available' : 'All Settled';
        const displayAmount = hasDebt ? outstandingBalance : hasCredit ? availableCredits : 0;

        // Current month stats (from already-loaded receipts)
        const monthDebits = selectedMonth && groupedDebitReceipts[selectedMonth]
          ? groupedDebitReceipts[selectedMonth].filter(r => r.status !== 'deleted')
          : [];
        const monthCredits = selectedMonth && groupedCreditReceipts[selectedMonth]
          ? groupedCreditReceipts[selectedMonth].filter(r => r.status !== 'deleted')
          : [];

        const monthInvoiced = monthDebits.reduce((sum, r) => sum + r.amount, 0);
        const monthPaid = monthCredits.reduce((sum, r) => sum + r.amount, 0);

        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Balance Box */}
            <Card>
              <div className={`p-6 ${hasDebt ? 'bg-error-50' : hasCredit ? 'bg-success-50' : 'bg-secondary-50'} rounded-lg`}>
                <div className={`text-sm mb-1 ${hasDebt ? 'text-error-600' : hasCredit ? 'text-success-600' : 'text-secondary-600'}`}>
                  {label}
                </div>
                <div className={`text-2xl font-bold ${hasDebt ? 'text-error-700' : hasCredit ? 'text-success-700' : 'text-secondary-700'}`}>
                  {currency} {displayAmount.toFixed(2)}
                </div>
              </div>
            </Card>

            {/* Monthly Invoiced Box */}
            <Card>
              <div className="p-6 bg-secondary-50 rounded-lg">
                <div className="text-sm text-secondary-600 mb-1">
                  Invoiced {selectedMonth ? `(${formatMonthDisplay(selectedMonth)})` : ''}
                </div>
                <div className="text-2xl font-bold text-secondary-900">
                  {currency} {monthInvoiced.toFixed(2)}
                </div>
              </div>
            </Card>

            {/* Monthly Paid Box */}
            <Card>
              <div className="p-6 bg-success-50 rounded-lg">
                <div className="text-sm text-success-600 mb-1">
                  Paid {selectedMonth ? `(${formatMonthDisplay(selectedMonth)})` : ''}
                </div>
                <div className="text-2xl font-bold text-success-700">
                  {currency} {monthPaid.toFixed(2)}
                </div>
              </div>
            </Card>
          </div>
        );
      })()}

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

                    {/* Invoice Generation Settings */}
                    {(() => {
                      const selectedProduct = availableProducts.find(p => p.id === selectedProductId);
                      const isRecurring = selectedProduct?.productType === 'recurring';

                      if (isRecurring) {
                        // Recurring product - simplified UI with just date picker for all recurring types
                        return (
                          <>
                            {/* First Invoice Date */}
                            <div className="mb-4">
                              <Label htmlFor="linking-invoice-date">First Invoice Date</Label>
                              <Input
                                id="linking-invoice-date"
                                type="date"
                                value={linkingInvoiceDate}
                                onChange={(e) => setLinkingInvoiceDate(e.target.value)}
                                className="w-full sm:w-48 mt-2"
                              />
                              <p className="text-xs text-secondary-500 mt-1">
                                Select when the first invoice should be generated. If you select a past date, invoices will be created for all periods up to the current date.
                              </p>
                            </div>

                            {/* Payment Due After */}
                            <div className="mb-4">
                              <Label htmlFor="linking-deadline-days">Payment Due After (days)</Label>
                              <Input
                                id="linking-deadline-days"
                                type="number"
                                value={linkingDeadlineDays}
                                onChange={(e) => setLinkingDeadlineDays(Number(e.target.value))}
                                className="w-full sm:w-48 mt-2"
                              />
                              <p className="text-xs text-secondary-500 mt-1">
                                Payment must be made within this period after each invoice
                              </p>
                            </div>
                          </>
                        );
                      } else {
                        // One-time product - simplified UI matching recurring products
                        return (
                          <>
                            {/* Invoice Date */}
                            <div className="mb-4">
                              <Label htmlFor="linking-invoice-date">Invoice Date</Label>
                              <Input
                                id="linking-invoice-date"
                                type="date"
                                value={linkingInvoiceDate}
                                onChange={(e) => setLinkingInvoiceDate(e.target.value)}
                                className="w-full sm:w-48 mt-2"
                              />
                              <p className="text-xs text-secondary-500 mt-1">
                                When the invoice will be created
                              </p>
                            </div>

                            {/* Payment Due After */}
                            <div className="mb-4">
                              <Label htmlFor="linking-deadline-days">Payment Due After (days)</Label>
                              <Input
                                id="linking-deadline-days"
                                type="number"
                                value={linkingDeadlineDays}
                                onChange={(e) => setLinkingDeadlineDays(Number(e.target.value))}
                                className="w-full sm:w-48 mt-2"
                              />
                              <p className="text-xs text-secondary-500 mt-1">
                                Payment must be made within this period after the invoice
                              </p>
                            </div>
                          </>
                        );
                      }
                    })()}

                    {/* Summary */}
                    {(() => {
                      const selectedProduct = availableProducts.find(p => p.id === selectedProductId);
                      if (!selectedProduct) return null;

                      const isRecurring = selectedProduct.productType === 'recurring';
                      const duration = selectedProduct.recurringDuration;

                      // Calculate first invoice date based on settings
                      const getFirstInvoiceDate = (): Date => {
                        // All products now use date picker
                        return linkingInvoiceDate ? new Date(linkingInvoiceDate) : new Date();
                      };

                      // Calculate next FUTURE invoice date for recurring products
                      // This finds the first invoice date that is after today
                      const getNextInvoiceDate = () => {
                        if (!isRecurring || !duration) return null;

                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        // Start from the first invoice date and keep advancing until we find a future date
                        let nextDate = new Date(firstInvoiceDate);
                        nextDate.setHours(0, 0, 0, 0);

                        // Keep advancing until we find a date in the future
                        while (nextDate <= today) {
                          switch (duration.unit) {
                            case 'days':
                              nextDate.setDate(nextDate.getDate() + duration.value);
                              break;
                            case 'weeks':
                              nextDate.setDate(nextDate.getDate() + (duration.value * 7));
                              break;
                            case 'months':
                              nextDate.setMonth(nextDate.getMonth() + duration.value);
                              break;
                            case 'years':
                              nextDate.setFullYear(nextDate.getFullYear() + duration.value);
                              break;
                          }
                        }
                        return nextDate;
                      };

                      const formatDuration = () => {
                        if (!duration) return 'month';
                        const value = duration.value;
                        const unit = duration.unit;
                        if (value === 1) {
                          return unit.slice(0, -1); // Remove 's' for singular
                        }
                        return `${value} ${unit}`;
                      };

                      const formatBillingDay = (day: number) => {
                        if (day === 1) return '1st';
                        if (day === 2) return '2nd';
                        if (day === 3) return '3rd';
                        if (day >= 11 && day <= 13) return `${day}th`;
                        switch (day % 10) {
                          case 1: return `${day}st`;
                          case 2: return `${day}nd`;
                          case 3: return `${day}rd`;
                          default: return `${day}th`;
                        }
                      };

                      const firstInvoiceDate = getFirstInvoiceDate();
                      const billingDay = firstInvoiceDate.getDate();

                      // Calculate payment due date
                      const getPaymentDueDate = (): Date | null => {
                        // All products now use deadline days
                        const dueDate = new Date(firstInvoiceDate);
                        dueDate.setDate(dueDate.getDate() + linkingDeadlineDays);
                        return dueDate;
                      };

                      const paymentDueDate = getPaymentDueDate();
                      const nextInvoiceDate = getNextInvoiceDate();

                      return (
                        <div className="mt-5 p-4 bg-secondary-50 rounded-lg">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-secondary-600">Amount to be invoiced:</span>
                            <span className="text-lg font-bold text-secondary-900">
                              {currency} {selectedProduct.price.toFixed(2)}
                            </span>
                          </div>

                          {/* Billing Schedule Preview for Recurring Products */}
                          {isRecurring && (
                            <div className="mt-3 pt-3 border-t border-secondary-200">
                              <p className="text-xs font-semibold text-secondary-700 mb-2 flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                Billing Schedule Preview
                              </p>
                              <div className="space-y-1.5 text-xs">
                                <div className="flex items-start gap-2">
                                  <span className="text-secondary-400 mt-0.5">├─</span>
                                  <span className="text-secondary-600">First invoice:</span>
                                  <span className="font-medium text-secondary-800">
                                    {firstInvoiceDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    {(() => {
                                      const today = new Date();
                                      today.setHours(0, 0, 0, 0);
                                      const invoiceDay = new Date(firstInvoiceDate);
                                      invoiceDay.setHours(0, 0, 0, 0);
                                      const isToday = today.getTime() === invoiceDay.getTime();
                                      return isToday && <span className="text-primary-600 ml-1">(today)</span>;
                                    })()}
                                  </span>
                                </div>
                                {paymentDueDate && (
                                  <div className="flex items-start gap-2">
                                    <span className="text-secondary-400 mt-0.5">├─</span>
                                    <span className="text-secondary-600">Payment due:</span>
                                    <span className="font-medium text-secondary-800">
                                      {paymentDueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                  </div>
                                )}
                                {nextInvoiceDate && (
                                  <div className="flex items-start gap-2">
                                    <span className="text-secondary-400 mt-0.5">├─</span>
                                    <span className="text-secondary-600">Next invoice:</span>
                                    <span className="font-medium text-primary-700">
                                      {nextInvoiceDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                  </div>
                                )}
                                <div className="flex items-start gap-2">
                                  <span className="text-secondary-400 mt-0.5">└─</span>
                                  <span className="text-secondary-600">Then every</span>
                                  <span className="font-medium text-secondary-800">{formatDuration()}</span>
                                  {duration?.unit === 'months' && (
                                    <span className="text-secondary-600">on the {formatBillingDay(billingDay)}</span>
                                  )}
                                  <span className="text-secondary-500 italic">automatically</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Billing Schedule Preview for One-time Products */}
                          {!isRecurring && (
                            <div className="mt-3 pt-3 border-t border-secondary-200">
                              <p className="text-xs font-semibold text-secondary-700 mb-2 flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                Invoice Schedule
                              </p>
                              <div className="space-y-1.5 text-xs">
                                <div className="flex items-start gap-2">
                                  <span className="text-secondary-400 mt-0.5">├─</span>
                                  <span className="text-secondary-600">Invoice date:</span>
                                  <span className="font-medium text-secondary-800">
                                    {firstInvoiceDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    {(() => {
                                      const today = new Date();
                                      today.setHours(0, 0, 0, 0);
                                      const invoiceDay = new Date(firstInvoiceDate);
                                      invoiceDay.setHours(0, 0, 0, 0);
                                      const isToday = today.getTime() === invoiceDay.getTime();
                                      return isToday && <span className="text-primary-600 ml-1">(today)</span>;
                                    })()}
                                  </span>
                                </div>
                                {paymentDueDate && (
                                  <div className="flex items-start gap-2">
                                    <span className="text-secondary-400 mt-0.5">└─</span>
                                    <span className="text-secondary-600">Payment due:</span>
                                    <span className="font-medium text-secondary-800">
                                      {paymentDueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
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
                    label="Due Date"
                    type="date"
                    value={editInvoiceForm.deadline}
                    onChange={(e) => setEditInvoiceForm({ ...editInvoiceForm, deadline: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                    helperText="Cannot be in the past"
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

      {/* Unlink Product Confirmation Modal */}
      {unlinkProductModalOpen && productToUnlink && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseUnlinkProductModal();
            }
          }}
        >
          <div className="w-full max-w-md">
            <Card className="w-full">
              <div className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-warning-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-warning-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-secondary-900">Unlink Product</h3>
                </div>
                <div className="space-y-4">
                  <p className="text-secondary-700">
                    Are you sure you want to unlink this product from {user?.name}?
                  </p>
                  <div className="bg-secondary-50 p-4 rounded-lg">
                    <p className="font-medium text-secondary-900">{productToUnlink.productName}</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                    <p className="text-blue-800 text-sm">
                      This will mark the product assignment as cancelled. All existing invoices will be preserved and remain as outstanding.
                    </p>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                    <Button
                      variant="outline"
                      onClick={handleCloseUnlinkProductModal}
                      disabled={unlinkingProductId === productToUnlink.productId}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleUnlinkProductConfirm}
                      disabled={unlinkingProductId === productToUnlink.productId}
                      className="bg-error-600 hover:bg-error-700 text-white border-error-600"
                    >
                      {unlinkingProductId === productToUnlink.productId ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Unlinking...
                        </>
                      ) : (
                        'Unlink Product'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Invoice Discount Modal */}
      {invoiceDiscountModalOpen && invoiceToDiscount && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseInvoiceDiscountModal();
            }
          }}
        >
          <div className="w-full max-w-md">
            <Card className="w-full">
              <div className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-secondary-900">Apply Discount to Invoice</h3>
                </div>

                <div className="space-y-4">
                  {/* Invoice Info */}
                  <div className="bg-secondary-50 p-4 rounded-lg">
                    <p className="font-medium text-secondary-900">{invoiceToDiscount.product?.name || 'Invoice'}</p>
                    <p className="text-secondary-600">Current Amount: {currency} {invoiceToDiscount.amount.toFixed(2)}</p>
                    {invoiceToDiscount.product?.discountApplied && (
                      <p className="text-xs text-primary-600 mt-1">
                        Previous discount: {invoiceToDiscount.product.discountApplied}
                      </p>
                    )}
                  </div>

                  {/* Discount Type */}
                  <div>
                    <Label>Discount Type</Label>
                    <div className="flex gap-4 mt-2">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="invoiceDiscountType"
                          value="percentage"
                          checked={invoiceDiscountType === 'percentage'}
                          onChange={(e) => setInvoiceDiscountType(e.target.value as 'percentage' | 'fixed')}
                          className="form-radio text-primary-600"
                        />
                        <span className="text-sm">Percentage (%)</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="invoiceDiscountType"
                          value="fixed"
                          checked={invoiceDiscountType === 'fixed'}
                          onChange={(e) => setInvoiceDiscountType(e.target.value as 'percentage' | 'fixed')}
                          className="form-radio text-primary-600"
                        />
                        <span className="text-sm">Fixed Amount ({currency})</span>
                      </label>
                    </div>
                  </div>

                  {/* Discount Value */}
                  <div>
                    <Label htmlFor="invoice-discount-value">
                      Discount Value {invoiceDiscountType === 'percentage' ? '(%)' : `(${currency})`}
                    </Label>
                    <Input
                      id="invoice-discount-value"
                      type="number"
                      min="0"
                      max={invoiceDiscountType === 'percentage' ? '100' : invoiceToDiscount.amount.toString()}
                      step={invoiceDiscountType === 'percentage' ? '1' : '0.01'}
                      value={invoiceDiscountValue}
                      onChange={(e) => setInvoiceDiscountValue(e.target.value)}
                      placeholder={invoiceDiscountType === 'percentage' ? 'e.g., 10' : 'e.g., 50.00'}
                      className="mt-1"
                    />
                    {(() => {
                      const discountedAmount = getInvoiceDiscountedAmount();
                      if (discountedAmount !== null && discountedAmount >= 0) {
                        return (
                          <div className="text-sm text-success-600 mt-1 font-medium">
                            New amount: {currency} {discountedAmount.toFixed(2)}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {/* Discount Reason */}
                  <div>
                    <Label htmlFor="invoice-discount-reason">Reason (Optional)</Label>
                    <Input
                      id="invoice-discount-reason"
                      type="text"
                      value={invoiceDiscountReason}
                      onChange={(e) => setInvoiceDiscountReason(e.target.value)}
                      placeholder="e.g., Early payment discount, Promotional offer"
                      className="mt-1"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex justify-between mt-6">
                    <div>
                      {invoiceToDiscount?.product?.originalPrice && (
                        <Button
                          variant="outline"
                          onClick={handleRemoveInvoiceDiscount}
                          disabled={savingInvoiceDiscount}
                          className="text-error-600 hover:text-error-700 border-error-300 hover:border-error-400"
                        >
                          Remove Discount
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={handleCloseInvoiceDiscountModal}
                        disabled={savingInvoiceDiscount}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSaveInvoiceDiscount}
                        disabled={savingInvoiceDiscount || !invoiceDiscountValue || parseFloat(invoiceDiscountValue) <= 0}
                      >
                        {savingInvoiceDiscount ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Applying...
                          </>
                        ) : (
                          'Apply Discount'
                        )}
                      </Button>
                    </div>
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