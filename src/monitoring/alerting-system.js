/**
 * Alerting System
 * Implements alerting for critical errors and performance issues
 * Supports multiple alert channels and configurable thresholds
 */

const { createApiLogger } = require('../logging');

/**
 * Alert Severity Levels
 */
const AlertSeverity = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical'
};

/**
 * Alert Status
 */
const AlertStatus = {
    ACTIVE: 'active',
    RESOLVED: 'resolved',
    SUPPRESSED: 'suppressed'
};

/**
 * Alert Channel Types
 */
const AlertChannel = {
    LOG: 'log',
    WEBHOOK: 'webhook',
    EMAIL: 'email',
    CONSOLE: 'console'
};

/**
 * Alerting System class for managing alerts and notifications
 */
class AlertingSystem {
    constructor(config = {}) {
        this.config = {
            enableAlerting: config.enableAlerting !== false,
            suppressionWindow: config.suppressionWindow || 300000, // 5 minutes
            maxActiveAlerts: config.maxActiveAlerts || 100,
            alertRetention: config.alertRetention || 86400000, // 24 hours
            defaultChannel: config.defaultChannel || AlertChannel.LOG,
            ...config
        };

        this.logger = createApiLogger({ logLevel: 'info' });
        this.alertRules = new Map();
        this.activeAlerts = new Map();
        this.alertHistory = [];
        this.channels = new Map();
        this.suppressedAlerts = new Set();
        
        // Alert statistics
        this.stats = {
            totalAlerts: 0,
            alertsBySeverity: {
                [AlertSeverity.INFO]: 0,
                [AlertSeverity.WARNING]: 0,
                [AlertSeverity.ERROR]: 0,
                [AlertSeverity.CRITICAL]: 0
            },
            alertsByRule: {},
            lastAlert: null,
            suppressedCount: 0
        };

        // Initialize default channels
        this._initializeDefaultChannels();
    }

    /**
     * Register an alert rule
     * @param {string} name - Rule name
     * @param {Object} rule - Alert rule configuration
     */
    registerAlertRule(name, rule) {
        this.alertRules.set(name, {
            name,
            condition: rule.condition,
            severity: rule.severity || AlertSeverity.WARNING,
            message: rule.message || `Alert triggered: ${name}`,
            channels: rule.channels || [this.config.defaultChannel],
            suppressionWindow: rule.suppressionWindow || this.config.suppressionWindow,
            enabled: rule.enabled !== false,
            metadata: rule.metadata || {},
            ...rule
        });

        this.stats.alertsByRule[name] = 0;

        this.logger.info(`Registered alert rule`, {
            name,
            severity: rule.severity,
            channels: rule.channels
        }, 'alerting-system');
    }

    /**
     * Register an alert channel
     * @param {string} name - Channel name
     * @param {string} type - Channel type
     * @param {Object} config - Channel configuration
     */
    registerAlertChannel(name, type, config = {}) {
        if (!Object.values(AlertChannel).includes(type)) {
            throw new Error(`Invalid alert channel type: ${type}`);
        }

        this.channels.set(name, {
            name,
            type,
            config: {
                enabled: config.enabled !== false,
                timeout: config.timeout || 5000,
                retryCount: config.retryCount || 2,
                ...config
            },
            stats: {
                totalSent: 0,
                successful: 0,
                failed: 0,
                lastSent: null,
                lastError: null
            }
        });

        this.logger.info(`Registered alert channel`, {
            name,
            type,
            enabled: config.enabled !== false
        }, 'alerting-system');
    }

    /**
     * Evaluate all alert rules against current metrics
     * @param {Object} metrics - Current system metrics
     * @param {Object} context - Additional context
     */
    evaluateAlerts(metrics, context = {}) {
        if (!this.config.enableAlerting) {
            return;
        }

        for (const [ruleName, rule] of this.alertRules) {
            if (!rule.enabled) {
                continue;
            }

            try {
                const shouldAlert = rule.condition(metrics, context);
                
                if (shouldAlert) {
                    this._triggerAlert(ruleName, rule, metrics, context);
                } else {
                    this._resolveAlert(ruleName);
                }

            } catch (error) {
                this.logger.error(`Error evaluating alert rule`, {
                    ruleName,
                    error: error.message
                }, 'alerting-system');
            }
        }
    }

