import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardBody,
  Badge,
  Alert,
  Avatar
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
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { userData } = useAuth();

  useEffect(() => {
    if (userData && userId) {
      loadUserDetails();
      loadAcademies();
    }
  }, [userData, userId]);

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-secondary-900">User Details</h1>
          <p className="text-secondary-600 mt-1 font-normal">Complete profile overview</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            icon={<ArrowLeftIcon />}
            onClick={() => navigate('/users')}
          >
            Back to Users
          </Button>
          <Button
            icon={<EditIcon />}
            onClick={() => navigate(`/users/edit/${user.id}`)}
            className="bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800"
          >
            Edit User
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="error">
          {error}
        </Alert>
      )}

      {/* User Profile Card */}
      <Card>
        <CardBody>
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0">
              <Avatar size="xl" className="border-4 border-primary-100">
                {getInitials(user.name)}
              </Avatar>
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-secondary-900 mb-2">{user.name}</h2>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {user.roles?.flatMap(role => role.role).map((role, index) => (
                      <Badge
                        key={index}
                        variant={role === 'owner' ? 'error' : role === 'admin' ? 'warning' : 'default'}
                      >
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-secondary-600 font-normal">Member since</p>
                  <p className="font-semibold text-secondary-900">
                    {user.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
                  </p>
                </div>
              </div>
              
              {/* Contact Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 bg-secondary-50 rounded-lg">
                  <EmailIcon />
                  <div>
                    <p className="text-xs text-secondary-600 font-normal">Email</p>
                    <p className="font-semibold text-secondary-900">{user.email || 'Not provided'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-secondary-50 rounded-lg">
                  <PhoneIcon />
                  <div>
                    <p className="text-xs text-secondary-600 font-normal">Phone</p>
                    <p className="font-semibold text-secondary-900">{user.phone || 'Not provided'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Academy Access */}
      <Card>
        <CardBody>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
              <SchoolIcon />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-secondary-900">Academy Access</h3>
              <p className="text-secondary-600 font-normal">Current academy assignments</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {getUserAcademies(user.roles).map((academy, index) => (
              <Badge key={index} variant="primary" size="lg">
                {academy}
              </Badge>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Player Details */}
      {user.roles?.some(role => role.role.includes('player')) && (
        <Card>
          <CardBody>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 7.172V5L8 4z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">Player Information</h3>
                <p className="text-secondary-600 font-normal">Athletic and personal details</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 bg-secondary-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarIcon />
                  <p className="text-sm font-semibold text-secondary-800">Date of Birth</p>
                </div>
                <p className="font-semibold text-secondary-900">{formatDate(player?.dob)}</p>
              </div>
              
              <div className="p-4 bg-secondary-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <UserIcon />
                  <p className="text-sm font-semibold text-secondary-800">Gender</p>
                </div>
                <p className="font-semibold text-secondary-900 capitalize">
                  {player?.gender || 'Not provided'}
                </p>
              </div>
              
              {player?.playerParameters && Object.keys(player.playerParameters).length > 0 && (
                <div className="md:col-span-2 lg:col-span-1">
                  <div className="p-4 bg-primary-50 rounded-lg">
                    <p className="text-sm font-semibold text-primary-800 mb-3">Additional Details</p>
                    <div className="space-y-2">
                      {Object.entries(player.playerParameters).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-xs text-primary-700 font-normal capitalize">
                            {key.replace(/_/g, ' ')}:
                          </span>
                          <span className="text-xs font-semibold text-primary-900">
                            {String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Account Status */}
      <Card>
        <CardBody>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-success-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-secondary-900">Account Status</h3>
              <p className="text-secondary-600 font-normal">Current account information</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-success-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-success-600 mb-1">Active</div>
              <div className="text-sm text-success-700 font-normal">Account Status</div>
            </div>
            <div className="p-4 bg-secondary-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-secondary-900 mb-1">
                {user.roles?.length || 0}
              </div>
              <div className="text-sm text-secondary-600 font-normal">Active Roles</div>
            </div>
            <div className="p-4 bg-secondary-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-secondary-900 mb-1">
                {getUserAcademies(user.roles || []).length}
              </div>
              <div className="text-sm text-secondary-600 font-normal">Academy Access</div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default UserDetails;