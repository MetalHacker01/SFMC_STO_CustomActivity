/**
 * Production Server for Send Time Optimization Activity
 * 
 * This is the production-ready server configuration that includes:
 * - SSL/TLS support
 * - Enhanced security middleware
 * - Production logging
 * - Performance optimizations
 * - Health monitoring
 * - Graceful shutdown handling
 */

const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');

// Load production configuration
const productionConfig = require('./config/production');
const SecurityConfig = require('./config/security');

// Initialize security configuration
const securityConfig = new SecurityConfig(productionConfig.security);

// Load environment variables
require('dotenv').config({ path: '.env.production' });

// Import the main application
const app = express();

// =============================================================================
// PRODUCTION MIDDLEWARE SETUP
// =============================================================================

// Security headers
app.use(helmet(securityConfig.getHelmetConfig()));
app.use(securityConfig.getSecurityHeaders());

// CORS configuration
app.use(cors(securityConfig.getCorsConfig()));

// Compression
if (productionConfig.performance.compression.enabled) {
  app.use(compression({
    level: productionConfig.performance.compression.level,
    threshold: productionConfig.performance.compression.threshold,
    filter: productionConfig.performance.compression.filter
  }));
}

// Rate limiting
const rateLimitConfig = securityConfig.getRateLimitConfig();
app.use('/execute', rateLimitConfig.execute);
app.use('/save', rateLimitConfig.auth);
app.use('/validate', rateLimitConfig.auth);
app.use('/publish', rateLimitConfig.auth);
app.use(rateLimitConfig.general);

// Slow down middleware
const slowDownConfig = securityConfig.getSlowDownConfig();
app.use(slowDownConfig.general);

// Request sanitization
app.use(securityConfig.getRequestSanitizer());

// Body parsing with size limits
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Store raw body for JWT verification if needed
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// =============================================================================
// PRODUCTION LOGGING SETUP
// =============================================================================

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

// Create logger with production configuration
const logger = winston.createLogger({
  level: productionConfig.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    productionConfig.logging.format === 'json' 
      ? winston.format.json()
      : winston.format.simple()
  ),
  defaultMeta: {
    service: 'sto-activity',
    version: productionConfig.environment.version,
    environment: productionConfig.environment.name
  },
  transports: []
});

// Console logging
if (productionConfig.logging.console.enabled) {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ all: false }),
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
      })
    )
  }));
}

// File logging with rotation
if (productionConfig.logging.file.enabled) {
  logger.add(new DailyRotateFile({
    filename: path.join(productionConfig.logging.file.path, 'sto-activity-%DATE%.log'),
    datePattern: productionConfig.logging.file.datePattern,
    maxSize: productionConfig.logging.file.maxSize,
    maxFiles: productionConfig.logging.file.maxFiles,
    zippedArchive: true
  }));

  // Separate error log
  logger.add(new DailyRotateFile({
    filename: path.join(productionConfig.logging.file.path, 'sto-activity-error-%DATE%.log'),
    datePattern: productionConfig.logging.file.datePattern,
    level: 'error',
    maxSize: productionConfig.logging.file.maxSize,
    maxFiles: productionConfig.logging.file.maxFiles,
    zippedArchive: true
  }));
}

// Replace console with winston logger
console.log = (...args) => logger.info(args.join(' '));
console.error = (...args) => logger.error(args.join(' '));
console.warn = (...args) => logger.warn(args.join(' '));
console.info = (...args) => logger.info(args.join(' '));

// =============================================================================
// LOAD MAIN APPLICATION
// =============================================================================

// Import and configure the main server application
const mainServer = require('./server');

// Apply main server routes to the production app
app.use(mainServer);

// =============================================================================
// PRODUCTION ERROR HANDLING
# =============================================================================

// Global error handler
app.use((error, req, res, next) => {
  logger.error('Unhandled application error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Don't expose error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(error.status || 500).json({
    error: 'Internal Server Error',
    message: isDevelopment ? error.message : 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown'
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn('404 Not Found:', {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found',
    timestamp: new Date().toISOString()
  });
});

// =============================================================================
# SSL/TLS CONFIGURATION
# =============================================================================

let server;

if (productionConfig.server.ssl.enabled) {
  try {
    // Load SSL certificates
    const sslOptions = {
      key: fs.readFileSync(productionConfig.server.ssl.keyPath),
      cert: fs.readFileSync(productionConfig.server.ssl.certPath),
      ...productionConfig.server.ssl.options
    };

    // Add CA certificate if provided
    if (productionConfig.server.ssl.caPath && fs.existsSync(productionConfig.server.ssl.caPath)) {
      sslOptions.ca = fs.readFileSync(productionConfig.server.ssl.caPath);
    }

    // Create HTTPS server
    server = https.createServer(sslOptions, app);
    logger.info('HTTPS server configured with SSL/TLS');

    // Redirect HTTP to HTTPS
    const httpApp = express();
    httpApp.use((req, res) => {
      const httpsUrl = `https://${req.headers.host}${req.url}`;
      res.redirect(301, httpsUrl);
    });
    
    const httpServer = http.createServer(httpApp);
    httpServer.listen(80, () => {
      logger.info('HTTP redirect server listening on port 80');
    });

  } catch (error) {
    logger.error('Failed to load SSL certificates:', error);
    logger.info('Falling back to HTTP server');
    server = http.createServer(app);
  }
} else {
  // Create HTTP server
  server = http.createServer(app);
  logger.info('HTTP server configured (SSL disabled)');
}

// =============================================================================
# SERVER CONFIGURATION
# =============================================================================

// Configure server timeouts
server.timeout = productionConfig.server.timeout.server;
server.keepAliveTimeout = productionConfig.server.timeout.keepAlive;
server.headersTimeout = productionConfig.server.timeout.headers;

// =============================================================================
# GRACEFUL SHUTDOWN HANDLING
# =============================================================================

let isShuttingDown = false;

const gracefulShutdown = (signal) => {
  if (isShuttingDown) {
    logger.warn(`Received ${signal} again, forcing shutdown`);
    process.exit(1);
  }

  isShuttingDown = true;
  logger.info(`Received ${signal}, starting graceful shutdown`);

  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      logger.error('Error during server shutdown:', err);
      process.exit(1);
    }

    logger.info('Server closed successfully');

    // Close database connections, cleanup resources, etc.
    Promise.all([
      // Add cleanup promises here
      new Promise(resolve => {
        // Example: close database connections
        setTimeout(resolve, 1000);
      })
    ])
    .then(() => {
      logger.info('Cleanup completed, exiting');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Error during cleanup:', error);
      process.exit(1);
    });
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// =============================================================================
# START SERVER
# =============================================================================

const PORT = productionConfig.server.port;
const HOST = productionConfig.server.host;

server.listen(PORT, HOST, () => {
  const protocol = productionConfig.server.ssl.enabled ? 'HTTPS' : 'HTTP';
  logger.info(`Send Time Optimization Activity server started`, {
    protocol,
    host: HOST,
    port: PORT,
    environment: productionConfig.environment.name,
    version: productionConfig.environment.version,
    nodeVersion: process.version,
    pid: process.pid
  });

  // Log configuration summary
  logger.info('Production configuration loaded:', {
    ssl: productionConfig.server.ssl.enabled,
    monitoring: productionConfig.monitoring.health.enabled,
    caching: productionConfig.performance.cache.holiday.ttl,
    rateLimit: productionConfig.security.rateLimit.max,
    features: productionConfig.environment.features
  });
});

// Export server for testing
module.exports = { app, server, logger };