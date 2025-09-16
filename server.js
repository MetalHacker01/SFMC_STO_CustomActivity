/**
 * SFMC Custom Journey Activity - Send Time Optimization (STO)
 * 
 * This custom activity calculates optimal send times based on geographic segments,
 * respecting business rules such as weekend exclusions and public holidays.
 * It demonstrates how to:
 * - Handle SFMC Journey Builder lifecycle events (save, validate, publish, execute)
 * - Calculate timezone-aware send times
 * - Integrate with holiday APIs
 * - Update data extension records with calculated send times
 */

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const axios = require('axios');
const moment = require('moment-timezone');
const NodeCache = require('node-cache');
const { TimezoneEngine } = require('./src/timezone-engine');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================================================
// CONFIGURATION
// =============================================================================

// JWT Secret for validating tokens from SFMC
const jwtSecret = process.env.JWT_SECRET;
const appExtensionKey = process.env.APP_EXTENSION_KEY;

// SFMC API Configuration
const sfmcConfig = {
    clientId: process.env.SFMC_CLIENT_ID,
    clientSecret: process.env.SFMC_CLIENT_SECRET,
    subdomain: process.env.SFMC_SUBDOMAIN,
    accountId: process.env.SFMC_ACCOUNT_ID,
    authUrl: process.env.SFMC_AUTH_URL,
    restBaseUrl: process.env.SFMC_REST_BASE_URL
};

// STO-specific configuration
const stoConfig = {
    defaultTimezone: process.env.STO_DEFAULT_TIMEZONE || 'America/Chicago',
    holidayApiUrl: process.env.STO_HOLIDAY_API_URL || 'https://date.nager.at/api/v3',
    holidayApiEnabled: process.env.STO_HOLIDAY_API_ENABLED === 'true',
    cacheTimeout: parseInt(process.env.STO_CACHE_TIMEOUT) || 3600, // 1 hour in seconds
    maxRetries: parseInt(process.env.STO_MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.STO_RETRY_DELAY) || 1000
};

// Initialize cache for holiday data
const holidayCache = new NodeCache({ stdTTL: stoConfig.cacheTimeout });

// Initialize timezone engine
const timezoneEngine = new TimezoneEngine(console, {
    defaultFallbackCountry: stoConfig.defaultTimezone.includes('America') ? 'US' : 'US',
    logValidationIssues: true,
    enableDetailedLogging: process.env.NODE_ENV === 'development'
});

// =============================================================================
// MIDDLEWARE
// =============================================================================

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Validates JWT token from SFMC
 */
function validateJWT(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.body.jwt;
    
    if (!token) {
        return res.status(401).json({ error: 'No JWT token provided' });
    }

    try {
        const decoded = jwt.verify(token, jwtSecret);
        req.jwt = decoded;
        next();
    } catch (error) {
        console.error('JWT validation error:', error);
        return res.status(401).json({ error: 'Invalid JWT token' });
    }
}

/**
 * Logs requests for debugging
 */
function logRequest(req, res, next) {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    next();
}

/**
 * Validates activity configuration for Journey Builder
 */
