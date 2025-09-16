/**
 * Tests for Error Recovery Mechanisms
 */

const {
    RetryManager,
    CircuitBreaker,
    FallbackManager,
    ErrorRecoverySystem,
    RetryExhaustedError,
    CircuitBreakerOpenError,
    CircuitState,
    FallbackType,
    RetryStrategies,
    FallbackConfigurations,
    ErrorRecoveryPresets
} = require('../src/error-recovery');

// Mock logger to prevent console output during tests
jest.mock('../src/logging', () => ({
    createApiLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    })
}));

describe('RetryManager', () => {
    let retryManager;

    beforeEach(() => {
        retryManager = new RetryManager({
            maxRetries: 3,
            baseDelay: 100,
            maxDelay: 1000
        });
    });

    describe('Basic Retry Logic', () => {
        test('should succeed on first attempt', async () => {
            const operation = jest.fn().mockResolvedValue('success');
            
            const result = await retryManager.executeWithRetry(operation);
            
            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        test('should retry on failure and eventually succeed', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('Temporary failure'))
                .mockRejectedValueOnce(new Error('Another failure'))
                .mockResolvedValue('success');
            
            const result = await retryManager.executeWithRetry(operation);
            
            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(3);
        });

        test('should throw RetryExhaustedError after max retries', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('Always fails'));
            
            await expect(retryManager.executeWithRetry(operation, { maxRetries: 2 }))
                .rejects.toThrow(RetryExhaustedError);
            
            expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
        });

        test('should respect custom retry conditions', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('Non-retryable error'));
            
            const shouldRetry = jest.fn().mockReturnValue(false);
            
            await expect(retryManager.executeWithRetry(operation, { shouldRetry }))
                .rejects.toThrow('Non-retryable error');
            
            expect(operation).toHaveBeenCalledTimes(1);
            expect(shouldRetry).toHaveBeenCalledWith(expect.any(Error), 1);
        });
    });

    describe('Retry Strategies', () => {
        test('should use exponential backoff strategy', () => {
            const strategy = RetryStrategies.exponentialBackoff(3, 1000, 10000);
            
            expect(strategy.maxRetries).toBe(3);
            expect(strategy.baseDelay).toBe(1000);
            expect(strategy.maxDelay).toBe(10000);
            expect(strategy.backoffMultiplier).toBe(2);
        });

        test('should use API call strategy', () => {
            const strategy = RetryStrategies.apiCall(5);
            
            expect(strategy.maxRetries).toBe(5);
            expect(strategy.retryableStatusCodes).toContain(500);
            expect(strategy.retryableStatusCodes).toContain(503);
        });
    });

    describe('Statistics', () => {
        test('should track retry statistics', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('Fail once'))
                .mockResolvedValue('success');
            
            await retryManager.executeWithRetry(operation);
            
            const stats = retryManager.getStats();
            expect(stats.totalAttempts).toBe(2);
            expect(stats.successfulRetries).toBe(1);
            expect(stats.failedRetries).toBe(0);
        });
    });
});

