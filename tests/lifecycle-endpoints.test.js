/**
 * Lifecycle Endpoints Integration Tests
 * 
 * Tests for the enhanced Journey Builder lifecycle endpoints
 * including save, validate, and publish operations with proper error handling.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock the lifecycle components before requiring the app
jest.mock('../src/lifecycle', () => {
    const mockLifecycleManager = {
        handleSave: jest.fn(),
        handleValidate: jest.fn(),
        handlePublish: jest.fn(),
        getStats: jest.fn(),
        getActivityState: jest.fn(),
        clearOldCache: jest.fn()
    };

    const mockErrorHandler = {
        handleSaveError: jest.fn(),
        handleValidateError: jest.fn(),
        handlePublishError: jest.fn(),
        getErrorStats: jest.fn(),
        resetErrorStats: jest.fn()
    };

    return {
        ActivityLifecycleManager: jest.fn(() => mockLifecycleManager),
        LifecycleErrorHandler: jest.fn(() => mockErrorHandler)
    };
});

const app = require('../server');

describe('Lifecycle Endpoints', () => {
    let validJWT;
    let mockLifecycleManager;
    let mockErrorHandler;

    beforeAll(() => {
        // Create a valid JWT for testing
        validJWT = jwt.sign(
            { 
                iss: 'test-issuer',
                aud: 'test-audience',
                exp: Math.floor(Date.now() / 1000) + 3600 
            },
            process.env.JWT_SECRET || 'test-secret'
        );
    });

    beforeEach(() => {
        // Get the mocked instances
        const { ActivityLifecycleManager, LifecycleErrorHandler } = require('../src/lifecycle');
        mockLifecycleManager = new ActivityLifecycleManager();
        mockErrorHandler = new LifecycleErrorHandler();

        // Reset all mocks
        jest.clearAllMocks();
    });

    describe('POST /save', () => {
        it('should successfully save valid activity configuration', async () => {
            const savePayload = {
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

            const expectedResponse = {
                success: true,
                message: 'Activity configuration saved successfully',
                activityObjectID: 'test-activity-123',
                version: 'v1234567890-abc123def',
                warnings: [],
                processingTime: 150,
                timestamp: '2024-01-15T10:30:00.000Z'
            };

            mockLifecycleManager.handleSave.mockResolvedValue(expectedResponse);

            const response = await request(app)
                .post('/save')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(savePayload)
                .expect(200);

            expect(response.body).toEqual(expectedResponse);
            expect(mockLifecycleManager.handleSave).toHaveBeenCalledWith(savePayload);
        });

        it('should return 400 for invalid configuration', async () => {
            const savePayload = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456',
                inArguments: [{
                    activityConfig: {
                        skipWeekends: true,
                        skipHolidays: true,
                        timeWindows: [], // Invalid - empty
                        defaultTimezone: 'America/Chicago'
                    }
                }],
                outArguments: []
            };

            const expectedResponse = {
                success: false,
                error: 'Invalid configuration',
                details: ['At least one time window must be configured'],
                warnings: []
            };

            mockLifecycleManager.handleSave.mockResolvedValue(expectedResponse);

            const response = await request(app)
                .post('/save')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(savePayload)
                .expect(400);

            expect(response.body).toEqual(expectedResponse);
        });

        it('should handle save operation exceptions', async () => {
            const savePayload = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456',
                inArguments: [{}],
                outArguments: []
            };

            const saveError = new Error('Database connection failed');
            const expectedErrorResponse = {
                success: false,
                error: 'Failed to save activity configuration - Server error',
                timestamp: '2024-01-15T10:30:00.000Z',
                errorType: 'SERVER_ERROR',
                recoverable: true
            };

            mockLifecycleManager.handleSave.mockRejectedValue(saveError);
            mockErrorHandler.handleSaveError.mockReturnValue(expectedErrorResponse);

            const response = await request(app)
                .post('/save')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(savePayload)
                .expect(500);

            expect(response.body).toEqual(expectedErrorResponse);
            expect(mockErrorHandler.handleSaveError).toHaveBeenCalledWith(
                saveError,
                {
                    activityObjectID: 'test-activity-123',
                    journeyId: 'test-journey-456'
                }
            );
        });

        it('should require valid JWT token', async () => {
            const response = await request(app)
                .post('/save')
                .send({})
                .expect(401);

            expect(response.body.error).toBe('No JWT token provided');
        });
    });

    describe('POST /validate', () => {
        it('should successfully validate valid configuration', async () => {
            const validatePayload = {
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

            const expectedResponse = {
                valid: true,
                errors: [],
                warnings: ['No day restrictions are enabled. Emails may be sent on weekends and holidays.'],
                processingTime: 120,
                timestamp: '2024-01-15T10:30:00.000Z',
                validationDetails: {
                    configuration: { valid: true, errors: [], warnings: [] },
                    context: { errors: [], warnings: [] },
                    dependencies: { errors: [], warnings: [] }
                }
            };

            mockLifecycleManager.handleValidate.mockResolvedValue(expectedResponse);

            const response = await request(app)
                .post('/validate')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(validatePayload)
                .expect(200);

            expect(response.body).toEqual(expectedResponse);
            expect(mockLifecycleManager.handleValidate).toHaveBeenCalledWith(validatePayload);
        });

        it('should return 400 for invalid configuration', async () => {
            const validatePayload = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456',
                inArguments: [{
                    activityConfig: {
                        skipWeekends: 'invalid', // Should be boolean
                        skipHolidays: true,
                        timeWindows: [
                            { startHour: 25, endHour: 10, enabled: true } // Invalid hours
                        ]
                    }
                }],
                outArguments: []
            };

            const expectedResponse = {
                valid: false,
                errors: [
                    'skipWeekends must be a boolean value',
                    'Time window 1 has invalid hours (25-10)'
                ],
                warnings: [],
                processingTime: 95,
                timestamp: '2024-01-15T10:30:00.000Z'
            };

            mockLifecycleManager.handleValidate.mockResolvedValue(expectedResponse);

            const response = await request(app)
                .post('/validate')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(validatePayload)
                .expect(400);

            expect(response.body).toEqual(expectedResponse);
        });

        it('should handle validation exceptions', async () => {
            const validatePayload = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456',
                inArguments: [{}],
                outArguments: []
            };

            const validationError = new Error('Validation service unavailable');
            const expectedErrorResponse = {
                valid: false,
                error: 'Configuration validation failed - Server error',
                timestamp: '2024-01-15T10:30:00.000Z',
                errorType: 'SERVER_ERROR',
                recoverable: true
            };

            mockLifecycleManager.handleValidate.mockRejectedValue(validationError);
            mockErrorHandler.handleValidateError.mockReturnValue(expectedErrorResponse);

            const response = await request(app)
                .post('/validate')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(validatePayload)
                .expect(500);

            expect(response.body).toEqual(expectedErrorResponse);
            expect(mockErrorHandler.handleValidateError).toHaveBeenCalledWith(
                validationError,
                {
                    activityObjectID: 'test-activity-123',
                    journeyId: 'test-journey-456'
                }
            );
        });
    });

    describe('POST /publish', () => {
        it('should successfully publish valid configuration', async () => {
            const publishPayload = {
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
                outArguments: []
            };

            const expectedResponse = {
                success: true,
                message: 'Activity published successfully',
                activityObjectID: 'test-activity-123',
                version: 'v1234567890-abc123def',
                warnings: ['Timezone engine supports only 15 countries - consider expanding coverage'],
                processingTime: 250,
                timestamp: '2024-01-15T10:30:00.000Z'
            };

            mockLifecycleManager.handlePublish.mockResolvedValue(expectedResponse);

            const response = await request(app)
                .post('/publish')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(publishPayload)
                .expect(200);

            expect(response.body).toEqual(expectedResponse);
            expect(mockLifecycleManager.handlePublish).toHaveBeenCalledWith(publishPayload);
        });

        it('should return 400 for invalid configuration', async () => {
            const publishPayload = {
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

            const expectedResponse = {
                success: false,
                error: 'Cannot publish invalid configuration',
                details: ['At least one time window must be configured'],
                warnings: []
            };

            mockLifecycleManager.handlePublish.mockResolvedValue(expectedResponse);

            const response = await request(app)
                .post('/publish')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(publishPayload)
                .expect(400);

            expect(response.body).toEqual(expectedResponse);
        });

        it('should return 400 when activity not ready for publishing', async () => {
            const publishPayload = {
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

            const expectedResponse = {
                success: false,
                error: 'Activity not ready for publishing',
                details: ['SFMC API credentials are not properly configured'],
                warnings: []
            };

            mockLifecycleManager.handlePublish.mockResolvedValue(expectedResponse);

            const response = await request(app)
                .post('/publish')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(publishPayload)
                .expect(400);

            expect(response.body).toEqual(expectedResponse);
        });

        it('should handle publish operation exceptions', async () => {
            const publishPayload = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456',
                inArguments: [{}],
                outArguments: []
            };

            const publishError = new Error('External service unavailable');
            const expectedErrorResponse = {
                success: false,
                error: 'Failed to publish activity - Server error',
                timestamp: '2024-01-15T10:30:00.000Z',
                errorType: 'SERVER_ERROR',
                recoverable: true
            };

            mockLifecycleManager.handlePublish.mockRejectedValue(publishError);
            mockErrorHandler.handlePublishError.mockReturnValue(expectedErrorResponse);

            const response = await request(app)
                .post('/publish')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(publishPayload)
                .expect(500);

            expect(response.body).toEqual(expectedErrorResponse);
            expect(mockErrorHandler.handlePublishError).toHaveBeenCalledWith(
                publishError,
                {
                    activityObjectID: 'test-activity-123',
                    journeyId: 'test-journey-456'
                }
            );
        });
    });

    describe('GET /stats', () => {
        it('should return comprehensive statistics', async () => {
            const expectedStats = {
                processor: {
                    totalProcessed: 150,
                    successful: 145,
                    failed: 5
                },
                lifecycle: {
                    totalActivities: 3,
                    validationCacheSize: 12,
                    activities: [
                        {
                            activityObjectID: 'activity-1',
                            status: 'published',
                            lastSaved: '2024-01-15T09:00:00.000Z',
                            lastPublished: '2024-01-15T09:05:00.000Z',
                            version: 'v1234567890-abc123def'
                        }
                    ]
                },
                errors: {
                    save: { total: 2, byType: { 'VALIDATION_ERROR': 1, 'NETWORK_ERROR': 1 } },
                    validate: { total: 1, byType: { 'TIMEOUT_ERROR': 1 } },
                    publish: { total: 0, byType: {} }
                }
            };

            // Mock the processor stats
            const mockProcessor = {
                getStats: jest.fn().mockReturnValue(expectedStats.processor)
            };
            jest.doMock('../src/execution/contact-processor', () => jest.fn(() => mockProcessor));

            mockLifecycleManager.getStats.mockReturnValue(expectedStats.lifecycle);
            mockErrorHandler.getErrorStats.mockReturnValue(expectedStats.errors);

            const response = await request(app)
                .get('/stats')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.stats).toEqual(expectedStats);
            expect(response.body.timestamp).toBeDefined();
        });
    });

    describe('GET /activity/:activityObjectID/state', () => {
        it('should return activity state when found', async () => {
            const activityObjectID = 'test-activity-123';
            const expectedState = {
                activityObjectID,
                journeyId: 'test-journey-456',
                config: {
                    skipWeekends: true,
                    skipHolidays: true,
                    timeWindows: [
                        { startHour: 9, endHour: 10, enabled: true }
                    ]
                },
                status: 'published',
                lastSaved: '2024-01-15T09:00:00.000Z',
                lastPublished: '2024-01-15T09:05:00.000Z',
                version: 'v1234567890-abc123def'
            };

            mockLifecycleManager.getActivityState.mockReturnValue(expectedState);

            const response = await request(app)
                .get(`/activity/${activityObjectID}/state`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.activityObjectID).toBe(activityObjectID);
            expect(response.body.state).toEqual(expectedState);
            expect(response.body.timestamp).toBeDefined();
        });

        it('should return 404 when activity not found', async () => {
            const activityObjectID = 'non-existent-activity';

            mockLifecycleManager.getActivityState.mockReturnValue(null);

            const response = await request(app)
                .get(`/activity/${activityObjectID}/state`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Activity not found');
            expect(response.body.activityObjectID).toBe(activityObjectID);
        });
    });

    describe('POST /lifecycle/cleanup', () => {
        it('should successfully perform lifecycle cleanup', async () => {
            mockLifecycleManager.clearOldCache.mockImplementation(() => {});
            mockErrorHandler.resetErrorStats.mockImplementation(() => {});

            const response = await request(app)
                .post('/lifecycle/cleanup')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Lifecycle cleanup completed');
            expect(response.body.timestamp).toBeDefined();
            expect(mockLifecycleManager.clearOldCache).toHaveBeenCalled();
            expect(mockErrorHandler.resetErrorStats).toHaveBeenCalled();
        });

        it('should handle cleanup errors gracefully', async () => {
            const cleanupError = new Error('Cleanup failed');
            mockLifecycleManager.clearOldCache.mockImplementation(() => {
                throw cleanupError;
            });

            const response = await request(app)
                .post('/lifecycle/cleanup')
                .expect(500);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Failed to perform lifecycle cleanup');
        });
    });

    describe('JWT Authentication', () => {
        it('should reject requests without JWT token', async () => {
            const response = await request(app)
                .post('/save')
                .send({})
                .expect(401);

            expect(response.body.error).toBe('No JWT token provided');
        });

        it('should reject requests with invalid JWT token', async () => {
            const invalidJWT = 'invalid.jwt.token';

            const response = await request(app)
                .post('/save')
                .set('Authorization', `Bearer ${invalidJWT}`)
                .send({})
                .expect(401);

            expect(response.body.error).toBe('Invalid JWT token');
        });

        it('should accept requests with valid JWT token', async () => {
            const savePayload = {
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

            const expectedResponse = {
                success: true,
                message: 'Activity configuration saved successfully',
                activityObjectID: 'test-activity-123',
                version: 'v1234567890-abc123def',
                warnings: [],
                processingTime: 150,
                timestamp: '2024-01-15T10:30:00.000Z'
            };

            mockLifecycleManager.handleSave.mockResolvedValue(expectedResponse);

            const response = await request(app)
                .post('/save')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(savePayload)
                .expect(200);

            expect(response.body).toEqual(expectedResponse);
        });
    });
});