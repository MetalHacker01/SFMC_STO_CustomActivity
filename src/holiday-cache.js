/**
 * Holiday Caching System
 * Provides in-memory caching for holiday data with expiration and refresh logic
 * Includes cache warming for supported countries
 */

const NodeCache = require('node-cache');

class HolidayCache {
    constructor(options = {}) {
        // Cache configuration
        this.ttl = options.ttl || 86400; // 24 hours default TTL
        this.checkPeriod = options.checkPeriod || 3600; // Check for expired keys every hour
        this.maxKeys = options.maxKeys || 1000; // Maximum number of cached keys
        
        // Create cache instance
        this.cache = new NodeCache({
            stdTTL: this.ttl,
            checkperiod: this.checkPeriod,
            maxKeys: this.maxKeys,
            useClones: false // For better performance, we'll handle cloning manually if needed
        });
        
        // Cache statistics
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            errors: 0
        };
        
        // Bind event listeners for cache monitoring
        this._bindEventListeners();
        
        // Countries to warm cache for
        this.warmupCountries = options.warmupCountries || [
            'US', 'CA', 'GB', 'AU', 'DE', 'FR', 'IT', 'ES', 'BR', 'IN', 'JP', 'CN', 'RU', 'ZA'
        ];
    }

    /**
     * Get holiday data from cache
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @param {number} year - Year to get holidays for
     * @returns {Array|null} Cached holiday data or null if not found
     */
    get(countryCode, year) {
        const key = this._generateKey(countryCode, year);
        
        try {
            const data = this.cache.get(key);
            
            if (data !== undefined) {
                this.stats.hits++;
                console.debug(`Cache HIT for ${key}`);
                return data;
            } else {
                this.stats.misses++;
                console.debug(`Cache MISS for ${key}`);
                return null;
            }
        } catch (error) {
            this.stats.errors++;
            console.error(`Cache GET error for ${key}:`, error.message);
            return null;
        }
    }

    /**
     * Store holiday data in cache
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @param {number} year - Year the holidays are for
     * @param {Array} holidays - Holiday data to cache
     * @param {number} customTTL - Custom TTL for this entry (optional)
     * @returns {boolean} True if successfully cached
     */
    set(countryCode, year, holidays, customTTL = null) {
        const key = this._generateKey(countryCode, year);
        
        try {
            // Validate input
            if (!Array.isArray(holidays)) {
                console.warn(`Invalid holiday data for ${key}: expected array`);
                return false;
            }
            
            // Create cache entry with metadata
            const cacheEntry = {
                data: holidays,
                countryCode: countryCode,
                year: year,
                cachedAt: new Date().toISOString(),
                source: 'api'
            };
            
            const ttl = customTTL || this.ttl;
            const success = this.cache.set(key, cacheEntry, ttl);
            
            if (success) {
                this.stats.sets++;
                console.debug(`Cache SET for ${key} (TTL: ${ttl}s, entries: ${holidays.length})`);
            } else {
                this.stats.errors++;
                console.warn(`Failed to cache data for ${key}`);
            }
            
            return success;
        } catch (error) {
            this.stats.errors++;
            console.error(`Cache SET error for ${key}:`, error.message);
            return false;
        }
    }

    /**
     * Remove holiday data from cache
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @param {number} year - Year to remove
     * @returns {boolean} True if successfully removed
     */
    delete(countryCode, year) {
        const key = this._generateKey(countryCode, year);
        
        try {
            const deleted = this.cache.del(key);
            
            if (deleted > 0) {
                this.stats.deletes++;
                console.debug(`Cache DELETE for ${key}`);
                return true;
            }
            
            return false;
        } catch (error) {
            this.stats.errors++;
            console.error(`Cache DELETE error for ${key}:`, error.message);
            return false;
        }
    }

    /**
     * Check if holiday data exists in cache and is not expired
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @param {number} year - Year to check
     * @returns {boolean} True if data exists and is valid
     */
    has(countryCode, year) {
        const key = this._generateKey(countryCode, year);
        return this.cache.has(key);
    }

    /**
     * Get cache entry with metadata
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @param {number} year - Year to get
     * @returns {Object|null} Cache entry with metadata or null
     */
    getWithMetadata(countryCode, year) {
        const key = this._generateKey(countryCode, year);
        
        try {
            const entry = this.cache.get(key);
            
            if (entry !== undefined) {
                this.stats.hits++;
                return {
                    ...entry,
                    key: key,
                    ttl: this.cache.getTtl(key),
                    age: Date.now() - new Date(entry.cachedAt).getTime()
                };
            } else {
                this.stats.misses++;
                return null;
            }
        } catch (error) {
            this.stats.errors++;
            console.error(`Cache GET metadata error for ${key}:`, error.message);
            return null;
        }
    }

    /**
     * Warm up cache with holiday data for supported countries
     * @param {Function} holidayFetcher - Function to fetch holiday data
     * @param {Array} countries - Countries to warm up (optional)
     * @param {Array} years - Years to warm up (optional)
     * @returns {Promise<Object>} Warmup results
     */
    async warmup(holidayFetcher, countries = null, years = null) {
        const targetCountries = countries || this.warmupCountries;
        const currentYear = new Date().getFullYear();
        const targetYears = years || [currentYear, currentYear + 1];
        
        const results = {
            success: 0,
            failed: 0,
            skipped: 0,
            errors: []
        };
        
        console.info(`Starting cache warmup for ${targetCountries.length} countries and ${targetYears.length} years...`);
        
        for (const countryCode of targetCountries) {
            for (const year of targetYears) {
                try {
                    // Skip if already cached and not expired
                    if (this.has(countryCode, year)) {
                        results.skipped++;
                        console.debug(`Skipping ${countryCode} ${year} - already cached`);
                        continue;
                    }
                    
                    // Fetch holiday data
                    const holidays = await holidayFetcher(countryCode, year);
                    
                    if (holidays && Array.isArray(holidays)) {
                        // Cache the data
                        const cached = this.set(countryCode, year, holidays);
                        
                        if (cached) {
                            results.success++;
                            console.debug(`Warmed up ${countryCode} ${year} - ${holidays.length} holidays`);
                        } else {
                            results.failed++;
                            results.errors.push(`Failed to cache ${countryCode} ${year}`);
                        }
                    } else {
                        results.failed++;
                        results.errors.push(`No holiday data for ${countryCode} ${year}`);
                    }
                    
                    // Small delay to avoid overwhelming the API
                    await this._sleep(100);
                    
                } catch (error) {
                    results.failed++;
                    results.errors.push(`Error warming up ${countryCode} ${year}: ${error.message}`);
                    console.warn(`Cache warmup error for ${countryCode} ${year}:`, error.message);
                }
            }
        }
        
        console.info(`Cache warmup completed: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`);
        return results;
    }

    /**
     * Refresh expired or soon-to-expire cache entries
     * @param {Function} holidayFetcher - Function to fetch holiday data
     * @param {number} refreshThreshold - Refresh entries expiring within this many seconds (default: 1 hour)
     * @returns {Promise<Object>} Refresh results
     */
    async refresh(holidayFetcher, refreshThreshold = 3600) {
        const keys = this.cache.keys();
        const results = {
            refreshed: 0,
            failed: 0,
            skipped: 0,
            errors: []
        };
        
        console.info(`Starting cache refresh for ${keys.length} entries...`);
        
        for (const key of keys) {
            try {
                const ttl = this.cache.getTtl(key);
                const timeUntilExpiry = ttl - Date.now();
                
                // Skip if not expiring soon
                if (timeUntilExpiry > refreshThreshold * 1000) {
                    results.skipped++;
                    continue;
                }
                
                // Parse key to get country and year
                const { countryCode, year } = this._parseKey(key);
                
                if (!countryCode || !year) {
                    results.failed++;
                    results.errors.push(`Invalid key format: ${key}`);
                    continue;
                }
                
                // Fetch fresh data
                const holidays = await holidayFetcher(countryCode, year);
                
                if (holidays && Array.isArray(holidays)) {
                    const cached = this.set(countryCode, year, holidays);
                    
                    if (cached) {
                        results.refreshed++;
                        console.debug(`Refreshed ${key} - ${holidays.length} holidays`);
                    } else {
                        results.failed++;
                        results.errors.push(`Failed to refresh cache for ${key}`);
                    }
                } else {
                    results.failed++;
                    results.errors.push(`No holiday data for refresh: ${key}`);
                }
                
                // Small delay to avoid overwhelming the API
                await this._sleep(100);
                
            } catch (error) {
                results.failed++;
                results.errors.push(`Error refreshing ${key}: ${error.message}`);
                console.warn(`Cache refresh error for ${key}:`, error.message);
            }
        }
        
        console.info(`Cache refresh completed: ${results.refreshed} refreshed, ${results.failed} failed, ${results.skipped} skipped`);
        return results;
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics and info
     */
    getStats() {
        return {
            ...this.stats,
            keys: this.cache.keys().length,
            size: this.cache.getStats(),
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
        };
    }

    /**
     * Clear all cached data
     * @returns {boolean} True if successfully cleared
     */
    clear() {
        try {
            this.cache.flushAll();
            console.info('Cache cleared successfully');
            return true;
        } catch (error) {
            console.error('Error clearing cache:', error.message);
            return false;
        }
    }

    /**
     * Generate cache key from country code and year
     * @private
     */
    _generateKey(countryCode, year) {
        return `holidays:${countryCode.toUpperCase()}:${year}`;
    }

    /**
     * Parse cache key to extract country code and year
     * @private
     */
    _parseKey(key) {
        const match = key.match(/^holidays:([A-Z]{2}):(\d{4})$/);
        
        if (match) {
            return {
                countryCode: match[1],
                year: parseInt(match[2], 10)
            };
        }
        
        return { countryCode: null, year: null };
    }

    /**
     * Bind event listeners for cache monitoring
     * @private
     */
    _bindEventListeners() {
        this.cache.on('set', (key, value) => {
            console.debug(`Cache event: SET ${key}`);
        });
        
        this.cache.on('del', (key, value) => {
            console.debug(`Cache event: DELETE ${key}`);
        });
        
        this.cache.on('expired', (key, value) => {
            console.debug(`Cache event: EXPIRED ${key}`);
        });
        
        this.cache.on('flush', () => {
            console.debug('Cache event: FLUSH');
        });
    }

    /**
     * Sleep utility for delays
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = HolidayCache;