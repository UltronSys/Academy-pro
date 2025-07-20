import React from 'react';
import { cn } from '../../utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  wrapperClassName?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, icon, wrapperClassName, type = 'text', ...props }, ref) => {
    const inputId = React.useId();

    return (
      <div className={cn('space-y-1', wrapperClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-semibold text-secondary-800"
          >
            {label}
            {props.required && <span className="text-error-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-secondary-400 text-sm">{icon}</span>
            </div>
          )}
          <input
            id={inputId}
            type={type}
            className={cn(
              'block w-full px-3 py-2.5 text-sm font-normal border rounded-lg shadow-sm placeholder-secondary-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-secondary-50 disabled:text-secondary-500 disabled:cursor-not-allowed transition-all duration-200',
              icon ? 'pl-10' : '',
              error ? 'border-error-300 focus:ring-error-500' : 'border-secondary-300',
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
        {(error || helperText) && (
          <p className={cn(
            'text-sm font-normal',
            error ? 'text-error-600' : 'text-secondary-600'
          )}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;