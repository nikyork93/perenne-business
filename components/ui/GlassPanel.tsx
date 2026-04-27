import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding variant */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Enables the top shimmer line (useful for topbars) */
  shimmer?: boolean;
  /** Enables rise-in animation on mount */
  animate?: boolean;
}

/**
 * The base Liquid Glass container.
 * Use for cards, panels, topbar, sidebar — anything that needs the glass look.
 */
export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, padding = 'md', shimmer = false, animate = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'glass',
          padding === 'sm' && 'p-4',
          padding === 'md' && 'p-5',
          padding === 'lg' && 'p-8',
          shimmer && 'glass-topbar',
          animate && 'animate-rise-in',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GlassPanel.displayName = 'GlassPanel';
