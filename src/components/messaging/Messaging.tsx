import React, { useState, useEffect } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { Card, Button, Toast, Input } from '../ui';
import { useApp } from '../../contexts/AppContext';
import { usePermissions } from '../../hooks/usePermissions';
import {
  subscribeToConversations,
  subscribeToUnreadCount,
  getMessagingSettings,
  getUsersWithWhatsApp,
  findOrCreateConversation
} from '../../services/messagingService';
import { Conversation, MessagingSettings } from '../../types';
import ConversationView from './ConversationView';
import ComposeMessage from './ComposeMessage';
import MessagingSettingsPanel from './MessagingSettings';

const Messaging: React.FC = () => {
  const { selectedOrganization } = useApp();
  const { canWrite } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const { conversationId } = useParams<{ conversationId?: string }>();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<MessagingSettings | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(conversationId || null);
  const [showCompose, setShowCompose] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [guardians, setGuardians] = useState<{ id: string; name: string; phone: string; type: 'player' | 'guardian' }[]>([]);
  const [guardiansLoading, setGuardiansLoading] = useState(false);
  const [guardianSearch, setGuardianSearch] = useState('');
  const [startingChat, setStartingChat] = useState<string | null>(null);

  // Get active tab from URL
  const activeTab = parseInt(searchParams.get('tab') || '0');

  // Load initial data and set up subscriptions
  useEffect(() => {
    if (!selectedOrganization?.id) return;

    setLoading(true);

    // Load messaging settings
    getMessagingSettings(selectedOrganization.id)
      .then(setSettings)
      .catch(console.error);

    // Subscribe to active conversations
    const unsubscribeActive = subscribeToConversations(
      selectedOrganization.id,
      setConversations,
      'active'
    );

    // Subscribe to unread count
    const unsubscribeUnread = subscribeToUnreadCount(
      selectedOrganization.id,
      setTotalUnread
    );

    setLoading(false);

    return () => {
      unsubscribeActive();
      unsubscribeUnread();
    };
  }, [selectedOrganization?.id]);

  // Update selected conversation from URL
  useEffect(() => {
    if (conversationId) {
      setSelectedConversationId(conversationId);
    }
  }, [conversationId]);

  const handleTabChange = (tab: number) => {
    setSearchParams({ tab: tab.toString() });
    setSelectedConversationId(null);
    setShowCompose(false);
  };

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    setShowCompose(false);
  };

  const handleNewMessage = () => {
    setShowCompose(true);
    setSelectedConversationId(null);
  };

  const handleConversationCreated = (id: string) => {
    setShowCompose(false);
    setSelectedConversationId(id);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const tabs = [
    { label: 'Inbox', count: totalUnread },
    { label: 'Settings', count: 0 }
  ];

  const [sidebarView, setSidebarView] = useState<'conversations' | 'guardians'>('conversations');

  // Load guardians when sidebar view is guardians
  useEffect(() => {
    if (sidebarView === 'guardians' && selectedOrganization?.id && guardians.length === 0) {
      setGuardiansLoading(true);
      getUsersWithWhatsApp(selectedOrganization.id, 'guardian')
        .then(setGuardians)
        .catch(console.error)
        .finally(() => setGuardiansLoading(false));
    }
  }, [sidebarView, selectedOrganization?.id, guardians.length]);

  const handleStartChat = async (guardian: { id: string; name: string; phone: string; type: 'player' | 'guardian' }) => {
    if (!selectedOrganization?.id) return;

    setStartingChat(guardian.id);
    try {
      const conversation = await findOrCreateConversation(
        selectedOrganization.id,
        guardian.id,
        guardian.name,
        guardian.phone,
        guardian.type
      );
      setSelectedConversationId(conversation.id);
      setSidebarView('conversations'); // Switch to conversations view
    } catch (error) {
      console.error('Error starting chat:', error);
      showToast('Failed to start conversation', 'error');
    } finally {
      setStartingChat(null);
    }
  };

  const filteredGuardians = guardians.filter(g =>
    guardianSearch === '' ||
    g.name.toLowerCase().includes(guardianSearch.toLowerCase()) ||
    g.phone.includes(guardianSearch)
  );

  // Check if messaging is configured
  const isConfigured = settings?.enabled && settings?.twilioAccountSid;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900">Messages</h1>
          <p className="text-secondary-600">WhatsApp communication with players and guardians</p>
        </div>
        {canWrite('messaging') && activeTab === 0 && isConfigured && (
          <Button onClick={handleNewMessage}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Message
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-secondary-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab, index) => (
            <button
              key={tab.label}
              onClick={() => handleTabChange(index)}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap flex items-center gap-2
                ${activeTab === index
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'
                }
              `}
            >
              {tab.label}
              {tab.count > 0 && index === 0 && (
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-primary-100 text-primary-700">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="flex justify-center items-center min-h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <>
          {/* Inbox Tab */}
          {activeTab === 0 && (
            <>
              {!isConfigured ? (
                <Card className="p-8 text-center">
                  <svg className="w-16 h-16 text-secondary-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-secondary-900 mb-2">
                    WhatsApp Messaging Not Configured
                  </h3>
                  <p className="text-secondary-600 mb-4">
                    Configure your Twilio credentials in the Settings tab to start sending messages.
                  </p>
                  <Button onClick={() => handleTabChange(1)}>
                    Go to Settings
                  </Button>
                </Card>
              ) : (
                <div className="flex gap-6">
                  {/* Sidebar - Conversations / Guardians */}
                  <div className="w-72 flex-shrink-0">
                    <Card className="h-full">
                      {/* Toggle */}
                      <div className="p-2 border-b border-secondary-200">
                        <div className="flex bg-secondary-100 rounded-lg p-1">
                          <button
                            onClick={() => setSidebarView('conversations')}
                            className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                              sidebarView === 'conversations'
                                ? 'bg-white text-secondary-900 shadow-sm'
                                : 'text-secondary-600 hover:text-secondary-900'
                            }`}
                          >
                            Chats
                          </button>
                          <button
                            onClick={() => setSidebarView('guardians')}
                            className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                              sidebarView === 'guardians'
                                ? 'bg-white text-secondary-900 shadow-sm'
                                : 'text-secondary-600 hover:text-secondary-900'
                            }`}
                          >
                            Guardians
                          </button>
                        </div>
                      </div>

                      {sidebarView === 'conversations' ? (
                        <>
                          {/* Search */}
                          <div className="p-3 border-b border-secondary-200">
                            <div className="relative">
                              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-secondary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                              </svg>
                              <Input
                                type="text"
                                placeholder="Search chats..."
                                className="pl-10 text-sm"
                              />
                            </div>
                          </div>
                          {/* Conversation List */}
                          <div className="overflow-y-auto max-h-[calc(100vh-350px)]">
                            {conversations.length === 0 ? (
                              <div className="p-6 text-center">
                                <p className="text-secondary-500 text-sm">No conversations yet</p>
                              </div>
                            ) : (
                              conversations.map(conversation => (
                                <div
                                  key={conversation.id}
                                  onClick={() => handleSelectConversation(conversation.id)}
                                  className={`p-3 border-b border-secondary-100 cursor-pointer transition-colors ${
                                    selectedConversationId === conversation.id
                                      ? 'bg-primary-50 border-l-4 border-l-primary-500'
                                      : 'hover:bg-secondary-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
                                      conversation.participantType === 'player'
                                        ? 'bg-blue-100 text-blue-700'
                                        : conversation.participantType === 'guardian'
                                        ? 'bg-purple-100 text-purple-700'
                                        : 'bg-gray-100 text-gray-700'
                                    }`}>
                                      {conversation.participantName.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between">
                                        <p className="font-medium text-secondary-900 text-sm truncate">
                                          {conversation.participantType === 'unknown'
                                            ? conversation.participantPhone
                                            : conversation.participantName}
                                        </p>
                                        {conversation.unreadCount > 0 && (
                                          <span className="px-1.5 py-0.5 text-xs font-semibold rounded-full bg-primary-500 text-white">
                                            {conversation.unreadCount}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-secondary-500 truncate">
                                        {conversation.lastMessagePreview || 'No messages'}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Guardian Search */}
                          <div className="p-3 border-b border-secondary-200">
                            <div className="relative">
                              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-secondary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                              </svg>
                              <Input
                                type="text"
                                placeholder="Search guardians..."
                                value={guardianSearch}
                                onChange={(e) => setGuardianSearch(e.target.value)}
                                className="pl-10 text-sm"
                              />
                            </div>
                          </div>
                          {/* Guardian List */}
                          <div className="overflow-y-auto max-h-[calc(100vh-350px)]">
                            {guardiansLoading ? (
                              <div className="p-6 text-center">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto"></div>
                                <p className="text-secondary-500 text-sm mt-2">Loading...</p>
                              </div>
                            ) : filteredGuardians.length === 0 ? (
                              <div className="p-6 text-center">
                                <p className="text-secondary-500 text-sm">
                                  {guardianSearch ? 'No guardians found' : 'No guardians'}
                                </p>
                              </div>
                            ) : (
                              filteredGuardians.map((guardian) => (
                                <div
                                  key={guardian.id}
                                  onClick={() => handleStartChat(guardian)}
                                  className="p-3 border-b border-secondary-100 cursor-pointer hover:bg-secondary-50 transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-semibold">
                                      {guardian.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-secondary-900 text-sm truncate">{guardian.name}</p>
                                      <p className="text-xs text-secondary-500">{guardian.phone}</p>
                                    </div>
                                    {startingChat === guardian.id && (
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </Card>
                  </div>

                  {/* Conversation View / Compose */}
                  <div className="flex-1">
                    {showCompose ? (
                      <ComposeMessage
                        onConversationCreated={handleConversationCreated}
                        onCancel={() => setShowCompose(false)}
                      />
                    ) : selectedConversationId ? (
                      <ConversationView
                        conversationId={selectedConversationId}
                        onBack={() => setSelectedConversationId(null)}
                      />
                    ) : (
                      <Card className="p-8 text-center h-full flex flex-col items-center justify-center min-h-[400px]">
                        <svg className="w-16 h-16 text-secondary-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        <h3 className="text-lg font-medium text-secondary-900 mb-2">
                          Select a conversation
                        </h3>
                        <p className="text-secondary-500">
                          Choose a conversation from the list or start a new one.
                        </p>
                      </Card>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Settings Tab */}
          {activeTab === 1 && (
            <MessagingSettingsPanel
              settings={settings}
              onUpdate={setSettings}
              showToast={showToast}
            />
          )}
        </>
      )}

      {/* Toast */}
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

export default Messaging;
