// ============================================================================
// Offline Detection Hook
// Detect network status and handle offline/online transitions
// ============================================================================

import { useState, useEffect, useCallback } from 'react';

interface NetworkState {
    isOnline: boolean;
    isOffline: boolean;
    downlink?: number;
    effectiveType?: string;
    saveData?: boolean;
}

export function useNetworkStatus(): NetworkState {
    const [state, setState] = useState<NetworkState>({
        isOnline: navigator.onLine,
        isOffline: !navigator.onLine,
    });
    
    useEffect(() => {
        const updateNetworkStatus = () => {
            const connection = (navigator as any).connection;
            
            setState({
                isOnline: navigator.onLine,
                isOffline: !navigator.onLine,
                downlink: connection?.downlink,
                effectiveType: connection?.effectiveType,
                saveData: connection?.saveData,
            });
        };
        
        // Initial check
        updateNetworkStatus();
        
        // Event listeners
        window.addEventListener('online', updateNetworkStatus);
        window.addEventListener('offline', updateNetworkStatus);
        
        // Connection change listener (for mobile)
        const connection = (navigator as any).connection;
        if (connection) {
            connection.addEventListener('change', updateNetworkStatus);
        }
        
        return () => {
            window.removeEventListener('online', updateNetworkStatus);
            window.removeEventListener('offline', updateNetworkStatus);
            
            if (connection) {
                connection.removeEventListener('change', updateNetworkStatus);
            }
        };
    }, []);
    
    return state;
}

// Hook for queuing actions when offline
interface QueuedAction {
    id: string;
    type: string;
    payload: any;
    timestamp: number;
}

export function useOfflineQueue() {
    const [queue, setQueue] = useState<QueuedAction[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const { isOnline } = useNetworkStatus();
    
    // Load queue from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('gapminer-offline-queue');
        if (saved) {
            try {
                setQueue(JSON.parse(saved));
            } catch {
                console.error('Failed to parse offline queue');
            }
        }
    }, []);
    
    // Save queue to localStorage when it changes
    useEffect(() => {
        localStorage.setItem('gapminer-offline-queue', JSON.stringify(queue));
    }, [queue]);
    
    const addToQueue = useCallback((action: Omit<QueuedAction, 'id' | 'timestamp'>) => {
        const newAction: QueuedAction = {
            ...action,
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
        };
        
        setQueue(prev => [...prev, newAction]);
        return newAction.id;
    }, []);
    
    const removeFromQueue = useCallback((id: string) => {
        setQueue(prev => prev.filter(action => action.id !== id));
    }, []);
    
    const clearQueue = useCallback(() => {
        setQueue([]);
    }, []);
    
    const processQueue = useCallback(async (
        processor: (action: QueuedAction) => Promise<boolean>
    ): Promise<void> => {
        if (!isOnline || isProcessing || queue.length === 0) return;
        
        setIsProcessing(true);
        
        const successful: string[] = [];
        const failed: string[] = [];
        
        for (const action of queue) {
            try {
                const result = await processor(action);
                if (result) {
                    successful.push(action.id);
                } else {
                    failed.push(action.id);
                }
            } catch (error) {
                console.error('Failed to process queued action:', error);
                failed.push(action.id);
            }
        }
        
        // Remove successful actions from queue
        setQueue(prev => prev.filter(action => !successful.includes(action.id)));
        
        setIsProcessing(false);
    }, [isOnline, isProcessing, queue]);
    
    return {
        queue,
        isProcessing,
        isOnline,
        addToQueue,
        removeFromQueue,
        clearQueue,
        processQueue,
        queueLength: queue.length,
    };
}

// Hook for offline-aware API calls
export function useOfflineAwareAPI() {
    const { isOnline } = useNetworkStatus();
    const { addToQueue, processQueue, queue } = useOfflineQueue();
    
    const makeRequest = useCallback(async <T>(
        apiCall: () => Promise<T>,
        offlineAction?: { type: string; payload: any }
    ): Promise<T | null> => {
        if (isOnline) {
            try {
                return await apiCall();
            } catch (error) {
                console.error('API call failed:', error);
                throw error;
            }
        } else if (offlineAction) {
            // Queue for later
            const id = addToQueue(offlineAction);
            console.log('Action queued for offline processing:', id);
            return null;
        } else {
            throw new Error('Offline and no offline action provided');
        }
    }, [isOnline, addToQueue]);
    
    return {
        isOnline,
        makeRequest,
        processQueue,
        pendingActions: queue.length,
    };
}
