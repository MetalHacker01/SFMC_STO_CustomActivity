/**
 * Tests for Postmonger integration endpoints
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Set up test environment
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

describe('Postmonger Endpoints', () => {
    let app;
    let validJWT;
    
    beforeAll(() => {
        // Mock dependencies before requiring the app
        jest.mock('../src/timezone-engine', () => ({
            TimezoneEngine: jest.fn().mockImplementation(() => ({
                getEngineStats: jest.fn().mockReturnValue({
                    supportedCountriesCount: 20,
                    validationStats: { valid: 100, invalid: 0 }
                })
            }))
        }));
        
        jest.mock('../src/execution/contact-processor', () => {
            return jest.fn().mockImplementation(() => ({
                processContact: jest.fn().mockResolvedValue({
                    success: true,
                    subscriberKey: 'test-123',
                    convertedTime: '2024-01-16T14:00:00Z',
                    adjustments: [],
                    processingTime: 100
                }),
                healthCheck: jest.fn().mockResolvedValue({
                    status: 'healthy'
                }),
                getStats: jest.fn().mockReturnValue({
                    totalProcessed: 10,
                    successful: 9,
                    failed: 1
                })
            }));
        });
        
        // Now require the app after mocking
        app = require('../server');
        
        // Create valid JWT
        validJWT = jwt.sign({
            iss: 'SFMC',
            sub: 'test-user',
            exp: Math.floor(Date.now() / 1000) + 3600
        }, process.env.JWT_SECRET);
    });

    describe('Save Endpoint', () => {
        test('should save valid configuration', async () => {
            const config = {
                inArguments: [{
                    activityConfig: {
                        skipWeekends: true,
                        timeWindows: [
                            { startHour: 9, endHour: 10, enabled: true }
                        ]
                    }
                }],
                outArguments: [{}]
            };

            const response = await request(app)
                .post('/save')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(config)
                .expect(200);

            expect(response.body.success).toBe(true);
        });
    });

    describe('Validate Endpoint', () => {
        test('should validate configuration', async () => {
            const config = {
                inArguments: [{
                    activityConfig: {
                        skipWeekends: true,
                        timeWindows: [
                            { startHour: 9, endHour: 10, enabled: true }
                        ]
                    }
                }],
                outArguments: [{}]
            };

            const response = await request(app)
                .post('/validate')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(config)
                .expect(200);

            expect(response.body.valid).toBe(true);
        });
    });

    describe('Publish Endpoint', () => {
        test('should publish configuration', async () => {
            const config = {
                inArguments: [{
                    activityConfig: {
                        skipWeekends: true,
                        timeWindows: [
                            { startHour: 9, endHour: 10, enabled: true }
                        ]
                    }
                }],
                outArguments: [{}]
            };

            const response = await request(app)
                .post('/publish')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(config)
                .expect(200);

            expect(response.body.success).toBe(true);
        });
    });

    describe('Stop Endpoint', () => {
        test('should stop activity', async () => {
            const payload = {
                activityObjectID: 'test-123',
                journeyId: 'journey-456'
            };

            const response = await request(app)
                .post('/stop')
                .set('Authorization', `Bearer ${validJWT}`)
                .send(payload)
                .expect(200);

            expect(response.body.success).toBe(true);
        });
    });
});