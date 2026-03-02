// ============================================================================
// Shared React Query Hooks for Data Fetching
// These hooks provide global caching and automatic refetching
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateRelatedQueries } from '@/lib/query-client';
import {
  fetchPapers,
  fetchPaperById,
  fetchPaperStats,
  fetchGaps,
  fetchGapById,
  fetchGapStats,
  fetchUserProfile,
  fetchLeaderboard,
  fetchCommunityGaps,
  fetchAlerts,
  fetchNotifications,
  type Paper,
  type Gap,
  type Alert,
  type Notification,
  type LeaderboardUser,
  type CommunityGap,
  type UserProfile,
} from '@/lib/query-api';

// ============================================================================
// PAPERS HOOKS
// ============================================================================

export function usePapers(filters?: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.papers.list(filters),
    queryFn: () => fetchPapers(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function usePaper(id: string) {
  return useQuery({
    queryKey: queryKeys.papers.detail(id),
    queryFn: () => fetchPaperById(id),
    enabled: !!id,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function usePaperStats() {
  return useQuery({
    queryKey: queryKeys.papers.stats,
    queryFn: fetchPaperStats,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// GAPS HOOKS
// ============================================================================

export function useGaps(filters?: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.gaps.list(filters),
    queryFn: () => fetchGaps(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useGap(id: string) {
  return useQuery({
    queryKey: queryKeys.gaps.detail(id),
    queryFn: () => fetchGapById(id),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  });
}

export function useGapStats() {
  return useQuery({
    queryKey: queryKeys.gaps.stats,
    queryFn: fetchGapStats,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// USER HOOKS
// ============================================================================

export function useUserProfile() {
  return useQuery({
    queryKey: queryKeys.user.profile,
    queryFn: fetchUserProfile,
    staleTime: 10 * 60 * 1000,
  });
}

// ============================================================================
// COMMUNITY HOOKS
// ============================================================================

export function useLeaderboard(period: string = 'all_time') {
  return useQuery({
    queryKey: queryKeys.community.leaderboard(period),
    queryFn: () => fetchLeaderboard(period),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCommunityGaps(filters?: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.community.gaps(filters),
    queryFn: () => fetchCommunityGaps(filters),
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// ALERTS HOOKS
// ============================================================================

export function useAlerts() {
  return useQuery({
    queryKey: queryKeys.alerts.list,
    queryFn: fetchAlerts,
    staleTime: 5 * 60 * 1000,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.alerts.notifications,
    queryFn: fetchNotifications,
    staleTime: 1 * 60 * 1000, // 1 minute - refresh more frequently
  });
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

export function useCreateGap() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (gapData: any) => {
      const response = await fetch('/api/gaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gapData),
      });
      if (!response.ok) throw new Error('Failed to create gap');
      return response.json();
    },
    onSuccess: () => {
      // Invalidate gaps cache to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.gaps.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.gaps.stats });
    },
  });
}

export function useVoteGap() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, vote }: { id: string; vote: number }) => {
      const response = await fetch(`/api/gaps/${id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote }),
      });
      if (!response.ok) throw new Error('Failed to vote');
      return response.json();
    },
    // Optimistic update
    onMutate: async ({ id, vote }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.gaps.detail(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.gaps.list() });
      
      // Snapshot the previous value
      const previousGap = queryClient.getQueryData(queryKeys.gaps.detail(id));
      const previousGaps = queryClient.getQueryData(queryKeys.gaps.list());
      
      // Optimistically update to the new value
      queryClient.setQueryData(queryKeys.gaps.detail(id), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          upvotes: old.upvotes + vote,
        };
      });
      
      queryClient.setQueryData(queryKeys.gaps.list(), (old: any) => {
        if (!old?.gaps) return old;
        return {
          ...old,
          gaps: old.gaps.map((gap: any) =>
            gap.id === id ? { ...gap, upvotes: gap.upvotes + vote } : gap
          ),
        };
      });
      
      // Return a context object with the snapshotted value
      return { previousGap, previousGaps };
    },
    // If the mutation fails, use the context returned from onMutate to roll back
    onError: (err, { id }, context) => {
      if (context?.previousGap) {
        queryClient.setQueryData(queryKeys.gaps.detail(id), context.previousGap);
      }
      if (context?.previousGaps) {
        queryClient.setQueryData(queryKeys.gaps.list(), context.previousGaps);
      }
    },
    // Always refetch after error or success
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gaps.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gaps.list() });
    },
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/alerts/notifications/${id}/read`, {
        method: 'PATCH',
      });
      if (!response.ok) throw new Error('Failed to mark notification as read');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.notifications });
    },
  });
}

// Re-export types
export type {
  Paper,
  Gap,
  Alert,
  Notification,
  LeaderboardUser,
  CommunityGap,
  UserProfile,
};
