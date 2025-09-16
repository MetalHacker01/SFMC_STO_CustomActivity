/**
 * Activity Lifecycle Manager Tests
 * 
 * Tests for the Journey Builder lifecycle management functionality
 * including save, validate, and publish operations.
 */

// Mock axios before importing the lifecycle components
jest.mock('axios');

const { ActivityLifecycleManager, LifecycleErrorHandler } = require('../src/lifecycle');

describe('ActivityLifecycleManager', () => {
    let lifecycleManager;
    let mockLogger;
    let mockConfig;

    beforeEach(() => {
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        mockConfig = {
            sfmc: {
                clientId: 'test-client-id',
                clientSecret: 'test-client-secret',
                subdomain: 'test-subdomain'
            },
            holidayApiUrl: 'https://test-holiday-api.com',
            holidayApiEnabled: true,
            cacheTimeout: 3600
        };

        lifecycleManager = new ActivityLifecycleManager(mockConfig, mockLogger);
    });

    describe('handleSave', () => {
        it('should successfully save valid configuration', async () => {
            const payload = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456',
                inArguments: [{
                    activityConfig: {
                        skipWeekends: true,
                        skipHolidays: true,
                        timeWindows: [
                            { startHour: 9, endHour: 10, enabled: true },
                            { startHour: 14, endHour: 15, enabled: true }
                        ],
                        defaultTimezone: 'America/Chicago'
                    }
                }],
                outArguments: []
            };

            const result = await lifecycleManager.handleSave(payload);

            expect(result.success).toBe(true);
            expect(result.activityObjectID).toBe('test-activity-123');
            expect(result.version).toBeDefined();
            expect(result.timestamp).toBeDefined();
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Activity save operation started',
                expect.objectContaining({
                    activityObjectID: 'test-activity-123',
                    journeyId: 'test-journey-456',
                    operation: 'save'
                })
            );
        });

        it('should reject invalid configuration', async () => {
            const payload = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456',
                inArguments: [{
                    activityConfig: {
                        skipWeekends: true,
                        skipHolidays: true,
                        timeWindows: [], // Invalid - empty time windows
                        defaultTimezone: 'America/Chicago'
                    }
                }],
                outArguments: []
            };

            const result = await lifecycleManager.handleSave(payload);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid configuration');
            expect(result.details).toContain('At least one time window must be configured');
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Save operation failed - invalid configuration',
                expect.objectContaining({
                    activityObjectID: 'test-activity-123',
                    errors: expect.arrayContaining(['At least one time window must be configured'])
                })
            );
        });

        it('should handle save operation errors', async () => {
            const payload = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456',
                inArguments: null, // This will cause an error
                outArguments: []
            };

            const result = await lifecycleManager.handleSave(payload);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Failed to save activity configuration');
            expect(result.processingTime).toBeDefined();
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Save operation failed with exception',
                expect.objectContaining({
                    activityObjectID: 'test-activity-123',
                    operation: 'save'
                })
            );
        });
    });

    describe('handleValidate', () => {
        it('should successfully validate valid configuration', async () => {
            // Mock axios for holiday API check
            const axios = require('axios');
            jest.spyOn(axios, 'get').mockResolvedValue({ status: 200 });

            const payload = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456',
                inArguments: [{
                    activityConfig: {
                        skipWeekends: true,
                        skipHolidays: false,
                        timeWindows: [
                            { startHour: 9, endHour: 10, enabled: true },
                            { startHour: 14, endHour: 15, enabled: true }
                        ],
                        defaultTimezone: 'America/Chicago'
                    }
                }],
                outArguments: [{ convertedTime: '' }]
            };

            const result = await lifecycleManager.handleValidate(payload);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.processingTime).toBeDefined();
            expect(result.validationDetails).toBeDefined();
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Activity validation passed',
                expect.objectContaining({
                    activityObjectID: 'test-activity-123'
                })
            );
        });

        it('should detect configuration validation errors', async () => {
            const payload = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456',
                inArguments: [{
                    activityConfig: {
                        skipWeekends: 'invalid', // Should be boolean
                        skipHolidays: true,
                        timeWindows: [
                            { startHour: 25, endHour: 10, enabled: true } // Invalid hour
                        ]
                    }
                }],
                outArguments: []
            };

            const result = await lifecycleManager.handleValidate(payload);

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors).toContain('skipWeekends must be a boolean value');
            expect(result.errors).toContain('Time window 1 has invalid hours (25-10)');
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Activity validation failed',
                expect.objectContaining({
                    activityObjectID: 'test-activity-123',
                    errorsCount: expect.any(Number)
                })
            );
        });

        it('should use cached validation results', async () => {
            const payload = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456',
                inArguments: [{
                    activityConfig: {
                        skipWeekends: true,
                        skipHolidays: true,
                        timeWindows: [
                            { startHour: 9, endHour: 10, enabled: true }
                        ]
                    }
                }],
                outArguments: []
            };

            // First validation
            const result1 = await lifecycleManager.handleValidate(payload);
            expect(result1.fromCache).toBeUndefined();

            // Second validation with same config should use cache
            const result2 = await lifecycleManager.handleValidate(payload);
            expect(result2.fromCache).toBe(true);
        });
    });

    describe('handlePublish', () => {
        it('should successfully publish valid configuration', async () => {
            // Mock axios for holiday API check
            const axios = require('axios');
            jest.spyOn(axios, 'get').mockResolvedValue({ status: 200 });

            const payload = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456',
                inArguments: [{
                    activityConfig: {
                        skipWeekends: true,
                        skipHolidays: false, // Disabled to avoid API calls in test
                        timeWindows: [
                            { startHour: 9, endHour: 10, enabled: true },
                            { startHour: 14, endHour: 15, enabled: true }
                        ],
                        defaultTimezone: 'America/Chicago'
                    }
                }],
                outArguments: []
            };

            const result = await lifecycleManager.handlePublish(payload);

            expect(result.success).toBe(true);
            expect(result.activityObjectID).toBe('test-activity-123');
            expect(result.version).toBeDefined();
            expect(result.warnings).toBeDefined();
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Activity published successfully',
                expect.objectContaining({
                    activityObjectID: 'test-activity-123'
                })
            );
        });

        it('should reject publishing invalid configuration', async () => {
            const payload = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456',
                inArguments: [{
                    activityConfig: {
                        skipWeekends: true,
                        skipHolidays: true,
                        timeWindows: [], // Invalid
                        defaultTimezone: 'America/Chicago'
                    }
                }],
                outArguments: []
            };

            const result = await lifecycleManager.handlePublish(payload);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Cannot publish invalid configuration');
            expect(result.details).toContain('At least one time window must be configured');
        });

        it('should update activity state after successful publish', async () => {
            // Mock axios for holiday API check
            const axios = require('axios');
            jest.spyOn(axios, 'get').mockResolvedValue({ status: 200 });

            const payload = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456',
                inArguments: [{
                    activityConfig: {
                        skipWeekends: true,
                        skipHolidays: false,
                        timeWindows: [
                            { startHour: 9, endHour: 10, enabled: true }
                        ]
                    }
                }],
                outArguments: []
            };

            await lifecycleManager.handlePublish(payload);

            const state = lifecycleManager.getActivityState('test-activity-123');
            expect(state).toBeDefined();
            expect(state.status).toBe('published');
            expect(state.lastPublished).toBeDefined();
            expect(state.version).toBeDefined();
        });
    });

    describe('validateActivityConfiguration', () => {
        it('should validate time windows correctly', () => {
            const config = {
                skipWeekends: true,
                skipHolidays: true,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true },
                    { startHour: 14, endHour: 15, enabled: false },
                    { startHour: 16, endHour: 17, enabled: false }
                ]
            };

            const result = lifecycleManager.validateActivityConfiguration(config);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.warnings).toContain('Only one time window is enabled. Consider adding more for better optimization.');
        });

        it('should detect invalid time window hours', () => {
            const config = {
                timeWindows: [
                    { startHour: -1, endHour: 10, enabled: true }, // Invalid start hour
                    { startHour: 9, endHour: 25, enabled: true },  // Invalid end hour
                    { startHour: 15, endHour: 10, enabled: true }  // Start > end
                ]
            };

            const result = lifecycleManager.validateActivityConfiguration(config);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Time window 1 has invalid hours (-1-10)');
            expect(result.errors).toContain('Time window 2 has invalid hours (9-25)');
            expect(result.errors).toContain('Time window 3 has invalid hours (15-10)');
        });

        it('should require at least one enabled time window', () => {
            const config = {
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: false },
                    { startHour: 14, endHour: 15, enabled: false }
                ]
            };

            const result = lifecycleManager.validateActivityConfiguration(config);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('At least one time window must be enabled');
        });

        it('should validate boolean flags', () => {
            const config = {
                skipWeekends: 'true', // Should be boolean
                skipHolidays: 1,      // Should be boolean
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true }
                ]
            };

            const result = lifecycleManager.validateActivityConfiguration(config);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('skipWeekends must be a boolean value');
            expect(result.errors).toContain('skipHolidays must be a boolean value');
        });
    });

    describe('getActivityState', () => {
        it('should return null for non-existent activity', () => {
            const state = lifecycleManager.getActivityState('non-existent');
            expect(state).toBeNull();
        });

        it('should return activity state after save', async () => {
            const payload = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456',
                inArguments: [{
                    activityConfig: {
                        skipWeekends: true,
                        timeWindows: [
                            { startHour: 9, endHour: 10, enabled: true }
                        ]
                    }
                }],
                outArguments: []
            };

            await lifecycleManager.handleSave(payload);

            const state = lifecycleManager.getActivityState('test-activity-123');
            expect(state).toBeDefined();
            expect(state.activityObjectID).toBe('test-activity-123');
            expect(state.status).toBe('saved');
            expect(state.config).toBeDefined();
        });
    });

    describe('getStats', () => {
        it('should return lifecycle statistics', () => {
            const stats = lifecycleManager.getStats();

            expect(stats).toBeDefined();
            expect(stats.totalActivities).toBe(0);
            expect(stats.validationCacheSize).toBe(0);
            expect(stats.activities).toEqual([]);
        });

        it('should track activities in statistics', async () => {
            const payload = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456',
                inArguments: [{
                    activityConfig: {
                        skipWeekends: true,
                        timeWindows: [
                            { startHour: 9, endHour: 10, enabled: true }
                        ]
                    }
                }],
                outArguments: []
            };

            await lifecycleManager.handleSave(payload);

            const stats = lifecycleManager.getStats();
            expect(stats.totalActivities).toBe(1);
            expect(stats.activities).toHaveLength(1);
            expect(stats.activities[0].activityObjectID).toBe('test-activity-123');
            expect(stats.activities[0].status).toBe('saved');
        });
    });

    describe('clearOldCache', () => {
        it('should clear validation cache when size limit exceeded', () => {
            // Simulate large cache
            for (let i = 0; i < 1001; i++) {
                lifecycleManager.validationCache.set(`key-${i}`, { valid: true });
            }

            expect(lifecycleManager.validationCache.size).toBe(1001);

            lifecycleManager.clearOldCache();

            expect(lifecycleManager.validationCache.size).toBe(0);
            expect(mockLogger.info).toHaveBeenCalledWith('Validation cache cleared due to size limit');
        });
    });
});

