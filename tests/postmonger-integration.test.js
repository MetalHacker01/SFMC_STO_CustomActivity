/**
 * Tests for Postmonger integration and Journey Builder lifecycle endpoints
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Set up environment variables for testing
process.env.JWT_SECRET = 'test-secret-key';
process.env.SFMC_CLIENT_ID = 'test-client-id';
process.env.SFMC_CLIENT_SECRET = 'test-client-secret';
process.env.NODE_ENV = 'test';

// Mock the timezone engine and contact processor
jest.mock('../src/timezone-engine', () => ({
    TimezoneEngine: jest.fn().mockImplementation(() => ({
        getEngineStats: jest.fn().mockReturnValue({
            supportedCountriesCount: 20,
            validationStats: { valid: 100, invalid: 0 }
        }),
        getTimezoneInfo: jest.fn().mockReturnValue({
            countryCode: 'US',
            timezone: 'America/Chicago',
            offset: -6
        })
    }))
}));

jest.mock('../src/execution/contact-processor');

const app = require('../server');

describe('Postmonger Integration Tests', () => {
    let validJWT;
    const jwtSecret = process.env.JWT_SECRET || 'test-secret';
    
    beforeAll(() => {
        // Create a valid JWT for testing
        validJWT = jwt.sign({
            iss: 'SFMC',
            sub: 'test-user',
            aud: 'test-app',
            exp: Math.floor(Date.now() / 1000) + 3600
        }, jwtSecret);
    });

    describe('Save Endpoint', () => {
        test('should save valid configuration', async () => {
            const validConfig = {
                inArguments: [{
                    activityConfig: {
                        skipWeekends: true,
                        skipHolidays: false,
                        timeWindows: [
                            { startHour: 9, endHour: 10, enabled: true },
                            { startHour: 10, endHour: 11, enabled: true }
                        ],
                        defaultTimezone: 'America/Chicago',
                        holidayApiEnabled: true,
                        fallbackBehavior: 'next_business_day'
                    }
                }],
                outArguments: [{
                    convertedTime: '{{{ConvertedTime}}}',
                    processingStatus: '{{{ProcessingStatus}}}'
                }],
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456'
            };

            const response = await request(app)
                .post('/save')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(validConfig)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('saved successfully');
        });

        test('should reject invalid configuration', async () => {
            const invalidConfig = {
                inArguments: [{
                    activityConfig: {
                        skipWeekends: 'invalid', // Should be boolean
                        timeWindows: [] // Should have at least one window
                    }
                }],
                outArguments: [{}],
                activityObjectID: 'test-activity-123'
            };

            const response = await request(app)
                .post('/save')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(invalidConfig)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Invalid configuration');
        });
    });

    describe('Validate Endpoint', () => {
        test('should validate correct configuration', async () => {
            const validConfig = {
                inArguments: [{
                    activityConfig: {
                        skipWeekends: true,
                        skipHolidays: true,
                        timeWindows: [
                            { startHour: 9, endHour: 10, enabled: true }
                        ],
                        defaultTimezone: 'America/Chicago'
                    }
                }],
                outArguments: [{
                    convertedTime: '{{{ConvertedTime}}}'
                }],
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456'
            };

            const response = await request(app)
                .post('/validate')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(validConfig)
                .expect(200);

            expect(response.body.valid).toBe(true);
            expect(response.body.errors).toHaveLength(0);
        });
    });

    describe('Publish Endpoint', () => {
        test('should publish valid configuration', async () => {
            const validConfig = {
                inArguments: [{
                    activityConfig: {
                        skipWeekends: true,
                        skipHolidays: true,
                        timeWindows: [
                            { startHour: 9, endHour: 10, enabled: true },
                            { startHour: 10, endHour: 11, enabled: true }
                        ],
                        defaultTimezone: 'America/Chicago',
                        holidayApiEnabled: true
                    }
                }],
                outArguments: [{
                    convertedTime: '{{{ConvertedTime}}}'
                }],
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456'
            };

            const response = await request(app)
                .post('/publish')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(validConfig)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('published successfully');
        });
    });

    describe('Execute Endpoint', () => {
        test('should execute activity for valid contact', async () => {
            // Mock the ContactProcessor
            const ContactProcessor = require('../src/execution/contact-processor');
            const mockProcessor = {
                processContact: jest.fn().mockResolvedValue({
                    success: true,
                    subscriberKey: 'test-subscriber-123',
                    convertedTime: '2024-01-16T14:00:00Z',
                    adjustments: [],
                    processingTime: 150
                })
            };
            ContactProcessor.mockImplementation(() => mockProcessor);

            const executePayload = {
                inArguments: [{
                    subscriberKey: 'test-subscriber-123',
                    geosegment: 'US',
                    emailAddress: 'test@example.com',
                    skipWeekends: true,
                    skipHolidays: false,
                    timeWindows: [
                        { startHour: 9, endHour: 10, enabled: true }
                    ]
                }],
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456'
            };

            const response = await request(app)
                .post('/execute')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(executePayload)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.subscriberKey).toBe('test-subscriber-123');
            expect(response.body.convertedTime).toBeDefined();
            expect(mockProcessor.processContact).toHaveBeenCalled();
        });
    });

    describe('Stop Endpoint', () => {
        test('should stop activity successfully', async () => {
            const stopPayload = {
                activityObjectID: 'test-activity-123',
                journeyId: 'test-journey-456'
            };

            const response = await request(app)
                .post('/stop')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(stopPayload)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('stopped successfully');
        });
    });
});