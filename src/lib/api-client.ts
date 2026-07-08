// ============================================================================
// API Client — Frontend HTTP client for the GapMiner backend
// All API calls go through the backend proxy — no API keys in the browser
// ============================================================================

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001/api';

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(access: string, refresh: string): void {
    accessToken = access;
    refreshToken = refresh;
    localStorage.setItem('gapminer_access_token', access);
    localStorage.setItem('gapminer_refresh_token', refresh);
}

export function loadTokens(): void {
    accessToken = localStorage.getItem('gapminer_access_token');
    refreshToken = localStorage.getItem('gapminer_refresh_token');
}

export function clearTokens(): void {
    accessToken = null;
    refreshToken = null;
    localStorage.removeItem('gapminer_access_token');
    localStorage.removeItem('gapminer_refresh_token');
}

export function getAccessToken(): string | null {
    return accessToken;
}

// Load tokens on module init
loadTokens();

// ============================================================================
// HTTP CLIENT
// ============================================================================

export class ApiError extends Error {
    statusCode: number;
    code?: string;
    recoverable: boolean;

    constructor(message: string, statusCode: number, code?: string) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.code = code;
        this.recoverable = statusCode >= 500 || statusCode === 429;
    }
}

interface RequestOptions {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    timeout?: number;
    skipAuth?: boolean;
}

async function refreshAccessToken(): Promise<boolean> {
    if (!refreshToken) return false;

    try {
        const response = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        });

        if (!response.ok) return false;

        const data = await response.json();
        setTokens(data.accessToken, data.refreshToken);
        return true;
    } catch {
        return false;
    }
}

export async function apiRequest<T = any>(
    endpoint: string,
    options: RequestOptions = {}
): Promise<T> {
    const { method = 'GET', body, headers = {}, timeout = 30000, skipAuth = false } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...headers,
    };

    if (!skipAuth && accessToken) {
        requestHeaders['Authorization'] = `Bearer ${accessToken}`;
    }

    try {
        let response = await fetch(`${API_BASE}${endpoint}`, {
            method,
            headers: requestHeaders,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });

        // Auto-refresh on 401 TOKEN_EXPIRED
        if (response.status === 401 && !skipAuth) {
            const errorData = await response.json().catch(() => ({}));
            if (errorData.code === 'TOKEN_EXPIRED') {
                const refreshed = await refreshAccessToken();
                if (refreshed) {
                    // Retry with new token
                    requestHeaders['Authorization'] = `Bearer ${accessToken}`;
                    response = await fetch(`${API_BASE}${endpoint}`, {
                        method,
                        headers: requestHeaders,
                        body: body ? JSON.stringify(body) : undefined,
                    });
                } else {
                    clearTokens();
                    throw new ApiError('Session expired. Please log in again.', 401, 'SESSION_EXPIRED');
                }
            }
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
            throw new ApiError(
                errorData.error || `Request failed: ${response.status}`,
                response.status,
                errorData.code
            );
        }

        return response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof ApiError) throw error;
        if (error instanceof Error && error.name === 'AbortError') {
            throw new ApiError('Request timed out', 408, 'TIMEOUT');
        }
        throw new ApiError('Network error — check your connection', 0, 'NETWORK_ERROR');
    }
}

// ============================================================================
// AUTH API
// ============================================================================

export interface UserProfile {
    id: string;
    email: string;
    name: string;
    role: string;
    tier: string;
    avatar?: string;
    isVerified?: boolean;
    subscriptionStatus?: string;
    currentPeriodEnd?: string;
    xp?: {
        totalXp: number;
        level: number;
        currentStreak: number;
        papersAnalyzed: number;
        gapsFound: number;
    };
    createdAt: string;
}

