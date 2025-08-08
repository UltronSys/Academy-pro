import React from 'react';

interface Tab {
  label: string;
  content: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: number;
  onChange: (index: number) => void;
}

const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onChange }) => {
  return (
    <div>
      <div className="border-b border-secondary-200">
        <nav className="-mb-px flex">
          {tabs.map((tab, index) => (
            <button
              key={index}
              onClick={() => onChange(index)}
              className={`
                py-3 px-6 text-sm font-medium border-b-2 transition-colors duration-200
                ${activeTab === index
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-secondary-600 hover:text-secondary-900 hover:border-secondary-300'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="p-6">
        {tabs[activeTab]?.content}
      </div>
    </div>
  );
};

export default Tabs;