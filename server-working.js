/**
 * Working STO Local Development Server
 * This version uses only the working components and provides STO functionality
 */

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const { TimezoneCalculator } = require('./src/timezone-calculator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3003;

console.log('🚀 Starting Working STO Server...');

// =============================================================================
// CONFIGURATION & SETUP
// =============================================================================

const mockLogger = {
    info: (msg, data) => console.log(`[INFO] ${msg}`, data ? JSON.stringify(data, null, 2) : ''),
    warn: (msg, data) => console.warn(`[WARN] ${msg}`, data ? JSON.stringify(data, null, 2) : ''),
    error: (msg, data) => console.error(`[ERROR] ${msg}`, data ? JSON.stringify(data, null, 2) : ''),
    debug: (msg, data) => console.log(`[DEBUG] ${msg}`, data ? JSON.stringify(data, null, 2) : '')
};

// Initialize timezone calculator
const timezoneCalculator = new TimezoneCalculator({}, mockLogger);

// Simple contact processor function
async function processContact(contact, config) {
    try {
        console.log(`Processing contact: ${contact.subscriberKey} (${contact.geosegment})`);
        
        // Get timezone info
        const timezoneInfo = timezoneCalculator.getTimezoneInfo(contact.geosegment || 'US');
        console.log(`Timezone info:`, timezoneInfo);
        
        // Calculate base send time (current time + 1 hour for demo)
        const baseTime = new Date(contact.entryTime || new Date());
        baseTime.setHours(baseTime.getHours() + 1);
        
        // Apply time window logic
        let convertedTime = new Date(baseTime);
        
        if (config.timeWindows && config.timeWindows.length > 0) {
            const enabledWindows = config.timeWindows.filter(w => w.enabled);
            if (enabledWindows.length > 0) {
                // Use first enabled time window
                const window = enabledWindows[0];
                convertedTime.setHours(window.startHour, 0, 0, 0);
                
                // If the time is in the past, move to next day
                if (convertedTime <= new Date()) {
                    convertedTime.setDate(convertedTime.getDate() + 1);
                }
            }
        }
        
        // Apply weekend exclusion
        if (config.skipWeekends) {
            while (convertedTime.getDay() === 0 || convertedTime.getDay() === 6) {
                convertedTime.setDate(convertedTime.getDate() + 1);
            }
        }
        
        // Convert to SFMC time if needed
        try {
            const sfmcTime = timezoneCalculator.convertToSFMCTime(convertedTime, contact.geosegment || 'US');
            convertedTime = sfmcTime;
        } catch (error) {
            console.warn('SFMC time conversion failed, using original time:', error.message);
        }
        
        return {
            success: true,
            subscriberKey: contact.subscriberKey,
            convertedTime: convertedTime,
            workflow: {
                timezone: timezoneInfo,
                originalTime: baseTime,
                adjustments: []
            },
            validation: {
                validDateTime: true,
                futureTime: convertedTime > new Date(),
                waitByAttributeCompatible: true
            }
        };
        
    } catch (error) {
        console.error('Contact processing error:', error);
        return {
            success: false,
            error: error.message,
            subscriberKey: contact.subscriberKey
        };
    }
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// =============================================================================
// ROUTES
// =============================================================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        components: {
            timezoneCalculator: 'operational',
            contactProcessor: 'operational',
            server: 'running'
        }
    });
});

// Main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index-local.html'));
});

// Original page for comparison
app.get('/original', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Save configuration
app.post('/save', (req, res) => {
    console.log('💾 Save configuration:', req.body);
    
    const config = req.body;
    
    // Basic validation
    if (!config.timeWindows || !Array.isArray(config.timeWindows)) {
        return res.status(400).json({
            success: false,
            error: 'Time windows are required'
        });
    }

    res.json({
        success: true,
        message: 'Configuration saved successfully',
        config: config,
        timestamp: new Date().toISOString()
    });
});

// Validate configuration
app.post('/validate', (req, res) => {
    console.log('✅ Validate configuration:', req.body);
    
    const config = req.body;
    const errors = [];

    if (!config.timeWindows || !Array.isArray(config.timeWindows)) {
        errors.push('Time windows are required');
    } else {
        config.timeWindows.forEach((window, index) => {
            if (typeof window.startHour !== 'number' || window.startHour < 0 || window.startHour > 23) {
                errors.push(`Time window ${index + 1}: Invalid start hour`);
            }
            if (typeof window.endHour !== 'number' || window.endHour < 0 || window.endHour > 23) {
                errors.push(`Time window ${index + 1}: Invalid end hour`);
            }
            if (window.startHour >= window.endHour) {
                errors.push(`Time window ${index + 1}: Start hour must be less than end hour`);
            }
        });
    }

    res.json({
        success: errors.length === 0,
        errors: errors,
        timestamp: new Date().toISOString()
    });
});

// Publish activity
app.post('/publish', (req, res) => {
    console.log('📤 Publish activity');
    res.json({
        success: true,
        message: 'Activity published successfully',
        timestamp: new Date().toISOString()
    });
});

// Execute contact processing
app.post('/execute', async (req, res) => {
    console.log('⚡ Execute activity for contact processing');
    
    try {
        const { contact, config } = req.body;
        
        if (!contact || !contact.subscriberKey) {
            return res.status(400).json({
                success: false,
                error: 'Contact with subscriberKey is required'
            });
        }

        if (!config || !config.timeWindows) {
            return res.status(400).json({
                success: false,
                error: 'Configuration with time windows is required'
            });
        }

        const result = await processContact(contact, config);
        
        if (result.success) {
            console.log(`✅ Successfully processed ${contact.subscriberKey}`);
            res.json(result);
        } else {
            console.log(`❌ Failed to process ${contact.subscriberKey}: ${result.error}`);
            res.status(500).json(result);
        }

    } catch (error) {
        console.error('Execute endpoint error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Debug endpoints
app.get('/debug/config', (req, res) => {
    res.json({
        environment: process.env.NODE_ENV || 'development',
        port: PORT,
        timestamp: new Date().toISOString(),
        availableEndpoints: [
            'GET /health',
            'GET /',
            'POST /save',
            'POST /validate', 
            'POST /publish',
            'POST /execute',
            'GET /debug/config',
            'GET /debug/timezone/:country'
        ]
    });
});

app.get('/debug/timezone/:country', (req, res) => {
    const country = req.params.country.toUpperCase();
    try {
        const timezoneInfo = timezoneCalculator.getTimezoneInfo(country);
        res.json({
            country,
            timezoneInfo,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            country,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Error handling
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path,
        timestamp: new Date().toISOString()
    });
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎉 Working STO Server is running!`);
    console.log(`📍 URL: http://0.0.0.0:${PORT}`);
    console.log(`🏥 Health Check: http://0.0.0.0:${PORT}/health`);
    console.log(`🎛️  Activity UI: http://0.0.0.0:${PORT}`);
    console.log(`📊 Debug Config: http://0.0.0.0:${PORT}/debug/config`);
    console.log(`🌍 Timezone Test: http://0.0.0.0:${PORT}/debug/timezone/US`);
    console.log(`\n🧪 Ready for STO testing!`);
});

module.exports = app;