export const authApi = {
    async register(email: string, password: string, name: string) {
        const data = await apiRequest<{ user: UserProfile; accessToken: string; refreshToken: string }>(
            '/auth/register',
            { method: 'POST', body: { email, password, name }, skipAuth: true }
        );
        setTokens(data.accessToken, data.refreshToken);
        return data.user;
    },

    async login(email: string, password: string) {
        const data = await apiRequest<{ user: UserProfile; accessToken: string; refreshToken: string }>(
            '/auth/login',
            { method: 'POST', body: { email, password }, skipAuth: true }
        );
        setTokens(data.accessToken, data.refreshToken);
        return data.user;
    },

    async loginWithGoogle(credential: string) {
        const data = await apiRequest<{ user: UserProfile; accessToken: string; refreshToken: string; isNewUser: boolean }>(
            '/auth/google',
            { method: 'POST', body: { credential }, skipAuth: true }
        );
        setTokens(data.accessToken, data.refreshToken);
        return data;
    },

    async getProfile() {
        return apiRequest<UserProfile>('/auth/me');
    },

    async updateProfile(updates: { name?: string; avatar?: string }) {
        return apiRequest('/auth/profile', { method: 'PATCH', body: updates });
    },

    async forgotPassword(email: string) {
        return apiRequest('/auth/forgot-password', { method: 'POST', body: { email }, skipAuth: true });
    },

    async resetPassword(token: string, newPassword: string) {
        return apiRequest('/auth/reset-password', { method: 'POST', body: { token, newPassword }, skipAuth: true });
    },

    async sendVerification() {
        return apiRequest('/auth/send-verification', { method: 'POST' });
    },

    async logout() {
        try {
            const refreshToken = localStorage.getItem('gapminer_refresh_token');
            await apiRequest('/auth/logout', { method: 'POST', body: { refreshToken } });
        } finally {
            clearTokens();
        }
    },

    async logoutAll() {
        try {
            await apiRequest('/auth/logout-all', { method: 'POST' });
        } finally {
            clearTokens();
        }
    },

    async getSessions() {
        return apiRequest<{ sessions: Array<{ id: string; user_agent: string; ip_address: string; created_at: string; expires_at: string }> }>('/auth/sessions');
    },

    clearTokens,
};

// ============================================================================
// PAPERS API
// ============================================================================

export interface Paper {
    id: string;
    url: string;
    title: string;
    abstract?: string;
    authors?: string[];
    venue?: string;
    year?: number;
    content?: string;
    citation_count: number;
    gap_count?: number;
    created_at: string;
    updated_at: string;
}

export interface PaginatedResponse<T> {
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
    [key: string]: any;
}

export const papersApi = {
    async list(params?: { q?: string; venue?: string; year?: number; page?: number; limit?: number }) {
        const searchParams = new URLSearchParams();
        if (params?.q) searchParams.set('q', params.q);
        if (params?.venue) searchParams.set('venue', params.venue);
        if (params?.year) searchParams.set('year', String(params.year));
        if (params?.page) searchParams.set('page', String(params.page));
        if (params?.limit) searchParams.set('limit', String(params.limit));

        const queryString = searchParams.toString();
        return apiRequest<{ papers: Paper[]; pagination: PaginatedResponse<Paper>['pagination'] }>(
            `/papers${queryString ? `?${queryString}` : ''}`
        );
    },

    async get(id: string) {
        return apiRequest<Paper & { gaps: any[] }>(`/papers/${id}`);
    },

    async create(paper: Omit<Paper, 'id' | 'citation_count' | 'created_at' | 'updated_at'>) {
        return apiRequest<Paper>('/papers', { method: 'POST', body: paper });
    },

    async delete(id: string) {
        return apiRequest(`/papers/${id}`, { method: 'DELETE' });
    },
};

// ============================================================================
// GAPS API
// ============================================================================

export interface Gap {
    id: string;
    paper_id: string;
    problem: string;
    type: 'data' | 'compute' | 'evaluation' | 'theory' | 'deployment' | 'methodology';
    confidence: number;
    impact_score: 'low' | 'medium' | 'high';
    difficulty: 'low' | 'medium' | 'high';
    assumptions: string[];
    failures: string[];
    dataset_gaps: string[];
    evaluation_critique?: string;
    upvotes: number;
    is_resolved: boolean;
    paper_title?: string;
    paper_url?: string;
    created_at: string;
}

export const gapsApi = {
    async list(params?: { q?: string; type?: string; impact?: string; paperId?: string; page?: number; limit?: number }) {
        const searchParams = new URLSearchParams();
        if (params?.q) searchParams.set('q', params.q);
        if (params?.type) searchParams.set('type', params.type);
        if (params?.impact) searchParams.set('impact', params.impact);
        if (params?.paperId) searchParams.set('paperId', params.paperId);
        if (params?.page) searchParams.set('page', String(params.page));
        if (params?.limit) searchParams.set('limit', String(params.limit));

        const queryString = searchParams.toString();
        return apiRequest<{ gaps: Gap[]; pagination: PaginatedResponse<Gap>['pagination'] }>(
            `/gaps${queryString ? `?${queryString}` : ''}`
        );
    },

    async create(gap: { paperId: string; problem: string; type: string; confidence?: number; impactScore?: string; difficulty?: string; assumptions?: string[]; failures?: string[]; datasetGaps?: string[]; evaluationCritique?: string }) {
        return apiRequest<Gap>('/gaps', { method: 'POST', body: gap });
    },

    async createBatch(paperId: string, gaps: any[]) {
        return apiRequest<{ gaps: Gap[]; count: number }>('/gaps/batch', {
            method: 'POST',
            body: { paperId, gaps },
        });
    },

    async vote(gapId: string, vote: 1 | -1) {
        return apiRequest<{ upvotes: number }>(`/gaps/${gapId}/vote`, {
            method: 'POST',
            body: { vote },
        });
    },

    async resolve(gapId: string, resolvedBy?: string) {
        return apiRequest(`/gaps/${gapId}/resolve`, {
            method: 'PATCH',
            body: { resolvedBy },
        });
    },

    async delete(gapId: string) {
        return apiRequest(`/gaps/${gapId}`, { method: 'DELETE' });
    },

    async getStats() {
        return apiRequest('/gaps/stats/overview');
    },
};

