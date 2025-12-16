import React from 'react';
import { Message } from '../../types';
import { Timestamp } from 'firebase/firestore';

interface MessageBubbleProps {
  message: Message;
  isOutbound: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isOutbound }) => {
  const formatTime = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return '';
    return timestamp.toDate().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusIcon = () => {
    switch (message.twilioStatus) {
      case 'queued':
        return (
          <svg className="w-4 h-4 text-secondary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'sent':
        return (
          <svg className="w-4 h-4 text-secondary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'delivered':
        return (
          <svg className="w-4 h-4 text-secondary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7M5 13l4 4L19 7" />
          </svg>
        );
      case 'read':
        return (
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7M5 13l4 4L19 7" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-4 h-4 text-error-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`
          max-w-[80%] sm:max-w-[70%] rounded-2xl px-4 py-2 shadow-sm
          ${isOutbound
            ? 'bg-primary-500 text-white rounded-br-md'
            : 'bg-white border border-secondary-200 text-secondary-900 rounded-bl-md'
          }
        `}
      >
        {/* Sender name for inbound */}
        {!isOutbound && message.senderName && (
          <p className="text-xs font-medium text-secondary-500 mb-1">
            {message.senderName}
          </p>
        )}

        {/* Message body */}
        <p className="whitespace-pre-wrap break-words">{message.body}</p>

        {/* Media attachment */}
        {message.mediaUrl && (
          <div className="mt-2">
            {message.mediaType?.startsWith('image/') ? (
              <img
                src={message.mediaUrl}
                alt="Attachment"
                className="max-w-full rounded-lg"
              />
            ) : (
              <a
                href={message.mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`
                  flex items-center gap-2 text-sm underline
                  ${isOutbound ? 'text-white/90' : 'text-primary-600'}
                `}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                View attachment
              </a>
            )}
          </div>
        )}

        {/* Footer */}
        <div className={`
          flex items-center gap-2 mt-1
          ${isOutbound ? 'justify-end' : 'justify-start'}
        `}>
          <span className={`text-xs ${isOutbound ? 'text-white/70' : 'text-secondary-400'}`}>
            {formatTime(message.sentAt)}
          </span>
          {isOutbound && getStatusIcon()}
        </div>

        {/* Error message */}
        {message.twilioStatus === 'failed' && message.twilioErrorMessage && (
          <p className={`text-xs mt-1 ${isOutbound ? 'text-white/70' : 'text-error-500'}`}>
            Failed: {message.twilioErrorMessage}
          </p>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
