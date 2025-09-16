/**
 * Unit tests for SFMC Authentication Service
 */

const axios = require('axios');
const SFMCAuthService = require('../src/dataextension/sfmc-auth');

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

describe('SFMCAuthService', () => {
    let authService;
    let mockLogger;
    let validConfig;

    beforeEach(() => {
        // Reset all mocks
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
            accountId: 'test-account-id'
        };

        authService = new SFMCAuthService(validConfig, mockLogger);
    });

    describe('constructor', () => {
        it('should initialize with valid configuration', () => {
            expect(authService.config.clientId).toBe('test-client-id');
            expect(authService.config.subdomain).toBe('test-subdomain');
            expect(authService.config.authUrl).toBe('https://test-subdomain.auth.marketingcloudapis.com/v2/token');
            expect(authService.config.restBaseUrl).toBe('https://test-subdomain.rest.marketingcloudapis.com');
        });

        it('should throw error for missing required configuration', () => {
            expect(() => {
                new SFMCAuthService({ clientId: 'test' }, mockLogger);
            }).toThrow('Missing required SFMC configuration: clientSecret, subdomain');
        });

        it('should use custom URLs when provided', () => {
            const customConfig = {
                ...validConfig,
                authUrl: 'https://custom.auth.url',
                restBaseUrl: 'https://custom.rest.url'
            };

            const service = new SFMCAuthService(customConfig, mockLogger);
            expect(service.config.authUrl).toBe('https://custom.auth.url');
            expect(service.config.restBaseUrl).toBe('https://custom.rest.url');
        });
    });

    describe('authenticate', () => {
        it('should successfully authenticate and store token data', async () => {
            const mockResponse = {
                data: {
                    access_token: 'test-access-token',
                    token_type: 'Bearer',
                    expires_in: 3600,
                    scope: 'data_extensions_read data_extensions_write'
                }
            };

            mockedAxios.post.mockResolvedValueOnce(mockResponse);

            const token = await authService.authenticate();

            expect(token).toBe('test-access-token');
            expect(authService.tokenData).toEqual(mockResponse.data);
            expect(authService.tokenExpiryTime).toBeGreaterThan(Date.now());
            expect(mockLogger.info).toHaveBeenCalledWith('SFMC authentication successful', expect.any(Object));
        });

        it('should include account_id in request when provided', async () => {
            const mockResponse = {
                data: {
                    access_token: 'test-token',
                    expires_in: 3600
                }
            };

            mockedAxios.post.mockResolvedValueOnce(mockResponse);

            await authService.authenticate();

            expect(mockedAxios.post).toHaveBeenCalledWith(
                'https://test-subdomain.auth.marketingcloudapis.com/v2/token',
                expect.objectContaining({
                    account_id: 'test-account-id'
                }),
                expect.any(Object)
            );
        });

        it('should handle authentication failure', async () => {
            const mockError = new Error('Network error');
            mockError.response = {
                status: 401,
                statusText: 'Unauthorized',
                data: { error: 'invalid_client' }
            };

            mockedAxios.post.mockRejectedValueOnce(mockError);

            await expect(authService.authenticate()).rejects.toThrow('SFMC authentication failed: Network error');
            expect(authService.tokenData).toBeNull();
            expect(authService.tokenExpiryTime).toBeNull();
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should handle invalid response format', async () => {
            const mockResponse = {
                data: {} // Missing access_token
            };

            mockedAxios.post.mockResolvedValueOnce(mockResponse);

            await expect(authService.authenticate()).rejects.toThrow('Invalid authentication response from SFMC');
        });
    });

    describe('getValidToken', () => {
        it('should return existing valid token', async () => {
            // Set up existing valid token
            authService.tokenData = { access_token: 'existing-token' };
            authService.tokenExpiryTime = Date.now() + 3600000; // 1 hour from now

            const token = await authService.getValidToken();

            expect(token).toBe('existing-token');
            expect(mockedAxios.post).not.toHaveBeenCalled();
        });

        it('should authenticate when no token exists', async () => {
            const mockResponse = {
                data: {
                    access_token: 'new-token',
                    expires_in: 3600
                }
            };

            mockedAxios.post.mockResolvedValueOnce(mockResponse);

            const token = await authService.getValidToken();

            expect(token).toBe('new-token');
            expect(mockedAxios.post).toHaveBeenCalled();
        });

        it('should refresh expired token', async () => {
            // Set up expired token
            authService.tokenData = { access_token: 'expired-token' };
            authService.tokenExpiryTime = Date.now() - 1000; // 1 second ago

            const mockResponse = {
                data: {
                    access_token: 'refreshed-token',
                    expires_in: 3600
                }
            };

            mockedAxios.post.mockResolvedValueOnce(mockResponse);

            const token = await authService.getValidToken();

            expect(token).toBe('refreshed-token');
            expect(mockedAxios.post).toHaveBeenCalled();
        });

        it('should handle concurrent refresh requests', async () => {
            // Set up expired token
            authService.tokenData = null;

            const mockResponse = {
                data: {
                    access_token: 'concurrent-token',
                    expires_in: 3600
                }
            };

            mockedAxios.post.mockResolvedValueOnce(mockResponse);

            // Make multiple concurrent requests
            const promises = [
                authService.getValidToken(),
                authService.getValidToken(),
                authService.getValidToken()
            ];

            const tokens = await Promise.all(promises);

            // Should all return the same token
            expect(tokens).toEqual(['concurrent-token', 'concurrent-token', 'concurrent-token']);
            // Should only make one API call
            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
        });
    });

    describe('isTokenExpired', () => {
        it('should return true when no expiry time is set', () => {
            authService.tokenExpiryTime = null;
            expect(authService.isTokenExpired()).toBe(true);
        });

        it('should return true when token is expired', () => {
            authService.tokenExpiryTime = Date.now() - 1000; // 1 second ago
            expect(authService.isTokenExpired()).toBe(true);
        });

        it('should return false when token is valid', () => {
            authService.tokenExpiryTime = Date.now() + 3600000; // 1 hour from now
            expect(authService.isTokenExpired()).toBe(false);
        });
    });

    describe('getAuthHeaders', () => {
        it('should return proper authorization headers', async () => {
            const mockResponse = {
                data: {
                    access_token: 'test-token',
                    expires_in: 3600
                }
            };

            mockedAxios.post.mockResolvedValueOnce(mockResponse);

            const headers = await authService.getAuthHeaders();

            expect(headers).toEqual({
                'Authorization': 'Bearer test-token',
                'Content-Type': 'application/json'
            });
        });
    });

    describe('makeAuthenticatedRequest', () => {
        beforeEach(() => {
            // Set up valid token
            authService.tokenData = { access_token: 'test-token' };
            authService.tokenExpiryTime = Date.now() + 3600000;
        });

        it('should make successful authenticated request', async () => {
            const mockResponse = { data: { success: true } };
            mockedAxios.mockResolvedValueOnce(mockResponse);

            const result = await authService.makeAuthenticatedRequest('GET', '/test/endpoint');

            expect(result).toEqual({ success: true });
            expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
                method: 'GET',
                url: 'https://test-subdomain.rest.marketingcloudapis.com/test/endpoint',
                headers: expect.objectContaining({
                    'Authorization': 'Bearer test-token'
                })
            }));
        });

        it('should include data for POST requests', async () => {
            const mockResponse = { data: { success: true } };
            mockedAxios.mockResolvedValueOnce(mockResponse);

            const requestData = { test: 'data' };
            await authService.makeAuthenticatedRequest('POST', '/test/endpoint', requestData);

            expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
                method: 'POST',
                data: requestData
            }));
        });

        it('should clear token on 401 response', async () => {
            const mockError = new Error('Unauthorized');
            mockError.response = { status: 401 };
            mockedAxios.mockRejectedValueOnce(mockError);

            await expect(authService.makeAuthenticatedRequest('GET', '/test')).rejects.toThrow();
            expect(authService.tokenData).toBeNull();
            expect(authService.tokenExpiryTime).toBeNull();
        });
    });

    describe('getTokenStatus', () => {
        it('should return correct status for valid token', () => {
            authService.tokenData = { access_token: 'test-token' };
            authService.tokenExpiryTime = Date.now() + 3600000;

            const status = authService.getTokenStatus();

            expect(status.hasToken).toBe(true);
            expect(status.isExpired).toBe(false);
            expect(status.expiryTime).toBeTruthy();
            expect(status.timeUntilExpiry).toBeGreaterThan(0);
        });

        it('should return correct status for no token', () => {
            const status = authService.getTokenStatus();

            expect(status.hasToken).toBe(false);
            expect(status.isExpired).toBe(true);
            expect(status.expiryTime).toBeNull();
            expect(status.timeUntilExpiry).toBeNull();
        });
    });

    describe('clearToken', () => {
        it('should clear all token data', () => {
            authService.tokenData = { access_token: 'test-token' };
            authService.tokenExpiryTime = Date.now() + 3600000;
            authService.refreshPromise = Promise.resolve();

            authService.clearToken();

            expect(authService.tokenData).toBeNull();
            expect(authService.tokenExpiryTime).toBeNull();
            expect(authService.refreshPromise).toBeNull();
        });
    });
});