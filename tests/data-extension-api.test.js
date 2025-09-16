/**
 * Unit tests for Data Extension API
 */

const DataExtensionAPI = require('../src/dataextension/data-extension-api');
const SFMCAuthService = require('../src/dataextension/sfmc-auth');

// Mock the auth service
jest.mock('../src/dataextension/sfmc-auth');

describe('DataExtensionAPI', () => {
    let dataExtensionAPI;
    let mockAuthService;
    let mockLogger;
    let validConfig;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock logger
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        // Valid configuration
        validConfig = {
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
            subdomain: 'test-subdomain',
            maxRetries: 2,
            retryDelay: 100
        };

        // Mock auth service
        mockAuthService = {
            makeAuthenticatedRequest: jest.fn(),
            getTokenStatus: jest.fn(),
            clearToken: jest.fn()
        };

        SFMCAuthService.mockImplementation(() => mockAuthService);

        dataExtensionAPI = new DataExtensionAPI(validConfig, mockLogger);
    });

    describe('constructor', () => {
        it('should initialize with auth service and configuration', () => {
            expect(SFMCAuthService).toHaveBeenCalledWith(validConfig, mockLogger);
            expect(dataExtensionAPI.retryConfig.maxRetries).toBe(2);
            expect(dataExtensionAPI.retryConfig.retryDelay).toBe(100);
        });

        it('should use default retry configuration when not provided', () => {
            const api = new DataExtensionAPI({}, mockLogger);
            expect(api.retryConfig.maxRetries).toBe(3);
            expect(api.retryConfig.retryDelay).toBe(1000);
        });
    });

    describe('updateConvertedTime', () => {
        const subscriberKey = 'test-subscriber-key';
        const convertedTime = new Date('2024-01-15T12:00:00Z');
        const dataExtensionKey = 'test-de-key';

        it('should successfully update ConvertedTime field', async () => {
            const mockResponse = { success: true };
            mockAuthService.makeAuthenticatedRequest.mockResolvedValueOnce(mockResponse);

            const result = await dataExtensionAPI.updateConvertedTime(subscriberKey, convertedTime, dataExtensionKey);

            expect(result.success).toBe(true);
            expect(result.subscriberKey).toBe(subscriberKey);
            expect(result.attempts).toBe(1);

            expect(mockAuthService.makeAuthenticatedRequest).toHaveBeenCalledWith(
                'PUT',
                '/data/v1/customobjectdata/key/test-de-key/rowset',
                [{
                    keys: { SubscriberKey: subscriberKey },
                    values: {
                        ConvertedTime: convertedTime.toISOString(),
                        LastUpdated: expect.any(String),
                        ProcessingStatus: 'Completed'
                    }
                }],
                { timeout: 20000 }
            );
        });

        it('should validate required parameters', async () => {
            const result1 = await dataExtensionAPI.updateConvertedTime('', convertedTime, dataExtensionKey);
            expect(result1.success).toBe(false);
            expect(result1.error).toContain('SubscriberKey is required');

            const result2 = await dataExtensionAPI.updateConvertedTime(subscriberKey, null, dataExtensionKey);
            expect(result2.success).toBe(false);
            expect(result2.error).toContain('ConvertedTime must be a valid Date object');

            const result3 = await dataExtensionAPI.updateConvertedTime(subscriberKey, convertedTime, '');
            expect(result3.success).toBe(false);
            expect(result3.error).toContain('DataExtensionKey is required');
        });

        it('should retry on failure and eventually succeed', async () => {
            const mockError = new Error('Network error');
            mockError.response = { status: 500 };
            
            mockAuthService.makeAuthenticatedRequest
                .mockRejectedValueOnce(mockError)
                .mockResolvedValueOnce({ success: true });

            const result = await dataExtensionAPI.updateConvertedTime(subscriberKey, convertedTime, dataExtensionKey);

            expect(result.success).toBe(true);
            expect(result.attempts).toBe(2);
            expect(mockAuthService.makeAuthenticatedRequest).toHaveBeenCalledTimes(2);
        });

        it('should fail after max retries', async () => {
            const mockError = new Error('Persistent error');
            mockError.response = { status: 500 };
            
            mockAuthService.makeAuthenticatedRequest.mockRejectedValue(mockError);

            const result = await dataExtensionAPI.updateConvertedTime(subscriberKey, convertedTime, dataExtensionKey);

            expect(result.success).toBe(false);
            expect(result.attempts).toBe(2);
            expect(result.error).toBe('Persistent error');
            expect(mockAuthService.makeAuthenticatedRequest).toHaveBeenCalledTimes(2);
        });

        it('should not retry on client errors', async () => {
            const mockError = new Error('Bad request');
            mockError.response = { status: 400 };
            
            mockAuthService.makeAuthenticatedRequest.mockRejectedValueOnce(mockError);

            const result = await dataExtensionAPI.updateConvertedTime(subscriberKey, convertedTime, dataExtensionKey);

            expect(result.success).toBe(false);
            expect(result.attempts).toBe(1); // Only one attempt made due to non-retryable error
            expect(mockAuthService.makeAuthenticatedRequest).toHaveBeenCalledTimes(1);
        });
    });

    describe('batchUpdateConvertedTime', () => {
        const updates = [
            { subscriberKey: 'sub1', convertedTime: new Date('2024-01-15T12:00:00Z') },
            { subscriberKey: 'sub2', convertedTime: new Date('2024-01-15T13:00:00Z') }
        ];
        const dataExtensionKey = 'test-de-key';

        it('should successfully batch update ConvertedTime fields', async () => {
            const mockResponse = { success: true };
            mockAuthService.makeAuthenticatedRequest.mockResolvedValueOnce(mockResponse);

            const result = await dataExtensionAPI.batchUpdateConvertedTime(updates, dataExtensionKey);

            expect(result.success).toBe(true);
            expect(result.contactCount).toBe(2);
            expect(result.attempts).toBe(1);

            expect(mockAuthService.makeAuthenticatedRequest).toHaveBeenCalledWith(
                'PUT',
                '/data/v1/customobjectdata/key/test-de-key/rowset',
                expect.arrayContaining([
                    expect.objectContaining({
                        keys: { SubscriberKey: 'sub1' },
                        values: expect.objectContaining({
                            ConvertedTime: updates[0].convertedTime.toISOString()
                        })
                    }),
                    expect.objectContaining({
                        keys: { SubscriberKey: 'sub2' },
                        values: expect.objectContaining({
                            ConvertedTime: updates[1].convertedTime.toISOString()
                        })
                    })
                ]),
                { timeout: 30000 }
            );
        });

        it('should validate batch update parameters', async () => {
            const result1 = await dataExtensionAPI.batchUpdateConvertedTime([], dataExtensionKey);
            expect(result1.success).toBe(false);
            expect(result1.error).toContain('Updates array is required and must not be empty');

            const result2 = await dataExtensionAPI.batchUpdateConvertedTime(updates, '');
            expect(result2.success).toBe(false);
            expect(result2.error).toContain('DataExtensionKey is required');

            const invalidUpdates = [{ subscriberKey: '', convertedTime: new Date() }];
            const result3 = await dataExtensionAPI.batchUpdateConvertedTime(invalidUpdates, dataExtensionKey);
            expect(result3.success).toBe(false);
            expect(result3.error).toContain('All updates must have a subscriberKey');
        });

        it('should handle batch update failures with retry', async () => {
            const mockError = new Error('Batch error');
            mockError.response = { status: 500 };
            
            mockAuthService.makeAuthenticatedRequest
                .mockRejectedValueOnce(mockError)
                .mockResolvedValueOnce({ success: true });

            const result = await dataExtensionAPI.batchUpdateConvertedTime(updates, dataExtensionKey);

            expect(result.success).toBe(true);
            expect(result.attempts).toBe(2);
        });
    });

    describe('validateDataExtension', () => {
        const dataExtensionKey = 'test-de-key';

        it('should successfully validate existing data extension with required fields', async () => {
            const mockResponse = {
                count: 100,
                items: [{
                    values: {
                        SubscriberKey: 'test-key',
                        ConvertedTime: '2024-01-15T12:00:00Z',
                        EmailAddress: 'test@example.com'
                    }
                }]
            };

            mockAuthService.makeAuthenticatedRequest.mockResolvedValueOnce(mockResponse);

            const result = await dataExtensionAPI.validateDataExtension(dataExtensionKey);

            expect(result.exists).toBe(true);
            expect(result.hasRequiredFields).toBe(true);
            expect(result.missingFields).toEqual([]);
            expect(result.totalRows).toBe(100);
            expect(result.availableFields).toContain('SubscriberKey');
            expect(result.availableFields).toContain('ConvertedTime');
        });

        it('should detect missing required fields', async () => {
            const mockResponse = {
                count: 50,
                items: [{
                    values: {
                        SubscriberKey: 'test-key',
                        EmailAddress: 'test@example.com'
                        // Missing ConvertedTime field
                    }
                }]
            };

            mockAuthService.makeAuthenticatedRequest.mockResolvedValueOnce(mockResponse);

            const result = await dataExtensionAPI.validateDataExtension(dataExtensionKey);

            expect(result.exists).toBe(true);
            expect(result.hasRequiredFields).toBe(false);
            expect(result.missingFields).toEqual(['ConvertedTime']);
        });

        it('should handle empty data extension', async () => {
            const mockResponse = {
                count: 0,
                items: []
            };

            mockAuthService.makeAuthenticatedRequest.mockResolvedValueOnce(mockResponse);

            const result = await dataExtensionAPI.validateDataExtension(dataExtensionKey);

            expect(result.exists).toBe(true);
            expect(result.fieldValidationSkipped).toBe(true);
            expect(result.totalRows).toBe(0);
        });

        it('should handle non-existent data extension', async () => {
            const mockError = new Error('Not found');
            mockError.response = { status: 404 };

            mockAuthService.makeAuthenticatedRequest.mockRejectedValueOnce(mockError);

            const result = await dataExtensionAPI.validateDataExtension(dataExtensionKey);

            // With graceful degradation, it assumes the DE is valid when validation fails
            expect(result.exists).toBe(true);
            expect(result.hasRequiredFields).toBe(true);
            expect(result.gracefulDegradation).toBe(true);
            expect(result.originalError).toContain('Not found');
        });

        it('should validate required parameter', async () => {
            const result = await dataExtensionAPI.validateDataExtension('');
            expect(result.exists).toBe(false);
            expect(result.hasRequiredFields).toBe(false);
            expect(result.error).toContain('DataExtensionKey is required');
        });

        it('should handle validation API errors', async () => {
            const mockError = new Error('API error');
            mockError.response = { status: 500 };

            mockAuthService.makeAuthenticatedRequest.mockRejectedValueOnce(mockError);

            const result = await dataExtensionAPI.validateDataExtension(dataExtensionKey);

            // With graceful degradation, it assumes the DE is valid when validation fails
            expect(result.exists).toBe(true);
            expect(result.hasRequiredFields).toBe(true);
            expect(result.gracefulDegradation).toBe(true);
            expect(result.originalError).toBeDefined();
        });
    });

    describe('shouldNotRetry', () => {
        it('should not retry on client errors except 429', () => {
            const error400 = new Error('Bad request');
            error400.response = { status: 400 };
            expect(dataExtensionAPI.shouldNotRetry(error400)).toBe(true);

            const error404 = new Error('Not found');
            error404.response = { status: 404 };
            expect(dataExtensionAPI.shouldNotRetry(error404)).toBe(true);

            const error429 = new Error('Rate limit');
            error429.response = { status: 429 };
            expect(dataExtensionAPI.shouldNotRetry(error429)).toBe(false);
        });

        it('should not retry on authentication errors', () => {
            const error401 = new Error('Unauthorized');
            error401.response = { status: 401 };
            expect(dataExtensionAPI.shouldNotRetry(error401)).toBe(true);

            const error403 = new Error('Forbidden');
            error403.response = { status: 403 };
            expect(dataExtensionAPI.shouldNotRetry(error403)).toBe(true);
        });

        it('should retry on server errors', () => {
            const error500 = new Error('Server error');
            error500.response = { status: 500 };
            expect(dataExtensionAPI.shouldNotRetry(error500)).toBe(false);

            const error502 = new Error('Bad gateway');
            error502.response = { status: 502 };
            expect(dataExtensionAPI.shouldNotRetry(error502)).toBe(false);
        });

        it('should not retry on validation errors', () => {
            const validationError = new Error('validation failed');
            expect(dataExtensionAPI.shouldNotRetry(validationError)).toBe(true);

            const invalidError = new Error('invalid data');
            expect(dataExtensionAPI.shouldNotRetry(invalidError)).toBe(true);
        });
    });

    describe('utility methods', () => {
        it('should get auth status', () => {
            const mockStatus = { hasToken: true, isExpired: false };
            mockAuthService.getTokenStatus.mockReturnValueOnce(mockStatus);

            const status = dataExtensionAPI.getAuthStatus();

            expect(status).toEqual(mockStatus);
            expect(mockAuthService.getTokenStatus).toHaveBeenCalled();
        });

        it('should clear auth token', () => {
            dataExtensionAPI.clearAuthToken();

            expect(mockAuthService.clearToken).toHaveBeenCalled();
        });

        it('should sleep for specified duration', async () => {
            const start = Date.now();
            await dataExtensionAPI.sleep(50);
            const end = Date.now();

            expect(end - start).toBeGreaterThanOrEqual(45); // Allow some variance
        });
    });
});