import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../../types';
import { getPlayerByUserId } from '../../services/playerService';
import { searchUsers as searchUsersAlgolia } from '../../services/algoliaService';
import { DataTable, Button } from '../ui';
import { useAuth } from '../../contexts/AuthContext';

interface PlayerGuardiansDialogProps {
  player: User;
  users: User[]; // Current users list for quick lookup
  onClose: () => void;
  onAddGuardian?: () => void; // Optional callback for custom add guardian behavior
}

const PlayerGuardiansDialog: React.FC<PlayerGuardiansDialogProps> = ({ player, users, onClose, onAddGuardian }) => {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const [guardians, setGuardians] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadGuardians = async () => {
      setLoading(true);
      setError(null);

      try {
        console.log('🔍 Loading guardians for player:', player.id, player.name);

        // Get player document to find guardian IDs
        const playerDoc = await getPlayerByUserId(player.id);

        if (!playerDoc || !playerDoc.guardianId || playerDoc.guardianId.length === 0) {
          console.log('⚠️ No guardians found for player');
          setGuardians([]);
          setLoading(false);
          return;
        }

        console.log('👥 Guardian IDs found:', playerDoc.guardianId);

        const guardianUsers: User[] = [];

        // First try to find guardians in current users list
        for (const guardianId of playerDoc.guardianId) {
          const userDoc = users.find(u => u.id === guardianId);
          console.log('👤 Looking for guardian user:', guardianId, userDoc ? '✅ Found' : '❌ Not found locally');
          if (userDoc) {
            guardianUsers.push(userDoc);
          }
        }

        // If we didn't find all guardians locally, search with Algolia
        if (guardianUsers.length < playerDoc.guardianId.length) {
          console.log('🔎 Some guardians not found locally, searching with Algolia...');
          const organizationId = userData?.roles[0]?.organizationId;
          if (organizationId) {
            const searchResults = await searchUsersAlgolia({
              query: '',
              organizationId,
              filters: {
                role: 'guardian'
              },
              page: 0,
              hitsPerPage: 1000
            });

            // Map Algolia results to User format and find missing guardians
            const algoliaGuardians = searchResults.users.map(record => ({
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

            // Add missing guardians from Algolia results
            for (const guardianId of playerDoc.guardianId) {
              if (!guardianUsers.find(g => g.id === guardianId)) {
                const algoliaGuardian = algoliaGuardians.find(g => g.id === guardianId);
                if (algoliaGuardian) {
                  console.log('✅ Found missing guardian in Algolia:', guardianId);
                  guardianUsers.push(algoliaGuardian);
                }
              }
            }
          }
        }

        console.log('📋 Total guardians loaded:', guardianUsers.length);
        setGuardians(guardianUsers);
      } catch (err) {
        console.error('❌ Error loading guardians for player:', err);
        setError('Failed to load guardians');
      } finally {
        setLoading(false);
      }
    };

    loadGuardians();
  }, [player.id, player.name, users, userData]);

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
      header: 'Guardian Name',
      render: (guardian: User) => (
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-700 rounded-full flex items-center justify-center text-white font-semibold text-sm">
            {getInitials(guardian.name)}
          </div>
          <div>
            <div className="text-sm font-medium text-secondary-900">{guardian.name}</div>
          </div>
        </div>
      )
    },
    {
      key: 'email',
      header: 'Email',
      render: (guardian: User) => (
        <div className="text-sm text-secondary-600">{guardian.email}</div>
      )
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (guardian: User) => (
        <div className="text-sm text-secondary-600">{guardian.phone || 'N/A'}</div>
      )
    }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-secondary-200">
          <h3 className="text-lg font-semibold text-secondary-900">
            Guardians for {player.name}
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
              <p className="text-secondary-600">Loading guardians...</p>
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
          ) : guardians.length > 0 ? (
            <DataTable data={guardians} columns={columns} />
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-secondary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-secondary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="text-secondary-600 mb-4">No guardians linked to this player</div>
              <p className="text-sm text-secondary-500 mb-6">Add a guardian to manage this player's account and receive updates.</p>
              <Button
                onClick={() => {
                  if (onAddGuardian) {
                    onAddGuardian();
                  } else {
                    // Default: navigate to edit player page
                    onClose();
                    navigate(`/users/edit/${player.id}`);
                  }
                }}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Guardian
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayerGuardiansDialog;
