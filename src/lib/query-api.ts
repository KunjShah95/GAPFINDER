// ============================================================================
// Shared API Functions for TanStack Query
// These functions fetch data from the backend
// ============================================================================

import { apiRequest } from '@/lib/api';

// Papers API
export interface Paper {
  id: string;
  title: string;
  url: string;
  abstract?: string;
  authors?: string[];
  venue?: string;
  year?: number;
  content?: string;
  citation_count?: number;
  created_at: string;
}

export interface PapersResponse {
  papers: Paper[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function fetchPapers(filters?: Record<string, any>): Promise<PapersResponse> {
  const params = new URLSearchParams();
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.search) params.set('q', filters.search);
  
  const queryString = params.toString() ? `?${params.toString()}` : '';
  return apiRequest(`/papers${queryString}`);
}

export async function fetchPaperById(id: string): Promise<Paper> {
  return apiRequest(`/papers/${id}`);
}

export async function fetchPaperStats(): Promise<{
  total_papers: number;
  papers_this_week: number;
  papers_this_month: number;
}> {
  return apiRequest('/papers/stats/overview');
}

// Gaps API
export interface Gap {
  id: string;
  paper_id: string;
  user_id: string;
  problem: string;
  type: 'data' | 'compute' | 'evaluation' | 'theory' | 'deployment' | 'methodology';
  confidence: number;
  impact_score: 'low' | 'medium' | 'high';
  difficulty: 'low' | 'medium' | 'high';
  assumptions?: string[];
  failures?: string[];
  evaluation_critique?: string;
  upvotes: number;
  is_resolved: boolean;
  paper_title?: string;
  paper_url?: string;
  created_at: string;
}

export interface GapsResponse {
  gaps: Gap[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function fetchGaps(filters?: Record<string, any>): Promise<GapsResponse> {
  const params = new URLSearchParams();
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.type) params.set('type', filters.type);
  if (filters?.impact) params.set('impact', filters.impact);
  if (filters?.resolved !== undefined) params.set('resolved', String(filters.resolved));
  if (filters?.search) params.set('q', filters.search);
  
  const queryString = params.toString() ? `?${params.toString()}` : '';
  return apiRequest(`/gaps${queryString}`);
}

export async function fetchGapById(id: string): Promise<Gap> {
  return apiRequest(`/gaps/${id}`);
}

export async function fetchGapStats(): Promise<{
  total_gaps: number;
  resolved_gaps: number;
  high_impact: number;
  medium_impact: number;
  low_impact: number;
}> {
  return apiRequest('/gaps/stats/overview');
}

export async function fetchSimilarGaps(id: string): Promise<Gap[]> {
  // This would integrate with the embeddings service
  // For now, return empty array or call an endpoint
  return apiRequest(`/gaps/${id}/similar`);
}

// User API
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  bio?: string;
  institution?: string;
  tier: string;
  role: string;
}

export async function fetchUserProfile(): Promise<UserProfile> {
  return apiRequest('/auth/profile');
}

export async function fetchUserStats(): Promise<{
  total_papers: number;
  total_gaps: number;
  total_upvotes: number;
}> {
  return apiRequest('/user/stats');
}

// Community API
export interface LeaderboardUser {
  rank: number;
  user_id: string;
  name: string;
  avatar_url?: string;
  institution?: string;
  shared_gaps: number;
  total_upvotes: number;
  total_views: number;
}

export async function fetchLeaderboard(period: string = 'all_time'): Promise<LeaderboardUser[]> {
  const response = await fetch(`/api/community/leaderboard?period=${period}&limit=50`);
  if (!response.ok) throw new Error('Failed to fetch leaderboard');
  const data = await response.json();
  return data.leaderboard || [];
}

export interface CommunityGap {
  id: string;
  problem: string;
  type: string;
  impact_score: string;
  upvotes: number;
  view_count: number;
  share_reason: string;
  paper_title: string;
  paper_url: string;
  venue?: string;
  year?: string;
  author_name: string;
  author_avatar?: string;
  author_institution?: string;
}

export async function fetchCommunityGaps(filters?: Record<string, any>): Promise<CommunityGap[]> {
  const params = new URLSearchParams();
  if (filters?.type) params.set('type', filters.type);
  if (filters?.sort) params.set('sort', filters.sort);
  
  const response = await fetch(`/api/community/gaps?${params}`);
  if (!response.ok) throw new Error('Failed to fetch community gaps');
  const data = await response.json();
  return data.gaps || [];
}

// Alerts API
export interface Alert {
  id: string;
  query: string;
  frequency: string;
  sources: string[];
  match_type: string;
  is_active: boolean;
  notification_count: number;
  unread_count: number;
  last_triggered_at: string | null;
  created_at: string;
}

export async function fetchAlerts(): Promise<Alert[]> {
  const response = await apiRequest('/alerts');
  return response.alerts || [];
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  paper_title?: string;
  paper_url?: string;
  alert_query?: string;
}

export async function fetchNotifications(): Promise<{ notifications: Notification[]; unreadCount: number }> {
  const response = await apiRequest('/alerts/notifications/all?limit=20');
  return {
    notifications: response.notifications || [],
    unreadCount: response.unreadCount || 0,
  };
}
