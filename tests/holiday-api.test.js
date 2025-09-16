/**
 * Tests for Holiday API Integration
 */

const HolidayAPI = require('../src/holiday-api');
const axios = require('axios');

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

describe('HolidayAPI', () => {
    let holidayAPI;
    let mockAxiosInstance;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        
        // Create mock axios instance
        mockAxiosInstance = {
            get: jest.fn(),
            interceptors: {
                response: {
                    use: jest.fn()
                }
            }
        };
        
        mockedAxios.create.mockReturnValue(mockAxiosInstance);
        
        holidayAPI = new HolidayAPI();
    });

    describe('constructor', () => {
        it('should create instance with default configuration', () => {
            expect(mockedAxios.create).toHaveBeenCalledWith({
                baseURL: 'https://date.nager.at/api/v3',
                timeout: 5000,
                headers: {
                    'User-Agent': 'SFMC-STO-Activity/1.0.0',
                    'Accept': 'application/json'
                }
            });
        });

        it('should accept custom configuration', () => {
            const customOptions = {
                baseURL: 'https://custom-api.com',
                timeout: 10000,
                retryAttempts: 5
            };
            
            new HolidayAPI(customOptions);
            
            expect(mockedAxios.create).toHaveBeenCalledWith({
                baseURL: 'https://custom-api.com',
                timeout: 10000,
                headers: {
                    'User-Agent': 'SFMC-STO-Activity/1.0.0',
                    'Accept': 'application/json'
                }
            });
        });
    });

    describe('getHolidays', () => {
        const mockHolidayData = [
            {
                date: '2024-01-01',
                name: 'New Year\'s Day',
                localName: 'New Year\'s Day',
                global: true,
                types: ['Public']
            },
            {
                date: '2024-07-04',
                name: 'Independence Day',
                localName: 'Independence Day',
                global: true,
                types: ['Public']
            }
        ];

        it('should fetch holidays successfully', async () => {
            mockAxiosInstance.get.mockResolvedValue({
                data: mockHolidayData
            });

            const result = await holidayAPI.getHolidays('US', 2024);

            expect(mockAxiosInstance.get).toHaveBeenCalledWith('/PublicHolidays/2024/US');
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                date: '2024-01-01',
                name: 'New Year\'s Day',
                countryCode: 'US',
                year: 2024,
                type: 'public',
                global: true,
                launchYear: null
            });
        });

        it('should validate required parameters', async () => {
            await expect(holidayAPI.getHolidays()).rejects.toThrow('Country code and year are required');
            await expect(holidayAPI.getHolidays('US')).rejects.toThrow('Country code and year are required');
            await expect(holidayAPI.getHolidays(null, 2024)).rejects.toThrow('Country code and year are required');
        });

        it('should validate country code format', async () => {
            await expect(holidayAPI.getHolidays('USA', 2024)).rejects.toThrow('Invalid country code format');
            await expect(holidayAPI.getHolidays('us', 2024)).rejects.toThrow('Invalid country code format');
            await expect(holidayAPI.getHolidays('U', 2024)).rejects.toThrow('Invalid country code format');
        });

        it('should validate year range', async () => {
            const currentYear = new Date().getFullYear();
            
            await expect(holidayAPI.getHolidays('US', currentYear - 2)).rejects.toThrow('Year must be between');
            await expect(holidayAPI.getHolidays('US', currentYear + 3)).rejects.toThrow('Year must be between');
        });

        it('should handle API errors gracefully', async () => {
            const error = new Error('Network error');
            error.request = true;
            mockAxiosInstance.get.mockRejectedValue(error);

            await expect(holidayAPI.getHolidays('US', 2024)).rejects.toThrow('Unable to connect to holiday API');
        });

        it('should handle 404 errors for unsupported countries', async () => {
            const error = new Error('Not found');
            error.response = {
                status: 404,
                statusText: 'Not Found',
                data: { message: 'Country not found' }
            };
            mockAxiosInstance.get.mockRejectedValue(error);

            await expect(holidayAPI.getHolidays('XX', 2024)).rejects.toThrow('Country not supported');
        });

        it('should handle rate limiting errors', async () => {
            const error = new Error('Rate limited');
            error.response = {
                status: 429,
                statusText: 'Too Many Requests'
            };
            mockAxiosInstance.get.mockRejectedValue(error);

            await expect(holidayAPI.getHolidays('US', 2024)).rejects.toThrow('API rate limit exceeded');
        });

        it('should retry on server errors', async () => {
            const serverError = new Error('Server error');
            serverError.response = {
                status: 500,
                statusText: 'Internal Server Error'
            };

            // Mock to fail twice then succeed
            mockAxiosInstance.get
                .mockRejectedValueOnce(serverError)
                .mockRejectedValueOnce(serverError)
                .mockResolvedValue({ data: mockHolidayData });

            const result = await holidayAPI.getHolidays('US', 2024);

            expect(mockAxiosInstance.get).toHaveBeenCalledTimes(3);
            expect(result).toHaveLength(2);
        });

        it('should fail after max retry attempts', async () => {
            const serverError = new Error('Server error');
            serverError.response = {
                status: 500,
                statusText: 'Internal Server Error'
            };

            mockAxiosInstance.get.mockRejectedValue(serverError);

            await expect(holidayAPI.getHolidays('US', 2024)).rejects.toThrow('Holiday API server error');
            expect(mockAxiosInstance.get).toHaveBeenCalledTimes(3); // Initial + 2 retries
        });
    });

    describe('getSupportedCountries', () => {
        const mockCountriesData = [
            { countryCode: 'US', name: 'United States' },
            { countryCode: 'CA', name: 'Canada' },
            { countryCode: 'GB', name: 'United Kingdom' }
        ];

        it('should fetch supported countries successfully', async () => {
            mockAxiosInstance.get.mockResolvedValue({
                data: mockCountriesData
            });

            const result = await holidayAPI.getSupportedCountries();

            expect(mockAxiosInstance.get).toHaveBeenCalledWith('/AvailableCountries');
            expect(result).toEqual([
                { countryCode: 'US', name: 'United States' },
                { countryCode: 'CA', name: 'Canada' },
                { countryCode: 'GB', name: 'United Kingdom' }
            ]);
        });

        it('should return fallback countries on API failure', async () => {
            mockAxiosInstance.get.mockRejectedValue(new Error('API unavailable'));

            const result = await holidayAPI.getSupportedCountries();

            expect(result).toContainEqual({ countryCode: 'US', name: 'United States' });
            expect(result).toContainEqual({ countryCode: 'BR', name: 'Brazil' });
            expect(result.length).toBeGreaterThan(10);
        });
    });

    describe('isAPIAvailable', () => {
        it('should return true when API is available', async () => {
            mockAxiosInstance.get.mockResolvedValue({ status: 200 });

            const result = await holidayAPI.isAPIAvailable();

            expect(result).toBe(true);
            expect(mockAxiosInstance.get).toHaveBeenCalledWith('/AvailableCountries', {
                timeout: 3000
            });
        });

        it('should return false when API is unavailable', async () => {
            mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

            const result = await holidayAPI.isAPIAvailable();

            expect(result).toBe(false);
        });

        it('should return false for non-200 status codes', async () => {
            mockAxiosInstance.get.mockResolvedValue({ status: 500 });

            const result = await holidayAPI.isAPIAvailable();

            expect(result).toBe(false);
        });
    });

    describe('error handling', () => {
        it('should not retry on client errors (4xx)', async () => {
            const clientError = new Error('Bad request');
            clientError.response = {
                status: 400,
                statusText: 'Bad Request'
            };

            mockAxiosInstance.get.mockRejectedValue(clientError);

            await expect(holidayAPI.getHolidays('US', 2024)).rejects.toThrow();
            expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1); // No retries
        });

        it('should handle empty response data', async () => {
            mockAxiosInstance.get.mockResolvedValue({ data: null });

            const result = await holidayAPI.getHolidays('US', 2024);

            expect(result).toEqual([]);
        });

        it('should handle malformed holiday data', async () => {
            const malformedData = [
                { date: '2024-01-01' }, // Missing name
                { name: 'Holiday' }, // Missing date
                null, // Null entry
                { date: '2024-07-04', name: 'Independence Day', types: ['Public'] }
            ];

            mockAxiosInstance.get.mockResolvedValue({ data: malformedData });

            const result = await holidayAPI.getHolidays('US', 2024);

            expect(result).toHaveLength(3); // Null entry filtered out
            expect(result[0].name).toBeNull();
            expect(result[1].date).toBeNull();
            expect(result[2].name).toBe('Independence Day');
        });
    });
});