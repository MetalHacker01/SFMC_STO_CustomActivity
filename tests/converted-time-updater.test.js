/**
 * Unit tests for ConvertedTime Updater
 */

const ConvertedTimeUpdater = require('../src/dataextension/converted-time-updater');
const DataExtensionAPI = require('../src/dataextension/data-extension-api');

// Mock the DataExtensionAPI
jest.mock('../src/dataextension/data-extension-api');

describe('ConvertedTimeUpdater', () => {
    let updater;
    let mockDataExtensionAPI;
    let mockLogger;
    let validConfig;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Mock logger
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        // Valid configuration
        validConfig = {
            maxBatchSize: 3,
            batchTimeout: 1000,
            enableBatching: true
        };

        // Mock DataExtensionAPI
        mockDataExtensionAPI = {
            updateConvertedTime: jest.fn(),
            batchUpdateConvertedTime: jest.fn(),
            validateDataExtension: jest.fn(),
            getAuthStatus: jest.fn(),
            clearAuthToken: jest.fn()
        };

        DataExtensionAPI.mockImplementation(() => mockDataExtensionAPI);

        updater = new ConvertedTimeUpdater(validConfig, mockLogger);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('constructor', () => {
        it('should initialize with configuration and create DataExtensionAPI', () => {
            expect(DataExtensionAPI).toHaveBeenCalledWith(validConfig, mockLogger);
            expect(updater.batchConfig.maxBatchSize).toBe(3);
            expect(updater.batchConfig.batchTimeout).toBe(1000);
            expect(updater.batchConfig.enableBatching).toBe(true);
        });

        it('should use default configuration when not provided', () => {
            const defaultUpdater = new ConvertedTimeUpdater({}, mockLogger);
            expect(defaultUpdater.batchConfig.maxBatchSize).toBe(50);
            expect(defaultUpdater.batchConfig.batchTimeout).toBe(5000);
            expect(defaultUpdater.batchConfig.enableBatching).toBe(true);
        });
    });

    describe('updateConvertedTime', () => {
        const subscriberKey = 'test-subscriber';
        const futureTime = new Date(Date.now() + 3600000); // 1 hour from now
        const dataExtensionKey = 'test-de-key';

        it('should successfully update ConvertedTime for a single contact', async () => {
            const mockResult = { success: true, subscriberKey, attempts: 1 };
            mockDataExtensionAPI.updateConvertedTime.mockResolvedValueOnce(mockResult);

            const result = await updater.updateConvertedTime(subscriberKey, futureTime, dataExtensionKey);

            expect(result).toEqual(mockResult);
            expect(mockDataExtensionAPI.updateConvertedTime).toHaveBeenCalledWith(
                subscriberKey,
                futureTime,
                dataExtensionKey
            );
            expect(mockLogger.info).toHaveBeenCalledWith('ConvertedTime updated successfully', expect.any(Object));
        });

        it('should validate required parameters', async () => {
            await expect(updater.updateConvertedTime('', futureTime, dataExtensionKey))
                .rejects.toThrow('SubscriberKey is required');

            await expect(updater.updateConvertedTime(subscriberKey, null, dataExtensionKey))
                .rejects.toThrow('ConvertedTime must be a valid Date object');

            await expect(updater.updateConvertedTime(subscriberKey, futureTime, ''))
                .rejects.toThrow('DataExtensionKey is required');
        });

        it('should warn when ConvertedTime is not in the future', async () => {
            const pastTime = new Date(Date.now() - 3600000); // 1 hour ago
            const mockResult = { success: true, subscriberKey, attempts: 1 };
            mockDataExtensionAPI.updateConvertedTime.mockResolvedValueOnce(mockResult);

            await updater.updateConvertedTime(subscriberKey, pastTime, dataExtensionKey);

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'ConvertedTime is not in the future, this may cause issues with Wait By Attribute',
                expect.any(Object)
            );
        });

        it('should handle update failures gracefully', async () => {
            const mockResult = { success: false, subscriberKey, error: 'API error', attempts: 3 };
            mockDataExtensionAPI.updateConvertedTime.mockResolvedValueOnce(mockResult);

            const result = await updater.updateConvertedTime(subscriberKey, futureTime, dataExtensionKey);

            expect(result).toEqual(mockResult);
            expect(mockLogger.error).toHaveBeenCalledWith('ConvertedTime update failed', expect.any(Object));
        });

        it('should handle exceptions during update', async () => {
            const error = new Error('Network error');
            mockDataExtensionAPI.updateConvertedTime.mockRejectedValueOnce(error);

            const result = await updater.updateConvertedTime(subscriberKey, futureTime, dataExtensionKey);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Network error');
            expect(mockLogger.error).toHaveBeenCalledWith('ConvertedTime update error', expect.any(Object));
        });
    });

    describe('queueBatchUpdate', () => {
        const subscriberKey = 'test-subscriber';
        const futureTime = new Date(Date.now() + 3600000);
        const dataExtensionKey = 'test-de-key';

        it('should add contact to batch queue', async () => {
            await updater.queueBatchUpdate(subscriberKey, futureTime, dataExtensionKey);

            const stats = updater.getBatchStatistics();
            expect(stats.totalPendingBatches).toBe(1);
            expect(stats.totalPendingContacts).toBe(1);
            expect(stats.batchDetails[0].batchKey).toBe(dataExtensionKey);
        });

        it('should process batch when it reaches max size', async () => {
            const mockResult = { success: true, contactCount: 3, attempts: 1 };
            mockDataExtensionAPI.batchUpdateConvertedTime.mockResolvedValueOnce(mockResult);

            // Add contacts to reach batch size (3)
            await updater.queueBatchUpdate('sub1', futureTime, dataExtensionKey);
            await updater.queueBatchUpdate('sub2', futureTime, dataExtensionKey);
            await updater.queueBatchUpdate('sub3', futureTime, dataExtensionKey);

            // Batch should be processed automatically
            expect(mockDataExtensionAPI.batchUpdateConvertedTime).toHaveBeenCalledWith(
                expect.arrayContaining([
                    { subscriberKey: 'sub1', convertedTime: futureTime },
                    { subscriberKey: 'sub2', convertedTime: futureTime },
                    { subscriberKey: 'sub3', convertedTime: futureTime }
                ]),
                dataExtensionKey
            );

            // Batch should be cleared
            const stats = updater.getBatchStatistics();
            expect(stats.totalPendingBatches).toBe(0);
        });

        it('should schedule batch processing with timer', async () => {
            await updater.queueBatchUpdate(subscriberKey, futureTime, dataExtensionKey);

            // Timer should be set
            expect(updater.batchTimer).toBeTruthy();

            // Advance timer
            const mockResult = { success: true, contactCount: 1, attempts: 1 };
            mockDataExtensionAPI.batchUpdateConvertedTime.mockResolvedValueOnce(mockResult);

            jest.advanceTimersByTime(1000);
            await Promise.resolve(); // Allow async operations to complete

            expect(mockDataExtensionAPI.batchUpdateConvertedTime).toHaveBeenCalled();
        });

        it('should process immediately when batching is disabled', async () => {
            const noBatchConfig = { ...validConfig, enableBatching: false };
            const noBatchUpdater = new ConvertedTimeUpdater(noBatchConfig, mockLogger);

            const mockResult = { success: true, subscriberKey, attempts: 1 };
            mockDataExtensionAPI.updateConvertedTime.mockResolvedValueOnce(mockResult);

            const result = await noBatchUpdater.queueBatchUpdate(subscriberKey, futureTime, dataExtensionKey);

            expect(result).toEqual(mockResult);
            expect(mockDataExtensionAPI.updateConvertedTime).toHaveBeenCalled();
        });

        it('should validate required parameters', async () => {
            await expect(updater.queueBatchUpdate('', futureTime, dataExtensionKey))
                .rejects.toThrow('All parameters are required');

            await expect(updater.queueBatchUpdate(subscriberKey, null, dataExtensionKey))
                .rejects.toThrow('All parameters are required');

            await expect(updater.queueBatchUpdate(subscriberKey, futureTime, ''))
                .rejects.toThrow('All parameters are required');
        });
    });

    describe('flushAllBatches', () => {
        it('should process all pending batches', async () => {
            const futureTime = new Date(Date.now() + 3600000);
            const mockResult = { success: true, contactCount: 2, attempts: 1 };
            mockDataExtensionAPI.batchUpdateConvertedTime.mockResolvedValue(mockResult);

            // Add contacts to different data extensions
            await updater.queueBatchUpdate('sub1', futureTime, 'de1');
            await updater.queueBatchUpdate('sub2', futureTime, 'de1');
            await updater.queueBatchUpdate('sub3', futureTime, 'de2');

            const results = await updater.flushAllBatches();

            expect(results).toHaveLength(2);
            expect(mockDataExtensionAPI.batchUpdateConvertedTime).toHaveBeenCalledTimes(2);

            // All batches should be cleared
            const stats = updater.getBatchStatistics();
            expect(stats.totalPendingBatches).toBe(0);
        });

        it('should clear batch timer', async () => {
            const futureTime = new Date(Date.now() + 3600000);
            await updater.queueBatchUpdate('sub1', futureTime, 'de1');

            expect(updater.batchTimer).toBeTruthy();

            await updater.flushAllBatches();

            expect(updater.batchTimer).toBeNull();
        });
    });

    describe('validateDataExtension', () => {
        const dataExtensionKey = 'test-de-key';

        it('should successfully validate data extension', async () => {
            const mockValidation = {
                exists: true,
                hasRequiredFields: true,
                missingFields: [],
                totalRows: 100
            };
            mockDataExtensionAPI.validateDataExtension.mockResolvedValueOnce(mockValidation);

            const result = await updater.validateDataExtension(dataExtensionKey);

            expect(result).toEqual(mockValidation);
            expect(mockDataExtensionAPI.validateDataExtension).toHaveBeenCalledWith(dataExtensionKey);
            expect(mockLogger.info).toHaveBeenCalledWith('Data extension validation successful', expect.any(Object));
        });

        it('should handle non-existent data extension', async () => {
            const mockValidation = {
                exists: false,
                hasRequiredFields: false,
                error: 'Data extension not found'
            };
            mockDataExtensionAPI.validateDataExtension.mockResolvedValueOnce(mockValidation);

            const result = await updater.validateDataExtension(dataExtensionKey);

            expect(result).toEqual(mockValidation);
            expect(mockLogger.error).toHaveBeenCalledWith('Data extension does not exist', expect.any(Object));
        });

        it('should handle missing required fields', async () => {
            const mockValidation = {
                exists: true,
                hasRequiredFields: false,
                missingFields: ['ConvertedTime']
            };
            mockDataExtensionAPI.validateDataExtension.mockResolvedValueOnce(mockValidation);

            const result = await updater.validateDataExtension(dataExtensionKey);

            expect(result).toEqual(mockValidation);
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Data extension missing required fields for ConvertedTime updates',
                expect.any(Object)
            );
        });

        it('should handle validation errors', async () => {
            const error = new Error('Validation failed');
            mockDataExtensionAPI.validateDataExtension.mockRejectedValueOnce(error);

            await expect(updater.validateDataExtension(dataExtensionKey)).rejects.toThrow('Validation failed');
            expect(mockLogger.error).toHaveBeenCalledWith('Data extension validation error', expect.any(Object));
        });
    });

    describe('getBatchStatistics', () => {
        it('should return correct statistics', async () => {
            const futureTime = new Date(Date.now() + 3600000);

            // Add some contacts to batches
            await updater.queueBatchUpdate('sub1', futureTime, 'de1');
            await updater.queueBatchUpdate('sub2', futureTime, 'de1');
            await updater.queueBatchUpdate('sub3', futureTime, 'de2');

            const stats = updater.getBatchStatistics();

            expect(stats.totalPendingBatches).toBe(2);
            expect(stats.totalPendingContacts).toBe(3);
            expect(stats.batchingEnabled).toBe(true);
            expect(stats.maxBatchSize).toBe(3);
            expect(stats.batchTimeout).toBe(1000);
            expect(stats.batchDetails).toHaveLength(2);
        });

        it('should return empty statistics when no batches', () => {
            const stats = updater.getBatchStatistics();

            expect(stats.totalPendingBatches).toBe(0);
            expect(stats.totalPendingContacts).toBe(0);
            expect(stats.batchDetails).toHaveLength(0);
        });
    });

    describe('utility methods', () => {
        it('should get auth status from DataExtensionAPI', () => {
            const mockStatus = { hasToken: true, isExpired: false };
            mockDataExtensionAPI.getAuthStatus.mockReturnValueOnce(mockStatus);

            const status = updater.getAuthStatus();

            expect(status).toEqual(mockStatus);
            expect(mockDataExtensionAPI.getAuthStatus).toHaveBeenCalled();
        });

        it('should clear auth token', () => {
            updater.clearAuthToken();

            expect(mockDataExtensionAPI.clearAuthToken).toHaveBeenCalled();
        });

        it('should cleanup resources', async () => {
            const futureTime = new Date(Date.now() + 3600000);
            await updater.queueBatchUpdate('sub1', futureTime, 'de1');

            expect(updater.batchTimer).toBeTruthy();

            const mockResult = { success: true, contactCount: 1, attempts: 1 };
            mockDataExtensionAPI.batchUpdateConvertedTime.mockResolvedValueOnce(mockResult);

            await updater.cleanup();

            expect(updater.batchTimer).toBeNull();
            expect(mockDataExtensionAPI.batchUpdateConvertedTime).toHaveBeenCalled();
        });
    });
});