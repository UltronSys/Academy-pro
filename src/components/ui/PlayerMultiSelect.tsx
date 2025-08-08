import React, { useState, useEffect, useRef } from 'react';
import { Input, Button } from './';
import { Player } from '../../types';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';

interface PlayerWithName extends Player {
  userName?: string;
}

interface PlayerMultiSelectProps {
  players: Player[];
  selectedPlayerIds: string[];
  onSelectionChange: (playerIds: string[], playerNames: string[]) => void;
  placeholder?: string;
}

const PlayerMultiSelect: React.FC<PlayerMultiSelectProps> = ({
  players,
  selectedPlayerIds,
  onSelectionChange,
  placeholder = "Search and select players..."
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [playersWithNames, setPlayersWithNames] = useState<PlayerWithName[]>([]);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load player names from user documents
  useEffect(() => {
    const loadPlayerNames = async () => {
      setLoading(true);
      try {
        const playersWithNamesPromises = players.map(async (player) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', player.userId));
            const userName = userDoc.exists() ? userDoc.data().name : `Player ${player.userId}`;
            return { ...player, userName };
          } catch (error) {
            console.error(`Error loading name for player ${player.userId}:`, error);
            return { ...player, userName: `Player ${player.userId}` };
          }
        });

        const results = await Promise.all(playersWithNamesPromises);
        setPlayersWithNames(results);
      } catch (error) {
        console.error('Error loading player names:', error);
      } finally {
        setLoading(false);
      }
    };

    if (players.length > 0) {
      loadPlayerNames();
    } else {
      setLoading(false);
    }
  }, [players]);

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

  const filteredPlayers = playersWithNames.filter(player =>
    player.userName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedPlayers = playersWithNames.filter(player =>
    selectedPlayerIds.includes(player.id)
  );

  const updateSelection = (newPlayerIds: string[]) => {
    const selectedNames = newPlayerIds.map(id => {
      const player = playersWithNames.find(p => p.id === id);
      return player?.userName || `Player ${id}`;
    });
    onSelectionChange(newPlayerIds, selectedNames);
  };

  const handlePlayerToggle = (playerId: string) => {
    if (selectedPlayerIds.includes(playerId)) {
      updateSelection(selectedPlayerIds.filter(id => id !== playerId));
    } else {
      updateSelection([...selectedPlayerIds, playerId]);
    }
  };

  const handleRemovePlayer = (playerId: string) => {
    updateSelection(selectedPlayerIds.filter(id => id !== playerId));
  };

  const handleClearAll = () => {
    updateSelection([]);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected Players Display */}
      {selectedPlayers.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {selectedPlayers.map(player => (
            <span
              key={player.id}
              className="inline-flex items-center px-2 py-1 rounded-md text-sm bg-primary-100 text-primary-800"
            >
              {player.userName}
              <button
                type="button"
                onClick={() => handleRemovePlayer(player.id)}
                className="ml-1 hover:text-primary-600"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={handleClearAll}
            className="text-xs text-secondary-500 hover:text-secondary-700 underline"
          >
            Clear all
          </button>
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
          {loading ? (
            <div className="p-3 text-center text-secondary-500">
              Loading players...
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="p-3 text-center text-secondary-500">
              {searchTerm ? 'No players found matching your search' : 'No players available'}
            </div>
          ) : (
            <>
              {filteredPlayers.map(player => (
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