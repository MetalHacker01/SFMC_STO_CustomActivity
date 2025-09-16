/**
 * Security Configuration for Send Time Optimization Activity
 * 
 * This module provides comprehensive security configurations including:
 * - SSL/TLS settings
 * - Security headers
 * - Input validation
 * - Rate limiting
 * - Authentication and authorization
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

/**
 * Security middleware configuration
 */
class SecurityConfig {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Get Helmet security headers configuration
   */
  getHelmetConfig() {
    return {
      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: [
            "'self'", 
            "'unsafe-inline'", 
            'https://design-system.lightning.force.com',
            'https://fonts.googleapis.com'
          ],
          scriptSrc: [
            "'self'", 
            "'unsafe-inline'", 
            'https://design-system.lightning.force.com'
          ],
          imgSrc: [
            "'self'", 
            'data:', 
            'https:',
            'https://design-system.lightning.force.com'
          ],
          connectSrc: [
            "'self'", 
            'https://*.marketingcloudapis.com',
            'https://*.exacttarget.com',
            'https://date.nager.at',
            'https://api.github.com'
          ],
          fontSrc: [
            "'self'", 
            'https://design-system.lightning.force.com',
            'https://fonts.gstatic.com'
          ],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"]
        },
        reportOnly: process.env.CSP_REPORT_ONLY === 'true'
      },

