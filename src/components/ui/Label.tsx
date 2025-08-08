import React from 'react';

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode;
  required?: boolean;
}

const Label: React.FC<LabelProps> = ({ children, required, className = '', ...props }) => {
  return (
    <label
      className={`block text-sm font-medium text-secondary-700 mb-1 ${className}`}
      {...props}
    >
      {children}
      {required && <span className="text-error-500 ml-1">*</span>}
    </label>
  );
};

export default Label;