/**
 * Production Configuration for Send Time Optimization Activity
 * 
 * This configuration file contains production-specific settings for:
 * - Security configurations
 * - Performance optimizations
 * - Monitoring and logging
 * - SSL/TLS settings
 * - Rate limiting
 * - Error handling
 */

const path = require('path');

module.exports = {
  // Server Configuration
  server: {
    port: process.env.PORT || 443,
    host: process.env.HOST || '0.0.0.0',
    
    // SSL/TLS Configuration
    ssl: {
      enabled: process.env.SSL_ENABLED === 'true',
      keyPath: process.env.SSL_KEY_PATH || '/etc/ssl/private/server.key',
      certPath: process.env.SSL_CERT_PATH || '/etc/ssl/certs/server.crt',
      caPath: process.env.SSL_CA_PATH || '/etc/ssl/certs/ca.crt',
      
      // SSL Options
      options: {
        secureProtocol: 'TLSv1_2_method',
        ciphers: [
          'ECDHE-RSA-AES128-GCM-SHA256',
          'ECDHE-RSA-AES256-GCM-SHA384',
          'ECDHE-RSA-AES128-SHA256',
          'ECDHE-RSA-AES256-SHA384'
        ].join(':'),
        honorCipherOrder: true
      }
    },
    
    // Request timeout settings
    timeout: {
      server: parseInt(process.env.SERVER_TIMEOUT) || 30000,
      keepAlive: parseInt(process.env.KEEP_ALIVE_TIMEOUT) || 65000,
      headers: parseInt(process.env.HEADERS_TIMEOUT) || 66000
    }
  },

  // Security Configuration
  security: {
    // CORS settings
    cors: {
      origin: process.env.ALLOWED_ORIGINS ? 
        process.env.ALLOWED_ORIGINS.split(',') : 
        ['https://*.marketingcloudapis.com', 'https://*.exacttarget.com'],
      credentials: true,
      optionsSuccessStatus: 200,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    },
    
    // Rate limiting
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX) || 1000, // requests per window
      message: 'Too many requests from this IP, please try again later',
      standardHeaders: true,
      legacyHeaders: false,
      
      // Skip rate limiting for health checks
      skip: (req) => req.path === '/health' || req.path === '/health/detailed'
    },
    
    // Helmet security headers
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://design-system.lightning.force.com'],
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://design-system.lightning.force.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https://*.marketingcloudapis.com', 'https://date.nager.at'],
          fontSrc: ["'self'", 'https://design-system.lightning.force.com'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    },
    
    // JWT Configuration
    jwt: {
      secret: process.env.JWT_SECRET,
      algorithm: 'HS256',
      expiresIn: '1h',
      issuer: process.env.JWT_ISSUER || 'send-time-optimization',
      audience: process.env.JWT_AUDIENCE || 'sfmc-journey-builder'
    }
  },

  // Performance Configuration
  performance: {
    // Compression settings
    compression: {
      enabled: true,
      level: 6,
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return true;
      }
    },
    
    // Caching settings
    cache: {
      // Holiday data cache
      holiday: {
        ttl: parseInt(process.env.HOLIDAY_CACHE_TTL) || 86400, // 24 hours
        maxKeys: parseInt(process.env.HOLIDAY_CACHE_MAX_KEYS) || 1000,
        checkPeriod: parseInt(process.env.HOLIDAY_CACHE_CHECK_PERIOD) || 600 // 10 minutes
      },
      
      // Timezone data cache
      timezone: {
        ttl: parseInt(process.env.TIMEZONE_CACHE_TTL) || 3600, // 1 hour
        maxKeys: parseInt(process.env.TIMEZONE_CACHE_MAX_KEYS) || 500
      },
      
      // SFMC token cache
      token: {
        ttl: parseInt(process.env.TOKEN_CACHE_TTL) || 3300, // 55 minutes (tokens expire in 1 hour)
        maxKeys: 10
      }
    },
    
    // Connection pooling
    http: {
      maxSockets: parseInt(process.env.HTTP_MAX_SOCKETS) || 50,
      maxFreeSockets: parseInt(process.env.HTTP_MAX_FREE_SOCKETS) || 10,
      timeout: parseInt(process.env.HTTP_TIMEOUT) || 30000,
      keepAlive: true,
      keepAliveMsecs: parseInt(process.env.HTTP_KEEP_ALIVE_MS) || 1000
    }
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    
    // File logging
    file: {
      enabled: process.env.FILE_LOGGING_ENABLED === 'true',
      path: process.env.LOG_FILE_PATH || '/var/log/sto-activity',
      maxSize: process.env.LOG_MAX_SIZE || '100MB',
      maxFiles: parseInt(process.env.LOG_MAX_FILES) || 10,
      datePattern: 'YYYY-MM-DD'
    },
    
    // Console logging
    console: {
      enabled: process.env.CONSOLE_LOGGING_ENABLED !== 'false',
      colorize: false,
      timestamp: true
    },
    
    // External logging services
    external: {
      // Datadog configuration
      datadog: {
        enabled: process.env.DATADOG_ENABLED === 'true',
        apiKey: process.env.DATADOG_API_KEY,
        service: 'sto-activity',
        env: process.env.NODE_ENV || 'production',
        version: process.env.APP_VERSION || '1.0.0'
      },
      
      // New Relic configuration
      newRelic: {
        enabled: process.env.NEW_RELIC_ENABLED === 'true',
        licenseKey: process.env.NEW_RELIC_LICENSE_KEY,
        appName: process.env.NEW_RELIC_APP_NAME || 'STO Activity'
      }
    }
  },

  // Monitoring Configuration
  monitoring: {
    // Health check settings
    health: {
      enabled: true,
      interval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
      timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000,
      
      // Critical component thresholds
      thresholds: {
        responseTime: parseInt(process.env.HEALTH_RESPONSE_TIME_THRESHOLD) || 5000,
        errorRate: parseFloat(process.env.HEALTH_ERROR_RATE_THRESHOLD) || 0.05,
        memoryUsage: parseFloat(process.env.HEALTH_MEMORY_THRESHOLD) || 0.85,
        cpuUsage: parseFloat(process.env.HEALTH_CPU_THRESHOLD) || 0.80
      }
    },
    
    // Metrics collection
    metrics: {
      enabled: true,
      interval: parseInt(process.env.METRICS_INTERVAL) || 60000,
      retention: parseInt(process.env.METRICS_RETENTION) || 86400000, // 24 hours
      
      // Prometheus settings
      prometheus: {
        enabled: process.env.PROMETHEUS_ENABLED === 'true',
        endpoint: '/metrics',
        prefix: 'sto_activity_'
      }
    },
    
    // Alerting configuration
    alerting: {
      enabled: true,
      evaluationInterval: parseInt(process.env.ALERT_EVALUATION_INTERVAL) || 30000,
      
      // Alert channels
      channels: {
        email: {
          enabled: process.env.EMAIL_ALERTS_ENABLED === 'true',
          smtp: {
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS
            }
          },
          recipients: process.env.ALERT_EMAIL_RECIPIENTS ? 
            process.env.ALERT_EMAIL_RECIPIENTS.split(',') : []
        },
        
        webhook: {
          enabled: process.env.WEBHOOK_ALERTS_ENABLED === 'true',
          url: process.env.ALERT_WEBHOOK_URL,
          timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 5000
        },
        
        slack: {
          enabled: process.env.SLACK_ALERTS_ENABLED === 'true',
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
          channel: process.env.SLACK_CHANNEL || '#alerts'
        }
      }
    }
  },

  // Database Configuration (if using persistent storage)
  database: {
    // PostgreSQL for audit logs and metrics storage
    postgres: {
      enabled: process.env.POSTGRES_ENABLED === 'true',
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT) || 5432,
      database: process.env.POSTGRES_DB || 'sto_activity',
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      
      // Connection pool settings
      pool: {
        min: parseInt(process.env.POSTGRES_POOL_MIN) || 2,
        max: parseInt(process.env.POSTGRES_POOL_MAX) || 10,
        acquire: parseInt(process.env.POSTGRES_POOL_ACQUIRE) || 30000,
        idle: parseInt(process.env.POSTGRES_POOL_IDLE) || 10000
      },
      
      // SSL configuration
      ssl: process.env.POSTGRES_SSL === 'true' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    },
    
    // Redis for caching and session storage
    redis: {
      enabled: process.env.REDIS_ENABLED === 'true',
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB) || 0,
      
      // Connection settings
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT) || 10000,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      
      // Cluster configuration
      cluster: {
        enabled: process.env.REDIS_CLUSTER_ENABLED === 'true',
        nodes: process.env.REDIS_CLUSTER_NODES ? 
          process.env.REDIS_CLUSTER_NODES.split(',').map(node => {
            const [host, port] = node.split(':');
            return { host, port: parseInt(port) || 6379 };
          }) : []
      }
    }
  },

  // External Services Configuration
  external: {
    // SFMC API settings
    sfmc: {
      timeout: parseInt(process.env.SFMC_API_TIMEOUT) || 30000,
      retries: parseInt(process.env.SFMC_API_RETRIES) || 3,
      retryDelay: parseInt(process.env.SFMC_API_RETRY_DELAY) || 1000,
      
      // Rate limiting for SFMC API calls
      rateLimit: {
        requests: parseInt(process.env.SFMC_RATE_LIMIT_REQUESTS) || 2500,
        window: parseInt(process.env.SFMC_RATE_LIMIT_WINDOW) || 60000 // 1 minute
      }
    },
    
    // Holiday API settings
    holidayApi: {
      timeout: parseInt(process.env.HOLIDAY_API_TIMEOUT) || 10000,
      retries: parseInt(process.env.HOLIDAY_API_RETRIES) || 2,
      retryDelay: parseInt(process.env.HOLIDAY_API_RETRY_DELAY) || 2000,
      
      // Fallback configuration
      fallback: {
        enabled: process.env.HOLIDAY_API_FALLBACK_ENABLED === 'true',
        dataPath: process.env.HOLIDAY_FALLBACK_DATA_PATH || './data/holidays'
      }
    }
  },

  // Application-specific Configuration
  application: {
    // Send Time Optimization settings
    sto: {
      defaultTimezone: process.env.STO_DEFAULT_TIMEZONE || 'America/Chicago',
      maxProcessingTime: parseInt(process.env.STO_MAX_PROCESSING_TIME) || 20000,
      batchSize: parseInt(process.env.STO_BATCH_SIZE) || 100,
      
      // Time window constraints
      timeWindows: {
        minWindows: parseInt(process.env.STO_MIN_TIME_WINDOWS) || 1,
        maxWindows: parseInt(process.env.STO_MAX_TIME_WINDOWS) || 24,
        defaultWindows: process.env.STO_DEFAULT_TIME_WINDOWS ? 
          JSON.parse(process.env.STO_DEFAULT_TIME_WINDOWS) : [
            { startHour: 9, endHour: 10, enabled: true },
            { startHour: 10, endHour: 11, enabled: true },
            { startHour: 14, endHour: 15, enabled: true }
          ]
      },
      
      // Timezone support
      timezone: {
        supportedCountries: process.env.STO_SUPPORTED_COUNTRIES ? 
          process.env.STO_SUPPORTED_COUNTRIES.split(',') : 
          ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'IT', 'ES', 'BR', 'MX', 'JP', 'CN', 'IN', 'RU', 'ZA'],
        fallbackCountry: process.env.STO_FALLBACK_COUNTRY || 'US'
      }
    }
  },

  // Environment-specific overrides
  environment: {
    name: process.env.NODE_ENV || 'production',
    version: process.env.APP_VERSION || '1.0.0',
    buildNumber: process.env.BUILD_NUMBER,
    deploymentDate: process.env.DEPLOYMENT_DATE || new Date().toISOString(),
    
    // Feature flags
    features: {
      batchProcessing: process.env.FEATURE_BATCH_PROCESSING !== 'false',
      advancedMonitoring: process.env.FEATURE_ADVANCED_MONITORING !== 'false',
      holidayApi: process.env.FEATURE_HOLIDAY_API !== 'false',
      performanceOptimizations: process.env.FEATURE_PERFORMANCE_OPTS !== 'false'
    }
  }
};