    /**
     * Manually trigger an alert
     * @param {string} ruleName - Rule name
     * @param {Object} context - Alert context
     */
    triggerAlert(ruleName, context = {}) {
        const rule = this.alertRules.get(ruleName);
        if (!rule) {
            this.logger.warn(`Alert rule not found: ${ruleName}`, {}, 'alerting-system');
            return;
        }

        this._triggerAlert(ruleName, rule, {}, context);
    }

    /**
     * Resolve an active alert
     * @param {string} alertId - Alert ID
     */
    resolveAlert(alertId) {
        const alert = this.activeAlerts.get(alertId);
        if (!alert) {
            return;
        }

        alert.status = AlertStatus.RESOLVED;
        alert.resolvedAt = new Date().toISOString();
        
        this.activeAlerts.delete(alertId);
        this._addToHistory(alert);

        this.logger.info(`Alert resolved`, {
            alertId,
            ruleName: alert.ruleName,
            duration: Date.now() - new Date(alert.triggeredAt).getTime()
        }, 'alerting-system');
    }

    /**
     * Suppress alerts for a specific rule
     * @param {string} ruleName - Rule name
     * @param {number} duration - Suppression duration in milliseconds
     */
    suppressAlerts(ruleName, duration = this.config.suppressionWindow) {
        this.suppressedAlerts.add(ruleName);
        
        setTimeout(() => {
            this.suppressedAlerts.delete(ruleName);
            this.logger.info(`Alert suppression lifted`, { ruleName }, 'alerting-system');
        }, duration);

        this.stats.suppressedCount++;

        this.logger.info(`Alerts suppressed`, {
            ruleName,
            duration: `${duration}ms`
        }, 'alerting-system');
    }

    /**
     * Get active alerts
     * @returns {Array} Active alerts
     */
    getActiveAlerts() {
        return Array.from(this.activeAlerts.values());
    }

    /**
     * Get alert history
     * @param {number} limit - Maximum number of alerts to return
     * @returns {Array} Alert history
     */
    getAlertHistory(limit = 100) {
        return this.alertHistory.slice(-limit);
    }

    /**
     * Get alerting statistics
     * @returns {Object} Alerting statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeAlerts: this.activeAlerts.size,
            registeredRules: this.alertRules.size,
            registeredChannels: this.channels.size,
            suppressedRules: this.suppressedAlerts.size,
            channelStats: this._getChannelStats()
        };
    }

    /**
     * Clear alert history
     */
    clearHistory() {
        this.alertHistory = [];
        this.logger.info('Alert history cleared', {}, 'alerting-system');
    }

    /**
     * Enable/disable alerting
     * @param {boolean} enabled - Whether to enable alerting
     */
    setAlertingEnabled(enabled) {
        this.config.enableAlerting = enabled;
        
        this.logger.info(`Alerting ${enabled ? 'enabled' : 'disabled'}`, {}, 'alerting-system');
    }

    /**
     * Trigger an alert
     * @private
     */
    _triggerAlert(ruleName, rule, metrics, context) {
        // Check if rule is suppressed
        if (this.suppressedAlerts.has(ruleName)) {
            return;
        }

        // Check if alert already exists and is within suppression window
        const existingAlert = Array.from(this.activeAlerts.values())
            .find(alert => alert.ruleName === ruleName);

        if (existingAlert) {
            const timeSinceLastTrigger = Date.now() - new Date(existingAlert.triggeredAt).getTime();
            if (timeSinceLastTrigger < rule.suppressionWindow) {
                return; // Still within suppression window
            }
        }

        // Create new alert
        const alertId = this._generateAlertId();
        const alert = {
            id: alertId,
            ruleName,
            severity: rule.severity,
            message: this._formatAlertMessage(rule.message, metrics, context),
            status: AlertStatus.ACTIVE,
            triggeredAt: new Date().toISOString(),
            resolvedAt: null,
            metrics: metrics,
            context: context,
            metadata: rule.metadata
        };

        // Add to active alerts
        this.activeAlerts.set(alertId, alert);

        // Update statistics
        this.stats.totalAlerts++;
        this.stats.alertsBySeverity[rule.severity]++;
        this.stats.alertsByRule[ruleName]++;
        this.stats.lastAlert = alert.triggeredAt;

        // Send alert through configured channels
        this._sendAlert(alert, rule.channels);

        // Cleanup old alerts if we exceed the limit
        this._cleanupActiveAlerts();

        this.logger.warn(`Alert triggered`, {
            alertId,
            ruleName,
            severity: rule.severity,
            message: alert.message
        }, 'alerting-system');
    }

