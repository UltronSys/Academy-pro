import React, { useState, useEffect, useRef } from 'react';
import { Input } from './';
import { searchUsers as searchUsersAlgolia } from '../../services/algoliaService';
import { useAuth } from '../../contexts/AuthContext';

interface PlayerWithName {
  id: string;
  userName: string;
  email?: string;
}

interface PlayerMultiSelectProps {
  selectedPlayerIds: string[];
  onSelectionChange: (playerIds: string[], playerNames: string[]) => void;
  placeholder?: string;
  onReset?: () => void; // Optional callback to reset the component
}

const PlayerMultiSelect: React.FC<PlayerMultiSelectProps> = ({
  selectedPlayerIds,
  onSelectionChange,
  placeholder = "Type to search and select players...",
  onReset: _onReset
}) => {
  const { userData } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<PlayerWithName[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentlySelected, setRecentlySelected] = useState<string[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<PlayerWithName[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Algolia search for players
  useEffect(() => {
    const performSearch = async () => {
      if (searchTerm.length < 2) {
        setSearchResults([]);
        return;
      }

      const organizationId = userData?.roles[0]?.organizationId;
      if (!organizationId) return;

      setLoading(true);
      try {
        const results = await searchUsersAlgolia({
          query: searchTerm,
          organizationId,
          filters: {
            role: 'player'
          },
          page: 0,
          hitsPerPage: 20
        });


        const playersWithNames: PlayerWithName[] = results.users
          .filter(record => !selectedPlayerIds.includes(record.objectID))
          .map(record => ({
            id: record.objectID,
            userName: record.name,
            email: record.email
          }));


        setSearchResults(playersWithNames);
      } catch (error) {
        console.error('Error searching players:', error);
      } finally {
        setLoading(false);
      }
    };

    const searchTimer = setTimeout(() => {
      performSearch();
    }, 300); // Debounce search

    return () => clearTimeout(searchTimer);
  }, [searchTerm, selectedPlayerIds, userData]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load selected players names when selectedPlayerIds change
  useEffect(() => {
    const loadSelectedPlayers = async () => {
      if (selectedPlayerIds.length === 0) {
        setSelectedPlayers([]);
        return;
      }

      const organizationId = userData?.roles[0]?.organizationId;
      if (!organizationId) return;

      try {
        const results = await searchUsersAlgolia({
          query: '',
          organizationId,
          filters: {
            role: 'player'
          },
          page: 0,
          hitsPerPage: 100
        });

        const selectedPlayersData: PlayerWithName[] = results.users
          .filter(record => selectedPlayerIds.includes(record.objectID))
          .map(record => ({
            id: record.objectID,
            userName: record.name,
            email: record.email
          }));

        setSelectedPlayers(selectedPlayersData);
      } catch (error) {
        console.error('Error loading selected players:', error);
      }
    };

    loadSelectedPlayers();
  }, [selectedPlayerIds, userData]);

  const updateSelection = (newPlayerIds: string[]) => {
    const selectedNames = newPlayerIds.map(id => {
      const player = [...searchResults, ...selectedPlayers].find(p => p.id === id);
      return player?.userName || `Player ${id}`;
    });
    
    
    onSelectionChange(newPlayerIds, selectedNames);
  };

  const handlePlayerToggle = (playerId: string) => {
    if (selectedPlayerIds.includes(playerId)) {
      updateSelection(selectedPlayerIds.filter(id => id !== playerId));
      // Remove from recently selected if unselected
      const player = [...searchResults, ...selectedPlayers].find(p => p.id === playerId);
      if (player && player.userName) {
        setRecentlySelected(prev => prev.filter(name => name !== player.userName));
      }
    } else {
      updateSelection([...selectedPlayerIds, playerId]);
      const player = searchResults.find(p => p.id === playerId);
      if (player && player.userName) {
        // Add to recently selected list
        setRecentlySelected(prev => [...prev, player.userName]);
      }
    }
    // Clear search after selection
    setSearchTerm('');
  };


  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected Players Count Display - Only show count, not names */}
      {selectedPlayers.length > 0 && (
        <div className="mb-2 flex items-center space-x-2 p-2 bg-primary-50 rounded-lg border border-primary-200">
          <div className="flex items-center justify-center w-7 h-7 bg-primary-600 text-white rounded-full text-sm font-semibold">
            {selectedPlayers.length}
          </div>
          <span className="text-primary-800 font-medium text-sm">
            {selectedPlayers.length} player{selectedPlayers.length !== 1 ? 's' : ''} linked
          </span>
        </div>
      )}

      {/* Recently Selected Players Display */}
      {recentlySelected.length > 0 && (
        <div className="mb-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-green-800 font-medium text-sm">
              ✓ Recently Added:
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {recentlySelected.map((playerName, index) => (
              <span
                key={index}
                className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded text-sm font-medium"
              >
                {playerName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <Input
          type="text"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="w-full"
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          <svg
            className={`w-4 h-4 text-secondary-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-secondary-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {searchTerm.length < 2 ? (
            <div className="p-3 text-center text-secondary-500">
              Type at least 2 characters to search for players...
            </div>
          ) : loading ? (
            <div className="p-3 text-center text-secondary-500">
              Searching players...
            </div>
          ) : searchResults.length === 0 ? (
            <div className="p-3 text-center text-secondary-500">
              No players found matching "{searchTerm}"
            </div>
          ) : (
            <>
              {searchResults.map(player => (
                <label
                  key={player.id}
                  className="flex items-center space-x-3 p-3 hover:bg-secondary-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedPlayerIds.includes(player.id)}
                    onChange={() => handlePlayerToggle(player.id)}
                    className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-secondary-900">{player.userName}</div>
                  </div>
                </label>
              ))}
            </>
          )}
        </div>
      )}

      {/* Summary */}
      {selectedPlayerIds.length > 0 && (
        <div className="mt-2 text-sm text-secondary-600">
          {selectedPlayerIds.length} player{selectedPlayerIds.length !== 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
};

export default PlayerMultiSelect;