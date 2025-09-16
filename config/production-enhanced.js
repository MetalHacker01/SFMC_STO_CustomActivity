/**
 * Enhanced Production Configuration for Send Time Optimization Activity
 * 
 * This configuration extends the base production configuration with additional
 * security, performance, and operational enhancements for enterprise deployments.
 */

const baseConfig = require('./production');
const path = require('path');

module.exports = {
  ...baseConfig,

  // Enhanced Server Configuration
  server: {
    ...baseConfig.server,
    
    // Advanced SSL/TLS Configuration
    ssl: {
      ...baseConfig.server.ssl,
      
      // Enhanced SSL options for maximum security
      options: {
        ...baseConfig.server.ssl.options,
        
        // Minimum TLS version
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3',
        
        // Cipher suites (ordered by preference)
        ciphers: [
          // TLS 1.3 cipher suites
          'TLS_AES_256_GCM_SHA384',
          'TLS_CHACHA20_POLY1305_SHA256',
          'TLS_AES_128_GCM_SHA256',
          
          // TLS 1.2 cipher suites
          'ECDHE-RSA-AES256-GCM-SHA384',
          'ECDHE-RSA-AES128-GCM-SHA256',
          'ECDHE-RSA-AES256-SHA384',
          'ECDHE-RSA-AES128-SHA256',
          'ECDHE-RSA-AES256-SHA',
          'ECDHE-RSA-AES128-SHA'
        ].join(':'),
        
        // Honor cipher order
        honorCipherOrder: true,
        
        // Disable weak protocols and ciphers
        secureOptions: require('constants').SSL_OP_NO_SSLv2 | 
                       require('constants').SSL_OP_NO_SSLv3 | 
                       require('constants').SSL_OP_NO_TLSv1 | 
                       require('constants').SSL_OP_NO_TLSv1_1 |
                       require('constants').SSL_OP_CIPHER_SERVER_PREFERENCE,
        
        // ECDH curve
        ecdhCurve: 'prime256v1:secp384r1:secp521r1',
        
        // Session settings
        sessionIdContext: 'sto-activity',
        sessionTimeout: 300, // 5 minutes
        
        // OCSP stapling
        requestOCSP: true
      },
      
      // Certificate validation
      validation: {
        enabled: true,
        checkExpiry: true,
        expiryWarningDays: 30,
        checkRevocation: false // Set to true if OCSP/CRL checking is needed
      }
    },
    
    // Enhanced timeout configuration
    timeout: {
      ...baseConfig.server.timeout,
      
      // Request timeout for different endpoints
      endpoints: {
        execute: parseInt(process.env.EXECUTE_TIMEOUT) || 25000,
        save: parseInt(process.env.SAVE_TIMEOUT) || 10000,
        validate: parseInt(process.env.VALIDATE_TIMEOUT) || 5000,
        health: parseInt(process.env.HEALTH_TIMEOUT) || 3000
      }
    },
    
    // Connection limits
    connections: {
      maxConnections: parseInt(process.env.MAX_CONNECTIONS) || 1000,
      maxConnectionsPerIP: parseInt(process.env.MAX_CONNECTIONS_PER_IP) || 50,
      connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT) || 30000
    }
  },

  // Enhanced Security Configuration
  security: {
    ...baseConfig.security,
    
    // Advanced rate limiting
    rateLimit: {
      ...baseConfig.security.rateLimit,
      
      // Endpoint-specific rate limits
      endpoints: {
        execute: {
          windowMs: 60000, // 1 minute
          max: parseInt(process.env.EXECUTE_RATE_LIMIT) || 100,
          message: 'Execute endpoint rate limit exceeded',
          standardHeaders: true,
          legacyHeaders: false
        },
        
        auth: {
          windowMs: 900000, // 15 minutes
          max: parseInt(process.env.AUTH_RATE_LIMIT) || 20,
          message: 'Authentication rate limit exceeded',
          standardHeaders: true,
          legacyHeaders: false,
          skipSuccessfulRequests: true
        },
        
        health: {
          windowMs: 60000, // 1 minute
          max: parseInt(process.env.HEALTH_RATE_LIMIT) || 200,
          message: 'Health check rate limit exceeded'
        }
      },
      
      // IP-based rate limiting
      ipBased: {
        enabled: true,
        windowMs: 900000, // 15 minutes
        max: parseInt(process.env.IP_RATE_LIMIT) || 500,
        trustProxy: true,
        skipSuccessfulRequests: false
      }
    },
    
    // Enhanced CORS configuration
    cors: {
      ...baseConfig.security.cors,
      
      // Dynamic origin validation
      origin: (origin, callback) => {
        const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
          process.env.ALLOWED_ORIGINS.split(',') : 
          ['https://*.marketingcloudapis.com', 'https://*.exacttarget.com'];
        
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        // Check against allowed patterns
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
      
      // Enhanced headers
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'Cache-Control',
        'X-File-Name',
        'X-Request-ID',
        'X-Correlation-ID'
      ],
      
      exposedHeaders: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'X-Request-ID',
        'X-Response-Time'
      ]
    },
    
    // Enhanced Helmet configuration
    helmet: {
      ...baseConfig.security.helmet,
      
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
          formAction: ["'self'"],
          upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        },
        reportOnly: process.env.CSP_REPORT_ONLY === 'true',
        reportUri: process.env.CSP_REPORT_URI || null
      },
      
      // Enhanced HSTS
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
      },
      
      // Additional security headers
      noSniff: true,
      xssFilter: true,
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin'
      },
      
      // Permissions Policy (formerly Feature Policy)
      permissionsPolicy: {
        geolocation: [],
        microphone: [],
        camera: [],
        payment: [],
        usb: [],
        magnetometer: [],
        gyroscope: [],
        accelerometer: []
      }
    },
    
    // Input validation and sanitization
    validation: {
      enabled: true,
      
      // Request size limits
      limits: {
        json: '10mb',
        urlencoded: '10mb',
        raw: '10mb',
        text: '10mb'
      },
      
      // Parameter pollution protection
      parameterPollution: {
        enabled: true,
        whitelist: ['timeWindows', 'countries']
      },
      
      // SQL injection protection
      sqlInjection: {
        enabled: true,
        patterns: [
          /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
          /(\'|\"|;|--|\*|\|)/,
          /(\bOR\b|\bAND\b).*(\=|\<|\>)/i
        ]
      },
      
      // XSS protection
      xss: {
        enabled: true,
        patterns: [
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
          /javascript:/gi,
          /on\w+\s*=/gi
        ]
      }
    },
    
    // API key management
    apiKeys: {
      enabled: process.env.API_KEY_AUTH_ENABLED === 'true',
      header: 'X-API-Key',
      keys: process.env.API_KEYS ? process.env.API_KEYS.split(',') : [],
      rateLimit: {
        windowMs: 3600000, // 1 hour
        max: parseInt(process.env.API_KEY_RATE_LIMIT) || 10000
      }
    }
  },

  // Enhanced Performance Configuration
  performance: {
    ...baseConfig.performance,
    
    // Advanced compression
    compression: {
      ...baseConfig.performance.compression,
      
      // Compression algorithms
      algorithms: ['gzip', 'deflate', 'br'],
      
      // Brotli compression settings
      brotli: {
        enabled: true,
        quality: 6,
        lgwin: 19
      },
      
      // Content-type specific compression
      contentTypes: {
        'application/json': { level: 9 },
        'text/html': { level: 6 },
        'text/css': { level: 9 },
        'application/javascript': { level: 9 },
        'text/plain': { level: 6 }
      }
    },
    
    // Enhanced caching
    cache: {
      ...baseConfig.performance.cache,
      
      // Multi-tier caching
      tiers: {
        memory: {
          enabled: true,
          maxSize: parseInt(process.env.MEMORY_CACHE_SIZE) || 100, // MB
          ttl: parseInt(process.env.MEMORY_CACHE_TTL) || 300 // 5 minutes
        },
        
        redis: {
          enabled: process.env.REDIS_ENABLED === 'true',
          ttl: parseInt(process.env.REDIS_CACHE_TTL) || 3600, // 1 hour
          keyPrefix: 'sto:cache:'
        },
        
        file: {
          enabled: process.env.FILE_CACHE_ENABLED === 'true',
          path: process.env.FILE_CACHE_PATH || '/tmp/sto-cache',
          ttl: parseInt(process.env.FILE_CACHE_TTL) || 86400 // 24 hours
        }
      },
      
      // Cache strategies
      strategies: {
        holiday: {
          tier: 'redis',
          ttl: 86400, // 24 hours
          refreshThreshold: 0.8 // Refresh when 80% of TTL elapsed
        },
        
        timezone: {
          tier: 'memory',
          ttl: 3600, // 1 hour
          maxKeys: 500
        },
        
        token: {
          tier: 'memory',
          ttl: 3300, // 55 minutes
          maxKeys: 100
        }
      }
    },
    
    // Connection pooling
    connectionPool: {
      ...baseConfig.performance.http,
      
      // HTTP/2 support
      http2: {
        enabled: process.env.HTTP2_ENABLED === 'true',
        maxSessionMemory: 10,
        maxHeaderListPairs: 128,
        maxOutstandingPings: 10
      },
      
      // Keep-alive settings
      keepAlive: {
        enabled: true,
        initialDelay: 0,
        interval: 1000,
        maxRetries: 3
      }
    },
    
    // Resource optimization
    resources: {
      // Memory management
      memory: {
        maxOldSpaceSize: parseInt(process.env.MAX_OLD_SPACE_SIZE) || 512, // MB
        maxSemiSpaceSize: parseInt(process.env.MAX_SEMI_SPACE_SIZE) || 16, // MB
        gcInterval: parseInt(process.env.GC_INTERVAL) || 300000 // 5 minutes
      },
      
      // CPU optimization
      cpu: {
        maxCpuUsage: parseFloat(process.env.MAX_CPU_USAGE) || 0.8, // 80%
        throttleThreshold: parseFloat(process.env.CPU_THROTTLE_THRESHOLD) || 0.9 // 90%
      }
    }
  },

  // Enhanced Monitoring Configuration
  monitoring: {
    ...baseConfig.monitoring,
    
    // Advanced health checks
    health: {
      ...baseConfig.monitoring.health,
      
      // Component-specific health checks
      components: {
        database: {
          enabled: process.env.POSTGRES_ENABLED === 'true',
          timeout: 5000,
          query: 'SELECT 1'
        },
        
        redis: {
          enabled: process.env.REDIS_ENABLED === 'true',
          timeout: 3000,
          command: 'PING'
        },
        
        sfmc: {
          enabled: true,
          timeout: 10000,
          endpoint: '/health/sfmc'
        },
        
        holidayApi: {
          enabled: process.env.STO_HOLIDAY_API_ENABLED === 'true',
          timeout: 5000,
          endpoint: '/health/holiday-api'
        }
      },
      
      // Health check scheduling
      schedule: {
        basic: '*/30 * * * * *', // Every 30 seconds
        detailed: '0 */5 * * * *', // Every 5 minutes
        external: '0 */10 * * * *' // Every 10 minutes
      }
    },
    
    // Enhanced metrics collection
    metrics: {
      ...baseConfig.monitoring.metrics,
      
      // Custom metrics
      custom: {
        enabled: true,
        
        // Business metrics
        business: {
          contactsProcessed: true,
          sendTimeCalculations: true,
          timezoneConversions: true,
          holidayChecks: true,
          dataExtensionUpdates: true
        },
        
        // Performance metrics
        performance: {
          responseTime: true,
          throughput: true,
          errorRate: true,
          memoryUsage: true,
          cpuUsage: true,
          cacheHitRate: true
        },
        
        // Security metrics
        security: {
          rateLimitHits: true,
          authenticationFailures: true,
          corsViolations: true,
          suspiciousRequests: true
        }
      },
      
      // Metric aggregation
      aggregation: {
        enabled: true,
        intervals: ['1m', '5m', '15m', '1h', '1d'],
        retention: {
          '1m': '1h',
          '5m': '6h',
          '15m': '24h',
          '1h': '7d',
          '1d': '30d'
        }
      }
    },
    
    // Enhanced alerting
    alerting: {
      ...baseConfig.monitoring.alerting,
      
      // Alert rules
      rules: {
        // Critical alerts
        critical: {
          responseTime: {
            threshold: 10000, // 10 seconds
            duration: '2m',
            severity: 'critical'
          },
          
          errorRate: {
            threshold: 0.1, // 10%
            duration: '5m',
            severity: 'critical'
          },
          
          memoryUsage: {
            threshold: 0.9, // 90%
            duration: '5m',
            severity: 'critical'
          }
        },
        
        // Warning alerts
        warning: {
          responseTime: {
            threshold: 5000, // 5 seconds
            duration: '5m',
            severity: 'warning'
          },
          
          errorRate: {
            threshold: 0.05, // 5%
            duration: '10m',
            severity: 'warning'
          },
          
          certificateExpiry: {
            threshold: 30, // 30 days
            severity: 'warning'
          }
        }
      },
      
      // Alert routing
      routing: {
        critical: ['email', 'slack', 'webhook'],
        warning: ['email', 'slack'],
        info: ['slack']
      }
    }
  },

  // Operational Configuration
  operations: {
    // Graceful shutdown
    shutdown: {
      timeout: parseInt(process.env.SHUTDOWN_TIMEOUT) || 30000,
      signals: ['SIGTERM', 'SIGINT'],
      cleanup: {
        closeConnections: true,
        flushLogs: true,
        saveMetrics: true
      }
    },
    
    // Process management
    process: {
      title: 'sto-activity',
      
      // Cluster mode
      cluster: {
        enabled: process.env.CLUSTER_ENABLED === 'true',
        workers: parseInt(process.env.CLUSTER_WORKERS) || require('os').cpus().length,
        respawn: true,
        maxRestarts: 5,
        restartDelay: 1000
      },
      
      // Process monitoring
      monitoring: {
        enabled: true,
        interval: 30000, // 30 seconds
        
        // Restart conditions
        restart: {
          memoryThreshold: parseInt(process.env.RESTART_MEMORY_THRESHOLD) || 512, // MB
          cpuThreshold: parseFloat(process.env.RESTART_CPU_THRESHOLD) || 0.95, // 95%
          errorThreshold: parseInt(process.env.RESTART_ERROR_THRESHOLD) || 100 // errors per minute
        }
      }
    },
    
    // Maintenance mode
    maintenance: {
      enabled: process.env.MAINTENANCE_MODE === 'true',
      message: process.env.MAINTENANCE_MESSAGE || 'Service temporarily unavailable for maintenance',
      allowedIPs: process.env.MAINTENANCE_ALLOWED_IPS ? 
        process.env.MAINTENANCE_ALLOWED_IPS.split(',') : [],
      bypassHeader: 'X-Maintenance-Bypass',
      bypassValue: process.env.MAINTENANCE_BYPASS_VALUE
    }
  },

  // Development and Testing Overrides
  development: {
    // Override settings for development environment
    enabled: process.env.NODE_ENV === 'development',
    
    overrides: {
      'security.rateLimit.max': 10000,
      'security.helmet.contentSecurityPolicy.reportOnly': true,
      'logging.level': 'debug',
      'monitoring.health.interval': 60000
    }
  }
};