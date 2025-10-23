import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import { getPlayersByGuardianId } from '../../services/playerService';
import { searchUsers as searchUsersAlgolia } from '../../services/algoliaService';
import { DataTable } from '../ui';
import { useAuth } from '../../contexts/AuthContext';

interface GuardianPlayersDialogProps {
  guardian: User;
  users: User[]; // Current users list for quick lookup
  onClose: () => void;
}

const GuardianPlayersDialog: React.FC<GuardianPlayersDialogProps> = ({ guardian, users, onClose }) => {
  const { userData } = useAuth();
  const [players, setPlayers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPlayers = async () => {
      setLoading(true);
      setError(null);

      try {
        console.log('🔍 Loading players for guardian:', guardian.id, guardian.name);
        const playerDocs = await getPlayersByGuardianId(guardian.id);
        console.log('📋 Found player records:', playerDocs.length);

        if (playerDocs.length > 0) {
          console.log('👥 Player IDs found:', playerDocs.map(p => p.userId));
        }

        const playerUsers: User[] = [];

        // First try to find players in current users list
        for (const playerDoc of playerDocs) {
          const userDoc = users.find(u => u.id === playerDoc.userId);
          console.log('👤 Looking for player user:', playerDoc.userId, userDoc ? '✅ Found' : '❌ Not found locally');
          if (userDoc) {
            playerUsers.push(userDoc);
          }
        }

        // If we didn't find all users locally, search with Algolia
        if (playerUsers.length < playerDocs.length) {
          console.log('🔎 Some players not found locally, searching with Algolia...');
          const organizationId = userData?.roles[0]?.organizationId;
          if (organizationId) {
            const searchResults = await searchUsersAlgolia({
              query: '',
              organizationId,
              filters: {
                role: 'player'
              },
              page: 0,
              hitsPerPage: 1000
            });

            // Map Algolia results to User format
            const algoliaPlayers = searchResults.users.map(record => ({
              id: record.objectID,
              name: record.name,
              email: record.email || '',
              phone: record.phone,
              roles: record.roleDetails || [],
              createdAt: record.createdAt ? {
                toDate: () => new Date(record.createdAt!),
                seconds: Math.floor((record.createdAt || 0) / 1000),
                nanoseconds: 0,
                toMillis: () => record.createdAt || 0,
                isEqual: () => false,
                toJSON: () => ({ seconds: Math.floor((record.createdAt || 0) / 1000), nanoseconds: 0 })
              } as any : {
                toDate: () => new Date(),
                seconds: 0,
                nanoseconds: 0,
                toMillis: () => 0,
                isEqual: () => false,
                toJSON: () => ({ seconds: 0, nanoseconds: 0 })
              } as any,
              updatedAt: record.updatedAt ? {
                toDate: () => new Date(record.updatedAt!),
                seconds: Math.floor((record.updatedAt || 0) / 1000),
                nanoseconds: 0,
                toMillis: () => record.updatedAt || 0,
                isEqual: () => false,
                toJSON: () => ({ seconds: Math.floor((record.updatedAt || 0) / 1000), nanoseconds: 0 })
              } as any : {
                toDate: () => new Date(),
                seconds: 0,
                nanoseconds: 0,
                toMillis: () => 0,
                isEqual: () => false,
                toJSON: () => ({ seconds: 0, nanoseconds: 0 })
              } as any,
            } as User));

            console.log('🔎 Algolia returned', algoliaPlayers.length, 'players');

            // Add missing players from Algolia results
            for (const playerDoc of playerDocs) {
              if (!playerUsers.find(p => p.id === playerDoc.userId)) {
                const algoliaPlayer = algoliaPlayers.find(p => p.id === playerDoc.userId);
                if (algoliaPlayer) {
                  console.log('✅ Found missing player in Algolia:', playerDoc.userId);
                  playerUsers.push(algoliaPlayer);
                } else {
                  console.log('⚠️ Player not found in Algolia or local list:', playerDoc.userId);
                }
              }
            }
          }
        }

        console.log('📋 Total players loaded:', playerUsers.length);
        setPlayers(playerUsers);
      } catch (err) {
        console.error('❌ Error loading players for guardian:', err);
        setError('Failed to load players');
      } finally {
        setLoading(false);
      }
    };

    loadPlayers();
  }, [guardian.id, users, userData]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const columns = [
    {
      key: 'name',
      header: 'Player Name',
      render: (player: User) => (
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-700 rounded-full flex items-center justify-center text-white font-semibold text-sm">
            {getInitials(player.name)}
          </div>
          <div>
            <div className="text-sm font-medium text-secondary-900">{player.name}</div>
          </div>
        </div>
      )
    },
    {
      key: 'email',
      header: 'Email',
      render: (player: User) => (
        <div className="text-sm text-secondary-600">{player.email}</div>
      )
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (player: User) => (
        <div className="text-sm text-secondary-600">{player.phone || 'N/A'}</div>
      )
    }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-secondary-200">
          <h3 className="text-lg font-semibold text-secondary-900">
            Players for {guardian.name}
          </h3>
          <button
            onClick={onClose}
            className="text-secondary-400 hover:text-secondary-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
              <p className="text-secondary-600">Loading players...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-error-600 mb-2">⚠️ {error}</div>
              <button
                onClick={() => window.location.reload()}
                className="text-primary-600 hover:text-primary-700 text-sm"
              >
                Try again
              </button>
            </div>
          ) : players.length > 0 ? (
            <DataTable data={players} columns={columns} />
          ) : (
            <div className="text-center py-12">
              <div className="text-secondary-600 mb-4">No players linked to this guardian</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GuardianPlayersDialog;
