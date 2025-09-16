/**
 * Unit tests for Data Extension Operation Logger
 */

const DataExtensionOperationLogger = require('../src/dataextension/operation-logger');

describe('DataExtensionOperationLogger', () => {
    let logger;
    let mockBaseLogger;

    beforeEach(() => {
        jest.clearAllMocks();

        mockBaseLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        };

        logger = new DataExtensionOperationLogger({
            logLevel: 'debug',
            maxLogEntries: 10
        }, mockBaseLogger);
    });

    describe('constructor', () => {
        it('should initialize with default configuration', () => {
            const defaultLogger = new DataExtensionOperationLogger();
            expect(defaultLogger.config.logLevel).toBe('info');
            expect(defaultLogger.config.maxLogEntries).toBe(1000);
            expect(defaultLogger.config.enableMetrics).toBe(true);
        });

        it('should use provided configuration', () => {
            expect(logger.config.logLevel).toBe('debug');
            expect(logger.config.maxLogEntries).toBe(10);
        });
    });

    describe('operation tracking', () => {
        it('should track operation start', () => {
            const tracking = logger.logOperationStart('testOperation', { key: 'value' });

            expect(tracking.operation).toBe('testOperation');
            expect(tracking.operationId).toBeTruthy();
            expect(tracking.startTime).toBeTruthy();
            expect(tracking.context).toEqual({ key: 'value' });
            expect(mockBaseLogger.debug).toHaveBeenCalled();
        });

        it('should track operation success', () => {
            const tracking = logger.logOperationStart('testOperation');
            
            // Simulate some time passing
            tracking.startTime = Date.now() - 100;
            
            logger.logOperationSuccess(tracking, { result: 'success' });

            expect(mockBaseLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('testOperation completed successfully')
            );

            const metrics = logger.getMetrics();
            expect(metrics.totalOperations).toBe(1);
            expect(metrics.successfulOperations).toBe(1);
        });

        it('should track operation failure', () => {
            const tracking = logger.logOperationStart('testOperation');
            const error = new Error('Test error');
            error.response = { status: 500, statusText: 'Internal Server Error' };
            
            tracking.startTime = Date.now() - 100;
            
            logger.logOperationFailure(tracking, error);

            expect(mockBaseLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('testOperation failed')
            );

            const metrics = logger.getMetrics();
            expect(metrics.totalOperations).toBe(1);
            expect(metrics.failedOperations).toBe(1);
        });
    });

    describe('authentication logging', () => {
        it('should log token requested event', () => {
            logger.logAuthEvent('token_requested');
            expect(mockBaseLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('SFMC authentication token requested')
            );
        });

        it('should log token received event', () => {
            logger.logAuthEvent('token_received', { expiresIn: 3600, tokenType: 'Bearer' });
            expect(mockBaseLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('SFMC authentication successful')
            );
        });

        it('should log authentication failure', () => {
            logger.logAuthEvent('auth_failed', { error: 'Invalid credentials', status: 401 });
            expect(mockBaseLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('SFMC authentication failed')
            );
        });
    });

    describe('validation logging', () => {
        it('should log successful validation', () => {
            const validationResult = {
                exists: true,
                hasRequiredFields: true,
                totalRows: 100,
                availableFields: ['SubscriberKey', 'ConvertedTime']
            };

            logger.logValidationEvent('test-de-key', validationResult);

            expect(mockBaseLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Data extension validation successful')
            );
        });

        it('should log validation failure for non-existent DE', () => {
            const validationResult = {
                exists: false,
                hasRequiredFields: false,
                error: 'Data extension not found'
            };

            logger.logValidationEvent('test-de-key', validationResult);

            expect(mockBaseLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Data extension does not exist')
            );
        });

        it('should log validation warning for missing fields', () => {
            const validationResult = {
                exists: true,
                hasRequiredFields: false,
                missingFields: ['ConvertedTime']
            };

            logger.logValidationEvent('test-de-key', validationResult);

            expect(mockBaseLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Data extension missing required fields')
            );
        });
    });

    describe('batch logging', () => {
        it('should log batch creation', () => {
            logger.logBatchEvent('batch_created', { batchKey: 'test-batch', contactCount: 5 });
            expect(mockBaseLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Batch created')
            );
        });

        it('should log batch processing success', () => {
            logger.logBatchEvent('batch_processed', {
                batchKey: 'test-batch',
                contactCount: 5,
                success: true,
                duration: 1000
            });
            expect(mockBaseLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Batch processed')
            );
        });

        it('should log batch processing failure', () => {
            logger.logBatchEvent('batch_failed', {
                batchKey: 'test-batch',
                contactCount: 5,
                error: 'Network error'
            });
            expect(mockBaseLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Batch processing failed')
            );
        });
    });

    describe('contact logging', () => {
        it('should log ConvertedTime calculation', () => {
            logger.logContactEvent('sub123', 'converted_time_calculated', {
                convertedTime: '2024-01-15T12:00:00Z',
                originalTime: '2024-01-15T10:00:00Z'
            });
            expect(mockBaseLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('ConvertedTime calculated for contact')
            );
        });

        it('should log ConvertedTime update success', () => {
            logger.logContactEvent('sub123', 'converted_time_updated', {
                convertedTime: '2024-01-15T12:00:00Z',
                attempts: 1
            });
            expect(mockBaseLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('ConvertedTime updated for contact')
            );
        });

        it('should log ConvertedTime update failure', () => {
            logger.logContactEvent('sub123', 'update_failed', {
                error: 'Network error',
                attempts: 3
            });
            expect(mockBaseLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('ConvertedTime update failed for contact')
            );
        });
    });

    describe('metrics', () => {
        it('should calculate metrics correctly', () => {
            // Simulate some operations
            const tracking1 = logger.logOperationStart('op1');
            tracking1.startTime = Date.now() - 100;
            logger.logOperationSuccess(tracking1, {});

            const tracking2 = logger.logOperationStart('op2');
            tracking2.startTime = Date.now() - 200;
            logger.logOperationFailure(tracking2, new Error('Test error'));

            const metrics = logger.getMetrics();

            expect(metrics.totalOperations).toBe(2);
            expect(metrics.successfulOperations).toBe(1);
            expect(metrics.failedOperations).toBe(1);
            expect(metrics.successRate).toBe('50.00%');
            expect(metrics.operations.op1).toBeDefined();
            expect(metrics.operations.op2).toBeDefined();
        });

        it('should track operation-specific metrics', () => {
            const tracking = logger.logOperationStart('testOp');
            tracking.startTime = Date.now() - 150;
            logger.logOperationSuccess(tracking, {});

            const metrics = logger.getMetrics();
            const opMetrics = metrics.operations.testOp;

            expect(opMetrics.total).toBe(1);
            expect(opMetrics.successful).toBe(1);
            expect(opMetrics.failed).toBe(0);
            expect(opMetrics.averageDuration).toBeGreaterThan(0);
        });

        it('should clear metrics', () => {
            const tracking = logger.logOperationStart('testOp');
            logger.logOperationSuccess(tracking, {});

            logger.clearMetrics();

            const metrics = logger.getMetrics();
            expect(metrics.totalOperations).toBe(0);
            expect(Object.keys(metrics.operations)).toHaveLength(0);
        });
    });

    describe('log management', () => {
        it('should maintain recent logs', () => {
            logger.logOperationStart('op1');
            logger.logOperationStart('op2');

            const recentLogs = logger.getRecentLogs();
            expect(recentLogs).toHaveLength(2);
            expect(recentLogs[0].operation).toBe('op1');
            expect(recentLogs[1].operation).toBe('op2');
        });

        it('should limit log entries', () => {
            // Add more logs than the limit (10)
            for (let i = 0; i < 15; i++) {
                logger.logOperationStart(`op${i}`);
            }

            const recentLogs = logger.getRecentLogs();
            expect(recentLogs).toHaveLength(10);
            expect(recentLogs[0].operation).toBe('op5'); // First 5 should be removed
        });

        it('should return limited recent logs', () => {
            for (let i = 0; i < 5; i++) {
                logger.logOperationStart(`op${i}`);
            }

            const recentLogs = logger.getRecentLogs(3);
            expect(recentLogs).toHaveLength(3);
            expect(recentLogs[0].operation).toBe('op2');
        });
    });

    describe('log levels', () => {
        it('should respect log level configuration', () => {
            const infoLogger = new DataExtensionOperationLogger({ logLevel: 'info' }, mockBaseLogger);

            infoLogger.debug('Debug message');
            infoLogger.info('Info message');
            infoLogger.warn('Warn message');
            infoLogger.error('Error message');

            expect(mockBaseLogger.debug).not.toHaveBeenCalled();
            expect(mockBaseLogger.info).toHaveBeenCalled();
            expect(mockBaseLogger.warn).toHaveBeenCalled();
            expect(mockBaseLogger.error).toHaveBeenCalled();
        });
    });

    describe('context sanitization', () => {
        it('should sanitize sensitive information', () => {
            const sensitiveContext = {
                username: 'user123',
                password: 'secret123',
                token: 'abc123',
                normalField: 'value'
            };

            // Test the sanitization method directly
            const sanitized = logger.sanitizeContext(sensitiveContext);

            expect(sanitized.username).toBe('user123');
            expect(sanitized.password).toBe('[REDACTED]');
            expect(sanitized.token).toBe('[REDACTED]');
            expect(sanitized.normalField).toBe('value');
        });

        it('should handle large results by truncating', () => {
            const tracking = logger.logOperationStart('testOp');
            const largeResult = { data: 'x'.repeat(2000) };

            logger.logOperationSuccess(tracking, largeResult);

            const recentLogs = logger.getRecentLogs();
            const successLog = recentLogs.find(log => log.phase === 'success');
            expect(successLog.result._truncated).toBe(true);
        });
    });

    describe('message formatting', () => {
        it('should format messages with timestamps when enabled', () => {
            const timestampLogger = new DataExtensionOperationLogger({
                includeTimestamps: true
            }, mockBaseLogger);

            timestampLogger.info('Test message', { key: 'value' });

            expect(mockBaseLogger.info).toHaveBeenCalledWith(
                expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] Test message/)
            );
        });

        it('should format messages without timestamps when disabled', () => {
            const noTimestampLogger = new DataExtensionOperationLogger({
                includeTimestamps: false
            }, mockBaseLogger);

            noTimestampLogger.info('Test message', { key: 'value' });

            expect(mockBaseLogger.info).toHaveBeenCalledWith(
                expect.stringMatching(/^Test message/)
            );
        });
    });
});