// ============================================================================
// COLLECTIONS API
// ============================================================================

export interface Collection {
    id: string;
    name: string;
    description?: string;
    color: string;
    starred: boolean;
    paper_count: number;
    gap_count: number;
    created_at: string;
}

export const collectionsApi = {
    async list() {
        return apiRequest<{ collections: Collection[] }>('/collections');
    },

    async create(data: { name: string; description?: string; color?: string }) {
        return apiRequest<Collection>('/collections', { method: 'POST', body: data });
    },

    async addPaper(collectionId: string, paperId: string) {
        return apiRequest(`/collections/${collectionId}/papers`, {
            method: 'POST',
            body: { paperId },
        });
    },

    async addGap(collectionId: string, gapId: string) {
        return apiRequest(`/collections/${collectionId}/gaps`, {
            method: 'POST',
            body: { gapId },
        });
    },

    async toggleStar(collectionId: string) {
        return apiRequest<{ starred: boolean }>(`/collections/${collectionId}/star`, {
            method: 'PATCH',
        });
    },

    async delete(collectionId: string) {
        return apiRequest(`/collections/${collectionId}`, { method: 'DELETE' });
    },
};

// ============================================================================
// AI API (all calls go through backend — API keys never exposed)
// ============================================================================

export const aiApi = {
    async scrapeUrl(url: string) {
        return apiRequest<{ url: string; title: string; content: string; venue?: string; year?: string }>(
            '/ai/scrape',
            { method: 'POST', body: { url }, timeout: 60000 }
        );
    },

    async analyzeGaps(content: string) {
        return apiRequest<{ gaps: any[] }>(
            '/ai/analyze-gaps',
            { method: 'POST', body: { content }, timeout: 60000 }
        );
    },

    async chat(prompt: string, papers?: { title: string; content: string }[], history?: { role: string; content: string }[]) {
        return apiRequest<{ response: string }>(
            '/ai/chat',
            { method: 'POST', body: { prompt, papers, history }, timeout: 60000 }
        );
    },

    async explainUnsolved(problem: string) {
        return apiRequest<{ explanation: string }>(
            '/ai/explain-unsolved',
            { method: 'POST', body: { prompt: problem }, timeout: 60000 }
        );
    },

    async generateProposal(gap: string) {
        return apiRequest(
            '/ai/generate-proposal',
            { method: 'POST', body: { gap }, timeout: 60000 }
        );
    },

    async comparePapers(papers: { title: string; content: string }[]) {
        return apiRequest<{ comparison: string }>(
            '/ai/compare-papers',
            { method: 'POST', body: { papers }, timeout: 60000 }
        );
    },

    async generateStartupIdea(problem: string) {
        return apiRequest<{ idea: string; audience: string; why_now: string }>(
            '/ai/generate-startup-idea',
            { method: 'POST', body: { prompt: problem }, timeout: 60000 }
        );
    },

    async generateResearchQuestions(problem: string) {
        return apiRequest<{ questions: string[] }>(
            '/ai/generate-research-questions',
            { method: 'POST', body: { prompt: problem }, timeout: 60000 }
        );
    },

    async redTeamAnalysis(gap: string) {
        return apiRequest<{ analysis: any[] }>(
            '/ai/red-team-analysis',
            { method: 'POST', body: { gap }, timeout: 60000 }
        );
    },

    async predictImpact(gap: string) {
        return apiRequest(
            '/ai/predict-impact',
            { method: 'POST', body: { gap }, timeout: 60000 }
        );
    },

    async healthCheck() {
        return apiRequest('/ai/health', { skipAuth: true });
    },
};

// ============================================================================
// HEALTH API
// ============================================================================

export const healthApi = {
    async check() {
        return apiRequest('/health', { skipAuth: true });
    },
};
