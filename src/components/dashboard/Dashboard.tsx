import React, { useState, useEffect } from 'react';
import { Card, CardBody, Badge } from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '../../contexts/AppContext';
import { getUsersByOrganization, getUsersByAcademy } from '../../services/userService';
import { User } from '../../types';

// Icons - using simple SVG icons instead of Material UI icons
const SportsIcon = () => (
  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 7.172V5L8 4z" />
  </svg>
);

const AssignmentIcon = () => (
  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
);

const MoneyIcon = () => (
  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
  </svg>
);

const EventIcon = () => (
  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const ArrowUpIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
  </svg>
);

const PersonAddIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
  </svg>
);

const SchoolIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
  </svg>
);

const InsightsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

interface StatsCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  subtitle?: string;
  trend?: {
    value: number;
    direction: 'up' | 'down';
  };
}

const StatsCard: React.FC<StatsCardProps> = ({ title, value, icon, subtitle, trend }) => (
  <Card className="hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
    <CardBody>
      <div className="flex justify-between items-start mb-3 sm:mb-4">
        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-primary-600 to-primary-700 rounded-xl flex items-center justify-center text-white shadow-lg">
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 px-2 sm:px-3 py-1 rounded-lg ${
            trend.direction === 'up' ? 'bg-primary-50 text-primary-700' : 'bg-error-50 text-error-700'
          }`}>
            <ArrowUpIcon />
            <span className="text-xs sm:text-sm font-semibold">{trend.value}%</span>
          </div>
        )}
      </div>
      
      <div className="text-2xl sm:text-3xl font-bold text-secondary-900 mb-1">
        {value.toLocaleString()}
      </div>
      
      <div className="text-sm font-semibold text-secondary-700 mb-1">
        {title}
      </div>
      
      {subtitle && (
        <div className="text-xs text-secondary-600 font-normal">
          {subtitle}
        </div>
      )}
    </CardBody>
  </Card>
);

const Dashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [academyUsers, setAcademyUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const { userData, loading: authLoading } = useAuth();
  const { selectedOrganization, selectedAcademy } = useApp();

  const organizationId = userData?.roles[0]?.organizationId;
  

  useEffect(() => {
    const loadDashboardData = async () => {
      // Wait for auth to finish loading
      if (authLoading) {
        return;
      }

      try {
        setLoading(true);

        if (organizationId) {
          // Fetch organization users (academies come from AppContext now)
          const orgUsers = await getUsersByOrganization(organizationId);
          setUsers(orgUsers);

          // If academy is selected, fetch academy-specific users
          if (selectedAcademy) {
            const academySpecificUsers = await getUsersByAcademy(organizationId, selectedAcademy.id);
            setAcademyUsers(academySpecificUsers);
          } else {
            setAcademyUsers([]);
          }
        } else {
          // If no organizationId, show empty dashboard
          setUsers([]);
          setAcademyUsers([]);
        }
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [organizationId, selectedAcademy, authLoading]);

  const getStatsForUsers = (userList: User[]) => {
    const roleStats = {
      players: 0,
      coaches: 0,
      guardians: 0,
      admins: 0
    };

    userList.forEach(user => {
      user.roles.forEach(role => {
        if (role.organizationId === organizationId) {
          if (role.role.includes('player')) roleStats.players++;
          if (role.role.includes('coach')) roleStats.coaches++;
          if (role.role.includes('guardian')) roleStats.guardians++;
          if (role.role.includes('admin') || role.role.includes('owner')) roleStats.admins++;
        }
      });
    });

    return roleStats;
  };

  const orgStats = getStatsForUsers(users);
  const academyStats = getStatsForUsers(academyUsers);
  const displayStats = selectedAcademy ? academyStats : orgStats;
  const displayUsers = selectedAcademy ? academyUsers : users;

  const recentUsers = displayUsers.slice(0, 5);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-secondary-900">Dashboard</h1>
        <p className="text-secondary-600 mt-1 font-normal text-sm sm:text-base">
          {selectedAcademy 
            ? `${selectedAcademy.name} - ${selectedOrganization?.name}`
            : `${selectedOrganization?.name} - Organization Overview`
          }
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Students"
          value={displayStats.players}
          icon={<SportsIcon />}
          subtitle={selectedAcademy ? "In this academy" : "Across all academies"}
          trend={{ value: 12, direction: 'up' }}
        />
        <StatsCard
          title="Active Coaches"
          value={displayStats.coaches}
          icon={<AssignmentIcon />}
          subtitle={selectedAcademy ? "In this academy" : "Across all academies"}
          trend={{ value: 8, direction: 'up' }}
        />
        <StatsCard
          title="Revenue"
          value={25000}
          icon={<MoneyIcon />}
          subtitle="This month"
          trend={{ value: 15, direction: 'up' }}
        />
        <StatsCard
          title="Upcoming Sessions"
          value={8}
          icon={<EventIcon />}
          subtitle="This week"
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Growth Chart */}
        <Card>
          <CardBody>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">User Growth</h3>
                <p className="text-sm text-secondary-600 font-normal">Last 7 days</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-primary-50 text-primary-700 rounded-lg">
                <ArrowUpIcon />
                <span className="text-sm font-semibold">23%</span>
              </div>
            </div>
            
            <div className="h-64 relative">
              {/* Simple SVG Chart */}
              <svg className="w-full h-full" viewBox="0 0 400 200">
                {/* Grid lines */}
                <defs>
                  <pattern id="grid" width="40" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="1"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
                
                {/* Chart area */}
                <path
                  d="M 20 160 L 80 140 L 140 120 L 200 100 L 260 80 L 320 60 L 380 40"
                  fill="none"
                  stroke="#16a34a"
                  strokeWidth="3"
                  className="drop-shadow-sm"
                />
                
                {/* Area under curve */}
                <path
                  d="M 20 160 L 80 140 L 140 120 L 200 100 L 260 80 L 320 60 L 380 40 L 380 200 L 20 200 Z"
                  fill="url(#gradient)"
                  opacity="0.3"
                />
                
                {/* Gradient definition */}
                <defs>
                  <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity="0.8"/>
                    <stop offset="100%" stopColor="#16a34a" stopOpacity="0.1"/>
                  </linearGradient>
                </defs>
                
                {/* Data points */}
                <circle cx="20" cy="160" r="4" fill="#16a34a" className="drop-shadow-sm"/>
                <circle cx="80" cy="140" r="4" fill="#16a34a" className="drop-shadow-sm"/>
                <circle cx="140" cy="120" r="4" fill="#16a34a" className="drop-shadow-sm"/>
                <circle cx="200" cy="100" r="4" fill="#16a34a" className="drop-shadow-sm"/>
                <circle cx="260" cy="80" r="4" fill="#16a34a" className="drop-shadow-sm"/>
                <circle cx="320" cy="60" r="4" fill="#16a34a" className="drop-shadow-sm"/>
                <circle cx="380" cy="40" r="4" fill="#16a34a" className="drop-shadow-sm"/>
                
                {/* Labels */}
                <text x="20" y="190" textAnchor="middle" className="text-xs fill-secondary-600" fontSize="10">Mon</text>
                <text x="80" y="190" textAnchor="middle" className="text-xs fill-secondary-600" fontSize="10">Tue</text>
                <text x="140" y="190" textAnchor="middle" className="text-xs fill-secondary-600" fontSize="10">Wed</text>
                <text x="200" y="190" textAnchor="middle" className="text-xs fill-secondary-600" fontSize="10">Thu</text>
                <text x="260" y="190" textAnchor="middle" className="text-xs fill-secondary-600" fontSize="10">Fri</text>
                <text x="320" y="190" textAnchor="middle" className="text-xs fill-secondary-600" fontSize="10">Sat</text>
                <text x="380" y="190" textAnchor="middle" className="text-xs fill-secondary-600" fontSize="10">Sun</text>
              </svg>
            </div>
            
            <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-secondary-200">
              <div className="text-center">
                <div className="text-lg font-bold text-secondary-900">12</div>
                <div className="text-xs text-secondary-600 font-normal">New Users</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-secondary-900">8</div>
                <div className="text-xs text-secondary-600 font-normal">Active Today</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-secondary-900">92%</div>
                <div className="text-xs text-secondary-600 font-normal">Retention</div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Recent Users */}
        <Card>
          <CardBody>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">Recent Users</h3>
                <p className="text-sm text-secondary-600 font-normal">Latest registered members</p>
              </div>
              <button className="text-primary-600 hover:text-primary-700 text-sm font-semibold">
                View all
              </button>
            </div>
            
            {recentUsers.length > 0 ? (
              <div className="space-y-4">
                {recentUsers.map((user) => (
                  <div key={user.id} className="flex items-center space-x-3 p-3 rounded-lg hover:bg-secondary-50 transition-colors duration-200">
                    <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-700 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                      {getInitials(user.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-secondary-900 text-sm truncate">{user.name}</div>
                      <div className="text-xs text-secondary-600 font-normal truncate">{user.email}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex gap-1">
                        {user.roles
                          .filter(role => role.organizationId === organizationId)
                          .slice(0, 2)
                          .map((role, index) => 
                            role.role.slice(0, 1).map((roleType, roleIndex) => (
                              <Badge
                                key={`${index}-${roleIndex}`}
                                variant="default"
                                size="sm"
                                className="bg-primary-50 text-primary-700 border-primary-200 text-xs"
                              >
                                {roleType}
                              </Badge>
                            ))
                          )}
                        {user.roles.filter(role => role.organizationId === organizationId).length > 2 && (
                          <span className="text-xs text-secondary-500">+{user.roles.filter(role => role.organizationId === organizationId).length - 2}</span>
                        )}
                      </div>
                      <div className="text-xs text-secondary-500 font-normal">2h ago</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-secondary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <PersonAddIcon />
                </div>
                <h4 className="text-lg font-semibold text-secondary-900 mb-2">No users found</h4>
                <p className="text-secondary-600 mb-4 font-normal">Start by adding your first users to get started</p>
                <button className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-700 text-white font-semibold rounded-lg hover:from-primary-700 hover:to-primary-800 transition-all duration-200 text-sm">
                  <PersonAddIcon />
                  Add User
                </button>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <Card>
          <CardBody>
            <h3 className="text-lg font-semibold text-secondary-900 mb-4">Quick Actions</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white font-semibold rounded-lg hover:from-primary-700 hover:to-primary-800 transition-all duration-200">
                <PersonAddIcon />
                <span className="hidden sm:inline">Add User</span>
              </button>
              <button className="flex items-center gap-3 px-4 py-3 border border-primary-300 text-primary-700 font-semibold rounded-lg hover:bg-primary-50 transition-all duration-200">
                <SchoolIcon />
                <span className="hidden sm:inline">Create Group</span>
              </button>
              <button className="flex items-center gap-3 px-4 py-3 border border-primary-300 text-primary-700 font-semibold rounded-lg hover:bg-primary-50 transition-all duration-200">
                <InsightsIcon />
                <span className="hidden sm:inline">View Reports</span>
              </button>
            </div>
          </CardBody>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardBody>
            <h3 className="text-lg font-semibold text-secondary-900 mb-4">Recent Activity</h3>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary-50">
                <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                  <PersonAddIcon />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-secondary-900 text-sm">New user registered</div>
                  <div className="text-xs text-secondary-600 font-normal">2 hours ago</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary-50">
                <div className="w-8 h-8 bg-success-600 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-secondary-900 text-sm">Session completed</div>
                  <div className="text-xs text-secondary-600 font-normal">5 hours ago</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary-50">
                <div className="w-8 h-8 bg-warning-600 rounded-full flex items-center justify-center">
                  <MoneyIcon />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-secondary-900 text-sm">Payment received</div>
                  <div className="text-xs text-secondary-600 font-normal">1 day ago</div>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;