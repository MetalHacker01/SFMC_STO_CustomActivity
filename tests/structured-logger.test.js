/**
 * Tests for Structured Logger System
 */

const StructuredLogger = require('../src/logging/structured-logger');
const loggerFactory = require('../src/logging/logger-factory');
const fs = require('fs');
const path = require('path');

describe('StructuredLogger', () => {
    let logger;
    let mockConsole;

    beforeEach(() => {
        // Mock console methods
        mockConsole = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            log: jest.fn()
        };

        // Create logger with test configuration
        logger = new StructuredLogger({
            logLevel: 'debug',
            enableConsoleOutput: true,
            enableFileOutput: false,
            enableMetrics: true,
            enableAggregation: true,
            serviceName: 'test-service',
            environment: 'test'
        });

        // Replace console methods
        global.console = mockConsole;
    });

    afterEach(() => {
        logger.clear();
        jest.restoreAllMocks();
    });

    describe('Basic Logging', () => {
        test('should log debug messages', () => {
            logger.debug('Test debug message', { key: 'value' }, 'test-category');

            expect(mockConsole.debug).toHaveBeenCalledWith(
                expect.stringContaining('DEBUG')
            );
            expect(mockConsole.debug).toHaveBeenCalledWith(
                expect.stringContaining('Test debug message')
            );
        });

        test('should log info messages', () => {
            logger.info('Test info message', { key: 'value' }, 'test-category');

            expect(mockConsole.info).toHaveBeenCalledWith(
                expect.stringContaining('INFO')
            );
            expect(mockConsole.info).toHaveBeenCalledWith(
                expect.stringContaining('Test info message')
            );
        });

        test('should log warning messages', () => {
            logger.warn('Test warning message', { key: 'value' }, 'test-category');

            expect(mockConsole.warn).toHaveBeenCalledWith(
                expect.stringContaining('WARN')
            );
            expect(mockConsole.warn).toHaveBeenCalledWith(
                expect.stringContaining('Test warning message')
            );
        });

        test('should log error messages', () => {
            logger.error('Test error message', { key: 'value' }, 'test-category');

            expect(mockConsole.error).toHaveBeenCalledWith(
                expect.stringContaining('ERROR')
            );
            expect(mockConsole.error).toHaveBeenCalledWith(
                expect.stringContaining('Test error message')
            );
        });

        test('should handle Error objects in context', () => {
            const error = new Error('Test error');
            logger.error('Error occurred', error, 'test-category');

            expect(mockConsole.error).toHaveBeenCalledWith(
                expect.stringContaining('Error occurred')
            );
        });
    });

    describe('Log Levels', () => {
        test('should respect log level configuration', () => {
            const infoLogger = new StructuredLogger({
                logLevel: 'info',
                enableConsoleOutput: true,
                enableFileOutput: false
            });

            global.console = mockConsole;

            infoLogger.debug('Debug message');
            infoLogger.info('Info message');
            infoLogger.warn('Warning message');
            infoLogger.error('Error message');

            expect(mockConsole.debug).not.toHaveBeenCalled();
            expect(mockConsole.info).toHaveBeenCalled();
            expect(mockConsole.warn).toHaveBeenCalled();
            expect(mockConsole.error).toHaveBeenCalled();
        });

        test('should filter logs by level correctly', () => {
            const errorLogger = new StructuredLogger({
                logLevel: 'error',
                enableConsoleOutput: true,
                enableFileOutput: false
            });

            global.console = mockConsole;

            errorLogger.debug('Debug message');
            errorLogger.info('Info message');
            errorLogger.warn('Warning message');
            errorLogger.error('Error message');

            expect(mockConsole.debug).not.toHaveBeenCalled();
            expect(mockConsole.info).not.toHaveBeenCalled();
            expect(mockConsole.warn).not.toHaveBeenCalled();
            expect(mockConsole.error).toHaveBeenCalled();
        });
    });

    describe('Context Sanitization', () => {
        test('should sanitize sensitive information', () => {
            logger.info('Test message', {
                username: 'testuser',
                password: 'secret123',
                token: 'abc123',
                normalField: 'normalValue'
            });

            const recentLogs = logger.getRecentLogs(1);
            expect(recentLogs[0].context.password).toBe('[REDACTED]');
            expect(recentLogs[0].context.token).toBe('[REDACTED]');
            expect(recentLogs[0].context.normalField).toBe('normalValue');
        });

        test('should truncate long strings', () => {
            const longString = 'a'.repeat(1500);
            logger.info('Test message', { longField: longString });

            const recentLogs = logger.getRecentLogs(1);
            expect(recentLogs[0].context.longField).toContain('[TRUNCATED]');
            expect(recentLogs[0].context.longField.length).toBeLessThan(longString.length);
        });
    });

    describe('Metrics Tracking', () => {
        test('should track basic metrics', () => {
            logger.info('Message 1');
            logger.warn('Message 2');
            logger.error('Message 3');

            const metrics = logger.getMetrics();
            expect(metrics.totalLogs).toBe(3);
            expect(metrics.logsByLevel.info).toBe(1);
            expect(metrics.logsByLevel.warn).toBe(1);
            expect(metrics.logsByLevel.error).toBe(1);
        });

        test('should track logs by category', () => {
            logger.info('Message 1', {}, 'category1');
            logger.info('Message 2', {}, 'category1');
            logger.info('Message 3', {}, 'category2');

            const metrics = logger.getMetrics();
            expect(metrics.logsByCategory.category1).toBe(2);
            expect(metrics.logsByCategory.category2).toBe(1);
        });

        test('should track error types', () => {
            logger.error('Error 1', {}, 'api');
            logger.error('Error 2', {}, 'api');
            logger.error('Error 3', {}, 'database');

            const metrics = logger.getMetrics();
            expect(metrics.errorsByType.api).toBe(2);
            expect(metrics.errorsByType.database).toBe(1);
        });
    });

    describe('Performance Logging', () => {
        test('should log performance metrics', () => {
            logger.logPerformance('test-operation', 100, { additional: 'data' });

            expect(mockConsole.debug).toHaveBeenCalledWith(
                expect.stringContaining('Performance: test-operation')
            );
        });

        test('should warn about slow operations', () => {
            logger.logPerformance('slow-operation', 6000);

            expect(mockConsole.warn).toHaveBeenCalledWith(
                expect.stringContaining('Slow operation detected')
            );
        });

        test('should track performance metrics', () => {
            logger.logPerformance('operation1', 100);
            logger.logPerformance('operation1', 200);
            logger.logPerformance('operation2', 150);

            const metrics = logger.getMetrics();
            expect(metrics.performanceMetrics.operations.operation1.count).toBe(2);
            expect(metrics.performanceMetrics.operations.operation1.averageTime).toBe(150);
            expect(metrics.performanceMetrics.operations.operation2.count).toBe(1);
        });
    });

    describe('Event Logging', () => {
        test('should log structured events', () => {
            logger.logEvent('user', 'login', { userId: '123' }, 'info');

            expect(mockConsole.info).toHaveBeenCalledWith(
                expect.stringContaining('Event: user.login')
            );

            const recentLogs = logger.getRecentLogs(1);
            expect(recentLogs[0].context.eventType).toBe('user');
            expect(recentLogs[0].context.eventName).toBe('login');
        });
    });

    describe('API Call Logging', () => {
        test('should log successful API calls', () => {
            logger.logApiCall('GET', 'https://api.example.com/users', 200, 150);

            expect(mockConsole.info).toHaveBeenCalledWith(
                expect.stringContaining('API GET')
            );

            const recentLogs = logger.getRecentLogs(1);
            expect(recentLogs[0].context.method).toBe('GET');
            expect(recentLogs[0].context.statusCode).toBe(200);
            expect(recentLogs[0].context.success).toBe(true);
        });

        test('should log failed API calls as errors', () => {
            logger.logApiCall('POST', 'https://api.example.com/users', 500, 300);

            expect(mockConsole.error).toHaveBeenCalledWith(
                expect.stringContaining('API POST')
            );

            const recentLogs = logger.getRecentLogs(1);
            expect(recentLogs[0].context.success).toBe(false);
        });

        test('should sanitize URLs with sensitive parameters', () => {
            logger.logApiCall('GET', 'https://api.example.com/users?token=secret123', 200, 100);

            const recentLogs = logger.getRecentLogs(1);
            expect(recentLogs[0].context.url).toContain('[REDACTED]');
            expect(recentLogs[0].context.url).not.toContain('secret123');
        });
    });

    describe('Child Loggers', () => {
        test('should create child logger with additional context', () => {
            const childLogger = logger.child({ requestId: '123' }, 'child-category');
            childLogger.info('Child message', { additional: 'data' });

            const recentLogs = logger.getRecentLogs(1);
            expect(recentLogs[0].context.requestId).toBe('123');
            expect(recentLogs[0].context.additional).toBe('data');
            expect(recentLogs[0].category).toBe('child-category');
        });
    });

    describe('Log Buffer and Aggregation', () => {
        test('should maintain log buffer', () => {
            logger.info('Message 1');
            logger.info('Message 2');
            logger.info('Message 3');

            const recentLogs = logger.getRecentLogs(2);
            expect(recentLogs).toHaveLength(2);
            expect(recentLogs[0].message).toBe('Message 3');
            expect(recentLogs[1].message).toBe('Message 2');
        });

        test('should filter logs by level', () => {
            logger.info('Info message');
            logger.warn('Warning message');
            logger.error('Error message');

            const errorLogs = logger.getRecentLogs(10, 'error');
            expect(errorLogs).toHaveLength(1);
            expect(errorLogs[0].message).toBe('Error message');
        });

        test('should filter logs by category', () => {
            logger.info('Message 1', {}, 'category1');
            logger.info('Message 2', {}, 'category2');
            logger.info('Message 3', {}, 'category1');

            const category1Logs = logger.getLogsByCategory('category1');
            expect(category1Logs).toHaveLength(2);
        });
    });

    describe('Error Summary', () => {
        test('should provide error summary', () => {
            logger.error('Error 1', {}, 'api');
            logger.error('Error 2', {}, 'database');
            logger.error('Error 3', {}, 'api');
            logger.info('Info message');

            const errorSummary = logger.getErrorSummary();
            expect(errorSummary.totalErrors).toBe(3);
            expect(errorSummary.errorsByCategory.api).toBe(2);
            expect(errorSummary.errorsByCategory.database).toBe(1);
            expect(errorSummary.recentErrors).toHaveLength(3);
        });
    });

    describe('Clear and Reset', () => {
        test('should clear logs and reset metrics', () => {
            logger.info('Message 1');
            logger.error('Error 1');

            let metrics = logger.getMetrics();
            expect(metrics.totalLogs).toBe(2);

            logger.clear();

            metrics = logger.getMetrics();
            expect(metrics.totalLogs).toBe(0);
            expect(logger.getRecentLogs()).toHaveLength(0);
        });
    });
});

