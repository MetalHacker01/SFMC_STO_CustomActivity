/**
 * Integration Tests for Send Time Optimization
 * Task 10.2: Implement integration tests
 * - Create tests for SFMC API integration
 * - Add tests for holiday API integration with mocked responses
 * - Test complete contact processing workflows
 */

const request = require('supertest');
const axios = require('axios');
const ContactProcessor = require('../src/execution/contact-processor');
const SFMCAuth = require('../src/dataextension/sfmc-auth');
const DataExtensionAPI = require('../src/dataextension/data-extension-api');
const HolidayAPI = require('../src/holiday-api');
const HolidayChecker = require('../src/holiday-checker');
const { TimezoneCalculator } = require('../src/timezone-calculator');

// Mock external dependencies
jest.mock('axios');
const mockedAxios = axios;

describe('Integration Tests', () => {
    describe('SFMC API Integration', () => {
        let sfmcAuth;
        let dataExtensionAPI;

        beforeEach(() => {
            jest.clearAllMocks();
            sfmcAuth = new SFMCAuth({
                clientId: 'test-client-id',
                clientSecret: 'test-client-secret',
                subdomain: 'test-subdomain'
            });
            dataExtensionAPI = new DataExtensionAPI(sfmcAuth);
        });

        describe('Authentication Flow', () => {
            test('should authenticate successfully with valid credentials', async () => {
                const mockTokenResponse = {
                    data: {
                        access_token: 'test-access-token',
                        token_type: 'Bearer',
                        expires_in: 3600,
                        scope: 'data_extensions_read data_extensions_write'
                    }
                };

                mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);

                const token = await sfmcAuth.getAccessToken();

                expect(token).toBe('test-access-token');
                expect(mockedAxios.post).toHaveBeenCalledWith(
                    'https://test-subdomain.auth.marketingcloudapis.com/v2/token',
                    expect.objectContaining({
                        grant_type: 'client_credentials',
                        client_id: 'test-client-id',
                        client_secret: 'test-client-secret'
                    }),
                    expect.objectContaining({
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    })
                );
            });

            test('should handle authentication failures gracefully', async () => {
                const mockErrorResponse = {
                    response: {
                        status: 401,
                        data: {
                            error: 'invalid_client',
                            error_description: 'Invalid client credentials'
                        }
                    }
                };

                mockedAxios.post.mockRejectedValueOnce(mockErrorResponse);

                await expect(sfmcAuth.getAccessToken()).rejects.toThrow('SFMC authentication failed');
            });

            test('should refresh token when expired', async () => {
                const mockTokenResponse = {
                    data: {
                        access_token: 'new-access-token',
                        token_type: 'Bearer',
                        expires_in: 3600
                    }
                };

                // First call returns expired token
                sfmcAuth.tokenCache = {
                    token: 'expired-token',
                    expiresAt: Date.now() - 1000 // Expired 1 second ago
                };

                mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);

                const token = await sfmcAuth.getAccessToken();

                expect(token).toBe('new-access-token');
                expect(mockedAxios.post).toHaveBeenCalledTimes(1);
            });

            test('should reuse valid cached token', async () => {
                sfmcAuth.tokenCache = {
                    token: 'cached-token',
                    expiresAt: Date.now() + 3600000 // Expires in 1 hour
                };

                const token = await sfmcAuth.getAccessToken();

                expect(token).toBe('cached-token');
                expect(mockedAxios.post).not.toHaveBeenCalled();
            });
        });

        describe('Data Extension Operations', () => {
            beforeEach(() => {
                // Mock successful authentication
                sfmcAuth.tokenCache = {
                    token: 'valid-token',
                    expiresAt: Date.now() + 3600000
                };
            });

            test('should update contact ConvertedTime successfully', async () => {
                const mockUpdateResponse = {
                    data: {
                        items: [{
                            keys: { SubscriberKey: '12345' },
                            values: { ConvertedTime: '2024-01-15T14:00:00Z' }
                        }]
                    }
                };

                mockedAxios.post.mockResolvedValueOnce(mockUpdateResponse);

                const result = await dataExtensionAPI.updateContact('12345', {
                    ConvertedTime: '2024-01-15T14:00:00Z'
                });

                expect(result.success).toBe(true);
                expect(result.subscriberKey).toBe('12345');
                expect(mockedAxios.post).toHaveBeenCalledWith(
                    expect.stringContaining('/data/v1/async/dataextensions/key:'),
                    expect.objectContaining({
                        items: [{
                            keys: { SubscriberKey: '12345' },
                            values: { ConvertedTime: '2024-01-15T14:00:00Z' }
                        }]
                    }),
                    expect.objectContaining({
                        headers: {
                            'Authorization': 'Bearer valid-token',
                            'Content-Type': 'application/json'
                        }
                    })
                );
            });

            test('should handle data extension update failures', async () => {
                const mockErrorResponse = {
                    response: {
                        status: 400,
                        data: {
                            message: 'Invalid data extension key',
                            errorcode: 10001
                        }
                    }
                };

                mockedAxios.post.mockRejectedValueOnce(mockErrorResponse);

                const result = await dataExtensionAPI.updateContact('12345', {
                    ConvertedTime: '2024-01-15T14:00:00Z'
                });

                expect(result.success).toBe(false);
                expect(result.error).toContain('Invalid data extension key');
            });

            test('should batch update multiple contacts efficiently', async () => {
                const mockBatchResponse = {
                    data: {
                        items: [
                            { keys: { SubscriberKey: '12345' }, values: { ConvertedTime: '2024-01-15T14:00:00Z' } },
                            { keys: { SubscriberKey: '12346' }, values: { ConvertedTime: '2024-01-15T15:00:00Z' } }
                        ]
                    }
                };

                mockedAxios.post.mockResolvedValueOnce(mockBatchResponse);

                const contacts = [
                    { subscriberKey: '12345', convertedTime: '2024-01-15T14:00:00Z' },
                    { subscriberKey: '12346', convertedTime: '2024-01-15T15:00:00Z' }
                ];

                const result = await dataExtensionAPI.batchUpdateContacts(contacts);

                expect(result.success).toBe(true);
                expect(result.updatedCount).toBe(2);
                expect(result.failedCount).toBe(0);
            });

            test('should handle partial batch update failures', async () => {
                const mockPartialFailureResponse = {
                    data: {
                        items: [
                            { keys: { SubscriberKey: '12345' }, values: { ConvertedTime: '2024-01-15T14:00:00Z' } }
                        ],
                        errors: [
                            { 
                                keys: { SubscriberKey: '12346' }, 
                                error: 'Invalid date format',
                                errorCode: 10002 
                            }
                        ]
                    }
                };

                mockedAxios.post.mockResolvedValueOnce(mockPartialFailureResponse);

                const contacts = [
                    { subscriberKey: '12345', convertedTime: '2024-01-15T14:00:00Z' },
                    { subscriberKey: '12346', convertedTime: 'invalid-date' }
                ];

                const result = await dataExtensionAPI.batchUpdateContacts(contacts);

                expect(result.success).toBe(true); // Partial success
                expect(result.updatedCount).toBe(1);
                expect(result.failedCount).toBe(1);
                expect(result.errors).toHaveLength(1);
                expect(result.errors[0].subscriberKey).toBe('12346');
            });

            test('should retry failed operations with exponential backoff', async () => {
                // First two calls fail, third succeeds
                mockedAxios.post
                    .mockRejectedValueOnce(new Error('Network timeout'))
                    .mockRejectedValueOnce(new Error('Service unavailable'))
                    .mockResolvedValueOnce({
                        data: {
                            items: [{ keys: { SubscriberKey: '12345' }, values: { ConvertedTime: '2024-01-15T14:00:00Z' } }]
                        }
                    });

                const result = await dataExtensionAPI.updateContact('12345', {
                    ConvertedTime: '2024-01-15T14:00:00Z'
                });

                expect(result.success).toBe(true);
                expect(mockedAxios.post).toHaveBeenCalledTimes(3);
            });
        });

        describe('Error Recovery and Resilience', () => {
            test('should handle rate limiting with proper backoff', async () => {
                const rateLimitResponse = {
                    response: {
                        status: 429,
                        headers: {
                            'retry-after': '60'
                        },
                        data: {
                            message: 'Rate limit exceeded'
                        }
                    }
                };

                mockedAxios.post
                    .mockRejectedValueOnce(rateLimitResponse)
                    .mockResolvedValueOnce({
                        data: {
                            items: [{ keys: { SubscriberKey: '12345' }, values: { ConvertedTime: '2024-01-15T14:00:00Z' } }]
                        }
                    });

                const startTime = Date.now();
                const result = await dataExtensionAPI.updateContact('12345', {
                    ConvertedTime: '2024-01-15T14:00:00Z'
                });
                const endTime = Date.now();

                expect(result.success).toBe(true);
                expect(endTime - startTime).toBeGreaterThan(1000); // Should have waited
                expect(mockedAxios.post).toHaveBeenCalledTimes(2);
            });

            test('should handle network connectivity issues', async () => {
                const networkError = new Error('Network Error');
                networkError.code = 'ECONNREFUSED';

                mockedAxios.post
                    .mockRejectedValueOnce(networkError)
                    .mockResolvedValueOnce({
                        data: {
                            items: [{ keys: { SubscriberKey: '12345' }, values: { ConvertedTime: '2024-01-15T14:00:00Z' } }]
                        }
                    });

                const result = await dataExtensionAPI.updateContact('12345', {
                    ConvertedTime: '2024-01-15T14:00:00Z'
                });

                expect(result.success).toBe(true);
                expect(mockedAxios.post).toHaveBeenCalledTimes(2);
            });
        });
    });

    describe('Holiday API Integration', () => {
        let holidayAPI;
        let holidayChecker;

        beforeEach(() => {
            jest.clearAllMocks();
            holidayAPI = new HolidayAPI();
            holidayChecker = new HolidayChecker();
        });

        describe('Holiday Data Retrieval', () => {
            test('should fetch holidays successfully from external API', async () => {
                const mockHolidayResponse = {
                    data: [
                        {
                            date: '2024-01-01',
                            localName: 'New Year\'s Day',
                            name: 'New Year\'s Day',
                            countryCode: 'US',
                            fixed: true,
                            global: true,
                            counties: null,
                            launchYear: null,
                            types: ['Public']
                        },
                        {
                            date: '2024-07-04',
                            localName: 'Independence Day',
                            name: 'Independence Day',
                            countryCode: 'US',
                            fixed: true,
                            global: true,
                            counties: null,
                            launchYear: 1776,
                            types: ['Public']
                        }
                    ]
                };

                mockedAxios.get.mockResolvedValueOnce(mockHolidayResponse);

                const holidays = await holidayAPI.getHolidays('US', 2024);

                expect(holidays).toHaveLength(2);
                expect(holidays[0].date).toBe('2024-01-01');
                expect(holidays[0].name).toBe('New Year\'s Day');
                expect(holidays[1].date).toBe('2024-07-04');
                expect(holidays[1].name).toBe('Independence Day');

                expect(mockedAxios.get).toHaveBeenCalledWith(
                    expect.stringContaining('/PublicHolidays/2024/US'),
                    expect.objectContaining({
                        timeout: expect.any(Number),
                        headers: expect.any(Object)
                    })
                );
            });

            test('should handle API errors gracefully with fallback', async () => {
                const apiError = new Error('API service unavailable');
                apiError.response = { status: 503 };

                mockedAxios.get.mockRejectedValueOnce(apiError);

                const holidays = await holidayAPI.getHolidays('US', 2024);

                // Should return empty array or fallback data
                expect(Array.isArray(holidays)).toBe(true);
                expect(holidays.length).toBeGreaterThanOrEqual(0);
            });

            test('should normalize holiday data from different API formats', async () => {
                const mockApiResponse = {
                    data: [
                        {
                            date: '2024-01-01',
                            localName: 'Neujahrstag',
                            name: 'New Year\'s Day',
                            countryCode: 'DE',
                            fixed: true,
                            global: false,
                            counties: ['BY', 'BW'],
                            types: ['Public']
                        }
                    ]
                };

                mockedAxios.get.mockResolvedValueOnce(mockApiResponse);

                const holidays = await holidayAPI.getHolidays('DE', 2024);

                expect(holidays[0]).toMatchObject({
                    date: '2024-01-01',
                    name: expect.any(String),
                    countryCode: 'DE',
                    type: 'public'
                });
            });

            test('should cache holiday data to minimize API calls', async () => {
                const mockHolidayResponse = {
                    data: [
                        { date: '2024-01-01', name: 'New Year\'s Day', countryCode: 'US', types: ['Public'] }
                    ]
                };

                mockedAxios.get.mockResolvedValueOnce(mockHolidayResponse);

                // First call should hit API
                const holidays1 = await holidayChecker.getHolidays('US', 2024);
                
                // Second call should use cache
                const holidays2 = await holidayChecker.getHolidays('US', 2024);

                expect(holidays1).toEqual(holidays2);
                expect(mockedAxios.get).toHaveBeenCalledTimes(1); // Only one API call
            });

            test('should handle different country holiday formats', async () => {
                const testCases = [
                    {
                        country: 'BR',
                        mockResponse: {
                            data: [
                                { date: '2024-01-01', name: 'Confraternização Universal', countryCode: 'BR', types: ['Public'] },
                                { date: '2024-04-21', name: 'Tiradentes', countryCode: 'BR', types: ['Public'] }
                            ]
                        }
                    },
                    {
                        country: 'JP',
                        mockResponse: {
                            data: [
                                { date: '2024-01-01', name: 'New Year\'s Day', countryCode: 'JP', types: ['Public'] },
                                { date: '2024-05-03', name: 'Constitution Memorial Day', countryCode: 'JP', types: ['Public'] }
                            ]
                        }
                    }
                ];

                for (const testCase of testCases) {
                    mockedAxios.get.mockResolvedValueOnce(testCase.mockResponse);
                    
                    const holidays = await holidayAPI.getHolidays(testCase.country, 2024);
                    
                    expect(holidays.length).toBeGreaterThan(0);
                    expect(holidays[0].countryCode).toBe(testCase.country);
                }
            });
        });

        describe('Holiday Checking Integration', () => {
            test('should integrate holiday API with holiday checker', async () => {
                const mockHolidayResponse = {
                    data: [
                        { date: '2024-01-01', name: 'New Year\'s Day', countryCode: 'US', types: ['Public'] }
                    ]
                };

                mockedAxios.get.mockResolvedValueOnce(mockHolidayResponse);

                const isHoliday = await holidayChecker.isPublicHoliday(new Date('2024-01-01'), 'US');
                const isNotHoliday = await holidayChecker.isPublicHoliday(new Date('2024-01-02'), 'US');

                expect(isHoliday).toBe(true);
                expect(isNotHoliday).toBe(false);
            });

            test('should handle API failures with appropriate fallback behavior', async () => {
                mockedAxios.get.mockRejectedValueOnce(new Error('API unavailable'));

                // Test with 'ignore' fallback (default)
                const result1 = await holidayChecker.isPublicHoliday(new Date('2024-01-01'), 'US');
                expect(result1).toBe(false);

                // Test with 'assume_holiday' fallback
                const assumeHolidayChecker = new HolidayChecker({ fallbackBehavior: 'assume_holiday' });
                const result2 = await assumeHolidayChecker.isPublicHoliday(new Date('2024-01-01'), 'US');
                expect(result2).toBe(true);
            });
        });

        describe('Performance and Caching', () => {
            test('should handle concurrent holiday requests efficiently', async () => {
                const mockHolidayResponse = {
                    data: [
                        { date: '2024-01-01', name: 'New Year\'s Day', countryCode: 'US', types: ['Public'] }
                    ]
                };

                mockedAxios.get.mockResolvedValue(mockHolidayResponse);

                // Make multiple concurrent requests
                const promises = Array.from({ length: 10 }, (_, i) => 
                    holidayChecker.isPublicHoliday(new Date('2024-01-01'), 'US')
                );

                const results = await Promise.all(promises);

                // All should return the same result
                expect(results.every(result => result === true)).toBe(true);
                
                // Should have made minimal API calls due to caching
                expect(mockedAxios.get).toHaveBeenCalledTimes(1);
            });

            test('should warm up cache for multiple countries', async () => {
                const countries = ['US', 'CA', 'GB'];
                const mockResponses = countries.map(country => ({
                    data: [
                        { date: '2024-01-01', name: 'New Year\'s Day', countryCode: country, types: ['Public'] }
                    ]
                }));

                mockedAxios.get
                    .mockResolvedValueOnce(mockResponses[0])
                    .mockResolvedValueOnce(mockResponses[1])
                    .mockResolvedValueOnce(mockResponses[2]);

                const warmupResult = await holidayChecker.warmupCache(countries, [2024]);

                expect(warmupResult.success).toBeGreaterThan(0);
                expect(warmupResult.failed).toBe(0);
                expect(mockedAxios.get).toHaveBeenCalledTimes(3);
            });
        });
    });

    describe('Complete Contact Processing Workflows', () => {
        let contactProcessor;
        let mockSFMCAuth;
        let mockDataExtensionAPI;

        beforeEach(() => {
            jest.clearAllMocks();
            
            mockSFMCAuth = {
                getAccessToken: jest.fn().mockResolvedValue('valid-token')
            };
            
            mockDataExtensionAPI = {
                updateContact: jest.fn().mockResolvedValue({ success: true, subscriberKey: '12345' })
            };

            contactProcessor = new ContactProcessor({
                sfmcAuth: mockSFMCAuth,
                dataExtensionAPI: mockDataExtensionAPI
            });
        });

        describe('End-to-End Contact Processing', () => {
            test('should process contact with complete workflow', async () => {
                // Mock holiday API response
                const mockHolidayResponse = {
                    data: [
                        { date: '2024-01-01', name: 'New Year\'s Day', countryCode: 'US', types: ['Public'] }
                    ]
                };
                mockedAxios.get.mockResolvedValueOnce(mockHolidayResponse);

                const contact = {
                    subscriberKey: '12345',
                    geosegment: 'US',
                    emailAddress: 'test@example.com'
                };

                const config = {
                    skipWeekends: true,
                    skipHolidays: true,
                    timeWindows: [
                        { startHour: 9, endHour: 10, enabled: true },
                        { startHour: 14, endHour: 16, enabled: true }
                    ]
                };

                const result = await contactProcessor.processContact(contact, config);

                expect(result.success).toBe(true);
                expect(result.subscriberKey).toBe('12345');
                expect(result.convertedTime).toBeDefined();
                expect(result.originalTime).toBeDefined();
                expect(result.adjustments).toBeDefined();

                // Verify SFMC update was called
                expect(mockDataExtensionAPI.updateContact).toHaveBeenCalledWith(
                    '12345',
                    expect.objectContaining({
                        ConvertedTime: expect.any(String)
                    })
                );
            });

            test('should handle contact processing with timezone conversion', async () => {
                const contact = {
                    subscriberKey: '12345',
                    geosegment: 'JP', // Japan timezone
                    emailAddress: 'test@example.com'
                };

                const config = {
                    skipWeekends: false,
                    skipHolidays: false,
                    timeWindows: [
                        { startHour: 10, endHour: 11, enabled: true }
                    ]
                };

                const result = await contactProcessor.processContact(contact, config);

                expect(result.success).toBe(true);
                expect(result.timezoneInfo).toBeDefined();
                expect(result.timezoneInfo.countryCode).toBe('JP');
                expect(result.convertedTime).toBeDefined();

                // Verify timezone conversion was applied
                const originalTime = new Date(result.originalTime);
                const convertedTime = new Date(result.convertedTime);
                expect(convertedTime.getTime()).not.toBe(originalTime.getTime());
            });

            test('should handle weekend exclusion in contact processing', async () => {
                const contact = {
                    subscriberKey: '12345',
                    geosegment: 'US',
                    emailAddress: 'test@example.com'
                };

                const config = {
                    skipWeekends: true,
                    skipHolidays: false,
                    timeWindows: [
                        { startHour: 10, endHour: 11, enabled: true }
                    ]
                };

                // Mock the current time to be a Saturday
                const mockSaturday = new Date('2024-01-06T10:00:00Z'); // Saturday
                jest.spyOn(Date, 'now').mockReturnValue(mockSaturday.getTime());

                const result = await contactProcessor.processContact(contact, config);

                expect(result.success).toBe(true);
                expect(result.adjustments.dateAdjusted).toBe(true);
                expect(result.adjustments.reason).toContain('weekend');

                // Converted time should be on Monday
                const convertedTime = new Date(result.convertedTime);
                expect(convertedTime.getDay()).toBe(1); // Monday

                Date.now.mockRestore();
            });

            test('should handle holiday exclusion in contact processing', async () => {
                // Mock holiday API to return New Year's Day
                const mockHolidayResponse = {
                    data: [
                        { date: '2024-01-01', name: 'New Year\'s Day', countryCode: 'US', types: ['Public'] }
                    ]
                };
                mockedAxios.get.mockResolvedValueOnce(mockHolidayResponse);

                const contact = {
                    subscriberKey: '12345',
                    geosegment: 'US',
                    emailAddress: 'test@example.com'
                };

                const config = {
                    skipWeekends: false,
                    skipHolidays: true,
                    timeWindows: [
                        { startHour: 10, endHour: 11, enabled: true }
                    ]
                };

                // Mock the current time to be New Year's Day
                const mockNewYears = new Date('2024-01-01T10:00:00Z');
                jest.spyOn(Date, 'now').mockReturnValue(mockNewYears.getTime());

                const result = await contactProcessor.processContact(contact, config);

                expect(result.success).toBe(true);
                expect(result.adjustments.dateAdjusted).toBe(true);
                expect(result.adjustments.reason).toContain('holiday');

                Date.now.mockRestore();
            });

            test('should handle multiple contacts in batch processing', async () => {
                const contacts = [
                    { subscriberKey: '12345', geosegment: 'US', emailAddress: 'test1@example.com' },
                    { subscriberKey: '12346', geosegment: 'BR', emailAddress: 'test2@example.com' },
                    { subscriberKey: '12347', geosegment: 'JP', emailAddress: 'test3@example.com' }
                ];

                const config = {
                    skipWeekends: true,
                    skipHolidays: false,
                    timeWindows: [
                        { startHour: 9, endHour: 10, enabled: true },
                        { startHour: 14, endHour: 16, enabled: true }
                    ]
                };

                const results = await Promise.all(
                    contacts.map(contact => contactProcessor.processContact(contact, config))
                );

                expect(results).toHaveLength(3);
                expect(results.every(result => result.success)).toBe(true);

                // Each contact should have different timezone handling
                const timezones = results.map(result => result.timezoneInfo?.countryCode);
                expect(timezones).toContain('US');
                expect(timezones).toContain('BR');
                expect(timezones).toContain('JP');

                // Verify all SFMC updates were called
                expect(mockDataExtensionAPI.updateContact).toHaveBeenCalledTimes(3);
            });
        });

        describe('Error Handling in Workflows', () => {
            test('should handle SFMC API failures gracefully', async () => {
                mockDataExtensionAPI.updateContact.mockResolvedValueOnce({
                    success: false,
                    error: 'Data extension not found'
                });

                const contact = {
                    subscriberKey: '12345',
                    geosegment: 'US',
                    emailAddress: 'test@example.com'
                };

                const config = {
                    skipWeekends: false,
                    skipHolidays: false,
                    timeWindows: [
                        { startHour: 10, endHour: 11, enabled: true }
                    ]
                };

                const result = await contactProcessor.processContact(contact, config);

                // Processing should succeed even if SFMC update fails
                expect(result.success).toBe(true);
                expect(result.convertedTime).toBeDefined();
                expect(result.warnings).toContain('SFMC update failed');
            });

            test('should handle invalid contact data', async () => {
                const invalidContact = {
                    subscriberKey: null,
                    geosegment: 'INVALID',
                    emailAddress: 'invalid-email'
                };

                const config = {
                    skipWeekends: false,
                    skipHolidays: false,
                    timeWindows: [
                        { startHour: 10, endHour: 11, enabled: true }
                    ]
                };

                const result = await contactProcessor.processContact(invalidContact, config);

                expect(result.success).toBe(false);
                expect(result.error).toBeDefined();
                expect(result.validationErrors).toBeDefined();
            });

            test('should handle timezone calculation failures', async () => {
                const contact = {
                    subscriberKey: '12345',
                    geosegment: 'XX', // Unsupported country
                    emailAddress: 'test@example.com'
                };

                const config = {
                    skipWeekends: false,
                    skipHolidays: false,
                    timeWindows: [
                        { startHour: 10, endHour: 11, enabled: true }
                    ]
                };

                const result = await contactProcessor.processContact(contact, config);

                expect(result.success).toBe(true); // Should succeed with fallback
                expect(result.warnings).toContain('Unsupported country code');
                expect(result.convertedTime).toBeDefined();
            });
        });

        describe('Performance and Scalability', () => {
            test('should handle high-volume contact processing efficiently', async () => {
                const contacts = Array.from({ length: 100 }, (_, i) => ({
                    subscriberKey: `contact-${i}`,
                    geosegment: ['US', 'BR', 'JP', 'GB', 'CA'][i % 5],
                    emailAddress: `test${i}@example.com`
                }));

                const config = {
                    skipWeekends: true,
                    skipHolidays: false,
                    timeWindows: [
                        { startHour: 9, endHour: 10, enabled: true },
                        { startHour: 14, endHour: 16, enabled: true }
                    ]
                };

                const startTime = Date.now();
                
                // Process in batches to simulate real-world usage
                const batchSize = 10;
                const batches = [];
                for (let i = 0; i < contacts.length; i += batchSize) {
                    batches.push(contacts.slice(i, i + batchSize));
                }

                const results = [];
                for (const batch of batches) {
                    const batchResults = await Promise.all(
                        batch.map(contact => contactProcessor.processContact(contact, config))
                    );
                    results.push(...batchResults);
                }

                const endTime = Date.now();
                const processingTime = endTime - startTime;

                expect(results).toHaveLength(100);
                expect(results.filter(r => r.success)).toHaveLength(100);
                expect(processingTime).toBeLessThan(30000); // Should complete within 30 seconds

                // Verify performance metrics
                const avgProcessingTime = processingTime / contacts.length;
                expect(avgProcessingTime).toBeLessThan(300); // Less than 300ms per contact
            });

            test('should handle concurrent processing without race conditions', async () => {
                const contact = {
                    subscriberKey: '12345',
                    geosegment: 'US',
                    emailAddress: 'test@example.com'
                };

                const config = {
                    skipWeekends: false,
                    skipHolidays: false,
                    timeWindows: [
                        { startHour: 10, endHour: 11, enabled: true }
                    ]
                };

                // Process the same contact multiple times concurrently
                const promises = Array.from({ length: 20 }, () => 
                    contactProcessor.processContact(contact, config)
                );

                const results = await Promise.all(promises);

                expect(results).toHaveLength(20);
                expect(results.every(result => result.success)).toBe(true);

                // All results should be consistent
                const convertedTimes = results.map(r => r.convertedTime);
                const uniqueTimes = [...new Set(convertedTimes)];
                expect(uniqueTimes).toHaveLength(1); // All should be the same
            });
        });
    });
});