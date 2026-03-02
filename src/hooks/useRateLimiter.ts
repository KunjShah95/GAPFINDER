// ============================================================================
// Rate Limiting Hook
// Client-side throttle to prevent overwhelming the API
// ============================================================================

import { useState, useCallback, useRef } from 'react';

interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
}

interface RequestLog {
    endpoint: string;
    timestamp: number;
}

interface RateLimitState {
    remaining: number;
    resetAt: number;
    isLimited: boolean;
}

export function useRateLimiter(config: RateLimitConfig = { maxRequests: 60, windowMs: 60000 }) {
    const [state, setState] = useState<RateLimitState>({
        remaining: config.maxRequests,
        resetAt: Date.now() + config.windowMs,
        isLimited: false,
    });
    
    const requestsRef = useRef<RequestLog[]>([]);
    
    const checkRateLimit = useCallback((endpoint?: string): boolean => {
        const now = Date.now();
        const windowStart = now - config.windowMs;
        
        // Clean up old requests outside the window
        requestsRef.current = requestsRef.current.filter(
            req => req.timestamp > windowStart
        );
        
        // Check if at limit
        if (requestsRef.current.length >= config.maxRequests) {
            const oldestRequest = requestsRef.current[0];
            const resetAt = oldestRequest.timestamp + config.windowMs;
            
            setState({
                remaining: 0,
                resetAt,
                isLimited: true,
            });
            
            return false;
        }
        
        // Log the request
        requestsRef.current.push({
            endpoint: endpoint || 'unknown',
            timestamp: now,
        });
        
        const remaining = config.maxRequests - requestsRef.current.length;
        const oldestRequest = requestsRef.current[0];
        const resetAt = oldestRequest ? oldestRequest.timestamp + config.windowMs : now + config.windowMs;
        
        setState({
            remaining,
            resetAt,
            isLimited: false,
        });
        
        return true;
    }, [config.maxRequests, config.windowMs]);
    
    const getRetryAfter = useCallback((): number => {
        if (!state.isLimited) return 0;
        return Math.max(0, Math.ceil((state.resetAt - Date.now()) / 1000));
    }, [state.isLimited, state.resetAt]);
    
    return {
        ...state,
        checkRateLimit,
        getRetryAfter,
    };
}

// Hook for endpoint-specific rate limiting
export function useEndpointRateLimiter(
    endpoint: string,
    config: RateLimitConfig = { maxRequests: 10, windowMs: 60000 }
) {
    const [state, setState] = useState<RateLimitState>({
        remaining: config.maxRequests,
        resetAt: Date.now() + config.windowMs,
        isLimited: false,
    });
    
    const requestsRef = useRef<number[]>([]);
    
    const checkLimit = useCallback((): boolean => {
        const now = Date.now();
        const windowStart = now - config.windowMs;
        
        // Clean up old requests
        requestsRef.current = requestsRef.current.filter(timestamp => timestamp > windowStart);
        
        // Check if at limit
        if (requestsRef.current.length >= config.maxRequests) {
            const oldestRequest = requestsRef.current[0];
            const resetAt = oldestRequest + config.windowMs;
            
            setState({
                remaining: 0,
                resetAt,
                isLimited: true,
            });
            
            return false;
        }
        
        // Log the request
        requestsRef.current.push(now);
        
        const remaining = config.maxRequests - requestsRef.current.length;
        const oldestRequest = requestsRef.current[0];
        const resetAt = oldestRequest ? oldestRequest + config.windowMs : now + config.windowMs;
        
        setState({
            remaining,
            resetAt,
            isLimited: false,
        });
        
        return true;
    }, [config.maxRequests, config.windowMs]);
    
    const getRetryAfter = useCallback((): number => {
        if (!state.isLimited) return 0;
        return Math.max(0, Math.ceil((state.resetAt - Date.now()) / 1000));
    }, [state.isLimited, state.resetAt]);
    
    return {
        ...state,
        checkLimit,
        getRetryAfter,
        endpoint,
    };
}