describe('LoggerFactory', () => {
    afterEach(() => {
        loggerFactory.clearAllLoggers();
    });

    describe('Logger Creation', () => {
        test('should create and cache logger instances', () => {
            const logger1 = loggerFactory.getLogger('test');
            const logger2 = loggerFactory.getLogger('test');

            expect(logger1).toBe(logger2); // Should return same instance
        });

        test('should create different loggers for different names', () => {
            const logger1 = loggerFactory.getLogger('test1');
            const logger2 = loggerFactory.getLogger('test2');

            expect(logger1).not.toBe(logger2);
        });

        test('should create component-specific loggers', () => {
            const executionLogger = loggerFactory.createExecutionLogger();
            const dataExtensionLogger = loggerFactory.createDataExtensionLogger();

            expect(executionLogger).toBeInstanceOf(StructuredLogger);
            expect(dataExtensionLogger).toBeInstanceOf(StructuredLogger);
            expect(executionLogger).not.toBe(dataExtensionLogger);
        });
    });

    describe('Aggregated Metrics', () => {
        test('should aggregate metrics from all loggers', () => {
            const logger1 = loggerFactory.getLogger('test1');
            const logger2 = loggerFactory.getLogger('test2');

            // Mock console to prevent output during tests
            global.console = {
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                log: jest.fn()
            };

            logger1.info('Message from logger1');
            logger1.error('Error from logger1');
            logger2.warn('Warning from logger2');

            const aggregatedMetrics = loggerFactory.getAggregatedMetrics();
            expect(aggregatedMetrics.totalLogs).toBe(3);
            expect(aggregatedMetrics.logsByLevel.info).toBe(1);
            expect(aggregatedMetrics.logsByLevel.error).toBe(1);
            expect(aggregatedMetrics.logsByLevel.warn).toBe(1);
        });
    });

    describe('Recent Logs from All', () => {
        test('should get recent logs from all loggers', () => {
            const logger1 = loggerFactory.getLogger('test1');
            const logger2 = loggerFactory.getLogger('test2');

            // Mock console
            global.console = {
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                log: jest.fn()
            };

            logger1.info('Message from logger1');
            logger2.info('Message from logger2');

            const recentLogs = loggerFactory.getRecentLogsFromAll(10);
            expect(recentLogs).toHaveLength(2);
            expect(recentLogs.some(log => log.loggerName.includes('test1'))).toBe(true);
            expect(recentLogs.some(log => log.loggerName.includes('test2'))).toBe(true);
        });
    });

    describe('Cleanup Operations', () => {
        test('should clear all loggers', () => {
            const logger1 = loggerFactory.getLogger('test1');
            const logger2 = loggerFactory.getLogger('test2');

            // Mock console
            global.console = {
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                log: jest.fn()
            };

            logger1.info('Message 1');
            logger2.info('Message 2');

            loggerFactory.clearAllLoggers();

            expect(logger1.getMetrics().totalLogs).toBe(0);
            expect(logger2.getMetrics().totalLogs).toBe(0);
        });
    });
});