    /**
     * Resolve an alert by rule name
     * @private
     */
    _resolveAlert(ruleName) {
        const alert = Array.from(this.activeAlerts.values())
            .find(alert => alert.ruleName === ruleName);

        if (alert) {
            this.resolveAlert(alert.id);
        }
    }

    /**
     * Send alert through specified channels
     * @private
     */
    async _sendAlert(alert, channelNames) {
        for (const channelName of channelNames) {
            const channel = this.channels.get(channelName);
            if (!channel || !channel.config.enabled) {
                continue;
            }

            try {
                await this._sendToChannel(alert, channel);
                
                channel.stats.totalSent++;
                channel.stats.successful++;
                channel.stats.lastSent = new Date().toISOString();

            } catch (error) {
                channel.stats.totalSent++;
                channel.stats.failed++;
                channel.stats.lastError = error.message;

                this.logger.error(`Failed to send alert to channel`, {
                    alertId: alert.id,
                    channelName,
                    error: error.message
                }, 'alerting-system');
            }
        }
    }

    /**
     * Send alert to specific channel
     * @private
     */
    async _sendToChannel(alert, channel) {
        switch (channel.type) {
            case AlertChannel.LOG:
                this._sendToLogChannel(alert, channel);
                break;
            case AlertChannel.CONSOLE:
                this._sendToConsoleChannel(alert, channel);
                break;
            case AlertChannel.WEBHOOK:
                await this._sendToWebhookChannel(alert, channel);
                break;
            case AlertChannel.EMAIL:
                await this._sendToEmailChannel(alert, channel);
                break;
            default:
                throw new Error(`Unsupported channel type: ${channel.type}`);
        }
    }

    /**
     * Send alert to log channel
     * @private
     */
    _sendToLogChannel(alert, channel) {
        const logLevel = this._getLogLevel(alert.severity);
        this.logger[logLevel](`ALERT: ${alert.message}`, {
            alertId: alert.id,
            ruleName: alert.ruleName,
            severity: alert.severity,
            triggeredAt: alert.triggeredAt,
            context: alert.context
        }, 'alert');
    }

    /**
     * Send alert to console channel
     * @private
     */
    _sendToConsoleChannel(alert, channel) {
        const prefix = this._getSeverityPrefix(alert.severity);
        console.log(`${prefix} ALERT [${alert.ruleName}]: ${alert.message}`);
        console.log(`  Triggered: ${alert.triggeredAt}`);
        console.log(`  Alert ID: ${alert.id}`);
    }

    /**
     * Send alert to webhook channel
     * @private
     */
    async _sendToWebhookChannel(alert, channel) {
        const axios = require('axios');
        
        const payload = {
            alert: {
                id: alert.id,
                ruleName: alert.ruleName,
                severity: alert.severity,
                message: alert.message,
                triggeredAt: alert.triggeredAt,
                status: alert.status
            },
            context: alert.context,
            metadata: alert.metadata
        };

        await axios.post(channel.config.url, payload, {
            timeout: channel.config.timeout,
            headers: channel.config.headers || {}
        });
    }

    /**
     * Send alert to email channel (placeholder)
     * @private
     */
    async _sendToEmailChannel(alert, channel) {
        // This would integrate with an email service like SendGrid, SES, etc.
        // For now, just log that we would send an email
        this.logger.info(`Would send email alert`, {
            alertId: alert.id,
            to: channel.config.recipients,
            subject: `Alert: ${alert.ruleName}`,
            message: alert.message
        }, 'alerting-system');
    }

    /**
     * Initialize default alert channels
     * @private
     */
    _initializeDefaultChannels() {
        // Log channel
        this.registerAlertChannel('log', AlertChannel.LOG, {
            enabled: true
        });

        // Console channel
        this.registerAlertChannel('console', AlertChannel.CONSOLE, {
            enabled: process.env.NODE_ENV === 'development'
        });
    }

    /**
     * Format alert message with context
     * @private
     */
    _formatAlertMessage(template, metrics, context) {
        let message = template;
        
        // Replace metric placeholders
        if (metrics) {
            for (const [key, value] of Object.entries(metrics)) {
                message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
            }
        }
        
        // Replace context placeholders
        if (context) {
            for (const [key, value] of Object.entries(context)) {
                message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
            }
        }
        
        return message;
    }

