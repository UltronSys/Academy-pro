import React, { useState, useEffect } from 'react';
import { Button, Card, Input, Label, Select, DataTable, Toast, ConfirmModal, PlayerMultiSelect } from '../ui';
import { useApp } from '../../contexts/AppContext';
import { usePermissions } from '../../hooks/usePermissions';
import { 
  createProduct, 
  getProductsByOrganization,
  getProductsByAcademy,
  updateProduct,
  deleteProduct,
  linkPlayersToProduct,
  unlinkPlayersFromProduct
} from '../../services/productService';
import { Product } from '../../types';
import { getPlayersByOrganization } from '../../services/playerService';
import { getSettingsByOrganization } from '../../services/settingsService';

const Products: React.FC = () => {
  const { selectedAcademy, selectedOrganization } = useApp();
  const { canWrite, canDelete } = usePermissions();
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
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');
  
  // Player linking states
  const [showLinkPlayersModal, setShowLinkPlayersModal] = useState(false);
  const [selectedProductForLinking, setSelectedProductForLinking] = useState<Product | null>(null);
  const [linkingPlayerIds, setLinkingPlayerIds] = useState<string[]>([]);
  const [linkingPlayerNames, setLinkingPlayerNames] = useState<string[]>([]);
  const [linkingSubmitting, setLinkingSubmitting] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState<string>('');
  const [deadlineDate, setDeadlineDate] = useState<string>('');
  const [invoiceGeneration, setInvoiceGeneration] = useState<'immediate' | 'scheduled'>('immediate');

  const typeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'recurring', label: 'Recurring' },
    { value: 'one-time', label: 'One-time' },
  ];

  // Load products on component mount and when organization/academy changes
  useEffect(() => {
    const loadProducts = async () => {
      if (!selectedOrganization?.id) return;
      
      try {
        setLoading(true);
        let productsData: Product[];
        
        if (selectedAcademy?.id) {
          productsData = await getProductsByAcademy(selectedOrganization.id, selectedAcademy.id);
        } else {
          productsData = await getProductsByOrganization(selectedOrganization.id);
        }
        
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
  }, [selectedOrganization?.id, selectedAcademy?.id]);

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || product.productType === filterType;
    const matchesAcademy = !selectedAcademy || product.academyId === selectedAcademy.id || !product.academyId;
    
    return matchesSearch && matchesType && matchesAcademy;
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

      // Only add academyId if it exists (avoid undefined values)
      if (selectedAcademy?.id) {
        productData.academyId = selectedAcademy.id;
      }

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

  const handleLinkPlayers = (product: Product) => {
    setSelectedProductForLinking(product);
    setLinkingPlayerIds(product.linkedPlayerIds || []);
    setLinkingPlayerNames(product.linkedPlayerNames || []);
    
    // Set default dates
    const today = new Date();
    const defaultDeadline = new Date();
    defaultDeadline.setDate(today.getDate() + 30); // Default 30 days for deadline
    
    setInvoiceDate(today.toISOString().split('T')[0]);
    setDeadlineDate(defaultDeadline.toISOString().split('T')[0]);
    setInvoiceGeneration('immediate');
    
    setShowLinkPlayersModal(true);
  };

  const handlePlayerLinkingChange = (playerIds: string[], playerNames: string[]) => {
    setLinkingPlayerIds(playerIds);
    setLinkingPlayerNames(playerNames);
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
  };

  const handleSubmitPlayerLinking = async () => {
    if (!selectedProductForLinking) return;
    
    // Validate dates only for scheduled invoices
    if (invoiceGeneration === 'scheduled') {
      if (!invoiceDate || !deadlineDate) {
        showToast('Please select both invoice date and deadline date', 'error');
        return;
      }
      
      const invoiceDateObj = new Date(invoiceDate);
      const deadlineDateObj = new Date(deadlineDate);
      
      if (deadlineDateObj <= invoiceDateObj) {
        showToast('Deadline date must be after invoice date', 'error');
        return;
      }
    }
    
    // Validate that players are selected
    if (!linkingPlayerIds || linkingPlayerIds.length === 0) {
      showToast('Please select at least one player to link', 'error');
      return;
    }
    
    try {
      setLinkingSubmitting(true);
      
      // For immediate invoices, use current date and default 30-day deadline
      const invoiceDateObj = invoiceGeneration === 'immediate' 
        ? new Date() 
        : new Date(invoiceDate);
      const deadlineDateObj = invoiceGeneration === 'immediate' 
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
        : new Date(deadlineDate);
      
      await linkPlayersToProduct(
        selectedProductForLinking.id,
        linkingPlayerIds,
        linkingPlayerNames,
        invoiceDateObj,
        deadlineDateObj,
        invoiceGeneration
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

  const handleUnlinkAllPlayers = async (product: Product) => {
    try {
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
    } catch (error) {
      console.error('Error unlinking players:', error);
      showToast('Failed to unlink players. Please try again.', 'error');
    }
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
          {canDelete('finance') && (
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
          confirmText="Delete"
          confirmVariant="error"
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
          loading={deleteLoading}
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
          <div className="w-full max-w-lg my-8">
            <Card className="w-full">
              <div className="p-6 max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-semibold text-secondary-900 mb-4">
                  Link Players to Product
                </h3>
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm font-medium text-gray-700">
                    Product: <span className="text-gray-900">{selectedProductForLinking.name}</span>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <Label>Select Players</Label>
                    <PlayerMultiSelect
                      selectedPlayerIds={linkingPlayerIds}
                      onSelectionChange={handlePlayerLinkingChange}
                      placeholder="Search and select players for this product..."
                    />
                  </div>
                  
                  {invoiceGeneration === 'scheduled' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="invoiceDate">Invoice Date</Label>
                        <Input
                          id="invoiceDate"
                          type="date"
                          value={invoiceDate}
                          onChange={(e) => setInvoiceDate(e.target.value)}
                          required
                          min={new Date().toISOString().split('T')[0]}
                        />
                        <div className="text-xs text-secondary-600 mt-1">
                          Date when the invoice will be created
                        </div>
                      </div>
                      
                      <div>
                        <Label htmlFor="deadlineDate">Payment Deadline</Label>
                        <Input
                          id="deadlineDate"
                          type="date"
                          value={deadlineDate}
                          onChange={(e) => setDeadlineDate(e.target.value)}
                          required
                          min={invoiceDate || new Date().toISOString().split('T')[0]}
                        />
                        <div className="text-xs text-secondary-600 mt-1">
                          Payment must be made by this date
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <Label>Invoice Generation</Label>
                    <div className="space-y-2 mt-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          value="immediate"
                          checked={invoiceGeneration === 'immediate'}
                          onChange={(e) => setInvoiceGeneration(e.target.value as 'immediate' | 'scheduled')}
                          className="form-radio text-primary-600"
                        />
                        <span className="text-sm">Create invoice immediately</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          value="scheduled"
                          checked={invoiceGeneration === 'scheduled'}
                          onChange={(e) => setInvoiceGeneration(e.target.value as 'immediate' | 'scheduled')}
                          className="form-radio text-primary-600"
                        />
                        <span className="text-sm">
                          {selectedProductForLinking?.productType === 'recurring' 
                            ? 'Wait for next billing cycle' 
                            : 'Wait until invoice date'}
                        </span>
                      </label>
                    </div>
                    <div className="text-xs text-secondary-600 mt-2">
                      {invoiceGeneration === 'immediate' 
                        ? 'A debit receipt will be created immediately for the selected players.'
                        : selectedProductForLinking?.productType === 'recurring'
                        ? `Receipt will be created at the end of the billing cycle (${selectedProductForLinking.recurringDuration?.value} ${selectedProductForLinking.recurringDuration?.unit}).`
                        : 'Receipt will be created on the invoice date specified above.'}
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-3 pt-6">
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
                    disabled={linkingSubmitting}
                  >
                    {linkingSubmitting && (
                      <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    {linkingSubmitting ? 'Linking Players...' : 'Link Players'}
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