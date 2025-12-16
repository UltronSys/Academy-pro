import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Label } from '../ui';
import { useApp } from '../../contexts/AppContext';
import {
  getUsersWithWhatsApp,
  findOrCreateConversation,
  sendMessage
} from '../../services/messagingService';

interface ComposeMessageProps {
  onConversationCreated: (conversationId: string) => void;
  onCancel: () => void;
}

interface Recipient {
  id: string;
  name: string;
  phone: string;
  type: 'player' | 'guardian';
}

const ComposeMessage: React.FC<ComposeMessageProps> = ({
  onConversationCreated,
  onCancel
}) => {
  const { selectedOrganization } = useApp();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'player' | 'guardian'>('all');

  // Load users with WhatsApp enabled
  useEffect(() => {
    if (!selectedOrganization?.id) return;

    setLoading(true);
    getUsersWithWhatsApp(selectedOrganization.id)
      .then(setRecipients)
      .catch((err) => {
        console.error('Error loading recipients:', err);
        setError('Failed to load recipients');
      })
      .finally(() => setLoading(false));
  }, [selectedOrganization?.id]);

  const filteredRecipients = recipients.filter(r => {
    const matchesSearch = searchQuery === '' ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.phone.includes(searchQuery);
    const matchesType = filterType === 'all' || r.type === filterType;
    return matchesSearch && matchesType;
  });

  const handleSend = async () => {
    if (!selectedOrganization?.id || !selectedRecipient || !messageText.trim()) return;

    setSending(true);
    setError(null);

    try {
      // Find or create conversation
      const conversation = await findOrCreateConversation(
        selectedOrganization.id,
        selectedRecipient.id,
        selectedRecipient.name,
        selectedRecipient.phone,
        selectedRecipient.type
      );

      // Send message
      const result = await sendMessage(
        conversation.id,
        messageText.trim(),
        selectedOrganization.id
      );

      if (result.success) {
        onConversationCreated(conversation.id);
      } else {
        setError(result.error || 'Failed to send message');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create conversation');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="h-full">
      {/* Header */}
      <div className="p-4 border-b border-secondary-200 flex items-center justify-between">
        <h3 className="font-semibold text-secondary-900">New Message</h3>
        <button
          onClick={onCancel}
          className="p-2 hover:bg-secondary-100 rounded-lg"
        >
          <svg className="w-5 h-5 text-secondary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4">
        {/* Recipient Selection */}
        {!selectedRecipient ? (
          <div className="space-y-4">
            {/* Search and filter */}
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-secondary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <Input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as 'all' | 'player' | 'guardian')}
                className="px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">All</option>
                <option value="player">Players</option>
                <option value="guardian">Guardians</option>
              </select>
            </div>

            {/* Recipients list */}
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : filteredRecipients.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-secondary-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="text-secondary-500">
                  {searchQuery
                    ? 'No matching recipients found'
                    : 'No users with WhatsApp enabled'}
                </p>
                <p className="text-sm text-secondary-400 mt-1">
                  Users need to enable WhatsApp messaging in their profile.
                </p>
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {filteredRecipients.map((recipient) => (
                  <div
                    key={recipient.id}
                    onClick={() => setSelectedRecipient(recipient)}
                    className="p-3 border border-secondary-200 rounded-lg cursor-pointer hover:bg-secondary-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`
                        w-10 h-10 rounded-full flex items-center justify-center font-semibold
                        ${recipient.type === 'player'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                        }
                      `}>
                        {recipient.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-secondary-900">{recipient.name}</p>
                        <p className="text-sm text-secondary-500">{recipient.phone}</p>
                      </div>
                      <span className={`
                        px-2 py-0.5 text-xs rounded-full
                        ${recipient.type === 'player'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-purple-50 text-purple-700'
                        }
                      `}>
                        {recipient.type === 'player' ? 'Player' : 'Guardian'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Message Composition */
          <div className="space-y-4">
            {/* Selected recipient */}
            <div className="flex items-center gap-3 p-3 bg-secondary-50 rounded-lg">
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center font-semibold
                ${selectedRecipient.type === 'player'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-purple-100 text-purple-700'
                }
              `}>
                {selectedRecipient.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="font-medium text-secondary-900">{selectedRecipient.name}</p>
                <p className="text-sm text-secondary-500">{selectedRecipient.phone}</p>
              </div>
              <button
                onClick={() => setSelectedRecipient(null)}
                className="p-1 hover:bg-secondary-200 rounded"
              >
                <svg className="w-4 h-4 text-secondary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Message input */}
            <div>
              <Label htmlFor="message">Message</Label>
              <textarea
                id="message"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type your message..."
                rows={4}
                className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-error-50 border border-error-200 rounded-lg">
                <p className="text-sm text-error-700">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setSelectedRecipient(null)}
              >
                Back
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || !messageText.trim()}
              >
                {sending ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sending...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Send Message
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default ComposeMessage;
