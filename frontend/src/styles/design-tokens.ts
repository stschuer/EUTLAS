/**
 * EUTLAS Design System Tokens
 * 
 * Design Principles:
 * - Visibility: Clear visual hierarchy
 * - Affordances: Interactive elements look interactive
 * - Signifiers: Icons + labels for clarity
 * - Feedback: Loading states, success/error messages
 * - Constraints: Disabled states, validation
 * - Consistency: Unified color palette & components
 */

export const colors = {
  // Primary - Emerald (Action, Success)
  primary: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
  },
  
  // Accent - Cyan (Highlights, Links)
  accent: {
    50: '#ecfeff',
    100: '#cffafe',
    200: '#a5f3fc',
    300: '#67e8f9',
    400: '#22d3ee',
    500: '#06b6d4',
    600: '#0891b2',
    700: '#0e7490',
    800: '#155e75',
    900: '#164e63',
  },
  
  // Status Colors
  status: {
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },
  
  // Cluster Status Colors
  clusterStatus: {
    creating: '#f59e0b',   // Yellow - in progress
    ready: '#10b981',      // Green - success
    updating: '#3b82f6',   // Blue - working
    deleting: '#ef4444',   // Red - destructive
    failed: '#ef4444',     // Red - error
    degraded: '#f97316',   // Orange - warning
    stopped: '#6b7280',    // Gray - inactive
  },
} as const;

export const spacing = {
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '1rem',      // 16px
  lg: '1.5rem',    // 24px
  xl: '2rem',      // 32px
  '2xl': '3rem',   // 48px
} as const;

export const transitions = {
  fast: '150ms ease',
  normal: '200ms ease',
  slow: '300ms ease',
} as const;

export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
  glow: '0 0 20px rgb(16 185 129 / 0.3)',
} as const;

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;




