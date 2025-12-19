import { HTMLAttributes, forwardRef } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = '', ...props }, ref) => (
    <span
      ref={ref}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      {...props}
    />
  )
);

Badge.displayName = 'Badge';
