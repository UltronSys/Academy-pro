import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Products from './Products';
import Transactions from './Transactions';
import PlayersGuardians from './PlayersGuardians';
import Stats from './Stats';

const Finance: React.FC = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(0);

  // Get tab from URL params
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tab = searchParams.get('tab');
    if (tab) {
      setActiveTab(parseInt(tab, 10));
    } else {
      // Default to first tab if no tab specified
      setActiveTab(0);
    }
  }, [location]);

  const renderContent = () => {
    switch (activeTab) {
      case 0:
        return <Products />;
      case 1:
        return <Transactions />;
      case 2:
        return <PlayersGuardians />;
      case 3:
        return <Stats />;
      default:
        return <Products />;
    }
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 0:
        return { title: 'Products & Services', description: 'Manage your academy\'s products and services' };
      case 1:
        return { title: 'Transactions', description: 'View and manage financial transactions' };
      case 2:
        return { title: 'Players & Guardians', description: 'Financial overview for players and guardians' };
      case 3:
        return { title: 'Financial Statistics', description: 'Analytics and financial reports' };
      default:
        return { title: 'Products & Services', description: 'Manage your academy\'s products and services' };
    }
  };

  const pageInfo = getPageTitle();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-secondary-900">{pageInfo.title}</h1>
        <p className="text-secondary-600 mt-1">{pageInfo.description}</p>
      </div>

      {renderContent()}
    </div>
  );
};

export default Finance;