describe('CircuitBreaker', () => {
    let circuitBreaker;

    beforeEach(() => {
        circuitBreaker = new CircuitBreaker({
            failureThreshold: 3,
            recoveryTimeout: 1000,
            monitoringPeriod: 100,
            name: 'test-circuit'
        });
    });

    describe('Basic Circuit Breaker Logic', () => {
        test('should start in CLOSED state', () => {
            expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
        });

        test('should execute operation when CLOSED', async () => {
            const operation = jest.fn().mockResolvedValue('success');
            
            const result = await circuitBreaker.execute(operation);
            
            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        test('should open circuit after failure threshold', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('Always fails'));
            
            // Fail enough times to open circuit
            for (let i = 0; i < 3; i++) {
                try {
                    await circuitBreaker.execute(operation);
                } catch (error) {
                    // Expected to fail
                }
            }
            
            expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
        });

        test('should reject calls when OPEN', async () => {
            const operation = jest.fn().mockResolvedValue('success');
            
            // Force circuit to open
            circuitBreaker.forceState(CircuitState.OPEN);
            
            await expect(circuitBreaker.execute(operation))
                .rejects.toThrow(CircuitBreakerOpenError);
            
            expect(operation).not.toHaveBeenCalled();
        });

        test('should transition to HALF_OPEN after recovery timeout', async () => {
            // Force circuit to open
            circuitBreaker.forceState(CircuitState.OPEN);
            circuitBreaker.lastFailureTime = Date.now() - 2000; // 2 seconds ago
            
            // Wait for monitoring period
            await new Promise(resolve => setTimeout(resolve, 150));
            
            expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
        });

        test('should close circuit after successful calls in HALF_OPEN', async () => {
            const operation = jest.fn().mockResolvedValue('success');
            
            circuitBreaker.forceState(CircuitState.HALF_OPEN);
            
            // Execute successful operations
            await circuitBreaker.execute(operation);
            await circuitBreaker.execute(operation);
            
            expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
        });
    });

    describe('Statistics', () => {
        test('should track circuit breaker statistics', async () => {
            const operation = jest.fn()
                .mockResolvedValueOnce('success')
                .mockRejectedValueOnce(new Error('failure'));
            
            await circuitBreaker.execute(operation);
            
            try {
                await circuitBreaker.execute(operation);
            } catch (error) {
                // Expected failure
            }
            
            const stats = circuitBreaker.getStats();
            expect(stats.totalCalls).toBe(2);
            expect(stats.successfulCalls).toBe(1);
            expect(stats.failedCalls).toBe(1);
        });
    });
});

