/**
 * Tests for Holiday Caching System
 */

const HolidayCache = require('../src/holiday-cache');

describe('HolidayCache', () => {
    let holidayCache;
    let mockHolidayData;

    beforeEach(() => {
        holidayCache = new HolidayCache({
            ttl: 60, // 1 minute for testing
            checkPeriod: 10, // 10 seconds for testing
            maxKeys: 100
        });

        mockHolidayData = [
            {
                date: '2024-01-01',
                name: 'New Year\'s Day',
                countryCode: 'US',
                year: 2024,
                type: 'public',
                global: true
            },
            {
                date: '2024-07-04',
                name: 'Independence Day',
                countryCode: 'US',
                year: 2024,
                type: 'public',
                global: true
            }
        ];
    });

    afterEach(() => {
        holidayCache.clear();
    });

    describe('constructor', () => {
        it('should create instance with default configuration', () => {
            const cache = new HolidayCache();
            
            expect(cache.ttl).toBe(86400); // 24 hours
            expect(cache.checkPeriod).toBe(3600); // 1 hour
            expect(cache.maxKeys).toBe(1000);
            expect(cache.warmupCountries).toContain('US');
            expect(cache.warmupCountries).toContain('BR');
        });

        it('should accept custom configuration', () => {
            const customOptions = {
                ttl: 3600,
                checkPeriod: 600,
                maxKeys: 500,
                warmupCountries: ['US', 'CA']
            };
            
            const cache = new HolidayCache(customOptions);
            
            expect(cache.ttl).toBe(3600);
            expect(cache.checkPeriod).toBe(600);
            expect(cache.maxKeys).toBe(500);
            expect(cache.warmupCountries).toEqual(['US', 'CA']);
        });
    });

    describe('basic cache operations', () => {
        it('should store and retrieve holiday data', () => {
            const success = holidayCache.set('US', 2024, mockHolidayData);
            expect(success).toBe(true);

            const cached = holidayCache.get('US', 2024);
            expect(cached).not.toBeNull();
            expect(cached.data).toEqual(mockHolidayData);
            expect(cached.countryCode).toBe('US');
            expect(cached.year).toBe(2024);
        });

        it('should return null for non-existent data', () => {
            const cached = holidayCache.get('CA', 2024);
            expect(cached).toBeNull();
        });

        it('should check if data exists in cache', () => {
            expect(holidayCache.has('US', 2024)).toBe(false);
            
            holidayCache.set('US', 2024, mockHolidayData);
            expect(holidayCache.has('US', 2024)).toBe(true);
        });

        it('should delete cached data', () => {
            holidayCache.set('US', 2024, mockHolidayData);
            expect(holidayCache.has('US', 2024)).toBe(true);
            
            const deleted = holidayCache.delete('US', 2024);
            expect(deleted).toBe(true);
            expect(holidayCache.has('US', 2024)).toBe(false);
        });

        it('should return false when deleting non-existent data', () => {
            const deleted = holidayCache.delete('CA', 2024);
            expect(deleted).toBe(false);
        });
    });

    describe('cache key generation', () => {
        it('should generate consistent keys', () => {
            holidayCache.set('us', 2024, mockHolidayData); // lowercase
            
            const cached = holidayCache.get('US', 2024); // uppercase
            expect(cached).not.toBeNull();
            expect(cached.data).toEqual(mockHolidayData);
        });

        it('should handle different countries and years', () => {
            holidayCache.set('US', 2024, mockHolidayData);
            holidayCache.set('CA', 2024, mockHolidayData);
            holidayCache.set('US', 2025, mockHolidayData);
            
            expect(holidayCache.has('US', 2024)).toBe(true);
            expect(holidayCache.has('CA', 2024)).toBe(true);
            expect(holidayCache.has('US', 2025)).toBe(true);
            expect(holidayCache.has('CA', 2025)).toBe(false);
        });
    });

    describe('cache metadata', () => {
        it('should store and retrieve metadata', () => {
            holidayCache.set('US', 2024, mockHolidayData);
            
            const entry = holidayCache.getWithMetadata('US', 2024);
            expect(entry).not.toBeNull();
            expect(entry.data).toEqual(mockHolidayData);
            expect(entry.countryCode).toBe('US');
            expect(entry.year).toBe(2024);
            expect(entry.cachedAt).toBeDefined();
            expect(entry.source).toBe('api');
            expect(entry.key).toBe('holidays:US:2024');
            expect(entry.ttl).toBeGreaterThan(Date.now());
            expect(entry.age).toBeGreaterThanOrEqual(0);
        });

        it('should return null for non-existent metadata', () => {
            const entry = holidayCache.getWithMetadata('CA', 2024);
            expect(entry).toBeNull();
        });
    });

    describe('data validation', () => {
        it('should reject non-array holiday data', () => {
            const success1 = holidayCache.set('US', 2024, 'invalid data');
            const success2 = holidayCache.set('US', 2024, { invalid: 'data' });
            const success3 = holidayCache.set('US', 2024, null);
            
            expect(success1).toBe(false);
            expect(success2).toBe(false);
            expect(success3).toBe(false);
        });

        it('should accept empty array', () => {
            const success = holidayCache.set('US', 2024, []);
            expect(success).toBe(true);
            
            const cached = holidayCache.get('US', 2024);
            expect(cached.data).toEqual([]);
        });
    });

    describe('custom TTL', () => {
        it('should accept custom TTL for cache entries', () => {
            const customTTL = 30; // 30 seconds
            const success = holidayCache.set('US', 2024, mockHolidayData, customTTL);
            expect(success).toBe(true);
            
            const entry = holidayCache.getWithMetadata('US', 2024);
            expect(entry).not.toBeNull();
            
            // TTL should be approximately customTTL seconds from now
            const expectedExpiry = Date.now() + (customTTL * 1000);
            expect(entry.ttl).toBeLessThanOrEqual(expectedExpiry + 1000); // 1 second tolerance
            expect(entry.ttl).toBeGreaterThan(expectedExpiry - 1000);
        });
    });

    describe('cache statistics', () => {
        it('should track cache hits and misses', () => {
            // Initial stats
            let stats = holidayCache.getStats();
            expect(stats.hits).toBe(0);
            expect(stats.misses).toBe(0);
            expect(stats.sets).toBe(0);
            
            // Cache miss
            holidayCache.get('US', 2024);
            stats = holidayCache.getStats();
            expect(stats.misses).toBe(1);
            
            // Cache set
            holidayCache.set('US', 2024, mockHolidayData);
            stats = holidayCache.getStats();
            expect(stats.sets).toBe(1);
            
            // Cache hit
            holidayCache.get('US', 2024);
            stats = holidayCache.getStats();
            expect(stats.hits).toBe(1);
            
            // Hit rate calculation
            expect(stats.hitRate).toBe(0.5); // 1 hit out of 2 total requests
        });

        it('should track cache operations', () => {
            holidayCache.set('US', 2024, mockHolidayData);
            holidayCache.delete('US', 2024);
            
            const stats = holidayCache.getStats();
            expect(stats.sets).toBe(1);
            expect(stats.deletes).toBe(1);
        });
    });

    describe('cache warmup', () => {
        let mockHolidayFetcher;

        beforeEach(() => {
            mockHolidayFetcher = jest.fn();
        });

        it('should warm up cache for specified countries and years', async () => {
            mockHolidayFetcher.mockResolvedValue(mockHolidayData);
            
            const results = await holidayCache.warmup(
                mockHolidayFetcher,
                ['US', 'CA'],
                [2024]
            );
            
            expect(results.success).toBe(2);
            expect(results.failed).toBe(0);
            expect(results.skipped).toBe(0);
            expect(mockHolidayFetcher).toHaveBeenCalledTimes(2);
            expect(mockHolidayFetcher).toHaveBeenCalledWith('US', 2024);
            expect(mockHolidayFetcher).toHaveBeenCalledWith('CA', 2024);
            
            // Verify data is cached
            expect(holidayCache.has('US', 2024)).toBe(true);
            expect(holidayCache.has('CA', 2024)).toBe(true);
        });

        it('should skip already cached entries', async () => {
            // Pre-cache one entry
            holidayCache.set('US', 2024, mockHolidayData);
            
            mockHolidayFetcher.mockResolvedValue(mockHolidayData);
            
            const results = await holidayCache.warmup(
                mockHolidayFetcher,
                ['US', 'CA'],
                [2024]
            );
            
            expect(results.success).toBe(1); // Only CA
            expect(results.skipped).toBe(1); // US was skipped
            expect(mockHolidayFetcher).toHaveBeenCalledTimes(1);
            expect(mockHolidayFetcher).toHaveBeenCalledWith('CA', 2024);
        });

        it('should handle fetcher errors gracefully', async () => {
            mockHolidayFetcher
                .mockResolvedValueOnce(mockHolidayData) // US succeeds
                .mockRejectedValueOnce(new Error('API error')); // CA fails
            
            const results = await holidayCache.warmup(
                mockHolidayFetcher,
                ['US', 'CA'],
                [2024]
            );
            
            expect(results.success).toBe(1);
            expect(results.failed).toBe(1);
            expect(results.errors).toContain('Error warming up CA 2024: API error');
            
            // US should be cached, CA should not
            expect(holidayCache.has('US', 2024)).toBe(true);
            expect(holidayCache.has('CA', 2024)).toBe(false);
        });

        it('should handle invalid fetcher responses', async () => {
            mockHolidayFetcher
                .mockResolvedValueOnce(mockHolidayData) // US succeeds
                .mockResolvedValueOnce(null); // CA returns null
            
            const results = await holidayCache.warmup(
                mockHolidayFetcher,
                ['US', 'CA'],
                [2024]
            );
            
            expect(results.success).toBe(1);
            expect(results.failed).toBe(1);
            expect(results.errors).toContain('No holiday data for CA 2024');
        });

        it('should use default countries and years when not specified', async () => {
            mockHolidayFetcher.mockResolvedValue(mockHolidayData);
            
            const results = await holidayCache.warmup(mockHolidayFetcher);
            
            // Should call for default countries (14) and 2 years (current + next)
            expect(mockHolidayFetcher).toHaveBeenCalledTimes(28);
            expect(results.success).toBe(28);
        });
    });

    describe('cache refresh', () => {
        let mockHolidayFetcher;

        beforeEach(() => {
            mockHolidayFetcher = jest.fn();
        });

        it('should refresh entries expiring soon', async () => {
            // Cache entry with short TTL
            holidayCache.set('US', 2024, mockHolidayData, 1); // 1 second TTL
            
            // Wait for entry to be close to expiration
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const updatedData = [...mockHolidayData, { date: '2024-12-25', name: 'Christmas' }];
            mockHolidayFetcher.mockResolvedValue(updatedData);
            
            const results = await holidayCache.refresh(mockHolidayFetcher, 2); // 2 second threshold
            
            expect(results.refreshed).toBe(1);
            expect(mockHolidayFetcher).toHaveBeenCalledWith('US', 2024);
            
            // Verify updated data
            const cached = holidayCache.get('US', 2024);
            expect(cached.data).toEqual(updatedData);
        });

        it('should skip entries not expiring soon', async () => {
            // Cache entry with long TTL
            holidayCache.set('US', 2024, mockHolidayData, 3600); // 1 hour TTL
            
            mockHolidayFetcher.mockResolvedValue(mockHolidayData);
            
            const results = await holidayCache.refresh(mockHolidayFetcher, 60); // 1 minute threshold
            
            expect(results.skipped).toBe(1);
            expect(results.refreshed).toBe(0);
            expect(mockHolidayFetcher).not.toHaveBeenCalled();
        });

        it('should handle refresh errors gracefully', async () => {
            holidayCache.set('US', 2024, mockHolidayData, 1); // Short TTL
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            mockHolidayFetcher.mockRejectedValue(new Error('Refresh failed'));
            
            const results = await holidayCache.refresh(mockHolidayFetcher, 2);
            
            expect(results.failed).toBe(1);
            expect(results.errors).toContain('Error refreshing holidays:US:2024: Refresh failed');
        });
    });

    describe('cache clearing', () => {
        it('should clear all cached data', () => {
            holidayCache.set('US', 2024, mockHolidayData);
            holidayCache.set('CA', 2024, mockHolidayData);
            
            expect(holidayCache.has('US', 2024)).toBe(true);
            expect(holidayCache.has('CA', 2024)).toBe(true);
            
            const cleared = holidayCache.clear();
            expect(cleared).toBe(true);
            
            expect(holidayCache.has('US', 2024)).toBe(false);
            expect(holidayCache.has('CA', 2024)).toBe(false);
        });
    });

    describe('error handling', () => {
        it('should handle cache errors gracefully', () => {
            // Mock cache to throw errors
            const originalGet = holidayCache.cache.get;
            holidayCache.cache.get = jest.fn().mockImplementation(() => {
                throw new Error('Cache error');
            });
            
            const result = holidayCache.get('US', 2024);
            expect(result).toBeNull();
            
            const stats = holidayCache.getStats();
            expect(stats.errors).toBe(1);
            
            // Restore original method
            holidayCache.cache.get = originalGet;
        });
    });
});