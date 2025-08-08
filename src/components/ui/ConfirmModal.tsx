import React from 'react';
import { Button, Card } from './';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'primary' | 'error' | 'success';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
  loading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-md">
        <Card className="w-full">
          <div className="p-6">
            <div className="flex items-center space-x-3 mb-4">
              {confirmVariant === 'error' && (
                <div className="flex-shrink-0 w-10 h-10 bg-error-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-error-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
              )}
              {confirmVariant === 'success' && (
                <div className="flex-shrink-0 w-10 h-10 bg-success-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
              )}
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">{title}</h3>
              </div>
            </div>
            
            <p className="text-secondary-700 mb-6">{message}</p>
            
            <div className="flex justify-end space-x-3">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={loading}
              >
                {cancelText}
              </Button>
              <Button
                type="button"
                variant={confirmVariant === 'error' ? 'outline' : 'primary'}
                onClick={onConfirm}
                disabled={loading}
                className={
                  confirmVariant === 'error' 
                    ? 'border-error-300 text-error-700 hover:bg-error-50' 
                    : confirmVariant === 'success'
                    ? 'bg-success-600 hover:bg-success-700 text-white border-success-600'
                    : ''
                }
              >
                {loading && (
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {loading ? 'Please wait...' : confirmText}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ConfirmModal;