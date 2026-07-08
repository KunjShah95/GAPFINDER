/**
 * Circuit Breaker Pattern Implementation
 * 
 * Protects against cascading failures when calling external APIs (Firecrawl, AI providers).
 * States: CLOSED (normal) → OPEN (failing, reject requests) → HALF_OPEN (testing recovery)
 */

export enum CircuitState {
    CLOSED = 'closed',       // Normal operation — allow requests
    OPEN = 'open',           // Too many failures — reject requests immediately
    HALF_OPEN = 'half-open', // Testing recovery — allow limited requests
}

interface CircuitBreakerConfig {
    name: string;
    failureThreshold?: number;      // Failures before opening (default: 5)
    successThreshold?: number;      // Successes needed to close from half-open (default: 2)
    timeout?: number;               // Milliseconds before half-open attempt (default: 60000)
    onStateChange?: (state: CircuitState) => void;
}

export class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private failureCount: number = 0;
    private successCount: number = 0;
    private nextAttemptTime: number = 0;

    private readonly config: Required<CircuitBreakerConfig>;

    constructor(config: CircuitBreakerConfig) {
        this.config = {
            failureThreshold: config.failureThreshold ?? 5,
            successThreshold: config.successThreshold ?? 2,
            timeout: config.timeout ?? 60000,
            onStateChange: config.onStateChange ?? (() => {}),
            name: config.name,
        };
    }

    /**
     * Execute a function with circuit breaker protection.
     * Throws if circuit is OPEN.
     */
    async call<T>(fn: () => Promise<T>): Promise<T> {
        if (this.state === CircuitState.OPEN) {
            if (Date.now() < this.nextAttemptTime) {
                throw new Error(
                    `[CircuitBreaker:${this.config.name}] Circuit OPEN, rejecting request. ` +
                    `Retry after ${Math.ceil((this.nextAttemptTime - Date.now()) / 1000)}s`
                );
            }
            // Transition to HALF_OPEN
            this.setState(CircuitState.HALF_OPEN);
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    private onSuccess(): void {
        this.failureCount = 0;

        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;
            if (this.successCount >= this.config.successThreshold) {
                this.setState(CircuitState.CLOSED);
            }
        }
    }

    private onFailure(): void {
        this.failureCount++;

        if (this.state === CircuitState.HALF_OPEN) {
            // Failed retry in half-open state → back to OPEN
            this.setState(CircuitState.OPEN);
        } else if (this.state === CircuitState.CLOSED && this.failureCount >= this.config.failureThreshold) {
            // Too many failures in closed state → OPEN
            this.setState(CircuitState.OPEN);
        }
    }

    private setState(newState: CircuitState): void {
        if (newState === this.state) return;

        const oldState = this.state;
        this.state = newState;
        this.successCount = 0;

        if (newState === CircuitState.OPEN) {
            this.nextAttemptTime = Date.now() + this.config.timeout;
            console.warn(
                `[CircuitBreaker:${this.config.name}] ${oldState} → ${newState} ` +
                `(will retry in ${this.config.timeout / 1000}s)`
            );
        } else if (newState === CircuitState.HALF_OPEN) {
            console.info(
                `[CircuitBreaker:${this.config.name}] ${oldState} → ${newState} ` +
                `(testing recovery)`
            );
        } else if (newState === CircuitState.CLOSED) {
            console.info(
                `[CircuitBreaker:${this.config.name}] ${oldState} → ${newState} ` +
                `(recovered)`
            );
        }

        this.config.onStateChange(newState);
    }

    getState(): CircuitState {
        return this.state;
    }

    getStats(): { state: CircuitState; failures: number; successes: number } {
        return {
            state: this.state,
            failures: this.failureCount,
            successes: this.successCount,
        };
    }

    reset(): void {
        this.setState(CircuitState.CLOSED);
        this.failureCount = 0;
        this.successCount = 0;
    }
}

/**
 * CircuitBreakerPool: Manage multiple breakers by name
 * Useful for monitoring multiple external APIs
 */
export class CircuitBreakerPool {
    private breakers = new Map<string, CircuitBreaker>();

    create(config: CircuitBreakerConfig): CircuitBreaker {
        const breaker = new CircuitBreaker(config);
        this.breakers.set(config.name, breaker);
        return breaker;
    }

    get(name: string): CircuitBreaker | undefined {
        return this.breakers.get(name);
    }

    getAll(): Map<string, CircuitBreaker> {
        return this.breakers;
    }

    getStats(): Record<string, ReturnType<CircuitBreaker['getStats']>> {
        const stats: Record<string, ReturnType<CircuitBreaker['getStats']>> = {};
        for (const [name, breaker] of this.breakers) {
            stats[name] = breaker.getStats();
        }
        return stats;
    }
}

export const defaultBreakerPool = new CircuitBreakerPool();