      // HTTP Strict Transport Security
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
      },

      // X-Frame-Options
      frameguard: {
        action: 'deny'
      },

      // X-Content-Type-Options
      noSniff: true,

      // X-XSS-Protection
      xssFilter: true,

      // Referrer Policy
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin'
      },

      // Hide X-Powered-By header
      hidePoweredBy: true,

      // DNS Prefetch Control
      dnsPrefetchControl: {
        allow: false
      },

      // Expect-CT
      expectCt: {
        maxAge: 86400,
        enforce: true
      }
    };
  }

  /**
   * Get rate limiting configuration
   */
  getRateLimitConfig() {
    return {
      // General API rate limiting
      general: rateLimit({
        windowMs: this.config.rateLimit?.windowMs || 900000, // 15 minutes
        max: this.config.rateLimit?.max || 1000,
        message: {
          error: 'Too many requests from this IP',
          retryAfter: Math.ceil((this.config.rateLimit?.windowMs || 900000) / 1000)
        },
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => {
          // Skip rate limiting for health checks and metrics
          return req.path === '/health' || 
                 req.path === '/health/detailed' || 
                 req.path === '/metrics';
        },
        keyGenerator: (req) => {
          // Use X-Forwarded-For header if behind proxy
          return req.headers['x-forwarded-for'] || 
                 req.connection.remoteAddress || 
                 req.socket.remoteAddress ||
                 (req.connection.socket ? req.connection.socket.remoteAddress : null);
        }
      }),

      // Strict rate limiting for execute endpoints
      execute: rateLimit({
        windowMs: 60000, // 1 minute
        max: 100, // 100 requests per minute
        message: {
          error: 'Execute endpoint rate limit exceeded',
          retryAfter: 60
        },
        standardHeaders: true,
        legacyHeaders: false
      }),

      // Authentication endpoint rate limiting
      auth: rateLimit({
        windowMs: 900000, // 15 minutes
        max: 50, // 50 auth attempts per 15 minutes
        message: {
          error: 'Too many authentication attempts',
          retryAfter: 900
        },
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests: true
      })
    };
  }

  /**
   * Get slow down configuration for progressive delays
   */
  getSlowDownConfig() {
    return {
      general: slowDown({
        windowMs: 900000, // 15 minutes
        delayAfter: 500, // Allow 500 requests per window without delay
        delayMs: 100, // Add 100ms delay per request after delayAfter
        maxDelayMs: 5000, // Maximum delay of 5 seconds
        skip: (req) => {
          return req.path === '/health' || 
                 req.path === '/health/detailed' || 
                 req.path === '/metrics';
        }
      })
    };
  }

  /**
   * Input validation rules
   */
  getValidationRules() {
    return {
      // JWT token validation
      jwt: {
        required: true,
        type: 'string',
        minLength: 10,
        pattern: /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/
      },

      // Subscriber key validation
      subscriberKey: {
        required: true,
        type: 'string',
        maxLength: 254,
        pattern: /^[a-zA-Z0-9@._-]+$/
      },

      // Geosegment validation
      geosegment: {
        required: false,
        type: 'string',
        length: 2,
        pattern: /^[A-Z]{2}$/
      },

      // Email validation
      email: {
        required: false,
        type: 'string',
        maxLength: 254,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      },

      // Time window validation
      timeWindow: {
        startHour: {
          required: true,
          type: 'number',
          min: 0,
          max: 23
        },
        endHour: {
          required: true,
          type: 'number',
          min: 0,
          max: 23
        },
        enabled: {
          required: true,
          type: 'boolean'
        }
      },

      // Configuration validation
      config: {
        skipWeekends: {
          required: false,
          type: 'boolean'
        },
        skipHolidays: {
          required: false,
          type: 'boolean'
        },
        timeWindows: {
          required: true,
          type: 'array',
          minLength: 1,
          maxLength: 24
        }
      }
    };
  }

  /**
   * Sanitization rules for input data
   */
  getSanitizationRules() {
    return {
      // Remove potentially dangerous characters
      removeHtml: (input) => {
        if (typeof input !== 'string') return input;
        return input.replace(/<[^>]*>/g, '');
      },

      // Normalize whitespace
      normalizeWhitespace: (input) => {
        if (typeof input !== 'string') return input;
        return input.trim().replace(/\s+/g, ' ');
      },

      // Escape special characters
      escapeSpecialChars: (input) => {
        if (typeof input !== 'string') return input;
        return input
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;');
      },

      // Validate and normalize country codes
      normalizeCountryCode: (input) => {
        if (typeof input !== 'string') return input;
        return input.toUpperCase().trim();
      },

      // Validate and normalize email addresses
      normalizeEmail: (input) => {
        if (typeof input !== 'string') return input;
        return input.toLowerCase().trim();
      }
    };
  }

  /**
   * CORS configuration
   */
  getCorsConfig() {
    const allowedOrigins = this.config.cors?.origin || [
      'https://*.marketingcloudapis.com',
      'https://*.exacttarget.com',
      'https://mc.s7.exacttarget.com',
      'https://mc.s8.exacttarget.com',
      'https://mc.s10.exacttarget.com'
    ];

    return {
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);

        // Check if origin matches allowed patterns
        const isAllowed = allowedOrigins.some(allowedOrigin => {
          if (allowedOrigin.includes('*')) {
            const pattern = allowedOrigin.replace(/\*/g, '.*');
            const regex = new RegExp(`^${pattern}$`);
            return regex.test(origin);
          }
          return allowedOrigin === origin;
        });

        if (isAllowed) {
          callback(null, true);
        } else {
          console.warn(`CORS: Origin ${origin} not allowed`);
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      optionsSuccessStatus: 200,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'Cache-Control',
        'X-File-Name'
      ],
      exposedHeaders: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset'
      ]
    };
  }

  /**
   * SSL/TLS configuration
   */
  getSSLConfig() {
    return {
      // Minimum TLS version
      secureProtocol: 'TLSv1_2_method',
      
      // Cipher suites (ordered by preference)
      ciphers: [
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-SHA256',
        'ECDHE-RSA-AES256-SHA384',
        'ECDHE-RSA-AES256-SHA',
        'ECDHE-RSA-AES128-SHA',
        'AES128-GCM-SHA256',
        'AES256-GCM-SHA384',
        'AES128-SHA256',
        'AES256-SHA256',
        'AES128-SHA',
        'AES256-SHA'
      ].join(':'),
      
      // Honor cipher order
      honorCipherOrder: true,
      
      // Disable weak protocols
      secureOptions: require('constants').SSL_OP_NO_SSLv2 | 
                     require('constants').SSL_OP_NO_SSLv3 | 
                     require('constants').SSL_OP_NO_TLSv1 | 
                     require('constants').SSL_OP_NO_TLSv1_1,
      
      // ECDH curve
      ecdhCurve: 'prime256v1'
    };
  }

  /**
   * Security headers middleware
   */
  getSecurityHeaders() {
    return (req, res, next) => {
      // Remove server information
      res.removeHeader('X-Powered-By');
      res.removeHeader('Server');
      
      // Add custom security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      
      // Add cache control for sensitive endpoints
      if (req.path.includes('/execute') || req.path.includes('/save') || req.path.includes('/validate')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
      
      next();
    };
  }

  /**
   * Request sanitization middleware
   */
  getRequestSanitizer() {
    const sanitizationRules = this.getSanitizationRules();
    
    return (req, res, next) => {
      try {
        // Sanitize request body
        if (req.body && typeof req.body === 'object') {
          req.body = this.sanitizeObject(req.body, sanitizationRules);
        }
        
        // Sanitize query parameters
        if (req.query && typeof req.query === 'object') {
          req.query = this.sanitizeObject(req.query, sanitizationRules);
        }
        
        next();
      } catch (error) {
        console.error('Request sanitization error:', error);
        res.status(400).json({
          error: 'Invalid request data',
          message: 'Request contains invalid or potentially dangerous content'
        });
      }
    };
  }

  /**
   * Sanitize object recursively
   */
  sanitizeObject(obj, rules) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const sanitized = Array.isArray(obj) ? [] : {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Apply string sanitization
        let sanitizedValue = rules.removeHtml(value);
        sanitizedValue = rules.normalizeWhitespace(sanitizedValue);
        
        // Apply specific rules based on key
        if (key.toLowerCase().includes('email')) {
          sanitizedValue = rules.normalizeEmail(sanitizedValue);
        } else if (key.toLowerCase().includes('country') || key === 'geosegment') {
          sanitizedValue = rules.normalizeCountryCode(sanitizedValue);
        }
        
        sanitized[key] = sanitizedValue;
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value, rules);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
}

module.exports = SecurityConfig;