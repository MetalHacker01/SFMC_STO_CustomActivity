/**
 * Unit tests for Data Extension Error Handler
 */

const DataExtensionErrorHandler = require('../src/dataextension/error-handler');

describe('DataExtensionErrorHandler', () => {
    let errorHandler;
    let mockLogger;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        };

        errorHandler = new DataExtensionErrorHandler({
            maxRetries: 2,
            retryDelay: 100,
            backoffMultiplier: 2
        }, mockLogger);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('constructor', () => {
        it('should initialize with default configuration', () => {
            const handler = new DataExtensionErrorHandler();
            expect(handler.config.maxRetries).toBe(3);
            expect(handler.config.retryDelay).toBe(1000);
            expect(handler.config.enableGracefulDegradation).toBe(true);
        });

        it('should use provided configuration', () => {
            expect(errorHandler.config.maxRetries).toBe(2);
            expect(errorHandler.config.retryDelay).toBe(100);
            expect(errorHandler.config.backoffMultiplier).toBe(2);
        });
    });

    describe('classifyError', () => {
        it('should classify authentication errors', () => {
            const error401 = new Error('Unauthorized');
            error401.response = { status: 401 };
            expect(errorHandler.classifyError(error401)).toBe('authentication');

            const errorToken = new Error('Invalid token');
            expect(errorHandler.classifyError(errorToken)).toBe('authentication');
        });

        it('should classify rate limit errors', () => {
            const error429 = new Error('Too many requests');
            error429.response = { status: 429 };
            expect(errorHandler.classifyError(error429)).toBe('rateLimit');

            const errorRate = new Error('Rate limit exceeded');
            expect(errorHandler.classifyError(errorRate)).toBe('rateLimit');
        });

        it('should classify validation errors', () => {
            const error400 = new Error('Bad request');
            error400.response = { status: 400 };
            expect(errorHandler.classifyError(error400)).toBe('validation');

            const errorValidation = new Error('Validation failed');
            expect(errorHandler.classifyError(errorValidation)).toBe('validation');
        });

        it('should classify server errors', () => {
            const error500 = new Error('Internal server error');
            error500.response = { status: 500 };
            expect(errorHandler.classifyError(error500)).toBe('serverError');

            const errorServer = new Error('Service unavailable');
            expect(errorHandler.classifyError(errorServer)).toBe('serverError');
        });

        it('should classify network errors', () => {
            const errorNetwork = new Error('Network error');
            expect(errorHandler.classifyError(errorNetwork)).toBe('network');

            const errorTimeout = new Error('Connection timeout');
            expect(errorHandler.classifyError(errorTimeout)).toBe('network');
        });

        it('should classify unknown errors', () => {
            const unknownError = new Error('Something went wrong');
            expect(errorHandler.classifyError(unknownError)).toBe('unknown');
        });
    });

    describe('shouldRetry', () => {
        it('should not retry authentication errors', () => {
            const error = new Error('Unauthorized');
            expect(errorHandler.shouldRetry(error, 'authentication', 1)).toBe(false);
        });

        it('should not retry validation errors', () => {
            const error = new Error('Bad request');
            expect(errorHandler.shouldRetry(error, 'validation', 1)).toBe(false);
        });

        it('should retry network errors', () => {
            const error = new Error('Network error');
            expect(errorHandler.shouldRetry(error, 'network', 1)).toBe(true);
        });

        it('should retry server errors', () => {
            const error = new Error('Server error');
            expect(errorHandler.shouldRetry(error, 'serverError', 1)).toBe(true);
        });

        it('should retry rate limit errors', () => {
            const error = new Error('Rate limit');
            expect(errorHandler.shouldRetry(error, 'rateLimit', 1)).toBe(true);
        });

        it('should not retry when max attempts reached', () => {
            const error = new Error('Network error');
            expect(errorHandler.shouldRetry(error, 'network', 2)).toBe(false);
        });

        it('should not retry 4xx errors except 429', () => {
            const error404 = new Error('Not found');
            error404.response = { status: 404 };
            expect(errorHandler.shouldRetry(error404, 'unknown', 1)).toBe(false);

            const error429 = new Error('Rate limit');
            error429.response = { status: 429 };
            expect(errorHandler.shouldRetry(error429, 'unknown', 1)).toBe(true);
        });
    });

    describe('calculateRetryDelay', () => {
        it('should calculate exponential backoff delay', () => {
            expect(errorHandler.calculateRetryDelay(1)).toBe(100);
            expect(errorHandler.calculateRetryDelay(2)).toBe(200);
            expect(errorHandler.calculateRetryDelay(3)).toBe(400);
        });

        it('should respect maximum delay', () => {
            const handler = new DataExtensionErrorHandler({
                retryDelay: 1000,
                backoffMultiplier: 10,
                maxRetryDelay: 5000
            });

            expect(handler.calculateRetryDelay(5)).toBe(5000);
        });
    });

    describe('handleError', () => {
        it('should handle retryable error', async () => {
            const error = new Error('Network error');
            const result = await errorHandler.handleError(error, 'testOperation', {}, 1);

            expect(result.errorType).toBe('network');
            expect(result.shouldRetry).toBe(true);
            expect(result.retryDelay).toBe(100);
            expect(mockLogger.warn).toHaveBeenCalled();
        });

        it('should handle non-retryable error with graceful degradation', async () => {
            const error = new Error('Validation failed');
            const result = await errorHandler.handleError(error, 'updateConvertedTime', {}, 1);

            expect(result.errorType).toBe('validation');
            expect(result.shouldRetry).toBe(false);
            expect(result.gracefulDegradation).toBeTruthy();
            expect(result.gracefulDegradation.type).toBe('continue_journey');
        });

        it('should update error statistics', async () => {
            const error = new Error('Test error');
            await errorHandler.handleError(error, 'testOperation', {}, 1);

            const stats = errorHandler.getErrorStats();
            expect(stats.totalErrors).toBe(1);
            expect(stats.errorsByType.unknown).toBe(1);
            expect(stats.errorsByOperation.testOperation).toBe(1);
        });
    });

    describe('executeWithRetry', () => {
        it('should succeed on first attempt', async () => {
            const mockOperation = jest.fn().mockResolvedValueOnce('success');

            const result = await errorHandler.executeWithRetry(mockOperation, 'testOp');

            expect(result.success).toBe(true);
            expect(result.result).toBe('success');
            expect(result.attempts).toBe(1);
            expect(mockOperation).toHaveBeenCalledTimes(1);
        });

        it('should retry and eventually succeed', async () => {
            // Use real timers for this test
            jest.useRealTimers();
            
            const fastErrorHandler = new DataExtensionErrorHandler({
                maxRetries: 2,
                retryDelay: 10, // Very short delay
                backoffMultiplier: 1
            }, mockLogger);

            const mockOperation = jest.fn()
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce('success');

            const result = await fastErrorHandler.executeWithRetry(mockOperation, 'testOp');

            expect(result.success).toBe(true);
            expect(result.result).toBe('success');
            expect(result.attempts).toBe(2);
            expect(mockOperation).toHaveBeenCalledTimes(2);
            
            jest.useFakeTimers();
        });

        it('should fail after max retries', async () => {
            // Use real timers for this test
            jest.useRealTimers();
            
            const fastErrorHandler = new DataExtensionErrorHandler({
                maxRetries: 2,
                retryDelay: 10, // Very short delay
                backoffMultiplier: 1
            }, mockLogger);

            const mockOperation = jest.fn().mockRejectedValue(new Error('Persistent error'));

            const result = await fastErrorHandler.executeWithRetry(mockOperation, 'testOp');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Persistent error');
            expect(result.attempts).toBe(2);
            expect(mockOperation).toHaveBeenCalledTimes(2);
            
            jest.useFakeTimers();
        });

        it('should not retry non-retryable errors', async () => {
            const error = new Error('Validation failed');
            const mockOperation = jest.fn().mockRejectedValue(error);

            const result = await errorHandler.executeWithRetry(mockOperation, 'testOp');

            expect(result.success).toBe(false);
            expect(result.attempts).toBe(1);
            expect(mockOperation).toHaveBeenCalledTimes(1);
        });

        it('should apply graceful degradation on final failure', async () => {
            const error = new Error('Validation failed');
            const mockOperation = jest.fn().mockRejectedValue(error);

            const result = await errorHandler.executeWithRetry(mockOperation, 'updateConvertedTime');

            expect(result.success).toBe(false);
            expect(result.gracefulDegradation).toBeTruthy();
            expect(result.gracefulDegradation.type).toBe('continue_journey');
        });

        it('should wait between retries', async () => {
            // Use real timers for this test
            jest.useRealTimers();
            
            const fastErrorHandler = new DataExtensionErrorHandler({
                maxRetries: 2,
                retryDelay: 10, // Very short delay
                backoffMultiplier: 1
            }, mockLogger);

            const mockOperation = jest.fn()
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce('success');

            const result = await fastErrorHandler.executeWithRetry(mockOperation, 'testOp');

            expect(result.success).toBe(true);
            expect(result.attempts).toBe(2);
            
            jest.useFakeTimers();
        });
    });

    describe('applyGracefulDegradation', () => {
        it('should provide degradation for updateConvertedTime', () => {
            const degradation = errorHandler.applyGracefulDegradation(
                new Error('Test'),
                'validation',
                'updateConvertedTime',
                {}
            );

            expect(degradation.type).toBe('continue_journey');
            expect(degradation.message).toContain('journey will continue');
        });

        it('should provide degradation for batchUpdateConvertedTime', () => {
            const degradation = errorHandler.applyGracefulDegradation(
                new Error('Test'),
                'serverError',
                'batchUpdateConvertedTime',
                {}
            );

            expect(degradation.type).toBe('partial_success');
            expect(degradation.fallbackValue).toBe('individual_updates');
        });

        it('should provide degradation for validateDataExtension', () => {
            const degradation = errorHandler.applyGracefulDegradation(
                new Error('Test'),
                'network',
                'validateDataExtension',
                {}
            );

            expect(degradation.type).toBe('assume_valid');
            expect(degradation.fallbackValue.exists).toBe(true);
        });

        it('should provide default degradation for unknown operations', () => {
            const degradation = errorHandler.applyGracefulDegradation(
                new Error('Test'),
                'unknown',
                'unknownOperation',
                {}
            );

            expect(degradation.type).toBe('log_and_continue');
        });
    });

    describe('wrapWithErrorHandling', () => {
        it('should wrap function with error handling', async () => {
            const mockFn = jest.fn().mockResolvedValueOnce('success');
            const wrappedFn = errorHandler.wrapWithErrorHandling(mockFn, 'testOp');

            const result = await wrappedFn('arg1', 'arg2');

            expect(result.success).toBe(true);
            expect(result.result).toBe('success');
            expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
        });
    });

    describe('error statistics', () => {
        it('should track error statistics', async () => {
            const error1 = new Error('Network error');
            const error2 = new Error('Validation failed');

            await errorHandler.handleError(error1, 'op1', {}, 1);
            await errorHandler.handleError(error2, 'op2', {}, 1);

            const stats = errorHandler.getErrorStats();

            expect(stats.totalErrors).toBe(2);
            expect(stats.errorsByType.network).toBe(1);
            expect(stats.errorsByType.validation).toBe(1);
            expect(stats.errorsByOperation.op1).toBe(1);
            expect(stats.errorsByOperation.op2).toBe(1);
            expect(stats.lastError).toBe('Validation failed');
        });

        it('should reset error statistics', () => {
            errorHandler.errorStats.totalErrors = 5;
            errorHandler.resetErrorStats();

            const stats = errorHandler.getErrorStats();
            expect(stats.totalErrors).toBe(0);
            expect(Object.keys(stats.errorsByType)).toHaveLength(0);
        });
    });
});