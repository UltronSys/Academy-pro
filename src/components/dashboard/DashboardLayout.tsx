import React, { useState, useEffect } from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '../../contexts/AppContext';
import { usePermissions } from '../../hooks/usePermissions';
import { getAcademiesByOrganization } from '../../services/academyService';
import { getOrganization } from '../../services/organizationService';
import { Academy, Organization } from '../../types';
import { Avatar, Select } from '../ui';

// Icons
const MenuIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const DashboardIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const ProductsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);

const TransactionsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);

const PaymentsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const StatsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const PeopleIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
  </svg>
);

const SchoolIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
  </svg>
);


const AllUsersIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);

const PlayersIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const CoachesIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);

const GuardiansIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const AdminsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
  </svg>
);

const FinanceIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);




const UserIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const ChevronUpIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const LogoutIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

const BellIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);


interface DashboardLayoutProps {
  children?: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [usersExpanded, setUsersExpanded] = useState(location.pathname.startsWith('/users'));
  const [financeExpanded, setFinanceExpanded] = useState(location.pathname.startsWith('/finance'));
  const { currentUser, userData, logout, refreshUserData } = useAuth();
  const { selectedAcademy, setSelectedAcademy, setSelectedOrganization } = useApp();
  const { canRead } = usePermissions();

  const organizationId = userData?.roles[0]?.organizationId;
  
  // Check if we have navigation state from signup
  const navigationState = location.state as any;

  // Get user's primary role for display
  const getUserRole = () => {
    if (!userData?.roles || userData.roles.length === 0) return 'User';
    
    const primaryRole = userData.roles[0];
    if (primaryRole.role.includes('owner')) return 'Owner';
    if (primaryRole.role.includes('admin')) return 'Administrator';
    if (primaryRole.role.includes('coach')) return 'Coach';
    if (primaryRole.role.includes('player')) return 'Player';
    if (primaryRole.role.includes('guardian')) return 'Guardian';
    
    return 'User';
  };

  useEffect(() => {
    setUsersExpanded(location.pathname.startsWith('/users'));
    setFinanceExpanded(location.pathname.startsWith('/finance'));
  }, [location.pathname]);