    /**
     * Generate unique alert ID
     * @private
     */
    _generateAlertId() {
        return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get log level for severity
     * @private
     */
    _getLogLevel(severity) {
        switch (severity) {
            case AlertSeverity.INFO:
                return 'info';
            case AlertSeverity.WARNING:
                return 'warn';
            case AlertSeverity.ERROR:
            case AlertSeverity.CRITICAL:
                return 'error';
            default:
                return 'info';
        }
    }

    /**
     * Get severity prefix for console output
     * @private
     */
    _getSeverityPrefix(severity) {
        switch (severity) {
            case AlertSeverity.INFO:
                return '[INFO]';
            case AlertSeverity.WARNING:
                return '[WARN]';
            case AlertSeverity.ERROR:
                return '[ERROR]';
            case AlertSeverity.CRITICAL:
                return '[CRITICAL]';
            default:
                return '[ALERT]';
        }
    }

    /**
     * Get channel statistics
     * @private
     */
    _getChannelStats() {
        const stats = {};
        
        for (const [name, channel] of this.channels) {
            stats[name] = {
                type: channel.type,
                enabled: channel.config.enabled,
                ...channel.stats
            };
        }
        
        return stats;
    }

    /**
     * Add alert to history
     * @private
     */
    _addToHistory(alert) {
        this.alertHistory.push(alert);
        
        // Limit history size
        if (this.alertHistory.length > 1000) {
            this.alertHistory = this.alertHistory.slice(-1000);
        }
    }

    /**
     * Cleanup old active alerts
     * @private
     */
    _cleanupActiveAlerts() {
        if (this.activeAlerts.size <= this.config.maxActiveAlerts) {
            return;
        }

        // Remove oldest alerts
        const alerts = Array.from(this.activeAlerts.values())
            .sort((a, b) => new Date(a.triggeredAt) - new Date(b.triggeredAt));

        const toRemove = alerts.slice(0, alerts.length - this.config.maxActiveAlerts);
        
        for (const alert of toRemove) {
            alert.status = AlertStatus.RESOLVED;
            alert.resolvedAt = new Date().toISOString();
            
            this.activeAlerts.delete(alert.id);
            this._addToHistory(alert);
        }
    }
}

/**
 * Predefined alert rules for common scenarios
 */
const CommonAlertRules = {
    /**
     * High error rate alert
     */
    highErrorRate: (threshold = 0.1) => ({
        condition: (metrics) => {
            const errorRate = metrics.errorRate || 0;
            return errorRate > threshold;
        },
        severity: AlertSeverity.ERROR,
        message: `High error rate detected: {errorRate}% (threshold: ${threshold * 100}%)`,
        suppressionWindow: 300000 // 5 minutes
    }),

    /**
     * High response time alert
     */
    highResponseTime: (threshold = 5000) => ({
        condition: (metrics) => {
            const avgResponseTime = metrics.avgResponseTime || 0;
            return avgResponseTime > threshold;
        },
        severity: AlertSeverity.WARNING,
        message: `High response time detected: {avgResponseTime}ms (threshold: ${threshold}ms)`,
        suppressionWindow: 300000
    }),

    /**
     * Low throughput alert
     */
    lowThroughput: (threshold = 1) => ({
        condition: (metrics) => {
            const requestRate = metrics.requestRate || 0;
            return requestRate < threshold;
        },
        severity: AlertSeverity.WARNING,
        message: `Low throughput detected: {requestRate} req/min (threshold: ${threshold} req/min)`,
        suppressionWindow: 600000 // 10 minutes
    }),

    /**
     * High memory usage alert
     */
    highMemoryUsage: (threshold = 0.9) => ({
        condition: (metrics) => {
            const memoryUsage = metrics.memoryUsagePercent || 0;
            return memoryUsage > threshold;
        },
        severity: AlertSeverity.CRITICAL,
        message: `High memory usage detected: {memoryUsagePercent}% (threshold: ${threshold * 100}%)`,
        suppressionWindow: 300000
    }),

    /**
     * Service unavailable alert
     */
    serviceUnavailable: () => ({
        condition: (metrics, context) => {
            return context.serviceStatus === 'unavailable';
        },
        severity: AlertSeverity.CRITICAL,
        message: `Service unavailable: {serviceName}`,
        suppressionWindow: 60000 // 1 minute
    })
};

module.exports = {
    AlertingSystem,
    AlertSeverity,
    AlertStatus,
    AlertChannel,
    CommonAlertRules
};