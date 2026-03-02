// ============================================================================
// TanStack Query Client Configuration
// Global server state management with caching, retry logic, and background refetching
// ============================================================================

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time - how long data is considered fresh
      staleTime: 1000 * 60 * 5, // 5 minutes
      
      // Cache time - how long to keep data in cache after component unmounts
      gcTime: 1000 * 60 * 30, // 30 minutes
      
      // Retry configuration
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff: 1s, 2s, 4s, max 30s
      
      // Refetch configuration
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: 'always',
      
      // Error handling
      throwOnError: false,
      
      // Network mode
      networkMode: 'online',
    },
    mutations: {
      // Retry mutations less aggressively
      retry: 1,
      retryDelay: 1000,
      
      // Network mode for mutations
      networkMode: 'online',
    },
  },
});

// Query keys for consistent cache management
export const queryKeys = {
  // Papers
  papers: {
    all: ['papers'] as const,
    list: (filters?: Record<string, any>) => [...queryKeys.papers.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.papers.all, 'detail', id] as const,
    stats: ['papers', 'stats'] as const,
  },
  
  // Gaps
  gaps: {
    all: ['gaps'] as const,
    list: (filters?: Record<string, any>) => [...queryKeys.gaps.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.gaps.all, 'detail', id] as const,
    stats: ['gaps', 'stats'] as const,
    similar: (id: string) => [...queryKeys.gaps.all, 'similar', id] as const,
  },
  
  // User
  user: {
    all: ['user'] as const,
    profile: ['user', 'profile'] as const,
    stats: ['user', 'stats'] as const,
    xp: ['user', 'xp'] as const,
  },
  
  // Community
  community: {
    leaderboard: (period: string) => ['community', 'leaderboard', period] as const,
    gaps: (filters?: Record<string, any>) => ['community', 'gaps', filters] as const,
  },
  
  // Alerts
  alerts: {
    all: ['alerts'] as const,
    list: ['alerts', 'list'] as const,
    notifications: ['alerts', 'notifications'] as const,
  },
  
  // Organizations
  organizations: {
    all: ['organizations'] as const,
    list: ['organizations', 'list'] as const,
    detail: (id: string) => ['organizations', 'detail', id] as const,
    dashboard: (id: string) => ['organizations', 'dashboard', id] as const,
  },
};

// Helper to invalidate related queries
export function invalidateRelatedQueries(queryKey: readonly unknown[]) {
  const keyPrefix = queryKey[0];
  
  // Invalidate the base list query
  queryClient.invalidateQueries({ 
    queryKey: [keyPrefix, 'list'],
    exact: false 
  });
  
  // Invalidate stats
  queryClient.invalidateQueries({ 
    queryKey: [keyPrefix, 'stats'],
    exact: false 
  });
}
