import { ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'ghost' | 'outline' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

const variantClasses = {
  default: 'bg-amber-500 text-stone-950 hover:bg-amber-400 shadow-sm shadow-amber-500/20',
  secondary: 'bg-stone-800 text-stone-100 hover:bg-stone-700 border border-stone-700',
  ghost: 'bg-transparent text-stone-300 hover:bg-stone-800 hover:text-stone-100',
  outline: 'border border-stone-700 bg-transparent text-stone-300 hover:bg-stone-800 hover:text-stone-100 hover:border-amber-500/50',
  destructive: 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50',
};

const sizeClasses = {
  sm: 'px-2.5 py-1 text-xs gap-1.5',
  md: 'px-3.5 py-1.5 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
  icon: 'h-9 w-9 p-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900',
        'disabled:opacity-50 disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);

Button.displayName = 'Button';
