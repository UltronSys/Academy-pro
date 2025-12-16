import React, { useState } from 'react';
import { Card, Input } from '../ui';
import { Conversation } from '../../types';
import { Timestamp } from 'firebase/firestore';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isArchived?: boolean;
}

const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  selectedId,
  onSelect,
  isArchived = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const formatTime = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return '';

    const date = timestamp.toDate();
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const filteredConversations = conversations.filter(conv =>
    searchQuery === '' ||
    conv.participantName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card className="h-full">
      {/* Search */}
      <div className="p-4 border-b border-secondary-200">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-secondary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <Input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="overflow-y-auto max-h-[calc(100vh-350px)]">
        {filteredConversations.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-12 h-12 text-secondary-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-secondary-500">
              {searchQuery ? 'No matching conversations' : isArchived ? 'No archived conversations' : 'No conversations yet'}
            </p>
          </div>
        ) : (
          filteredConversations.map(conversation => (
            <div
              key={conversation.id}
              onClick={() => onSelect(conversation.id)}
              className={`
                p-4 border-b border-secondary-100 cursor-pointer transition-colors
                ${selectedId === conversation.id
                  ? 'bg-primary-50 border-l-4 border-l-primary-500'
                  : 'hover:bg-secondary-50'
                }
              `}
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className={`
                  w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold flex-shrink-0
                  ${conversation.participantType === 'player'
                    ? 'bg-blue-100 text-blue-700'
                    : conversation.participantType === 'guardian'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-gray-100 text-gray-700'
                  }
                `}>
                  {conversation.participantName.charAt(0).toUpperCase()}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-medium text-secondary-900 truncate">
                      {conversation.participantType === 'unknown'
                        ? conversation.participantPhone
                        : conversation.participantName}
                    </h4>
                    <span className="text-xs text-secondary-500 flex-shrink-0">
                      {formatTime(conversation.lastMessageAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    {/* Message direction indicator */}
                    {conversation.lastMessageDirection === 'outbound' && (
                      <svg className="w-4 h-4 text-secondary-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                    <p className="text-sm text-secondary-600 truncate">
                      {conversation.lastMessagePreview || 'No messages yet'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    {/* Type badge */}
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
                        : 'Unknown'}
                    </span>

                    {/* Session indicator */}
                    {conversation.sessionActive && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-700">
                        Active
                      </span>
                    )}

                    {/* Unread badge */}
                    {conversation.unreadCount > 0 && (
                      <span className="ml-auto px-2 py-0.5 text-xs font-semibold rounded-full bg-primary-500 text-white">
                        {conversation.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
};

export default ConversationList;
