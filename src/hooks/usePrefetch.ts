// ============================================================================
// Prefetch Hooks
// Preload data for common routes to improve navigation speed
// ============================================================================

import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-client';
import { fetchPapers, fetchGaps, fetchUserProfile, fetchLeaderboard } from '@/lib/query-api';

// Prefetch common data on app load
export function usePrefetchCommonData() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Prefetch with low priority (won't block critical rendering)
    const prefetchData = async () => {
      // Prefetch user profile (needed for most pages)
      if (!queryClient.getQueryData(queryKeys.user.profile)) {
        queryClient.prefetchQuery({
          queryKey: queryKeys.user.profile,
          queryFn: fetchUserProfile,
          staleTime: 10 * 60 * 1000,
        });
      }

      // Prefetch leaderboard (popular page)
      if (!queryClient.getQueryData(queryKeys.community.leaderboard('all_time'))) {
        queryClient.prefetchQuery({
          queryKey: queryKeys.community.leaderboard('all_time'),
          queryFn: () => fetchLeaderboard('all_time'),
          staleTime: 5 * 60 * 1000,
        });
      }
    };

    // Delay prefetching until after initial render
    const timer = setTimeout(prefetchData, 2000);
    return () => clearTimeout(timer);
  }, [queryClient]);
}

// Prefetch on hover (for links)
export function usePrefetchOnHover() {
  const queryClient = useQueryClient();

  const prefetchPapers = useCallback(() => {
    if (!queryClient.getQueryData(queryKeys.papers.list())) {
      queryClient.prefetchQuery({
        queryKey: queryKeys.papers.list(),
        queryFn: () => fetchPapers(),
        staleTime: 5 * 60 * 1000,
      });
    }
  }, [queryClient]);

  const prefetchGaps = useCallback(() => {
    if (!queryClient.getQueryData(queryKeys.gaps.list())) {
      queryClient.prefetchQuery({
        queryKey: queryKeys.gaps.list(),
        queryFn: () => fetchGaps(),
        staleTime: 5 * 60 * 1000,
      });
    }
  }, [queryClient]);

  const prefetchLeaderboard = useCallback((period: string = 'all_time') => {
    if (!queryClient.getQueryData(queryKeys.community.leaderboard(period))) {
      queryClient.prefetchQuery({
        queryKey: queryKeys.community.leaderboard(period),
        queryFn: () => fetchLeaderboard(period),
        staleTime: 5 * 60 * 1000,
      });
    }
  }, [queryClient]);

  return {
    prefetchPapers,
    prefetchGaps,
    prefetchLeaderboard,
  };
}

// Prefetch next page in pagination
export function usePrefetchNextPage() {
  const queryClient = useQueryClient();

  const prefetchNextPapersPage = useCallback((currentPage: number, totalPages: number) => {
    const nextPage = currentPage + 1;
    if (nextPage <= totalPages) {
      queryClient.prefetchQuery({
        queryKey: queryKeys.papers.list({ page: nextPage }),
        queryFn: () => fetchPapers({ page: nextPage }),
        staleTime: 5 * 60 * 1000,
      });
    }
  }, [queryClient]);

  const prefetchNextGapsPage = useCallback((currentPage: number, totalPages: number) => {
    const nextPage = currentPage + 1;
    if (nextPage <= totalPages) {
      queryClient.prefetchQuery({
        queryKey: queryKeys.gaps.list({ page: nextPage }),
        queryFn: () => fetchGaps({ page: nextPage }),
        staleTime: 5 * 60 * 1000,
      });
    }
  }, [queryClient]);

  return {
    prefetchNextPapersPage,
    prefetchNextGapsPage,
  };
}
