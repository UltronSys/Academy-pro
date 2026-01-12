import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardBody,
  Badge,
  Alert,
  Avatar,
} from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { User, Player, Academy } from '../../types';
import { getUserById } from '../../services/userService';
import { getPlayerByUserId } from '../../services/playerService';
import { getAcademiesByOrganization } from '../../services/academyService';

// Icons
const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const EditIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const UserIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const EmailIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const PhoneIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const SchoolIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
  </svg>
);

const UserDetails: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [guardians, setGuardians] = useState<User[]>([]);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  

  const { userData } = useAuth();

  useEffect(() => {
    if (userData && userId) {
      loadUserDetails();
      loadAcademies();
    }
  }, [userData, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadUserDetails = async () => {
    try {
      setLoading(true);
      const userDetails = await getUserById(userId!);
      setUser(userDetails);

      // Load player data if user has player role
      if (userDetails?.roles?.some(role => role.role.includes('player'))) {
        try {
          const playerData = await getPlayerByUserId(userDetails.id);
          setPlayer(playerData);
          
          // Load guardian information if player has guardians
          if (playerData?.guardianId && playerData.guardianId.length > 0) {
            try {
              const guardiansData = await Promise.all(
                playerData.guardianId.map(id => getUserById(id))
              );
              setGuardians(guardiansData.filter(g => g !== null) as User[]);
            } catch (error) {
              console.error('Error loading guardian data:', error);
            }
          }
        } catch (error) {
          console.error('Error loading player data:', error);
        }
      }
    } catch (error) {
      console.error('Error loading user:', error);
      setError('Failed to load user details');
    } finally {
      setLoading(false);
    }
  };

  const loadAcademies = async () => {
    try {
      const organizationId = userData?.roles?.[0]?.organizationId;
      if (organizationId) {
        const orgAcademies = await getAcademiesByOrganization(organizationId);
        setAcademies(orgAcademies);
      }
    } catch (error) {
      console.error('Error loading academies:', error);
    }
  };


  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getUserAcademies = (userRoles: any[]) => {
    if (!userRoles || userRoles.length === 0) return [];
    
    const academyIds = userRoles.flatMap(role => role.academyId || []);
    
    if (academyIds.length === 0) {
      return ['Organization-wide'];
    }
    
    return academyIds.map(id => {
      const academy = academies.find(a => a.id === id);
      return academy?.name || 'Unknown Academy';
    });
  };

  const formatDate = (dateValue: any) => {
    if (!dateValue) return 'Not provided';
    
    try {
      let date: Date;
      if (dateValue instanceof Date) {
        date = dateValue;
      } else if (dateValue.toDate && typeof dateValue.toDate === 'function') {
        date = dateValue.toDate();
      } else if (typeof dateValue === 'string') {
        date = new Date(dateValue);
      } else {
        return 'Invalid date';
      }
      
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      
      return date.toLocaleDateString();
    } catch (error) {
      return 'Invalid date';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <Alert variant="error">User not found</Alert>
        <Button
          variant="outline"
          icon={<ArrowLeftIcon />}
          onClick={() => navigate('/users')}
        >
          Back to Users
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white shadow-sm rounded-lg p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">User Details</h1>
            <p className="text-gray-600 mt-1">Complete profile overview</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              icon={<ArrowLeftIcon />}
              onClick={() => navigate('/users')}
              className="border-gray-300 hover:bg-gray-50"
            >
              Back to Users
            </Button>
            <Button
              icon={<EditIcon />}
              onClick={() => navigate('/users', { state: { editUserId: user.id } })}
              className="bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 shadow-sm"
            >
              Edit User
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="error">
          {error}
        </Alert>
      )}

      {/* User Profile Card */}
      <Card className="shadow-lg border-0">
        <CardBody className="p-8">
          <div className="flex flex-col md:flex-row items-start gap-8">
            <div className="flex-shrink-0">
              <Avatar size="xl" className="w-24 h-24 text-2xl font-bold bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-lg">
                {getInitials(user.name)}
              </Avatar>
            </div>
            <div className="flex-1">
              <div className="flex flex-col md:flex-row justify-between items-start mb-6">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-3">{user.name}</h2>
                  <div className="flex flex-wrap gap-2">
                    {user.roles?.flatMap(role => role.role).map((role, index) => (
                      <Badge
                        key={index}
                        variant={role === 'owner' ? 'error' : role === 'admin' ? 'warning' : 'primary'}
                        className="px-3 py-1 text-sm font-semibold"
                      >
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="mt-4 md:mt-0 text-left md:text-right">
                  <p className="text-sm text-gray-500">Member since</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {user.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
                  </p>
                </div>
              </div>
              
              {/* Contact Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-sm transition-shadow">
                  <div className="text-primary-600">
                    <EmailIcon />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Email</p>
                    <p className="font-semibold text-gray-900">{user.email || 'Not provided'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-sm transition-shadow">
                  <div className="text-primary-600">
                    <PhoneIcon />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Phone</p>
                    <p className="font-semibold text-gray-900">{user.phone || 'Not provided'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Academy Access */}
      <Card className="shadow-lg border-0">
        <CardBody className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-primary-100 to-primary-200 rounded-xl flex items-center justify-center shadow-sm">
              <SchoolIcon />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Academy Access</h3>
              <p className="text-gray-600">Current academy assignments</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3">
            {getUserAcademies(user.roles).map((academy, index) => (
              <Badge key={index} variant="primary" size="lg" className="px-4 py-2 text-sm font-semibold shadow-sm">
                {academy}
              </Badge>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Player Details */}
      {user.roles?.some(role => role.role.includes('player')) && (
        <Card className="shadow-lg border-0">
          <CardBody className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-primary-100 to-primary-200 rounded-xl flex items-center justify-center shadow-sm">
                <svg className="w-6 h-6 text-primary-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 7.172V5L8 4z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Player Information</h3>
                <p className="text-gray-600">Athletic and personal details</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="text-blue-600">
                    <CalendarIcon />
                  </div>
                  <p className="text-sm font-semibold text-gray-700">Date of Birth</p>
                </div>
                <p className="text-lg font-bold text-gray-900">{formatDate(player?.dob)}</p>
              </div>
              
              <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="text-purple-600">
                    <UserIcon />
                  </div>
                  <p className="text-sm font-semibold text-gray-700">Gender</p>
                </div>
                <p className="text-lg font-bold text-gray-900 capitalize">
                  {player?.gender || 'Not provided'}
                </p>
              </div>
              
              {player?.playerParameters && Object.keys(player.playerParameters).length > 0 && (
                <div className="md:col-span-2 lg:col-span-1">
                  <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
                    <p className="text-sm font-semibold text-gray-700 mb-3">Additional Details</p>
                    <div className="space-y-2">
                      {Object.entries(player.playerParameters).map(([key, value]) => (
                        <div key={key} className="flex justify-between items-center">
                          <span className="text-sm text-gray-600 capitalize">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="text-sm font-semibold text-gray-900">
                            {String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Guardian Information */}
            {guardians.length > 0 && (
              <div className="mt-8 pt-8 border-t border-gray-200">
                <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Guardian Information
                </h4>
                <div className="space-y-4">
                  {guardians.map((guardian) => (
                    <div key={guardian.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200 hover:shadow-md transition-all">
                      <div className="flex items-center gap-4 mb-3 sm:mb-0">
                        <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center text-white font-bold shadow-sm">
                          {guardian.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-lg">{guardian.name}</p>
                          <p className="text-sm text-gray-600">{guardian.email}</p>
                          {guardian.phone && (
                            <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              {guardian.phone}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => navigate(`/users/${guardian.id}`)}
                        className="bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 shadow-sm"
                      >
                        View Profile
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}


      {/* Account Status */}
      <Card className="shadow-lg border-0">
        <CardBody className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-green-100 to-green-200 rounded-xl flex items-center justify-center shadow-sm">
              <svg className="w-6 h-6 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Account Status</h3>
              <p className="text-gray-600">Current account information</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-green-50 to-emerald-100 p-6 rounded-lg text-center border border-green-200 shadow-sm">
              <div className="text-3xl font-bold text-green-700 mb-2">Active</div>
              <div className="text-sm text-gray-600">Account Status</div>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-indigo-100 p-6 rounded-lg text-center border border-blue-200 shadow-sm">
              <div className="text-3xl font-bold text-blue-700 mb-2">
                {user.roles?.length || 0}
              </div>
              <div className="text-sm text-gray-600">Active Roles</div>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-pink-100 p-6 rounded-lg text-center border border-purple-200 shadow-sm">
              <div className="text-3xl font-bold text-purple-700 mb-2">
                {getUserAcademies(user.roles || []).length}
              </div>
              <div className="text-sm text-gray-600">Academy Access</div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default UserDetails;