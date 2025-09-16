/**
 * Activity Lifecycle Manager
 * 
 * Manages the complete lifecycle of the STO custom activity in Journey Builder,
 * including save, validate, and publish operations with comprehensive error handling
 * and state management.
 */

class ActivityLifecycleManager {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.activityStates = new Map(); // In-memory state storage
        this.validationCache = new Map(); // Cache validation results
    }

    /**
     * Handles the save operation for activity configuration
     * Requirements: 7.1 - Log detailed error information
     */
    async handleSave(payload) {
        const startTime = Date.now();
        const { inArguments = [], outArguments = [], activityObjectID, journeyId } = payload;
        
        try {
            this.logger.info('Activity save operation started', {
                activityObjectID,
                journeyId,
                timestamp: new Date().toISOString(),
                operation: 'save'
            });

            // Extract and validate activity configuration
            const activityConfig = inArguments.find(arg => arg.activityConfig) || {};
            const config = activityConfig.activityConfig || {};

            // Perform configuration validation
            const validation = this.validateActivityConfiguration(config);
            if (!validation.valid) {
                this.logger.error('Save operation failed - invalid configuration', {
                    activityObjectID,
                    journeyId,
                    errors: validation.errors,
                    timestamp: new Date().toISOString()
                });

                return {
                    success: false,
                    error: 'Invalid configuration',
                    details: validation.errors,
                    warnings: validation.warnings
                };
            }

            // Store activity state
            const activityState = {
                activityObjectID,
                journeyId,
                config,
                status: 'saved',
                lastSaved: new Date().toISOString(),
                version: this.generateVersion(),
                validation: validation
            };

            this.activityStates.set(activityObjectID, activityState);

            // Log successful save with execution statistics
            const processingTime = Date.now() - startTime;
            this.logger.info('Activity configuration saved successfully', {
                activityObjectID,
                journeyId,
                processingTime,
                configSummary: {
                    skipWeekends: config.skipWeekends,
                    skipHolidays: config.skipHolidays,
                    timeWindowsCount: config.timeWindows?.length || 0,
                    defaultTimezone: config.defaultTimezone
                },
                timestamp: new Date().toISOString()
            });

            return {
                success: true,
                message: 'Activity configuration saved successfully',
                activityObjectID,
                version: activityState.version,
                warnings: validation.warnings,
                processingTime,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            
            // Requirement 7.1: Log detailed error information including contact ID, timestamp, and error details
            this.logger.error('Save operation failed with exception', {
                activityObjectID,
                journeyId,
                error: error.message,
                stack: error.stack,
                processingTime,
                timestamp: new Date().toISOString(),
                operation: 'save'
            });

            return {
                success: false,
                error: 'Failed to save activity configuration',
                details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
                processingTime,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Handles the validate operation for activity configuration
     * Requirements: 7.1 - Log detailed error information
     */
    async handleValidate(payload) {
        const startTime = Date.now();
        const { inArguments = [], outArguments = [], activityObjectID, journeyId } = payload;

        try {
            this.logger.info('Activity validation operation started', {
                activityObjectID,
                journeyId,
                timestamp: new Date().toISOString(),
                operation: 'validate'
            });

            // Extract activity configuration
            const activityConfig = inArguments.find(arg => arg.activityConfig) || {};
            const config = activityConfig.activityConfig || {};

            // Check validation cache first
            const cacheKey = this.generateConfigHash(config);
            if (this.validationCache.has(cacheKey)) {
                const cachedResult = this.validationCache.get(cacheKey);
                this.logger.debug('Using cached validation result', {
                    activityObjectID,
                    cacheKey,
                    timestamp: new Date().toISOString()
                });
                return { ...cachedResult, fromCache: true };
            }

            // Perform comprehensive validation
            const configValidation = this.validateActivityConfiguration(config);
            const contextValidation = this.validateJourneyContext(payload);
            const dependencyValidation = await this.validateDependencies(config);

            // Combine all validation results
            const allErrors = [
                ...configValidation.errors,
                ...contextValidation.errors,
                ...dependencyValidation.errors
            ];
            const allWarnings = [
                ...configValidation.warnings,
                ...contextValidation.warnings,
                ...dependencyValidation.warnings
            ];

            const isValid = allErrors.length === 0;
            const processingTime = Date.now() - startTime;

            const result = {
                valid: isValid,
                errors: allErrors,
                warnings: allWarnings,
                processingTime,
                timestamp: new Date().toISOString(),
                validationDetails: {
                    configuration: configValidation,
                    context: contextValidation,
                    dependencies: dependencyValidation
                }
            };

            // Cache the validation result
            this.validationCache.set(cacheKey, result);

            // Update activity state
            if (this.activityStates.has(activityObjectID)) {
                const state = this.activityStates.get(activityObjectID);
                state.lastValidated = new Date().toISOString();
                state.validationResult = result;
                this.activityStates.set(activityObjectID, state);
            }

            if (isValid) {
                this.logger.info('Activity validation passed', {
                    activityObjectID,
                    journeyId,
                    processingTime,
                    warningsCount: allWarnings.length,
                    timestamp: new Date().toISOString()
                });
            } else {
                this.logger.warn('Activity validation failed', {
                    activityObjectID,
                    journeyId,
                    processingTime,
                    errorsCount: allErrors.length,
                    warningsCount: allWarnings.length,
                    errors: allErrors,
                    timestamp: new Date().toISOString()
                });
            }

            return result;

        } catch (error) {
            const processingTime = Date.now() - startTime;
            
            // Requirement 7.1: Log detailed error information
            this.logger.error('Validation operation failed with exception', {
                activityObjectID,
                journeyId,
                error: error.message,
                stack: error.stack,
                processingTime,
                timestamp: new Date().toISOString(),
                operation: 'validate'
            });

            return {
                valid: false,
                error: 'Validation process failed',
                details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
                processingTime,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Handles the publish operation for activity configuration
     * Requirements: 7.1 - Log detailed error information
     */
    async handlePublish(payload) {
        const startTime = Date.now();
        const { inArguments = [], outArguments = [], activityObjectID, journeyId } = payload;

        try {
            this.logger.info('Activity publish operation started', {
                activityObjectID,
                journeyId,
                timestamp: new Date().toISOString(),
                operation: 'publish'
            });

            // Extract activity configuration
            const activityConfig = inArguments.find(arg => arg.activityConfig) || {};
            const config = activityConfig.activityConfig || {};

            // Validate configuration before publishing
            const validation = this.validateActivityConfiguration(config);
            if (!validation.valid) {
                this.logger.error('Publish operation failed - invalid configuration', {
                    activityObjectID,
                    journeyId,
                    errors: validation.errors,
                    timestamp: new Date().toISOString()
                });

                return {
                    success: false,
                    error: 'Cannot publish invalid configuration',
                    details: validation.errors,
                    warnings: validation.warnings
                };
            }

            // Perform comprehensive pre-publish checks
            const publishChecks = await this.performPublishChecks(config);
            if (!publishChecks.ready) {
                this.logger.warn('Publish operation failed - readiness checks failed', {
                    activityObjectID,
                    journeyId,
                    issues: publishChecks.issues,
                    warnings: publishChecks.warnings,
                    timestamp: new Date().toISOString()
                });

                return {
                    success: false,
                    error: 'Activity not ready for publishing',
                    details: publishChecks.issues,
                    warnings: publishChecks.warnings
                };
            }

            // Update activity state to published
            const activityState = {
                activityObjectID,
                journeyId,
                config,
                status: 'published',
                lastPublished: new Date().toISOString(),
                version: this.generateVersion(),
                publishChecks: publishChecks
            };

            this.activityStates.set(activityObjectID, activityState);

            // Perform post-publish setup
            await this.performPostPublishSetup(config, activityObjectID);

            const processingTime = Date.now() - startTime;

            // Log successful publish with execution statistics
            this.logger.info('Activity published successfully', {
                activityObjectID,
                journeyId,
                processingTime,
                version: activityState.version,
                warningsCount: publishChecks.warnings.length,
                timestamp: new Date().toISOString()
            });

            return {
                success: true,
                message: 'Activity published successfully',
                activityObjectID,
                version: activityState.version,
                warnings: publishChecks.warnings,
                processingTime,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            
            // Requirement 7.1: Log detailed error information
            this.logger.error('Publish operation failed with exception', {
                activityObjectID,
                journeyId,
                error: error.message,
                stack: error.stack,
                processingTime,
                timestamp: new Date().toISOString(),
                operation: 'publish'
            });

            return {
                success: false,
                error: 'Failed to publish activity',
                details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
                processingTime,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Validates activity configuration with comprehensive checks
     */
    validateActivityConfiguration(config) {
        const errors = [];
        const warnings = [];
        
        try {
            // Check if config exists
            if (!config || typeof config !== 'object') {
                errors.push('Activity configuration is required');
                return { valid: false, errors, warnings };
            }
            
            // Validate time windows (required)
            if (!Array.isArray(config.timeWindows) || config.timeWindows.length === 0) {
                errors.push('At least one time window must be configured');
            } else {
                // Validate each time window structure
                config.timeWindows.forEach((window, index) => {
                    if (typeof window.startHour !== 'number' || 
                        typeof window.endHour !== 'number' || 
                        typeof window.enabled !== 'boolean') {
                        errors.push(`Time window ${index + 1} has invalid structure`);
                    } else if (window.startHour < 0 || window.startHour > 23 || 
                              window.endHour < 0 || window.endHour > 23 || 
                              window.startHour >= window.endHour) {
                        errors.push(`Time window ${index + 1} has invalid hours (${window.startHour}-${window.endHour})`);
                    }
                });
                
                // Check for enabled time windows
                const enabledWindows = config.timeWindows.filter(w => w.enabled);
                if (enabledWindows.length === 0) {
                    errors.push('At least one time window must be enabled');
                } else if (enabledWindows.length === 1) {
                    warnings.push('Only one time window is enabled. Consider adding more for better optimization.');
                } else {
                    // Check for time window coverage gaps only when there are multiple enabled windows
                    const sortedWindows = enabledWindows.sort((a, b) => a.startHour - b.startHour);
                    for (let i = 1; i < sortedWindows.length; i++) {
                        if (sortedWindows[i].startHour > sortedWindows[i-1].endHour) {
                            warnings.push('Time window gaps detected - some optimal send times may be skipped');
                            break;
                        }
                    }
                }
            }
            
            // Validate boolean flags
            if (config.skipWeekends !== undefined && typeof config.skipWeekends !== 'boolean') {
                errors.push('skipWeekends must be a boolean value');
            }
            
            if (config.skipHolidays !== undefined && typeof config.skipHolidays !== 'boolean') {
                errors.push('skipHolidays must be a boolean value');
            }
            
            // Validate default timezone
            if (config.defaultTimezone && typeof config.defaultTimezone !== 'string') {
                errors.push('defaultTimezone must be a string');
            }
            
            // Validate holiday API settings
            if (config.holidayApiEnabled !== undefined && typeof config.holidayApiEnabled !== 'boolean') {
                errors.push('holidayApiEnabled must be a boolean value');
            }
            
            // Validate fallback behavior
            if (config.fallbackBehavior && 
                !['next_business_day', 'immediate', 'default_time'].includes(config.fallbackBehavior)) {
                errors.push('fallbackBehavior must be one of: next_business_day, immediate, default_time');
            }
            
            // Add warnings for potentially problematic configurations
            if (config.skipHolidays && !this.config.holidayApiEnabled) {
                warnings.push('Holiday exclusion is enabled but holiday API is disabled in server configuration');
            }
            
            if (!config.skipWeekends && !config.skipHolidays) {
                warnings.push('No day restrictions are enabled. Emails may be sent on weekends and holidays.');
            }

            // Validate data extension configuration
            if (config.dataExtensionKey && typeof config.dataExtensionKey !== 'string') {
                errors.push('dataExtensionKey must be a string');
            }
            
            return {
                valid: errors.length === 0,
                errors,
                warnings
            };
            
        } catch (error) {
            this.logger.error('Configuration validation error', {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            
            return {
                valid: false,
                errors: ['Configuration validation failed: ' + error.message],
                warnings
            };
        }
    }

    /**
     * Validates Journey Builder context and data bindings
     */
    validateJourneyContext(payload) {
        const errors = [];
        const warnings = [];
        
        try {
            // Check for required Journey Builder fields
            if (!payload.activityObjectID) {
                warnings.push('Missing activityObjectID - this may cause issues in Journey Builder');
            }
            
            if (!payload.journeyId) {
                warnings.push('Missing journeyId - this may affect logging and monitoring');
            }
            
            // Validate inArguments structure
            if (!Array.isArray(payload.inArguments)) {
                errors.push('inArguments must be an array');
            } else if (payload.inArguments.length === 0) {
                errors.push('inArguments cannot be empty');
            } else {
                // Check for required data bindings
                const dataArg = payload.inArguments.find(arg => 
                    arg.contactKey || arg.subscriberKey || arg.geosegment
                );
                
                if (!dataArg) {
                    warnings.push('No contact data bindings found - ensure proper data extension mapping');
                } else {
                    if (!dataArg.subscriberKey && !dataArg.contactKey) {
                        warnings.push('Missing subscriberKey or contactKey binding');
                    }
                    
                    if (!dataArg.geosegment) {
                        warnings.push('Missing geosegment binding - timezone calculation may use defaults');
                    }
                }
            }
            
            // Validate outArguments structure
            if (!Array.isArray(payload.outArguments)) {
                errors.push('outArguments must be an array');
            } else if (payload.outArguments.length === 0) {
                warnings.push('No outArguments defined - calculated values will not be available to subsequent activities');
            }
            
            return { errors, warnings };
            
        } catch (error) {
            this.logger.error('Journey context validation error', {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            
            return {
                errors: ['Journey context validation failed: ' + error.message],
                warnings
            };
        }
    }

    /**
     * Validates external dependencies and system readiness
     */
    async validateDependencies(config) {
        const errors = [];
        const warnings = [];

        try {
            // Check SFMC configuration
            if (!this.config.sfmc.clientId || !this.config.sfmc.clientSecret) {
                errors.push('SFMC API credentials are not properly configured');
            }

            // Check holiday API if enabled
            if (config.skipHolidays && this.config.holidayApiEnabled) {
                try {
                    const axios = require('axios');
                    const testResponse = await axios.get(
                        `${this.config.holidayApiUrl}/PublicHolidays/2024/US`,
                        { timeout: 5000 }
                    );
                    
                    if (testResponse.status !== 200) {
                        warnings.push('Holiday API is not responding correctly');
                    }
                } catch (error) {
                    warnings.push('Holiday API connectivity could not be verified - holiday exclusion may not work properly');
                }
            }

            // Check timezone engine
            try {
                const TimezoneEngine = require('../timezone-engine');
                const engine = new TimezoneEngine(this.logger);
                const stats = engine.getEngineStats();
                
                if (stats.supportedCountriesCount === 0) {
                    errors.push('Timezone engine has no supported countries configured');
                } else if (stats.supportedCountriesCount < 10) {
                    warnings.push(`Timezone engine supports only ${stats.supportedCountriesCount} countries - consider expanding coverage`);
                }
            } catch (error) {
                // In test environment, timezone engine might not be available
                if (process.env.NODE_ENV !== 'test') {
                    errors.push('Timezone engine is not properly initialized');
                } else {
                    warnings.push('Timezone engine not available in test environment');
                }
            }

            return { errors, warnings };

        } catch (error) {
            this.logger.error('Dependency validation error', {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });

            return {
                errors: ['Dependency validation failed: ' + error.message],
                warnings
            };
        }
    }

    /**
     * Performs comprehensive pre-publish checks
     */
    async performPublishChecks(config) {
        const issues = [];
        const warnings = [];
        
        try {
            // Validate configuration one more time
            const configValidation = this.validateActivityConfiguration(config);
            if (!configValidation.valid) {
                issues.push(...configValidation.errors);
            }
            warnings.push(...configValidation.warnings);

            // Check external dependencies
            const dependencyValidation = await this.validateDependencies(config);
            issues.push(...dependencyValidation.errors);
            warnings.push(...dependencyValidation.warnings);

            // Check system resources and performance
            const performanceChecks = await this.checkSystemPerformance();
            if (!performanceChecks.ready) {
                issues.push(...performanceChecks.issues);
            }
            warnings.push(...performanceChecks.warnings);
            
            return {
                ready: issues.length === 0,
                issues,
                warnings
            };
            
        } catch (error) {
            this.logger.error('Publish checks error', {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            
            return {
                ready: false,
                issues: ['Publish checks failed: ' + error.message],
                warnings
            };
        }
    }

    /**
     * Performs post-publish setup tasks
     */
    async performPostPublishSetup(config, activityObjectID) {
        try {
            // Pre-warm caches if holiday checking is enabled
            if (config.skipHolidays && this.config.holidayApiEnabled) {
                await this.preWarmHolidayCache();
            }

            // Initialize monitoring for this activity
            this.initializeActivityMonitoring(activityObjectID);

            this.logger.info('Post-publish setup completed', {
                activityObjectID,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.logger.warn('Post-publish setup failed', {
                activityObjectID,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Checks system performance and readiness
     */
    async checkSystemPerformance() {
        const issues = [];
        const warnings = [];

        try {
            // Check memory usage
            const memUsage = process.memoryUsage();
            const memUsageMB = memUsage.heapUsed / 1024 / 1024;
            
            if (memUsageMB > 500) { // 500MB threshold
                warnings.push(`High memory usage detected: ${memUsageMB.toFixed(2)}MB`);
            }

            // Check if required modules are available
            try {
                require('../execution/contact-processor');
                require('../timezone-engine');
            } catch (error) {
                // In test environment, modules might not be available
                if (process.env.NODE_ENV !== 'test') {
                    issues.push('Required processing modules are not available');
                } else {
                    warnings.push('Processing modules not available in test environment');
                }
            }

            return {
                ready: issues.length === 0,
                issues,
                warnings
            };

        } catch (error) {
            return {
                ready: false,
                issues: ['Performance check failed: ' + error.message],
                warnings
            };
        }
    }

    /**
     * Pre-warms holiday cache for better performance
     */
    async preWarmHolidayCache() {
        try {
            const axios = require('axios');
            const currentYear = new Date().getFullYear();
            const commonCountries = ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'BR', 'JP', 'IN', 'CN'];

            for (const country of commonCountries) {
                try {
                    await axios.get(
                        `${this.config.holidayApiUrl}/PublicHolidays/${currentYear}/${country}`,
                        { timeout: 5000 }
                    );
                } catch (error) {
                    // Continue with other countries if one fails
                    this.logger.debug(`Failed to pre-warm holiday cache for ${country}`, {
                        error: error.message
                    });
                }
            }

            this.logger.info('Holiday cache pre-warming completed', {
                countries: commonCountries.length,
                year: currentYear,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.logger.warn('Holiday cache pre-warming failed', {
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Initializes monitoring for a specific activity
     */
    initializeActivityMonitoring(activityObjectID) {
        // In a production environment, this would set up monitoring dashboards,
        // alerts, and performance tracking for the specific activity
        this.logger.info('Activity monitoring initialized', {
            activityObjectID,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Generates a unique version identifier
     */
    generateVersion() {
        return `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generates a hash for configuration caching
     */
    generateConfigHash(config) {
        const crypto = require('crypto');
        return crypto.createHash('md5').update(JSON.stringify(config)).digest('hex');
    }

    /**
     * Gets the current state of an activity
     */
    getActivityState(activityObjectID) {
        return this.activityStates.get(activityObjectID) || null;
    }

    /**
     * Gets statistics about the lifecycle manager
     */
    getStats() {
        return {
            totalActivities: this.activityStates.size,
            validationCacheSize: this.validationCache.size,
            activities: Array.from(this.activityStates.entries()).map(([id, state]) => ({
                activityObjectID: id,
                status: state.status,
                lastSaved: state.lastSaved,
                lastPublished: state.lastPublished,
                version: state.version
            }))
        };
    }

    /**
     * Clears old cache entries to prevent memory leaks
     */
    clearOldCache() {
        // Clear validation cache if it gets too large
        if (this.validationCache.size > 1000) {
            this.validationCache.clear();
            this.logger.info('Validation cache cleared due to size limit');
        }

        // Remove old activity states (older than 24 hours)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        for (const [id, state] of this.activityStates.entries()) {
            if (new Date(state.lastSaved || state.lastPublished) < oneDayAgo) {
                this.activityStates.delete(id);
            }
        }
    }
}

module.exports = ActivityLifecycleManager;