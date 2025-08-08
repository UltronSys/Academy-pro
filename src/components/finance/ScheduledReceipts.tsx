import React, { useState, useEffect } from 'react';
import { Button, Card, DataTable, Badge, Toast } from '../ui';
import { useApp } from '../../contexts/AppContext';
import { usePermissions } from '../../hooks/usePermissions';
import { 
  getPlayersWithScheduledReceipts, 
  processScheduledReceipts,
  processPlayerScheduledReceipts 
} from '../../services/scheduledReceiptService';

interface ScheduledReceiptData {
  playerId: string;
  playerName: string;
  userId: string;
  scheduledReceipts: {
    productId: string;
    productName: string;
    price: number;
    nextReceiptDate: Date;
    daysUntilDue: number;
  }[];
}

const ScheduledReceipts: React.FC = () => {
  const { selectedOrganization } = useApp();
  const { canWrite } = usePermissions();
  const [scheduledData, setScheduledData] = useState<ScheduledReceiptData[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processingPlayerId, setProcessingPlayerId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    const loadScheduledReceipts = async () => {
      if (!selectedOrganization?.id) return;
      
      try {
        setLoading(true);
        const data = await getPlayersWithScheduledReceipts(selectedOrganization.id);
        setScheduledData(data);
      } catch (error) {
        console.error('Error loading scheduled receipts:', error);
        showToast('Failed to load scheduled receipts', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadScheduledReceipts();
  }, [selectedOrganization?.id]);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const handleProcessAllScheduledReceipts = async () => {
    if (!selectedOrganization?.id || !canWrite('finance')) return;
    
    try {
      setProcessing(true);
      const results = await processScheduledReceipts(selectedOrganization.id);
      
      showToast(
        `Processed ${results.processed} receipts successfully. ${results.failed} failed.`,
        results.failed > 0 ? 'info' : 'success'
      );
      
      // Reload data
      const updatedData = await getPlayersWithScheduledReceipts(selectedOrganization.id);
      setScheduledData(updatedData);
      
    } catch (error) {
      console.error('Error processing scheduled receipts:', error);
      showToast('Failed to process scheduled receipts', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleProcessPlayerReceipts = async (playerId: string) => {
    if (!canWrite('finance')) return;
    
    try {
      setProcessingPlayerId(playerId);
      const results = await processPlayerScheduledReceipts(playerId);
      
      showToast(
        `Processed ${results.processed} receipts for player. ${results.failed} failed.`,
        results.failed > 0 ? 'info' : 'success'
      );
      
      // Reload data
      if (selectedOrganization?.id) {
        const updatedData = await getPlayersWithScheduledReceipts(selectedOrganization.id);
        setScheduledData(updatedData);
      }
      
    } catch (error) {
      console.error('Error processing player receipts:', error);
      showToast('Failed to process player receipts', 'error');
    } finally {
      setProcessingPlayerId(null);
    }
  };

  const getDaysUntilDueColor = (days: number) => {
    if (days <= 0) return 'error';
    if (days <= 3) return 'warning';
    if (days <= 7) return 'primary';
    return 'success';
  };

  const columns = [
    {
      key: 'player',
      header: 'Player',
      render: (data: ScheduledReceiptData) => (
        <div>
          <div className="font-medium text-secondary-900">{data.playerName}</div>
          <div className="text-sm text-secondary-600">ID: {data.playerId}</div>
        </div>
      )
    },
    {
      key: 'products',
      header: 'Scheduled Products',
      render: (data: ScheduledReceiptData) => (
        <div className="space-y-1">
          {data.scheduledReceipts.map((receipt, index) => (
            <div key={index} className="text-sm">
              <div className="font-medium">{receipt.productName}</div>
              <div className="text-secondary-600">${receipt.price.toFixed(2)}</div>
            </div>
          ))}
        </div>
      )
    },
    {
      key: 'dueDate',
      header: 'Next Due Date',
      render: (data: ScheduledReceiptData) => (
        <div className="space-y-1">
          {data.scheduledReceipts.map((receipt, index) => (
            <div key={index} className="text-sm">
              <div>{receipt.nextReceiptDate.toLocaleDateString()}</div>
              <Badge variant={getDaysUntilDueColor(receipt.daysUntilDue)} size="sm">
                {receipt.daysUntilDue <= 0 
                  ? 'Overdue' 
                  : `${receipt.daysUntilDue} days`
                }
              </Badge>
            </div>
          ))}
        </div>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (data: ScheduledReceiptData) => (
        <div className="flex space-x-2">
          {canWrite('finance') && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleProcessPlayerReceipts(data.playerId)}
              disabled={processingPlayerId === data.playerId}
            >
              {processingPlayerId === data.playerId ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-3 w-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : (
                'Process Now'
              )}
            </Button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-secondary-900">Scheduled Receipts</h2>
          <p className="text-secondary-600 mt-1">
            Manage recurring product receipts scheduled for generation
          </p>
        </div>
        
        {canWrite('finance') && scheduledData.length > 0 && (
          <Button 
            onClick={handleProcessAllScheduledReceipts}
            disabled={processing}
            className="bg-primary-600 hover:bg-primary-700"
          >
            {processing ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing All...
              </>
            ) : (
              'Process All Due Receipts'
            )}
          </Button>
        )}
      </div>

      <Card>
        {loading ? (
          <div className="p-8 text-center text-secondary-600">
            Loading scheduled receipts...
          </div>
        ) : scheduledData.length === 0 ? (
          <div className="p-8 text-center text-secondary-600">
            <div className="text-lg font-medium mb-2">No Scheduled Receipts</div>
            <div className="text-sm">
              Players with recurring products will appear here when receipts are scheduled.
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <div className="text-sm text-secondary-600">
                  Showing {scheduledData.length} player(s) with scheduled receipts
                </div>
                <div className="flex items-center space-x-4 text-sm">
                  <div className="flex items-center">
                    <Badge variant="error" size="sm" className="mr-2">Overdue</Badge>
                    <span className="text-secondary-600">Past due date</span>
                  </div>
                  <div className="flex items-center">
                    <Badge variant="warning" size="sm" className="mr-2">Soon</Badge>
                    <span className="text-secondary-600">Due within 3 days</span>
                  </div>
                </div>
              </div>
            </div>
            
            <DataTable
              data={scheduledData}
              columns={columns}
              emptyMessage="No scheduled receipts found"
            />
          </>
        )}
      </Card>

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

export default ScheduledReceipts;