function validateActivityConfiguration(config) {
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
            errors.push('At least one time window must be selected');
        } else {
            // Validate each time window
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
        if (config.skipHolidays && !stoConfig.holidayApiEnabled) {
            warnings.push('Holiday exclusion is enabled but holiday API is disabled in server configuration');
        }
        
        if (!config.skipWeekends && !config.skipHolidays) {
            warnings.push('No day restrictions are enabled. Emails may be sent on weekends and holidays.');
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
        
    } catch (error) {
        console.error('Configuration validation error:', error);
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
function validateJourneyContext(payload) {
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
        console.error('Journey context validation error:', error);
        return {
            errors: ['Journey context validation failed: ' + error.message],
            warnings
        };
    }
}

/**
 * Performs pre-publish checks to ensure activity is ready for production
 */
async function performPublishChecks(config) {
    const issues = [];
    const warnings = [];
    
    try {
        // Check external dependencies
        if (config.skipHolidays && stoConfig.holidayApiEnabled) {
            try {
                // Test holiday API connectivity
                const testResponse = await axios.get(
                    `${stoConfig.holidayApiUrl}/PublicHolidays/2024/US`,
                    { timeout: 5000 }
                );
                
                if (testResponse.status !== 200) {
                    issues.push('Holiday API is not responding correctly');
                }
            } catch (error) {
                console.warn('Holiday API connectivity test failed:', error.message);
                warnings.push('Holiday API connectivity could not be verified - holiday exclusion may not work properly');
            }
        }
        
        // Check SFMC configuration
        if (!sfmcConfig.clientId || !sfmcConfig.clientSecret) {
            issues.push('SFMC API credentials are not properly configured');
        }
        
        // Check timezone engine readiness
        try {
            const engineStats = timezoneEngine.getEngineStats();
            if (engineStats.supportedCountriesCount === 0) {
                issues.push('Timezone engine has no supported countries configured');
            } else if (engineStats.supportedCountriesCount < 10) {
                warnings.push(`Timezone engine supports only ${engineStats.supportedCountriesCount} countries - consider expanding coverage`);
            }
        } catch (error) {
            issues.push('Timezone engine is not properly initialized');
        }
        
        // Check cache configuration
        if (!holidayCache) {
            warnings.push('Holiday cache is not initialized - performance may be impacted');
        }
        
        // Validate time window coverage
        if (config.timeWindows && config.timeWindows.length > 0) {
            const enabledWindows = config.timeWindows.filter(w => w.enabled);
            const totalHours = enabledWindows.length;
            
            if (totalHours < 2) {
                warnings.push('Very limited time window coverage may result in delayed sends');
            }
            
            // Check for gaps in time coverage
            const sortedWindows = enabledWindows.sort((a, b) => a.startHour - b.startHour);
            for (let i = 1; i < sortedWindows.length; i++) {
                if (sortedWindows[i].startHour > sortedWindows[i-1].endHour) {
                    warnings.push('Time window gaps detected - some optimal send times may be skipped');
                    break;
                }
            }
        }
        
        return {
            ready: issues.length === 0,
            issues,
            warnings
        };
        
    } catch (error) {
        console.error('Publish checks error:', error);
        return {
            ready: false,
            issues: ['Publish checks failed: ' + error.message],
            warnings
        };
    }
}

// =============================================================================
// ROUTES
// =============================================================================

// Initialize monitoring system
const { MonitoringSystem, HealthStatus, AlertSeverity } = require('./src/monitoring');
const monitoringSystem = new MonitoringSystem({
    enableHealthMonitoring: true,
    enablePerformanceCollection: true,
    enableAlerting: true,
    healthCheckInterval: 30000, // 30 seconds
    metricsCollectionInterval: 60000, // 1 minute
    alertEvaluationInterval: 30000 // 30 seconds
});

// Register health checks for system components
monitoringSystem.registerHealthCheck('timezone-engine', async () => {
    try {
        const stats = timezoneEngine.getEngineStats();
        return {
            status: stats.supportedCountriesCount > 0 ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
            details: {
                supportedCountries: stats.supportedCountriesCount,
                validationStats: stats.validationStats
            }
        };
    } catch (error) {
        return {
            status: HealthStatus.UNHEALTHY,
            error: error.message
        };
    }
}, { critical: true });

monitoringSystem.registerHealthCheck('contact-processor', async () => {
    try {
        const ContactProcessor = require('./src/execution/contact-processor');
        const processor = new ContactProcessor({
            defaultTimezone: stoConfig.defaultTimezone,
            holidayApiEnabled: stoConfig.holidayApiEnabled,
            sfmc: sfmcConfig,
            holidayApi: {
                baseUrl: stoConfig.holidayApiUrl,
                timeout: 5000
            }
        }, console);

        const health = await processor.healthCheck();
        return {
            status: health.status === 'healthy' ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
            details: health
        };
    } catch (error) {
        return {
            status: HealthStatus.UNHEALTHY,
            error: error.message
        };
    }
}, { critical: true });

monitoringSystem.registerHealthCheck('holiday-api', async () => {
    if (!stoConfig.holidayApiEnabled) {
        return {
            status: HealthStatus.HEALTHY,
            details: { message: 'Holiday API disabled' }
        };
    }

    try {
        const axios = require('axios');
        const response = await axios.get(`${stoConfig.holidayApiUrl}/PublicHolidays/2024/US`, {
            timeout: 5000
        });
        
        return {
            status: response.status === 200 ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
            details: {
                responseTime: response.headers['x-response-time'] || 'unknown',
                status: response.status
            }
        };
    } catch (error) {
        return {
            status: HealthStatus.UNHEALTHY,
            error: error.message
        };
    }
}, { critical: false });

// Register custom alert rules
monitoringSystem.registerAlertRule('high_error_rate', {
    condition: (metrics) => {
        const errorRate = parseFloat(metrics.errorRate?.replace('%', '') || 0);
        return errorRate > 10; // Alert if error rate > 10%
    },
    severity: AlertSeverity.ERROR,
    message: 'High error rate detected: {errorRate}% (threshold: 10%)',
    suppressionWindow: 300000 // 5 minutes
});

monitoringSystem.registerAlertRule('slow_response_time', {
    condition: (metrics) => {
        const avgResponseTime = parseFloat(metrics.avgResponseTime?.replace('ms', '') || 0);
        return avgResponseTime > 5000; // Alert if avg response time > 5 seconds
    },
    severity: AlertSeverity.WARNING,
    message: 'Slow response time detected: {avgResponseTime}ms (threshold: 5000ms)',
    suppressionWindow: 300000
});

monitoringSystem.registerAlertRule('component_failure', {
    condition: (metrics) => metrics.healthStatus === HealthStatus.UNHEALTHY,
    severity: AlertSeverity.CRITICAL,
    message: 'System health is unhealthy - one or more critical components are failing',
    suppressionWindow: 180000 // 3 minutes
});

// Start monitoring system
monitoringSystem.start();

// Add monitoring middleware
app.use(monitoringSystem.createExpressMiddleware());

// Health check endpoint with comprehensive monitoring
app.get('/health', async (req, res) => {
    try {
        const status = await monitoringSystem.getStatus();
        
        const httpStatus = status.health.status === HealthStatus.HEALTHY ? 200 :
                          status.health.status === HealthStatus.DEGRADED ? 200 : 503;

        res.status(httpStatus).json({
            status: status.health.status,
            timestamp: status.timestamp,
            service: 'Send Time Optimization Activity',
            uptime: status.system.uptime,
            components: status.health.componentResults || {},
            performance: {
                requests: status.performance.requests,
                memory: status.system.memory,
                cpu: status.system.cpu
            },
            alerts: {
                active: status.alerting.activeAlerts.length,
                total: status.alerting.totalAlerts
            }
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            status: HealthStatus.UNHEALTHY,
            timestamp: new Date().toISOString(),
            service: 'Send Time Optimization Activity',
            error: error.message
        });
    }
});

// Detailed health endpoint
app.get('/health/detailed', async (req, res) => {
    try {
        const status = await monitoringSystem.getStatus();
        res.json(status);
    } catch (error) {
        console.error('Detailed health check error:', error);
        res.status(500).json({
            error: 'Failed to retrieve detailed health status',
            message: error.message
        });
    }
});

// Metrics endpoint for Prometheus scraping
app.get('/metrics', (req, res) => {
    try {
        const metrics = monitoringSystem.exportPrometheusMetrics();
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
    } catch (error) {
        console.error('Metrics export error:', error);
        res.status(500).json({
            error: 'Failed to export metrics',
            message: error.message
        });
    }
});

// Alerts endpoint
app.get('/alerts', (req, res) => {
    try {
        const activeAlerts = monitoringSystem.getActiveAlerts();
        const stats = monitoringSystem.alertingSystem.getStats();
        
        res.json({
            activeAlerts,
            statistics: stats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Alerts endpoint error:', error);
        res.status(500).json({
            error: 'Failed to retrieve alerts',
            message: error.message
        });
    }
});

// Performance metrics endpoint
app.get('/performance', (req, res) => {
    try {
        const metrics = monitoringSystem.getPerformanceMetrics();
        const summary = monitoringSystem.performanceCollector.getPerformanceSummary();
        
        res.json({
            metrics,
            summary,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Performance endpoint error:', error);
        res.status(500).json({
            error: 'Failed to retrieve performance metrics',
            message: error.message
        });
    }
});

// Serve configuration UI
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize lifecycle management components
const { ActivityLifecycleManager, LifecycleErrorHandler } = require('./src/lifecycle');
const lifecycleManager = new ActivityLifecycleManager({
    sfmc: sfmcConfig,
    holidayApiUrl: stoConfig.holidayApiUrl,
    holidayApiEnabled: stoConfig.holidayApiEnabled,
    cacheTimeout: stoConfig.cacheTimeout
}, console);
const lifecycleErrorHandler = new LifecycleErrorHandler(console);

// Journey Builder lifecycle endpoints
app.post('/save', logRequest, validateJWT, async (req, res) => {
    console.log('Save endpoint called');
    
    try {
        const result = await lifecycleManager.handleSave(req.body);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
        
    } catch (error) {
        const errorResponse = lifecycleErrorHandler.handleSaveError(error, {
            activityObjectID: req.body.activityObjectID,
            journeyId: req.body.journeyId
        });
        
        res.status(500).json(errorResponse);
    }
});

app.post('/validate', logRequest, validateJWT, async (req, res) => {
    console.log('Validate endpoint called');
    
    try {
        const result = await lifecycleManager.handleValidate(req.body);
        
        if (result.valid) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
        
    } catch (error) {
        const errorResponse = lifecycleErrorHandler.handleValidateError(error, {
            activityObjectID: req.body.activityObjectID,
            journeyId: req.body.journeyId
        });
        
        res.status(500).json(errorResponse);
    }
});

app.post('/publish', logRequest, validateJWT, async (req, res) => {
    console.log('Publish endpoint called');
    
    try {
        const result = await lifecycleManager.handlePublish(req.body);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
        
    } catch (error) {
        const errorResponse = lifecycleErrorHandler.handlePublishError(error, {
            activityObjectID: req.body.activityObjectID,
            journeyId: req.body.journeyId
        });
        
        res.status(500).json(errorResponse);
    }
});

app.post('/execute', logRequest, validateJWT, async (req, res) => {
    console.log('Execute endpoint called');
    
    try {
        // Extract contact and configuration data from the request
        const { inArguments = [], activityObjectID, journeyId, activityId } = req.body;
        
        // Parse inArguments to extract contact data and activity configuration
        const contactData = inArguments.find(arg => arg.contactKey || arg.subscriberKey) || {};
        const activityConfig = inArguments.find(arg => arg.timeWindows || arg.skipWeekends !== undefined) || {};
        
        // Validate required data
        if (!contactData.subscriberKey && !contactData.contactKey) {
            return res.status(400).json({
                success: false,
                error: 'SubscriberKey or ContactKey is required'
            });
        }

        // Normalize contact data
        const contact = {
            subscriberKey: contactData.subscriberKey || contactData.contactKey,
            geosegment: contactData.geosegment || contactData.Geosegment,
            emailAddress: contactData.emailAddress || contactData.EmailAddress,
            entryTime: new Date() // Use current time as entry time
        };

        // Create context for processing
        const context = {
            activityObjectID,
            journeyId,
            activityId,
            dataExtensionKey: activityConfig.dataExtensionKey,
            jwt: req.jwt
        };

        // Initialize contact processor with current configuration
        const ContactProcessor = require('./src/execution/contact-processor');
        const processor = new ContactProcessor({
            defaultTimezone: stoConfig.defaultTimezone,
            holidayApiEnabled: stoConfig.holidayApiEnabled,
            maxRetries: stoConfig.maxRetries,
            retryDelay: stoConfig.retryDelay,
            sfmc: sfmcConfig,
            holidayApi: {
                baseUrl: stoConfig.holidayApiUrl,
                timeout: 5000
            },
            holidayCache: {
                ttl: stoConfig.cacheTimeout
            }
        }, console);

        // Process the contact
        const result = await processor.processContact(contact, activityConfig, context);

        if (result.success) {
            console.log(`Contact processing successful for ${contact.subscriberKey}`, {
                convertedTime: result.convertedTime,
                adjustments: result.adjustments.length,
                processingTime: result.processingTime
            });

            res.json({
                success: true,
                subscriberKey: result.subscriberKey,
                convertedTime: result.convertedTime,
                adjustments: result.adjustments,
                processingTime: result.processingTime
            });
        } else {
            console.error(`Contact processing failed for ${contact.subscriberKey}:`, result.error);
            
            res.status(500).json({
                success: false,
                error: result.error,
                subscriberKey: result.subscriberKey,
                processingTime: result.processingTime
            });
        }

    } catch (error) {
        console.error('Execute endpoint error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal processing error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Batch processing endpoint for multiple contacts
app.post('/execute/batch', logRequest, validateJWT, async (req, res) => {
    console.log('Batch execute endpoint called');
    
    try {
        const { contacts, activityConfig, context = {} } = req.body;
        
        if (!Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Contacts array is required and must not be empty'
            });
        }

        // Initialize contact processor
        const ContactProcessor = require('./src/execution/contact-processor');
        const processor = new ContactProcessor({
            defaultTimezone: stoConfig.defaultTimezone,
            holidayApiEnabled: stoConfig.holidayApiEnabled,
            maxRetries: stoConfig.maxRetries,
            retryDelay: stoConfig.retryDelay,
            sfmc: sfmcConfig,
            holidayApi: {
                baseUrl: stoConfig.holidayApiUrl,
                timeout: 5000
            },
            holidayCache: {
                ttl: stoConfig.cacheTimeout
            }
        }, console);

        // Process batch
        const result = await processor.processBatch(contacts, activityConfig || {}, {
            ...context,
            jwt: req.jwt
        });

        console.log(`Batch processing completed`, {
            totalContacts: result.totalContacts,
            successful: result.successful,
            failed: result.failed,
            processingTime: result.processingTime
        });

        res.json(result);

    } catch (error) {
        console.error('Batch execute endpoint error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal batch processing error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Contact processor statistics endpoint
app.get('/stats', (req, res) => {
    try {
        const ContactProcessor = require('./src/execution/contact-processor');
        const processor = new ContactProcessor({
            defaultTimezone: stoConfig.defaultTimezone,
            holidayApiEnabled: stoConfig.holidayApiEnabled,
            sfmc: sfmcConfig
        }, console);

        const processorStats = processor.getStats();
        const lifecycleStats = lifecycleManager.getStats();
        const errorStats = lifecycleErrorHandler.getErrorStats();
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            stats: {
                processor: processorStats,
                lifecycle: lifecycleStats,
                errors: errorStats
            }
        });
    } catch (error) {
        console.error('Stats endpoint error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve statistics',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Activity state management endpoint
app.get('/activity/:activityObjectID/state', (req, res) => {
    try {
        const { activityObjectID } = req.params;
        const state = lifecycleManager.getActivityState(activityObjectID);
        
        if (!state) {
            return res.status(404).json({
                success: false,
                error: 'Activity not found',
                activityObjectID
            });
        }
        
        res.json({
            success: true,
            activityObjectID,
            state,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Activity state endpoint error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve activity state',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Lifecycle management endpoint for cache cleanup
app.post('/lifecycle/cleanup', (req, res) => {
    try {
        lifecycleManager.clearOldCache();
        lifecycleErrorHandler.resetErrorStats();
        
        res.json({
            success: true,
            message: 'Lifecycle cleanup completed',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Lifecycle cleanup error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to perform lifecycle cleanup',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Timezone testing endpoint (for development/testing)
app.get('/timezone/test/:countryCode?', (req, res) => {
    const countryCode = req.params.countryCode || 'US';
    const testTime = new Date();
    
    try {
        // Get timezone information
        const timezoneInfo = timezoneEngine.getTimezoneInfo(countryCode, {
            endpoint: 'timezone-test',
            timestamp: testTime.toISOString()
        });
        
        // Test time conversions
        const toSFMC = timezoneEngine.convertToSFMCTime(testTime, countryCode);
        const fromSFMC = timezoneEngine.convertFromSFMCTime(testTime, countryCode);
        
        // Get comprehensive summary
        const summary = timezoneEngine.getTimezoneSummary(countryCode, testTime);
        
        res.json({
            success: true,
            countryCode: countryCode,
            testTime: testTime.toISOString(),
            timezoneInfo,
            conversions: {
                toSFMC,
                fromSFMC
            },
            summary,
            engineStats: timezoneEngine.getEngineStats()
        });
    } catch (error) {
        console.error('Timezone test error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            countryCode: countryCode
        });
    }
});

// Timezone validation endpoint
app.post('/timezone/validate', (req, res) => {
    const { countryCodes } = req.body;
    
    if (!countryCodes || !Array.isArray(countryCodes)) {
        return res.status(400).json({
            success: false,
            error: 'countryCodes array is required'
        });
    }
    
    try {
        const validation = timezoneEngine.validateMultipleCountries(countryCodes);
        res.json({
            success: true,
            validation,
            engineStats: timezoneEngine.getEngineStats()
        });
    } catch (error) {
        console.error('Timezone validation error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Stop endpoint for Journey Builder lifecycle
app.post('/stop', logRequest, validateJWT, async (req, res) => {
    console.log('Stop endpoint called');
    
    try {
        const { activityObjectID, journeyId } = req.body;
        
        console.log('Stopping activity:', {
            activityObjectID,
            journeyId,
            timestamp: new Date().toISOString()
        });
        
        // In a production environment, you might want to:
        // 1. Clean up any running processes
        // 2. Clear caches related to this activity
        // 3. Log the stop event for monitoring
        // 4. Perform any necessary cleanup
        
        // Clear holiday cache if needed
        if (holidayCache) {
            holidayCache.flushAll();
            console.log('Holiday cache cleared');
        }
        
        console.log('Activity stopped successfully', {
            activityObjectID,
            journeyId,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Activity stopped successfully',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Stop endpoint error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop activity',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

// Periodic cleanup task to prevent memory leaks
setInterval(() => {
    try {
        lifecycleManager.clearOldCache();
        console.log('Periodic lifecycle cleanup completed');
    } catch (error) {
        console.error('Periodic cleanup error:', error);
    }
}, 60 * 60 * 1000); // Run every hour

app.listen(PORT, () => {
    console.log(`Send Time Optimization Activity server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Holiday API enabled: ${stoConfig.holidayApiEnabled}`);
    console.log(`Default timezone: ${stoConfig.defaultTimezone}`);
    console.log(`Lifecycle management initialized`);
});

module.exports = app;