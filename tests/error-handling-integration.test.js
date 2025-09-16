/**
 * Integration tests for comprehensive data extension error handling
 * Tests the complete error handling workflow including retry logic, graceful degradation, and logging
 */

const { createDataExtensionSuite } = require('../src/dataextension');

describe('Data Extension Error Handling Integration', () => {
    let suite;
    let mockLogger;
    let config;

    beforeEach(() => {
        jest.clearAllMocks();

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        };

        config = {
            sfmc: {
                clientId: 'test-client-id',
                clientSecret: 'test-client-secret',
                subdomain: 'test-subdomain',
                maxRetries: 2,
                retryDelay: 100,
                backoffMultiplier: 2,
                enableGracefulDegradation: true
            },
            errorHandling: {
                maxRetries: 2,
                retryDelay: 100,
                backoffMultiplier: 2,
                enableGracefulDegradation: true
            },
            logging: {
                logLevel: 'debug',
                enableMetrics: true,
                maxLogEntries: 100
            }
        };

        suite = createDataExtensionSuite(config, mockLogger);
    });

    describe('Error Handler Integration', () => {
        it('should provide comprehensive error handling for all operations', () => {
            expect(suite.errorHandler).toBeDefined();
            expect(suite.operationLogger).toBeDefined();
            expect(suite.dataExtensionAPI).toBeDefined();
            expect(suite.convertedTimeUpdater).toBeDefined();
        });

        it('should have wrapped methods with error handling', () => {
            expect(suite.updateConvertedTimeWithErrorHandling).toBeDefined();
            expect(suite.batchUpdateWithErrorHandling).toBeDefined();
            expect(suite.validateDataExtensionWithErrorHandling).toBeDefined();
        });

        it('should track error statistics across operations', async () => {
            // Simulate some errors
            const mockError = new Error('Network error');
            await suite.errorHandler.handleError(mockError, 'testOperation1', {}, 1);
            await suite.errorHandler.handleError(mockError, 'testOperation2', {}, 1);

            const stats = suite.errorHandler.getErrorStats();
            expect(stats.totalErrors).toBe(2);
            expect(stats.errorsByOperation.testOperation1).toBe(1);
            expect(stats.errorsByOperation.testOperation2).toBe(1);
        });
    });

    describe('Operation Logger Integration', () => {
        it('should log all operation phases', () => {
            const tracking = suite.operationLogger.logOperationStart('testOp', { key: 'value' });
            
            expect(tracking.operationId).toBeDefined();
            expect(tracking.operation).toBe('testOp');
            expect(mockLogger.debug).toHaveBeenCalled();

            suite.operationLogger.logOperationSuccess(tracking, { result: 'success' });
            expect(mockLogger.info).toHaveBeenCalled();

            const metrics = suite.operationLogger.getMetrics();
            expect(metrics.totalOperations).toBe(1);
            expect(metrics.successfulOperations).toBe(1);
        });

        it('should log authentication events', () => {
            suite.operationLogger.logAuthEvent('token_received', { expiresIn: 3600 });
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('SFMC authentication successful')
            );
        });

        it('should log validation events', () => {
            const validationResult = {
                exists: true,
                hasRequiredFields: true,
                totalRows: 100
            };

            suite.operationLogger.logValidationEvent('test-de-key', validationResult);
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Data extension validation successful')
            );
        });

        it('should log batch processing events', () => {
            suite.operationLogger.logBatchEvent('batch_processed', {
                batchKey: 'test-batch',
                contactCount: 5,
                success: true,
                duration: 1000
            });

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Batch processed')
            );
        });

        it('should log contact processing events', () => {
            suite.operationLogger.logContactEvent('sub123', 'converted_time_updated', {
                convertedTime: '2024-01-15T12:00:00Z',
                attempts: 1
            });

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('ConvertedTime updated for contact')
            );
        });
    });

    describe('Graceful Degradation Scenarios', () => {
        it('should apply graceful degradation for updateConvertedTime failures', async () => {
            const error = new Error('Validation failed');
            const result = await suite.errorHandler.handleError(
                error,
                'updateConvertedTime',
                { subscriberKey: 'test123' },
                1
            );

            expect(result.gracefulDegradation).toBeDefined();
            expect(result.gracefulDegradation.type).toBe('continue_journey');
            expect(result.gracefulDegradation.message).toContain('journey will continue');
        });

        it('should apply graceful degradation for batch update failures', async () => {
            const error = new Error('Validation failed'); // Non-retryable error
            const result = await suite.errorHandler.handleError(
                error,
                'batchUpdateConvertedTime',
                { contactCount: 10 },
                1
            );

            expect(result.gracefulDegradation).toBeDefined();
            expect(result.gracefulDegradation.type).toBe('partial_success');
            expect(result.gracefulDegradation.fallbackValue).toBe('individual_updates');
        });

        it('should apply graceful degradation for validation failures', async () => {
            const error = new Error('Bad request'); // Non-retryable error
            error.response = { status: 400 };
            const result = await suite.errorHandler.handleError(
                error,
                'validateDataExtension',
                { dataExtensionKey: 'test-de' },
                1
            );

            expect(result.gracefulDegradation).toBeDefined();
            expect(result.gracefulDegradation.type).toBe('assume_valid');
            expect(result.gracefulDegradation.fallbackValue.exists).toBe(true);
        });
    });

    describe('Retry Logic Integration', () => {
        it('should retry retryable errors with exponential backoff', async () => {
            const mockOperation = jest.fn()
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce('success');

            const result = await suite.errorHandler.executeWithRetry(
                mockOperation,
                'testOperation',
                { key: 'value' }
            );

            expect(result.success).toBe(true);
            expect(result.attempts).toBe(2);
            expect(mockOperation).toHaveBeenCalledTimes(2);
        });

        it('should not retry non-retryable errors', async () => {
            const authError = new Error('Unauthorized');
            authError.response = { status: 401 };

            const mockOperation = jest.fn().mockRejectedValue(authError);

            const result = await suite.errorHandler.executeWithRetry(
                mockOperation,
                'testOperation',
                { key: 'value' }
            );

            expect(result.success).toBe(false);
            expect(result.attempts).toBe(1);
            expect(mockOperation).toHaveBeenCalledTimes(1);
        });

        it('should respect maximum retry attempts', async () => {
            const mockOperation = jest.fn().mockRejectedValue(new Error('Persistent error'));

            const result = await suite.errorHandler.executeWithRetry(
                mockOperation,
                'testOperation',
                { key: 'value' }
            );

            expect(result.success).toBe(false);
            expect(result.attempts).toBe(2); // maxRetries from config
            expect(mockOperation).toHaveBeenCalledTimes(2);
        });
    });

    describe('Comprehensive Logging and Metrics', () => {
        it('should provide comprehensive health status', () => {
            const healthStatus = suite.dataExtensionAPI.getHealthStatus();

            expect(healthStatus.authentication).toBeDefined();
            expect(healthStatus.errorStatistics).toBeDefined();
            expect(healthStatus.operationMetrics).toBeDefined();
            expect(healthStatus.timestamp).toBeDefined();
        });

        it('should track operation metrics over time', () => {
            // Simulate some operations
            const tracking1 = suite.operationLogger.logOperationStart('op1');
            suite.operationLogger.logOperationSuccess(tracking1, {});

            const tracking2 = suite.operationLogger.logOperationStart('op2');
            suite.operationLogger.logOperationFailure(tracking2, new Error('Test error'));

            const metrics = suite.operationLogger.getMetrics();

            expect(metrics.totalOperations).toBe(2);
            expect(metrics.successfulOperations).toBe(1);
            expect(metrics.failedOperations).toBe(1);
            expect(metrics.successRate).toBe('50.00%');
            expect(metrics.operations.op1).toBeDefined();
            expect(metrics.operations.op2).toBeDefined();
        });

        it('should maintain recent logs for debugging', () => {
            suite.operationLogger.logOperationStart('op1');
            suite.operationLogger.logOperationStart('op2');
            suite.operationLogger.logOperationStart('op3');

            const recentLogs = suite.operationLogger.getRecentLogs(2);
            expect(recentLogs).toHaveLength(2);
            expect(recentLogs[0].operation).toBe('op2');
            expect(recentLogs[1].operation).toBe('op3');
        });

        it('should allow resetting statistics', async () => {
            // Generate some stats
            const tracking = suite.operationLogger.logOperationStart('testOp');
            suite.operationLogger.logOperationSuccess(tracking, {});

            await suite.errorHandler.handleError(new Error('Test'), 'testOp', {}, 1);

            // Verify stats exist before reset
            let metrics = suite.operationLogger.getMetrics();
            let errorStats = suite.errorHandler.getErrorStats();
            expect(metrics.totalOperations).toBeGreaterThan(0);
            expect(errorStats.totalErrors).toBeGreaterThan(0);

            // Reset both directly since they're separate instances in the suite
            suite.operationLogger.clearMetrics();
            suite.errorHandler.resetErrorStats();

            // Check after reset
            metrics = suite.operationLogger.getMetrics();
            errorStats = suite.errorHandler.getErrorStats();

            expect(metrics.totalOperations).toBe(0);
            expect(errorStats.totalErrors).toBe(0);
        });
    });

    describe('Error Classification and Handling', () => {
        it('should correctly classify different error types', () => {
            const authError = new Error('Unauthorized');
            authError.response = { status: 401 };
            expect(suite.errorHandler.classifyError(authError)).toBe('authentication');

            const rateLimitError = new Error('Too many requests');
            rateLimitError.response = { status: 429 };
            expect(suite.errorHandler.classifyError(rateLimitError)).toBe('rateLimit');

            const validationError = new Error('Bad request');
            validationError.response = { status: 400 };
            expect(suite.errorHandler.classifyError(validationError)).toBe('validation');

            const serverError = new Error('Internal server error');
            serverError.response = { status: 500 };
            expect(suite.errorHandler.classifyError(serverError)).toBe('serverError');

            const networkError = new Error('Network timeout');
            expect(suite.errorHandler.classifyError(networkError)).toBe('network');
        });

        it('should determine retry eligibility correctly', () => {
            const authError = new Error('Unauthorized');
            expect(suite.errorHandler.shouldRetry(authError, 'authentication', 1)).toBe(false);

            const networkError = new Error('Network error');
            expect(suite.errorHandler.shouldRetry(networkError, 'network', 1)).toBe(true);

            const serverError = new Error('Server error');
            expect(suite.errorHandler.shouldRetry(serverError, 'serverError', 1)).toBe(true);

            // Should not retry when max attempts reached
            expect(suite.errorHandler.shouldRetry(networkError, 'network', 2)).toBe(false);
        });

        it('should calculate exponential backoff delays', () => {
            expect(suite.errorHandler.calculateRetryDelay(1)).toBe(100);
            expect(suite.errorHandler.calculateRetryDelay(2)).toBe(200);
            expect(suite.errorHandler.calculateRetryDelay(3)).toBe(400);
        });
    });
});