  // First priority: Use navigation state if available (from signup)
  useEffect(() => {
    if (navigationState?.justSignedUp) {
      
      // Force refresh user data from AuthContext to sync with the new user
      if (navigationState.userData) {
        
        // Immediate refresh
        refreshUserData().then(() => {
        }).catch((error) => {
          console.error('DashboardLayout: Failed to refresh AuthContext:', error);
        });
        
        // Backup refresh after a short delay to ensure it's loaded
        setTimeout(() => {
          refreshUserData().catch((error) => {
            console.error('DashboardLayout: Backup refresh failed:', error);
          });
        }, 1000);
      }
      
      if (navigationState.organization) {
        setOrganization(navigationState.organization);
        setSelectedOrganization(navigationState.organization);
      }
      
      if (navigationState.academies && navigationState.academies.length > 0) {
        setAcademies(navigationState.academies);
        if (selectedAcademy === undefined) {
          setSelectedAcademy(null); // Start with "All Academies" selected
        }
      }
      
      
      // Clear the navigation state to prevent reuse
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [navigationState, setSelectedOrganization, setSelectedAcademy, selectedAcademy, navigate, location.pathname, refreshUserData]);

  // Second priority: Load data normally if we have organizationId but no data
  useEffect(() => {
    const loadData = async () => {
      // Skip if we just used navigation state or if we already have data
      if (navigationState?.justSignedUp || !organizationId || (organization && academies.length > 0)) {
        return;
      }
      
      try {
        
        const [orgData, academyData] = await Promise.all([
          getOrganization(organizationId),
          getAcademiesByOrganization(organizationId)
        ]);
        
        
        if (orgData) {
          setOrganization(orgData);
          setSelectedOrganization(orgData);
        }
        
        setAcademies(academyData);
        // Only set the first academy as selected if no academy is currently selected
        // and we're not explicitly showing "All Academies"
        if (academyData.length > 0 && selectedAcademy === undefined) {
          setSelectedAcademy(null); // Start with "All Academies" selected
        }
      } catch (error) {
        console.error('DashboardLayout: Error loading data:', error);
      }
    };

    loadData();
  }, [organizationId, setSelectedOrganization, setSelectedAcademy, organization, academies.length, selectedAcademy, navigationState]);

  // Fallback: Force reload if userData changes and we still don't have data
  useEffect(() => {
    if (userData && organizationId && !navigationState?.justSignedUp && (!organization || academies.length === 0)) {
      
      const forceReload = async () => {
        try {
          const [orgData, academyData] = await Promise.all([
            getOrganization(organizationId),
            getAcademiesByOrganization(organizationId)
          ]);
          
          if (orgData) {
            setOrganization(orgData);
            setSelectedOrganization(orgData);
          }
          
          if (academyData && academyData.length > 0) {
            setAcademies(academyData);
            if (selectedAcademy === undefined) {
              setSelectedAcademy(null);
            }
          }
          
        } catch (error) {
          console.error('DashboardLayout: Force reload failed:', error);
        }
      };
      
      forceReload();
    }
  }, [userData, organizationId, organization, academies.length, selectedAcademy, setSelectedOrganization, setSelectedAcademy, navigationState]);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
    setProfileMenuOpen(false);
  };

  const allMenuItems = [
    { 
      text: 'Dashboard', 
      icon: <DashboardIcon />, 
      path: '/dashboard',
      description: 'Overview & Analytics',
      resource: null // Dashboard doesn't require specific permissions
    },
    { 
      text: 'Users', 
      icon: <PeopleIcon />, 
      path: '/users',
      description: 'Manage Users & Staff',
      resource: 'users',
      hasSubItems: true,
      subItems: [
        { text: 'All Users', path: '/users?tab=0', icon: <AllUsersIcon /> },
        { text: 'Players', path: '/users?tab=1', icon: <PlayersIcon /> },
        { text: 'Coaches', path: '/users?tab=2', icon: <CoachesIcon /> },
        { text: 'Guardians', path: '/users?tab=3', icon: <GuardiansIcon /> },
        { text: 'Admins', path: '/users?tab=4', icon: <AdminsIcon /> }
      ]
    },
    { 
      text: 'Finance', 
      icon: <FinanceIcon />, 
      path: '/finance',
      description: 'Financial Management',
      resource: 'finance',
      hasSubItems: true,
      subItems: [
        { text: 'Products', path: '/finance?tab=0', icon: <ProductsIcon /> },
        { text: 'Transactions', path: '/finance?tab=1', icon: <TransactionsIcon /> },
        { text: 'Players/Guardians', path: '/finance?tab=2', icon: <PaymentsIcon /> },
        { text: 'Stats', path: '/finance?tab=3', icon: <StatsIcon /> }
      ]
    },
    { 
      text: 'Settings', 
      icon: <SettingsIcon />, 
      path: '/settings',
      description: 'System Configuration',
      resource: 'settings'
    },
  ];

  // Filter menu items based on permissions
  const menuItems = allMenuItems.filter(item => {
    if (!item.resource) return true; // Dashboard is always visible
    const hasAccess = canRead(item.resource as any);
    return hasAccess;
  });

  const drawer = (
    <div className="h-full bg-white flex flex-col">
      {/* Logo */}
      <div className="flex items-center space-x-3 px-4 sm:px-6 py-4 border-b border-secondary-200 flex-shrink-0">
        <div className="flex items-center justify-center w-12 h-12 bg-white rounded-lg overflow-hidden">
          <img
            src="/logo.png"
            alt="Vijaro Logo"
            className="w-10 h-10 object-contain"
          />
        </div>
        <div>
          <h2 className="text-lg font-bold text-secondary-900">Vijaro</h2>
          <p className="text-xs font-medium text-secondary-600">Management System</p>
        </div>
      </div>
      
      <div className="px-3 sm:px-4 py-4 sm:py-6 flex-1 overflow-y-auto">
        {/* Organization Info */}
        {organization && (
          <div className="mb-6 p-3 bg-primary-50 border border-primary-200 rounded-lg">
            <div className="text-xs font-bold text-primary-700 uppercase tracking-wider mb-1">
              Organization
            </div>
            <div className="font-semibold text-secondary-900">{organization.name}</div>
          </div>
        )}
        
        {/* Navigation Menu */}
        <nav className="space-y-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            
            return (
              <div key={item.text}>
                <button
                  onClick={() => {
                    if (item.hasSubItems && item.text === 'Users') {
                      setUsersExpanded(!usersExpanded);
                    } else if (item.hasSubItems && item.text === 'Finance') {
                      setFinanceExpanded(!financeExpanded);
                    } else {
                      navigate(item.path);
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3 py-3 sm:py-3 text-left rounded-lg transition-all duration-200 min-h-[44px] ${
                    isActive 
                      ? 'bg-primary-600 text-white shadow-sm' 
                      : 'text-secondary-700 hover:bg-primary-50 hover:text-primary-700'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <span className={`${isActive ? 'text-white' : 'text-secondary-500'}`}>
                      {item.icon}
                    </span>
                    <div>
                      <div className={`font-semibold text-sm ${isActive ? 'text-white' : 'text-secondary-900'}`}>
                        {item.text}
                      </div>
                      <div className={`text-xs font-normal ${isActive ? 'text-white/80' : 'text-secondary-600'}`}>
                        {item.description}
                      </div>
                    </div>
                  </div>
                  {item.hasSubItems && (
                    <span className={`${isActive ? 'text-white' : 'text-secondary-500'}`}>
                      {(item.text === 'Users' && usersExpanded) || (item.text === 'Finance' && financeExpanded) ? <ChevronUpIcon /> : <ChevronDownIcon />}
                    </span>
                  )}
                </button>
                
                {/* Sub-items for Users */}
                {item.hasSubItems && item.text === 'Users' && usersExpanded && (
                  <div className="mt-2 ml-6 space-y-1">
                    {item.subItems?.map((subItem) => {
                      const tabValue = subItem.path.split('tab=')[1];
                      const subIsActive = location.pathname === '/users' && location.search.includes(`tab=${tabValue}`);
                      return (
                        <button
                          key={subItem.text}
                          onClick={() => navigate(subItem.path)}
                          className={`w-full flex items-center space-x-2 px-3 py-2.5 text-left rounded-lg transition-all duration-200 min-h-[40px] ${
                            subIsActive 
                              ? 'bg-primary-600 text-white shadow-sm' 
                              : 'text-secondary-700 hover:bg-primary-50 hover:text-primary-700'
                          }`}
                        >
                          <span className={`${subIsActive ? 'text-white' : 'text-secondary-500'}`}>
                            {subItem.icon}
                          </span>
                          <span className={`text-sm font-semibold ${subIsActive ? 'text-white' : 'text-secondary-800'}`}>
                            {subItem.text}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                
                {/* Sub-items for Finance */}
                {item.hasSubItems && item.text === 'Finance' && financeExpanded && (
                  <div className="mt-2 ml-6 space-y-1">
                    {item.subItems?.map((subItem) => {
                      const tabValue = subItem.path.split('tab=')[1];
                      const subIsActive = location.pathname === '/finance' && location.search.includes(`tab=${tabValue}`);
                      return (
                        <button
                          key={subItem.text}
                          onClick={() => navigate(subItem.path)}
                          className={`w-full flex items-center space-x-2 px-3 py-2.5 text-left rounded-lg transition-all duration-200 min-h-[40px] ${
                            subIsActive 
                              ? 'bg-primary-600 text-white shadow-sm' 
                              : 'text-secondary-700 hover:bg-primary-50 hover:text-primary-700'
                          }`}
                        >
                          <span className={`${subIsActive ? 'text-white' : 'text-secondary-500'}`}>
                            {subItem.icon}
                          </span>
                          <span className={`text-sm font-semibold ${subIsActive ? 'text-white' : 'text-secondary-800'}`}>
                            {subItem.text}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={handleDrawerToggle} />
          <div className="relative flex w-full max-w-xs flex-col bg-white h-full shadow-xl">
            {drawer}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <div className="flex flex-col w-72">
          <div className="flex-1 min-h-0 border-r border-gray-200 bg-white">
            {drawer}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top navigation */}
        <header className="bg-white border-b border-secondary-200 lg:ml-0">
          <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 lg:px-6">
            {/* Mobile menu button */}
            <button
              onClick={handleDrawerToggle}
              className="lg:hidden p-2 text-secondary-600 hover:text-secondary-900 -ml-2"
            >
              <MenuIcon />
            </button>
            
            {/* Left side - Academy selector and search */}
            <div className="flex items-center space-x-2 sm:space-x-4 flex-1 lg:ml-0">
              {/* Academy Selector */}
              {academies.length > 0 && (
                <div className="flex items-center space-x-1 sm:space-x-2 bg-secondary-50 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 border border-secondary-200">
                  <span className="text-primary-600 hidden sm:block">
                    <SchoolIcon />
                  </span>
                  <Select
                    value={selectedAcademy?.id || 'all'}
                    onChange={(e) => {
                      if (e.target.value === 'all') {
                        setSelectedAcademy(null);
                      } else {
                        const academy = academies.find(a => a.id === e.target.value);
                        setSelectedAcademy(academy || null);
                      }
                    }}
                    wrapperClassName="w-32 sm:w-40 lg:w-48"
                    className="text-sm"
                  >
                    <option value="all">All Academies</option>
                    {academies.map((academy) => (
                      <option key={academy.id} value={academy.id}>
                        {academy.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              
            </div>

            {/* Right side - Notifications and profile */}
            <div className="flex items-center space-x-2 sm:space-x-4">
              {/* Notifications */}
              <button className="relative p-1.5 sm:p-2 text-secondary-600 hover:text-secondary-900 transition-colors duration-200">
                <BellIcon />
                <span className="absolute -top-1 -right-1 bg-primary-500 text-white text-xs rounded-full h-4 w-4 sm:h-5 sm:w-5 flex items-center justify-center font-semibold">
                  3
                </span>
              </button>
              
              {/* Divider - hidden on mobile */}
              <div className="w-px h-6 bg-secondary-300 hidden sm:block" />
              
              {/* Profile */}
              <div className="relative">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  {/* Profile text - hidden on mobile */}
                  <div className="text-right hidden sm:block">
                    <div className="text-sm font-semibold text-secondary-900">
                      {currentUser?.displayName || 'User'}
                    </div>
                    <div className="text-xs font-normal text-secondary-600">{getUserRole()}</div>
                  </div>
                  
                  <button
                    onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                    className="flex items-center space-x-1"
                  >
                    <Avatar size="md">
                      {currentUser?.displayName?.charAt(0).toUpperCase() || 'U'}
                    </Avatar>
                    {/* Dropdown arrow - hidden on mobile */}
                    <ChevronDownIcon />
                  </button>
                </div>
                
                {/* Profile dropdown */}
                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-secondary-200 py-1 z-50">
                    <div className="px-4 py-3 border-b border-secondary-200">
                      <div className="text-sm font-semibold text-secondary-900">
                        {currentUser?.displayName}
                      </div>
                      <div className="text-xs font-normal text-secondary-600">
                        {currentUser?.email}
                      </div>
                    </div>
                    <button
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center space-x-2 w-full px-4 py-2 text-sm font-normal text-secondary-700 hover:bg-secondary-50 transition-colors duration-200"
                    >
                      <UserIcon />
                      <span>Profile Settings</span>
                    </button>
                    <div className="border-t border-secondary-200 my-1" />
                    <button
                      onClick={handleLogout}
                      className="flex items-center space-x-2 w-full px-4 py-2 text-sm font-normal text-error-600 hover:bg-error-50 transition-colors duration-200"
                    >
                      <LogoutIcon />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        
        {/* Main content area */}
        <main className="flex-1 overflow-auto bg-secondary-50 p-3 sm:p-4 lg:p-6">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;