describe('FallbackManager', () => {
    let fallbackManager;

    beforeEach(() => {
        fallbackManager = new FallbackManager({
            enableFallbacks: true
        });
    });

    describe('Fallback Execution', () => {
        test('should return primary result when operation succeeds', async () => {
            const primaryOperation = jest.fn().mockResolvedValue('primary success');
            
            const result = await fallbackManager.executeWithFallback(
                'test-operation',
                primaryOperation,
                { type: FallbackType.DEFAULT_VALUE, value: 'fallback' }
            );
            
            expect(result).toBe('primary success');
            expect(primaryOperation).toHaveBeenCalledTimes(1);
        });

        test('should use default value fallback when primary fails', async () => {
            const primaryOperation = jest.fn().mockRejectedValue(new Error('Primary failed'));
            
            const result = await fallbackManager.executeWithFallback(
                'test-operation',
                primaryOperation,
                { type: FallbackType.DEFAULT_VALUE, value: 'fallback value' }
            );
            
            expect(result).toBe('fallback value');
        });

        test('should use cached value fallback', async () => {
            // Cache a value first
            fallbackManager._cacheResult('test-operation', 'cached value', 60000);
            
            const primaryOperation = jest.fn().mockRejectedValue(new Error('Primary failed'));
            
            const result = await fallbackManager.executeWithFallback(
                'test-operation',
                primaryOperation,
                { type: FallbackType.CACHED_VALUE }
            );
            
            expect(result).toBe('cached value');
        });

        test('should use custom function fallback', async () => {
            const primaryOperation = jest.fn().mockRejectedValue(new Error('Primary failed'));
            const customFallback = jest.fn().mockResolvedValue('custom fallback result');
            
            const result = await fallbackManager.executeWithFallback(
                'test-operation',
                primaryOperation,
                { 
                    type: FallbackType.CUSTOM_FUNCTION, 
                    function: customFallback 
                }
            );
            
            expect(result).toBe('custom fallback result');
            expect(customFallback).toHaveBeenCalledWith(expect.any(Error));
        });

        test('should skip operation fallback', async () => {
            const primaryOperation = jest.fn().mockRejectedValue(new Error('Primary failed'));
            
            const result = await fallbackManager.executeWithFallback(
                'test-operation',
                primaryOperation,
                { 
                    type: FallbackType.SKIP_OPERATION, 
                    skipValue: 'operation skipped' 
                }
            );
            
            expect(result).toBe('operation skipped');
        });
    });

    describe('Fallback Conditions', () => {
        test('should respect fallback conditions', async () => {
            const primaryOperation = jest.fn().mockRejectedValue(new Error('Specific error'));
            
            const condition = jest.fn().mockReturnValue(false);
            
            await expect(fallbackManager.executeWithFallback(
                'test-operation',
                primaryOperation,
                { 
                    type: FallbackType.DEFAULT_VALUE, 
                    value: 'fallback',
                    condition 
                }
            )).rejects.toThrow('Specific error');
            
            expect(condition).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    describe('Statistics', () => {
        test('should track fallback statistics', async () => {
            const primaryOperation = jest.fn().mockRejectedValue(new Error('Primary failed'));
            
            await fallbackManager.executeWithFallback(
                'test-operation',
                primaryOperation,
                { type: FallbackType.DEFAULT_VALUE, value: 'fallback' }
            );
            
            const stats = fallbackManager.getStats();
            expect(stats.totalFallbacks).toBe(1);
            expect(stats.successfulFallbacks).toBe(1);
            expect(stats.fallbacksByType[FallbackType.DEFAULT_VALUE]).toBe(1);
        });
    });
});

describe('ErrorRecoverySystem Integration', () => {
    let errorRecovery;

    beforeEach(() => {
        errorRecovery = new ErrorRecoverySystem({
            enableRetry: true,
            enableCircuitBreaker: true,
            enableFallback: true
        });
    });

    describe('Integrated Recovery', () => {
        test('should execute with full recovery stack', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('Temporary failure'))
                .mockResolvedValue('success');
            
            const result = await errorRecovery.executeWithRecovery(
                'test-operation',
                operation,
                {
                    retry: { maxRetries: 2 },
                    fallback: { 
                        type: FallbackType.DEFAULT_VALUE, 
                        value: 'fallback' 
                    }
                }
            );
            
            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(2);
        });

        test('should use fallback when all retries exhausted', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('Always fails'));
            
            const result = await errorRecovery.executeWithRecovery(
                'test-operation',
                operation,
                {
                    retry: { maxRetries: 1 },
                    fallback: { 
                        type: FallbackType.DEFAULT_VALUE, 
                        value: 'fallback result' 
                    }
                }
            );
            
            expect(result).toBe('fallback result');
        });

        test('should create wrapped function with recovery', async () => {
            const originalFunction = jest.fn()
                .mockRejectedValueOnce(new Error('Temporary failure'))
                .mockResolvedValue('success');
            
            const wrappedFunction = errorRecovery.wrapWithRecovery(
                'test-operation',
                originalFunction,
                {
                    retry: { maxRetries: 2 },
                    fallback: { 
                        type: FallbackType.DEFAULT_VALUE, 
                        value: 'fallback' 
                    }
                }
            );
            
            const result = await wrappedFunction('arg1', 'arg2');
            
            expect(result).toBe('success');
            expect(originalFunction).toHaveBeenCalledWith('arg1', 'arg2');
        });
    });

    describe('Recovery Statistics', () => {
        test('should provide comprehensive statistics', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('Failure'))
                .mockResolvedValue('success');
            
            await errorRecovery.executeWithRecovery(
                'test-operation',
                operation,
                {
                    retry: { maxRetries: 2 },
                    fallback: { 
                        type: FallbackType.DEFAULT_VALUE, 
                        value: 'fallback' 
                    }
                }
            );
            
            const stats = errorRecovery.getStats();
            
            expect(stats).toHaveProperty('retry');
            expect(stats).toHaveProperty('circuitBreaker');
            expect(stats).toHaveProperty('fallback');
            expect(stats).toHaveProperty('timestamp');
        });
    });
});

describe('ErrorRecoveryPresets', () => {
    test('should provide API call preset', () => {
        const preset = ErrorRecoveryPresets.apiCall('test-api');
        
        expect(preset).toHaveProperty('retry');
        expect(preset).toHaveProperty('circuitBreaker');
        expect(preset).toHaveProperty('fallback');
        expect(preset.circuitBreaker.name).toBe('test-api-api');
    });

    test('should provide database preset', () => {
        const preset = ErrorRecoveryPresets.database('test-db');
        
        expect(preset.retry.maxRetries).toBe(2);
        expect(preset.circuitBreaker.failureThreshold).toBe(3);
    });

    test('should provide external service preset', () => {
        const alternativeService = jest.fn();
        const preset = ErrorRecoveryPresets.externalService('test-service', alternativeService);
        
        expect(preset.fallback.type).toBe(FallbackType.ALTERNATIVE_SERVICE);
        expect(preset.fallback.alternativeService).toBe(alternativeService);
    });
});