import React, { useState, useEffect, useRef } from 'react';
import { Card, Button } from '../ui';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  getConversationById,
  subscribeToMessages,
  sendMessage,
  markAsRead,
  archiveConversation,
  unarchiveConversation
} from '../../services/messagingService';
import { Conversation, Message } from '../../types';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';

interface ConversationViewProps {
  conversationId: string;
  onBack?: () => void;
  isArchived?: boolean;
}

const ConversationView: React.FC<ConversationViewProps> = ({
  conversationId,
  onBack,
  isArchived = false
}) => {
  const { selectedOrganization } = useApp();
  const { userData: _userData } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversation and subscribe to messages
  useEffect(() => {
    if (!conversationId) return;

    setLoading(true);
    setError(null);

    // Load conversation details
    getConversationById(conversationId)
      .then(setConversation)
      .catch((err) => {
        console.error('Error loading conversation:', err);
        setError('Failed to load conversation');
      });

    // Subscribe to messages
    const unsubscribe = subscribeToMessages(conversationId, (newMessages) => {
      setMessages(newMessages);
      setLoading(false);
    });

    // Mark as read when viewing
    if (!isArchived) {
      markAsRead(conversationId).catch(console.error);
    }

    return () => {
      unsubscribe();
    };
  }, [conversationId, isArchived]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!selectedOrganization?.id || !text.trim()) return;

    setSending(true);
    setError(null);

    const result = await sendMessage(conversationId, text.trim(), selectedOrganization.id);

    if (!result.success) {
      setError(result.error || 'Failed to send message');
    }

    setSending(false);
  };

  const handleArchive = async () => {
    try {
      if (isArchived) {
        await unarchiveConversation(conversationId);
      } else {
        await archiveConversation(conversationId);
      }
      onBack?.();
    } catch (err) {
      setError('Failed to update conversation');
    }
  };

  // Check if within 24-hour window
  const isSessionExpired = conversation && !conversation.sessionActive;

  if (loading) {
    return (
      <Card className="h-full flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </Card>
    );
  }

  if (!conversation) {
    return (
      <Card className="h-full flex items-center justify-center min-h-[400px]">
        <p className="text-secondary-500">Conversation not found</p>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col min-h-[500px]">
      {/* Header */}
      <div className="p-4 border-b border-secondary-200 flex items-center gap-4">
        {/* Back button (mobile) */}
        {onBack && (
          <button
            onClick={onBack}
            className="lg:hidden p-2 hover:bg-secondary-100 rounded-lg"
          >
            <svg className="w-5 h-5 text-secondary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Avatar */}
        <div className={`
          w-10 h-10 rounded-full flex items-center justify-center text-lg font-semibold
          ${conversation.participantType === 'player'
            ? 'bg-blue-100 text-blue-700'
            : conversation.participantType === 'guardian'
            ? 'bg-purple-100 text-purple-700'
            : 'bg-gray-100 text-gray-700'
          }
        `}>
          {conversation.participantName.charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-secondary-900 truncate">
            {conversation.participantType === 'unknown'
              ? conversation.participantPhone
              : conversation.participantName}
          </h3>
          <div className="flex items-center gap-2">
            <span className={`
              px-2 py-0.5 text-xs rounded-full
              ${conversation.participantType === 'player'
                ? 'bg-blue-50 text-blue-700'
                : conversation.participantType === 'guardian'
                ? 'bg-purple-50 text-purple-700'
                : 'bg-gray-50 text-gray-700'
              }
            `}>
              {conversation.participantType === 'player'
                ? 'Player'
                : conversation.participantType === 'guardian'
                ? 'Guardian'
                : 'Unknown Contact'}
            </span>
            {conversation.participantType !== 'unknown' && (
              <span className="text-sm text-secondary-500">
                {conversation.participantPhone}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleArchive}
          >
            {isArchived ? 'Unarchive' : 'Archive'}
          </Button>
        </div>
      </div>

      {/* Session Warning */}
      {isSessionExpired && !isArchived && (
        <div className="px-4 py-3 bg-warning-50 border-b border-warning-200">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-warning-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-warning-800">
                24-hour messaging window expired
              </p>
              <p className="text-sm text-warning-700 mt-1">
                The recipient must reply before you can send another message. WhatsApp requires a recent interaction to prevent spam.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-secondary-500">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isOutbound={message.direction === 'outbound'}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-error-50 border-t border-error-200">
          <p className="text-sm text-error-700">{error}</p>
        </div>
      )}

      {/* Input */}
      {!isArchived && (
        <MessageInput
          onSend={handleSend}
          disabled={sending || !!isSessionExpired}
          placeholder={isSessionExpired ? 'Waiting for recipient to reply...' : 'Type a message...'}
        />
      )}
    </Card>
  );
};

export default ConversationView;
