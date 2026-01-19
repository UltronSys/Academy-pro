import React, { useState, useEffect } from 'react';
import { Button, Card, Input, Label, Select, DataTable, Toast, ConfirmModal } from '../ui';
import { useApp } from '../../contexts/AppContext';
import { usePermissions } from '../../hooks/usePermissions';
import {
  createProduct,
  getProductsByOrganization,
  updateProduct,
  deleteProduct,
  linkPlayersToProduct,
  unlinkPlayersFromProduct
} from '../../services/productService';
import { Product, Player } from '../../types';
import { getPlayersByOrganization, syncProductLinkedPlayers } from '../../services/playerService';
import { getUserById } from '../../services/userService';
import { getSettingsByOrganization } from '../../services/settingsService';

interface PlayerWithUserInfo {
  player: Player;
  userName: string;
}

const Products: React.FC = () => {
  const { selectedOrganization } = useApp();
  const { canWrite } = usePermissions();
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [newProductType, setNewProductType] = useState<'recurring' | 'one-time'>('one-time');
  const [recurringValue, setRecurringValue] = useState(1);
  const [recurringUnit, setRecurringUnit] = useState<'days' | 'weeks' | 'months' | 'years'>('months');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; confirmText?: string; confirmVariant?: 'error' | 'primary' } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [unlinkLoading, setUnlinkLoading] = useState(false);
  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');
  
  // Player linking states
  const [showLinkPlayersModal, setShowLinkPlayersModal] = useState(false);
  const [selectedProductForLinking, setSelectedProductForLinking] = useState<Product | null>(null);
  const [linkingPlayerIds, setLinkingPlayerIds] = useState<string[]>([]);
  const [linkingPlayerNames, setLinkingPlayerNames] = useState<string[]>([]);
  const [linkingSubmitting, setLinkingSubmitting] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState<string>('');
  const [_deadlineDate, setDeadlineDate] = useState<string>('');
  const [invoiceGeneration, setInvoiceGeneration] = useState<'immediate' | 'scheduled'>('immediate');
  const [allPlayers, setAllPlayers] = useState<PlayerWithUserInfo[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);

  // Recurring product states
  const [linkingDeadlineDays, setLinkingDeadlineDays] = useState<number>(30);

  const handleSyncLinkedPlayers = async () => {
    if (!selectedOrganization?.id) return;

    try {
      setSyncing(true);
      const result = await syncProductLinkedPlayers(selectedOrganization.id);

      // Reload products to show updated linked players (products are org-wide)
      const productsData = await getProductsByOrganization(selectedOrganization.id);
      setProducts(productsData);

      setToast({
        message: `Sync complete! Updated ${result.synced} products${result.errors > 0 ? `, ${result.errors} errors` : ''}`,
        type: result.errors > 0 ? 'info' : 'success'
      });
    } catch (error) {
      console.error('Error syncing linked players:', error);
      setToast({ message: 'Failed to sync linked players', type: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const typeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'recurring', label: 'Recurring' },
    { value: 'one-time', label: 'One-time' },
  ];

  // Load products on component mount and when organization changes
  // Products are organization-wide, not academy-specific
  useEffect(() => {
    const loadProducts = async () => {
      if (!selectedOrganization?.id) return;

      try {
        setLoading(true);
        // Always load all products for the organization (products are org-wide)
        const productsData = await getProductsByOrganization(selectedOrganization.id);

        setProducts(productsData);
        
        // Load players for linking functionality
        await getPlayersByOrganization(selectedOrganization.id);
        
        // Load currency from settings
        const settingsData = await getSettingsByOrganization(selectedOrganization.id);
        if (settingsData?.generalSettings?.currency) {
          setDefaultCurrency(settingsData.generalSettings.currency);
        }
      } catch (error) {
        console.error('Error loading products:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, [selectedOrganization?.id]);

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || product.productType === filterType;

    return matchesSearch && matchesType;
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const handleCloseModal = () => {
    setShowAddProduct(false);
    setEditingProduct(null);
    setSubmitting(false);
    // Reset form state
    setNewProductType('one-time');
    setRecurringValue(1);
    setRecurringUnit('months');
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setNewProductType(product.productType);
    if (product.recurringDuration) {
      setRecurringValue(product.recurringDuration.value);
      setRecurringUnit(product.recurringDuration.unit);
    } else {
      setRecurringValue(1);
      setRecurringUnit('months');
    }
    setShowAddProduct(true);
  };

  const handleSubmitProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedOrganization?.id) {
      showToast('No organization selected', 'error');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const price = parseFloat(formData.get('price') as string);

    // Basic validation
    if (!name.trim()) {
      showToast('Product name is required', 'error');
      return;
    }
    if (isNaN(price) || price <= 0) {
      showToast('Please enter a valid price', 'error');
      return;
    }

    try {
      setSubmitting(true);
      
      // Products are organization-wide, not academy-specific
      const productData: any = {
        name: name.trim(),
        description: description.trim(),
        price,
        currency: defaultCurrency,
        organizationId: selectedOrganization.id,
        isActive: true,
        productType: newProductType,
        ...(newProductType === 'recurring' && {
          recurringDuration: {
            value: recurringValue,
            unit: recurringUnit
          }
        })
      };

      if (editingProduct) {
        // Update existing product
        await updateProduct(editingProduct.id, productData);
        setProducts(prev => 
          prev.map(product => 
            product.id === editingProduct.id 
              ? { ...product, ...productData }
              : product
          )
        );
        showToast('Product updated successfully!', 'success');
      } else {
        // Create new product
        const newProduct = await createProduct(productData);
        setProducts(prev => [newProduct, ...prev]);
        showToast('Product added successfully!', 'success');
      }
      
      handleCloseModal();
    } catch (error: any) {
      console.error('Error saving product:', error);
      
      let errorMessage = `Failed to ${editingProduct ? 'update' : 'create'} product. Please try again.`;
      if (error?.code === 'permission-denied') {
        errorMessage = 'Permission denied. You may not have access to manage products.';
      } else if (error?.code === 'network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (error?.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      showToast(errorMessage, 'error');
    } finally {
      setSubmitting(false);
    }
  };


  const handleDeleteProduct = (product: Product) => {
    // Check if product has linked players
    if (product.linkedPlayerIds && product.linkedPlayerIds.length > 0) {
      showToast(`Cannot delete "${product.name}" - it has ${product.linkedPlayerIds.length} player(s) linked. Please unlink all players first.`, 'error');
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Delete Product',
      message: `Are you sure you want to delete "${product.name}"? This action cannot be undone.`,
      onConfirm: () => confirmDeleteProduct(product.id)
    });
  };

  const confirmDeleteProduct = async (productId: string) => {
    try {
      setDeleteLoading(true);
      await deleteProduct(productId);
      setProducts(prev => prev.filter(product => product.id !== productId));
      showToast('Product deleted successfully', 'success');
      setConfirmModal(null);
    } catch (error) {
      console.error('Error deleting product:', error);
      showToast('Failed to delete product. Please try again.', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleLinkPlayers = async (product: Product) => {
    setSelectedProductForLinking(product);
    setLinkingPlayerIds(product.linkedPlayerIds || []);
    setLinkingPlayerNames(product.linkedPlayerNames || []);

    // Set default dates
    const today = new Date();
    const defaultDeadline = new Date();
    defaultDeadline.setDate(today.getDate() + 30); // Default 30 days for deadline

    setInvoiceDate(today.toISOString().split('T')[0]);
    setDeadlineDate(defaultDeadline.toISOString().split('T')[0]);
    setPlayerSearchQuery('');

    // Reset recurring states
    setLinkingDeadlineDays(30);

    setShowLinkPlayersModal(true);

    // Load all players
    if (!selectedOrganization?.id) return;

    try {
      setLoadingPlayers(true);
      const players = await getPlayersByOrganization(selectedOrganization.id);

      // Get user info for each player
      const playersWithUserInfo: PlayerWithUserInfo[] = await Promise.all(
        players.map(async (player) => {
          try {
            const user = await getUserById(player.userId);
            return {
              player,
              userName: user?.name || 'Unknown Player'
            };
          } catch {
            return {
              player,
              userName: 'Unknown Player'
            };
          }
        })
      );

      setAllPlayers(playersWithUserInfo);
    } catch (error) {
      console.error('Error loading players:', error);
      showToast('Failed to load players', 'error');
    } finally {
      setLoadingPlayers(false);
    }
  };

  const handlePlayerToggle = (playerId: string, playerName: string) => {
    if (linkingPlayerIds.includes(playerId)) {
      // Remove player
      setLinkingPlayerIds(prev => prev.filter(id => id !== playerId));
      setLinkingPlayerNames(prev => prev.filter(name => name !== playerName));
    } else {
      // Add player
      setLinkingPlayerIds(prev => [...prev, playerId]);
      setLinkingPlayerNames(prev => [...prev, playerName]);
    }
  };

  const handleSelectAllPlayers = () => {
    // Get filtered players based on search
    const filteredPlayers = allPlayers.filter(({ userName }) =>
      playerSearchQuery === '' ||
      userName.toLowerCase().includes(playerSearchQuery.toLowerCase())
    );

    // Check if all filtered players are already selected
    const allFilteredIds = filteredPlayers.map(({ player }) => player.userId);
    const allSelected = allFilteredIds.every(id => linkingPlayerIds.includes(id));

    if (allSelected) {
      // Deselect all filtered players
      setLinkingPlayerIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
      setLinkingPlayerNames(prev => {
        const filteredNames = filteredPlayers.map(({ userName }) => userName);
        return prev.filter(name => !filteredNames.includes(name));
      });
    } else {
      // Select all filtered players (add those not already selected)
      const newIds = allFilteredIds.filter(id => !linkingPlayerIds.includes(id));
      const newNames = filteredPlayers
        .filter(({ player }) => !linkingPlayerIds.includes(player.userId))
        .map(({ userName }) => userName);

      setLinkingPlayerIds(prev => [...prev, ...newIds]);
      setLinkingPlayerNames(prev => [...prev, ...newNames]);
    }
  };

  const handleCloseLinkingModal = () => {
    setShowLinkPlayersModal(false);
    setSelectedProductForLinking(null);
    setLinkingPlayerIds([]);
    setLinkingPlayerNames([]);
    setLinkingSubmitting(false);
    setInvoiceDate('');
    setDeadlineDate('');
    setInvoiceGeneration('immediate');
    setPlayerSearchQuery('');
    setAllPlayers([]);
    // Reset recurring states
    setLinkingDeadlineDays(30);
  };

  const handleSubmitPlayerLinking = async () => {
    if (!selectedProductForLinking) return;

    // Validate that players are selected
    if (!linkingPlayerIds || linkingPlayerIds.length === 0) {
      showToast('Please select at least one player to link', 'error');
      return;
    }

    const _isRecurringProduct = selectedProductForLinking.productType === 'recurring';

    // Validate and calculate dates based on product type
    let invoiceDateObj: Date;
    let deadlineDateObj: Date;
    let effectiveInvoiceGeneration: 'immediate' | 'scheduled' = invoiceGeneration;

    // All products now use date picker + deadline days
    if (!invoiceDate) {
      showToast('Please select the invoice date', 'error');
      return;
    }
    invoiceDateObj = new Date(invoiceDate);
    invoiceDateObj.setHours(0, 0, 0, 0);
    deadlineDateObj = new Date(invoiceDateObj);
    deadlineDateObj.setDate(deadlineDateObj.getDate() + linkingDeadlineDays);

    // If the selected date is today or in the past, treat as immediate
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    effectiveInvoiceGeneration = invoiceDateObj <= today ? 'immediate' : 'scheduled';

    try {
      setLinkingSubmitting(true);

      await linkPlayersToProduct(
        selectedProductForLinking.id,
        linkingPlayerIds,
        linkingPlayerNames,
        invoiceDateObj,
        deadlineDateObj,
        effectiveInvoiceGeneration
      );

      // Update local state
      setProducts(prev =>
        prev.map(product =>
          product.id === selectedProductForLinking.id
            ? {
                ...product,
                linkedPlayerIds: linkingPlayerIds,
                linkedPlayerNames: linkingPlayerNames
              }
            : product
        )
      );

      handleCloseLinkingModal();

      // Calculate how many players were newly added vs already linked
      const currentlyLinked = selectedProductForLinking.linkedPlayerIds || [];
      const newlyAdded = linkingPlayerIds.filter(id => !currentlyLinked.includes(id));

      if (newlyAdded.length > 0) {
        showToast(`${newlyAdded.length} new player(s) linked successfully!`, 'success');
      } else {
        showToast('No new players added - all selected players were already linked.', 'info');
      }
    } catch (error) {
      console.error('Error linking players:', error);
      showToast('Failed to link players. Please try again.', 'error');
    } finally {
      setLinkingSubmitting(false);
    }
  };

  const handleUnlinkAllPlayers = (product: Product) => {
    const playerCount = product.linkedPlayerIds?.length || 0;
    setConfirmModal({
      isOpen: true,
      title: 'Unlink All Players',
      message: `Are you sure you want to unlink all ${playerCount} player${playerCount !== 1 ? 's' : ''} from "${product.name}"?`,
      confirmText: 'Unlink All',
      confirmVariant: 'error',
      onConfirm: async () => {
        try {
          setUnlinkLoading(true);
          await unlinkPlayersFromProduct(product.id);

          // Update local state
          setProducts(prev =>
            prev.map(p =>
              p.id === product.id
                ? { ...p, linkedPlayerIds: [], linkedPlayerNames: [] }
                : p
            )
          );

          showToast('All players unlinked successfully!', 'success');
          setConfirmModal(null);
        } catch (error) {
          console.error('Error unlinking players:', error);
          showToast('Failed to unlink players. Please try again.', 'error');
        } finally {
          setUnlinkLoading(false);
        }
      }
    });
  };

  const columns = [
    { 
      key: 'name', 
      header: 'Product Name',
      render: (product: Product) => (
        <div>
          <div className="font-medium text-secondary-900">{product.name}</div>
          <div className="text-sm text-secondary-600">{product.description}</div>
        </div>
      )
    },
    { 
      key: 'price', 
      header: 'Price',
      render: (product: Product) => (
        <div>
          <span className="font-medium">
            {product.currency} {product.price.toFixed(2)}
          </span>
          {product.productType === 'recurring' && product.recurringDuration && (
            <div className="text-xs text-secondary-600">
              per {product.recurringDuration.value} {product.recurringDuration.unit}
            </div>
          )}
        </div>
      )
    },
    { 
      key: 'type', 
      header: 'Type',
      render: (product: Product) => (
        <div>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            product.productType === 'recurring' 
              ? 'bg-blue-100 text-blue-800' 
              : 'bg-green-100 text-green-800'
          }`}>
            {product.productType === 'recurring' ? 'Recurring' : 'One-time'}
          </span>
          {product.productType === 'recurring' && product.recurringDuration && (
            <div className="text-xs text-secondary-600 mt-1">
              Every {product.recurringDuration.value} {product.recurringDuration.unit}
            </div>
          )}
        </div>
      )
    },
    { 
      key: 'linkedPlayers', 
      header: 'Linked Players',
      render: (product: Product) => (
        <div>
          {product.linkedPlayerIds && product.linkedPlayerIds.length > 0 ? (
            <>
              <div className="text-lg font-bold text-primary-600">
                {product.linkedPlayerIds.length}
              </div>
              <div className="text-xs text-secondary-500">
                player{product.linkedPlayerIds.length !== 1 ? 's' : ''} linked
              </div>
            </>
          ) : (
            <span className="text-sm text-secondary-500">No players linked</span>
          )}
        </div>
      )
    },
    { 
      key: 'actions', 
      header: 'Actions',
      render: (product: Product) => (
        <div className="flex items-center space-x-2">
          {canWrite('finance') && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => handleEditProduct(product)}
            >
              Edit
            </Button>
          )}
          {canWrite('finance') && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => handleLinkPlayers(product)}
              className="text-blue-600 hover:text-blue-700"
            >
              Link Players
            </Button>
          )}
          {canWrite('finance') && product.linkedPlayerIds && product.linkedPlayerIds.length > 0 && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => handleUnlinkAllPlayers(product)}
              className="text-orange-600 hover:text-orange-700"
            >
              Unlink All
            </Button>
          )}
          {canWrite('finance') && (
            <Button
              variant="ghost"
              size="sm"
              className="text-error-600 hover:text-error-700"
              onClick={() => handleDeleteProduct(product)}
            >
              Delete
            </Button>
          )}
        </div>
      )
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex-1 w-full sm:max-w-md">
          <Input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="flex items-center space-x-3">
          <Select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-32"
          >
            {typeOptions.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </Select>
          {canWrite('finance') && (
            <Button
              variant="outline"
              onClick={handleSyncLinkedPlayers}
              disabled={syncing}
              className="mr-2"
            >
              {syncing ? 'Syncing...' : 'Sync Linked Players'}
            </Button>
          )}
          {canWrite('finance') && (
            <Button onClick={() => setShowAddProduct(true)}>
              Add Product
            </Button>
          )}
        </div>
      </div>

      {/* Products Table */}
      {loading ? (
        <div className="flex justify-center items-center min-h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <Card>
          <DataTable
            data={filteredProducts}
            columns={columns}
            emptyMessage="No products found"
            showPagination={true}
            itemsPerPage={10}
          />
        </Card>
      )}

      {/* Add Product Modal */}
      {showAddProduct && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto"
          onClick={(e) => {
            // Only close if clicking the backdrop and not submitting
            if (e.target === e.currentTarget && !submitting) {
              handleCloseModal();
            }
          }}
        >
          <div className="w-full max-w-md my-8">
            <Card className="w-full">
              <div className="p-6 max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-secondary-900 mb-4">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h3>
              <form className="space-y-4" onSubmit={handleSubmitProduct}>
                <div>
                  <Label htmlFor="name">Product Name</Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="Enter product name"
                    defaultValue={editingProduct?.name || ''}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <textarea
                    id="description"
                    name="description"
                    className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    rows={3}
                    placeholder="Enter product description"
                    defaultValue={editingProduct?.description || ''}
                  />
                </div>
                <div>
                  <Label htmlFor="productType">Product Type</Label>
                  <Select 
                    id="productType" 
                    value={newProductType}
                    onChange={(e) => setNewProductType(e.target.value as 'recurring' | 'one-time')}
                    required
                  >
                    <option value="one-time">One-time Purchase</option>
                    <option value="recurring">Recurring Subscription</option>
                  </Select>
                </div>
                {newProductType === 'recurring' && (
                  <div>
                    <Label htmlFor="recurringDuration">Recurring Duration</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        id="recurringValue"
                        type="number"
                        min="1"
                        value={recurringValue}
                        onChange={(e) => setRecurringValue(parseInt(e.target.value) || 1)}
                        placeholder="1"
                        required
                      />
                      <Select 
                        id="recurringUnit"
                        value={recurringUnit}
                        onChange={(e) => setRecurringUnit(e.target.value as 'days' | 'weeks' | 'months' | 'years')}
                        required
                      >
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                        <option value="months">Months</option>
                        <option value="years">Years</option>
                      </Select>
                    </div>
                    <div className="text-xs text-secondary-600 mt-1">
                      Customers will be charged every {recurringValue} {recurringUnit}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="price">Price</Label>
                    <Input
                      id="price"
                      name="price"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      defaultValue={editingProduct?.price || ''}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="currency">Currency</Label>
                    <Input
                      id="currency"
                      name="currency"
                      type="text"
                      value={defaultCurrency}
                      readOnly
                      className="bg-gray-50 cursor-not-allowed"
                      title="Currency is set in organization settings"
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseModal}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting && (
                      <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    {submitting ? (editingProduct ? 'Updating Product...' : 'Adding Product...') : (editingProduct ? 'Update Product' : 'Add Product')}
                  </Button>
                </div>
              </form>
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

      {/* Confirm Modal */}
      {confirmModal && (
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText || "Delete"}
          confirmVariant={confirmModal.confirmVariant || "error"}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
          loading={deleteLoading || unlinkLoading}
        />
      )}

      {/* Link Players Modal */}
      {showLinkPlayersModal && selectedProductForLinking && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !linkingSubmitting) {
              handleCloseLinkingModal();
            }
          }}
        >
          <div className="w-full max-w-4xl my-8">
            <Card className="w-full">
              <div className="p-6 max-h-[85vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-semibold text-secondary-900">
                      Link Players to Product
                    </h3>
                    <p className="text-sm text-secondary-500 mt-1">
                      Select players to assign to <span className="font-medium text-secondary-700">{selectedProductForLinking.name}</span>
                    </p>
                  </div>
                  <button
                    onClick={handleCloseLinkingModal}
                    disabled={linkingSubmitting}
                    className="p-2 hover:bg-secondary-100 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5 text-secondary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Product Info Banner */}
                <div className="mb-5 p-4 bg-primary-50 border border-primary-200 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium text-primary-900">{selectedProductForLinking.name}</div>
                      <div className="text-sm text-primary-700">
                        {defaultCurrency} {selectedProductForLinking.price.toFixed(2)}
                        {selectedProductForLinking.productType === 'recurring' && selectedProductForLinking.recurringDuration && (
                          <span> / {selectedProductForLinking.recurringDuration.value} {selectedProductForLinking.recurringDuration.unit}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    selectedProductForLinking.productType === 'recurring'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {selectedProductForLinking.productType === 'recurring' ? 'Recurring' : 'One-time'}
                  </span>
                </div>

                {/* Search Bar and Select All */}
                <div className="flex gap-3 mb-4">
                  <div className="relative flex-1">
                    <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-secondary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search players by name..."
                      value={playerSearchQuery}
                      onChange={(e) => setPlayerSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  {!loadingPlayers && allPlayers.length > 0 && (
                    <button
                      onClick={handleSelectAllPlayers}
                      className="px-4 py-2.5 bg-secondary-100 hover:bg-secondary-200 text-secondary-700 rounded-lg font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2"
                    >
                      {(() => {
                        const filteredPlayers = allPlayers.filter(({ userName }) =>
                          playerSearchQuery === '' ||
                          userName.toLowerCase().includes(playerSearchQuery.toLowerCase())
                        );
                        const allFilteredIds = filteredPlayers.map(({ player }) => player.userId);
                        const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => linkingPlayerIds.includes(id));

                        return allSelected ? (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Deselect All
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Select All {playerSearchQuery && `(${filteredPlayers.length})`}
                          </>
                        );
                      })()}
                    </button>
                  )}
                </div>

                {/* Selection Summary Bar */}
                {linkingPlayerIds.length > 0 && (
                  <div className="mb-4 p-3 bg-primary-50 border border-primary-200 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-semibold text-sm">{linkingPlayerIds.length}</span>
                      </div>
                      <span className="text-primary-800 font-medium">
                        {linkingPlayerIds.length} player{linkingPlayerIds.length !== 1 ? 's' : ''} selected
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setLinkingPlayerIds([]);
                        setLinkingPlayerNames([]);
                      }}
                      className="text-sm text-primary-600 hover:text-primary-800 font-medium"
                    >
                      Clear selection
                    </button>
                  </div>
                )}

                {/* Player Cards Grid */}
                {loadingPlayers ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mb-3"></div>
                    <p className="text-secondary-500">Loading players...</p>
                  </div>
                ) : allPlayers.length === 0 ? (
                  <div className="text-center py-12 bg-secondary-50 rounded-lg">
                    <svg className="w-12 h-12 text-secondary-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <p className="text-secondary-600 font-medium">No players found</p>
                    <p className="text-sm text-secondary-500 mt-1">There are no players in this organization</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6 max-h-[300px] overflow-y-auto pr-1">
                    {allPlayers
                      .filter(({ userName }) =>
                        playerSearchQuery === '' ||
                        userName.toLowerCase().includes(playerSearchQuery.toLowerCase())
                      )
                      .map(({ player, userName }) => {
                        const isSelected = linkingPlayerIds.includes(player.userId);
                        const wasAlreadyLinked = selectedProductForLinking.linkedPlayerIds?.includes(player.userId);
                        return (
                          <div
                            key={player.id}
                            onClick={() => handlePlayerToggle(player.userId, userName)}
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

                            {/* Already linked badge */}
                            {wasAlreadyLinked && (
                              <div className="absolute top-2 left-2">
                                <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                                  Linked
                                </span>
                              </div>
                            )}

                            {/* Player avatar and info */}
                            <div className="flex items-center gap-3">
                              <div className={`
                                w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold
                                ${isSelected ? 'bg-primary-200 text-primary-800' : 'bg-secondary-200 text-secondary-700'}
                              `}>
                                {userName.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className={`font-medium truncate ${isSelected ? 'text-primary-900' : 'text-secondary-900'}`}>
                                  {userName}
                                </h4>
                                <p className="text-xs text-secondary-500 truncate">
                                  {player.gender || 'Player'}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Invoice Settings - Only show if players are selected */}
                {linkingPlayerIds.length > 0 && (
                  <div className="border-t border-secondary-200 pt-5 mt-2">
                    <h4 className="text-sm font-medium text-secondary-700 mb-4">Invoice Settings</h4>

                    {(() => {
                      const isRecurring = selectedProductForLinking?.productType === 'recurring';

                      if (isRecurring) {
                        // Recurring product UI - simplified with just date picker for all recurring types
                        return (
                          <>
                            {/* First Invoice Date */}
                            <div className="mb-4">
                              <Label htmlFor="invoiceDate">First Invoice Date</Label>
                              <Input
                                id="invoiceDate"
                                type="date"
                                value={invoiceDate}
                                onChange={(e) => setInvoiceDate(e.target.value)}
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
                        // One-time product UI - simplified to match recurring
                        return (
                          <>
                            {/* Invoice Date */}
                            <div className="mb-4">
                              <Label htmlFor="invoiceDate">Invoice Date</Label>
                              <Input
                                id="invoiceDate"
                                type="date"
                                value={invoiceDate}
                                onChange={(e) => setInvoiceDate(e.target.value)}
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
                      const isRecurring = selectedProductForLinking?.productType === 'recurring';
                      const duration = selectedProductForLinking?.recurringDuration;

                      // Calculate first invoice date - all products now use date picker
                      const getFirstInvoiceDate = (): Date => {
                        return invoiceDate ? new Date(invoiceDate) : new Date();
                      };

                      // Calculate next FUTURE invoice date for recurring products
                      const getNextInvoiceDate = () => {
                        if (!isRecurring || !duration) return null;

                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        let nextDate = new Date(firstInvoiceDate);
                        nextDate.setHours(0, 0, 0, 0);

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
                          return unit.slice(0, -1);
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

                      // Calculate payment due date - all products now use deadline days
                      const getPaymentDueDate = (): Date | null => {
                        const dueDate = new Date(firstInvoiceDate);
                        dueDate.setDate(dueDate.getDate() + linkingDeadlineDays);
                        return dueDate;
                      };

                      const paymentDueDate = getPaymentDueDate();
                      const nextInvoiceDate = getNextInvoiceDate();

                      return (
                        <div className="p-4 bg-secondary-50 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-secondary-600">Players to link:</span>
                            <span className="font-semibold text-secondary-900">{linkingPlayerIds.length}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-secondary-600">Amount per player:</span>
                            <span className="font-semibold text-secondary-900">
                              {defaultCurrency} {selectedProductForLinking.price.toFixed(2)}
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
                                    <span className="text-secondary-400 mt-0.5">├─</span>
                                    <span className="text-secondary-600">Payment due:</span>
                                    <span className="font-medium text-secondary-800">
                                      {paymentDueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                  </div>
                                )}
                                <div className="flex items-start gap-2">
                                  <span className="text-secondary-400 mt-0.5">└─</span>
                                  <span className="text-secondary-600">Total invoices:</span>
                                  <span className="font-bold text-primary-600">
                                    {defaultCurrency} {(selectedProductForLinking.price * linkingPlayerIds.length).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          <p className="text-xs text-primary-600 mt-3 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {isRecurring
                              ? 'Invoices will be created for all periods up to today'
                              : 'Invoice will be created once you confirm'}
                          </p>
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
                    onClick={handleCloseLinkingModal}
                    disabled={linkingSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmitPlayerLinking}
                    disabled={linkingSubmitting || linkingPlayerIds.length === 0}
                  >
                    {linkingSubmitting && (
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    {linkingSubmitting ? 'Linking...' : `Link ${linkingPlayerIds.length} Player${linkingPlayerIds.length !== 1 ? 's' : ''}`}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;