describe('LifecycleErrorHandler', () => {
    let errorHandler;
    let mockLogger;

    beforeEach(() => {
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        errorHandler = new LifecycleErrorHandler(mockLogger);
    });

    describe('handleSaveError', () => {
        it('should handle network errors', () => {
            const error = new Error('Network error');
            error.code = 'ECONNREFUSED';

            const context = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456'
            };

            const result = errorHandler.handleSaveError(error, context);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Failed to save activity configuration - Network connectivity issue');
            expect(result.recoverable).toBe(true);
            expect(result.retryAfter).toBe(5000);
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Save operation error',
                expect.objectContaining({
                    operation: 'save',
                    activityObjectID: 'test-activity-123',
                    type: 'NETWORK_ERROR'
                })
            );
        });

        it('should handle validation errors', () => {
            const error = new Error('Validation failed');
            error.name = 'ValidationError';

            const context = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456'
            };

            const result = errorHandler.handleSaveError(error, context);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Failed to save activity configuration - Invalid configuration');
            expect(result.recoverable).toBe(false);
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Save operation error',
                expect.objectContaining({
                    type: 'VALIDATION_ERROR'
                })
            );
        });
    });

    describe('handleValidateError', () => {
        it('should return validation-specific error response', () => {
            const error = new Error('Timeout occurred');
            error.code = 'ETIMEDOUT';

            const context = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456'
            };

            const result = errorHandler.handleValidateError(error, context);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Configuration validation failed - Request timed out');
            expect(result.recoverable).toBe(true);
            expect(result.errorType).toBe('TIMEOUT_ERROR');
        });
    });

    describe('handlePublishError', () => {
        it('should identify critical publish errors', () => {
            const error = new Error('Authentication failed');
            error.message = 'JWT token invalid';

            const context = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456'
            };

            const result = errorHandler.handlePublishError(error, context);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Failed to publish activity - Authentication failed');
            expect(result.recoverable).toBe(false);
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Critical publish error detected',
                expect.objectContaining({
                    critical: true,
                    blockingPublish: true
                })
            );
        });
    });

    describe('classifyError', () => {
        it('should classify network errors correctly', () => {
            const error = new Error('Connection refused');
            error.code = 'ECONNREFUSED';

            const type = errorHandler.classifyError(error);
            expect(type).toBe('NETWORK_ERROR');
        });

        it('should classify timeout errors correctly', () => {
            const error = new Error('Request timeout');
            error.code = 'ETIMEDOUT';

            const type = errorHandler.classifyError(error);
            expect(type).toBe('TIMEOUT_ERROR');
        });

        it('should classify HTTP client errors correctly', () => {
            const error = new Error('Bad request');
            error.response = { status: 400 };

            const type = errorHandler.classifyError(error);
            expect(type).toBe('CLIENT_ERROR');
        });

        it('should classify HTTP server errors correctly', () => {
            const error = new Error('Internal server error');
            error.response = { status: 500 };

            const type = errorHandler.classifyError(error);
            expect(type).toBe('SERVER_ERROR');
        });
    });

    describe('getErrorStats', () => {
        it('should return error statistics', () => {
            const stats = errorHandler.getErrorStats();

            expect(stats).toBeDefined();
            expect(stats.save).toBeDefined();
            expect(stats.validate).toBeDefined();
            expect(stats.publish).toBeDefined();
            expect(stats.timestamp).toBeDefined();
        });

        it('should track error counts', () => {
            const error = new Error('Test error');
            const context = { activityObjectID: 'test', journeyId: 'test' };

            errorHandler.handleSaveError(error, context);
            errorHandler.handleValidateError(error, context);

            const stats = errorHandler.getErrorStats();
            expect(stats.save.total).toBe(1);
            expect(stats.validate.total).toBe(1);
            expect(stats.publish.total).toBe(0);
        });
    });

    describe('resetErrorStats', () => {
        it('should reset all error statistics', () => {
            const error = new Error('Test error');
            const context = { activityObjectID: 'test', journeyId: 'test' };

            errorHandler.handleSaveError(error, context);
            errorHandler.resetErrorStats();

            const stats = errorHandler.getErrorStats();
            expect(stats.save.total).toBe(0);
            expect(stats.validate.total).toBe(0);
            expect(stats.publish.total).toBe(0);
        });
    });
});