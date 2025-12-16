import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Label } from '../ui';
import { useApp } from '../../contexts/AppContext';
import { usePermissions } from '../../hooks/usePermissions';
import { updateMessagingSettings } from '../../services/messagingService';
import { MessagingSettings as MessagingSettingsType } from '../../types';

interface MessagingSettingsProps {
  settings: MessagingSettingsType | null;
  onUpdate: (settings: MessagingSettingsType) => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const MessagingSettingsPanel: React.FC<MessagingSettingsProps> = ({
  settings,
  onUpdate,
  showToast
}) => {
  const { selectedOrganization } = useApp();
  const { canWrite } = usePermissions();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    twilioAccountSid: settings?.twilioAccountSid || '',
    twilioAuthToken: settings?.twilioAuthToken || '',
    twilioWhatsAppNumber: settings?.twilioWhatsAppNumber || '',
    enabled: settings?.enabled ?? false,
    autoReplyEnabled: settings?.autoReplyEnabled ?? false,
    autoReplyMessage: settings?.autoReplyMessage || ''
  });

  // Update form when settings prop changes (e.g., after loading from Firestore)
  useEffect(() => {
    if (settings) {
      setFormData({
        twilioAccountSid: settings.twilioAccountSid || '',
        twilioAuthToken: settings.twilioAuthToken || '',
        twilioWhatsAppNumber: settings.twilioWhatsAppNumber || '',
        enabled: settings.enabled ?? false,
        autoReplyEnabled: settings.autoReplyEnabled ?? false,
        autoReplyMessage: settings.autoReplyMessage || ''
      });
    }
  }, [settings]);

  const handleChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    console.log('handleSave called');
    console.log('selectedOrganization:', selectedOrganization);

    if (!selectedOrganization?.id) {
      console.log('No organization selected');
      showToast('No organization selected', 'error');
      return;
    }

    // Validate required fields
    if (!formData.twilioAccountSid || !formData.twilioAuthToken || !formData.twilioWhatsAppNumber) {
      showToast('Please fill in all Twilio credentials', 'error');
      return;
    }

    // Validate WhatsApp number format
    if (!formData.twilioWhatsAppNumber.startsWith('whatsapp:')) {
      showToast('WhatsApp number must start with "whatsapp:" (e.g., whatsapp:+14155238886)', 'error');
      return;
    }

    setSaving(true);
    console.log('Saving settings for org:', selectedOrganization.id);

    try {
      await updateMessagingSettings(selectedOrganization.id, {
        ...formData,
        organizationId: selectedOrganization.id
      });

      console.log('Settings saved successfully');

      onUpdate({
        id: selectedOrganization.id,
        organizationId: selectedOrganization.id,
        ...formData
      } as MessagingSettingsType);

      showToast('Settings saved successfully', 'success');
    } catch (error) {
      console.error('Error saving settings:', error);
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const canEdit = canWrite('messaging') || canWrite('settings');
  console.log('canEdit:', canEdit, 'canWrite messaging:', canWrite('messaging'), 'canWrite settings:', canWrite('settings'));

  return (
    <div className="space-y-6">
      {/* Twilio Configuration */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-secondary-900 mb-1">
            Twilio WhatsApp Configuration
          </h3>
          <p className="text-sm text-secondary-500 mb-6">
            Configure your Twilio credentials to enable WhatsApp messaging.
          </p>

          <div className="space-y-4">
            <div>
              <Label htmlFor="accountSid">Account SID</Label>
              <Input
                id="accountSid"
                type="text"
                value={formData.twilioAccountSid}
                onChange={(e) => handleChange('twilioAccountSid', e.target.value)}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                disabled={!canEdit}
              />
              <p className="text-xs text-secondary-500 mt-1">
                Find this in your Twilio Console Dashboard
              </p>
            </div>

            <div>
              <Label htmlFor="authToken">Auth Token</Label>
              <Input
                id="authToken"
                type="password"
                value={formData.twilioAuthToken}
                onChange={(e) => handleChange('twilioAuthToken', e.target.value)}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                disabled={!canEdit}
              />
              <p className="text-xs text-secondary-500 mt-1">
                Keep this secret! Find it in your Twilio Console
              </p>
            </div>

            <div>
              <Label htmlFor="whatsappNumber">WhatsApp Number</Label>
              <Input
                id="whatsappNumber"
                type="text"
                value={formData.twilioWhatsAppNumber}
                onChange={(e) => handleChange('twilioWhatsAppNumber', e.target.value)}
                placeholder="whatsapp:+14155238886"
                disabled={!canEdit}
              />
              <p className="text-xs text-secondary-500 mt-1">
                Your Twilio WhatsApp-enabled number (must include "whatsapp:" prefix)
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* General Settings */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-secondary-900 mb-1">
            Messaging Settings
          </h3>
          <p className="text-sm text-secondary-500 mb-6">
            Configure how messaging works for your organization.
          </p>

          <div className="space-y-4">
            {/* Enable/Disable */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-secondary-900">Enable Messaging</p>
                <p className="text-sm text-secondary-500">
                  Allow sending and receiving WhatsApp messages
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => handleChange('enabled', e.target.checked)}
                  disabled={!canEdit}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-secondary-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-secondary-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>

            {/* Auto-reply */}
            <div className="border-t border-secondary-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium text-secondary-900">Auto-Reply</p>
                  <p className="text-sm text-secondary-500">
                    Send an automatic response to incoming messages
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.autoReplyEnabled}
                    onChange={(e) => handleChange('autoReplyEnabled', e.target.checked)}
                    disabled={!canEdit}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-secondary-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-secondary-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>

              {formData.autoReplyEnabled && (
                <div>
                  <Label htmlFor="autoReplyMessage">Auto-Reply Message</Label>
                  <textarea
                    id="autoReplyMessage"
                    value={formData.autoReplyMessage}
                    onChange={(e) => handleChange('autoReplyMessage', e.target.value)}
                    placeholder="Thank you for your message. We'll get back to you shortly."
                    rows={3}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none disabled:bg-secondary-50"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Webhook Info */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-secondary-900 mb-1">
            Webhook Configuration
          </h3>
          <p className="text-sm text-secondary-500 mb-4">
            Configure these URLs in your Twilio WhatsApp Sandbox or Number settings.
          </p>

          <div className="space-y-3">
            <div className="p-3 bg-secondary-50 rounded-lg">
              <p className="text-sm font-medium text-secondary-700">Incoming Messages Webhook</p>
              <code className="text-sm text-primary-600 break-all">
                https://us-central1-vijaro-prod.cloudfunctions.net/whatsappWebhook
              </code>
            </div>

            <div className="p-3 bg-secondary-50 rounded-lg">
              <p className="text-sm font-medium text-secondary-700">Status Callback URL</p>
              <code className="text-sm text-primary-600 break-all">
                https://us-central1-vijaro-prod.cloudfunctions.net/whatsappStatusCallback
              </code>
            </div>
          </div>
        </div>
      </Card>

      {/* Save Button */}
      {canEdit && (
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default MessagingSettingsPanel;
