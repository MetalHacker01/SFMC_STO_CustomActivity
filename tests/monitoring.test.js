/**
 * Tests for Monitoring and Alerting System
 */

const {
    HealthMonitor,
    PerformanceCollector,
    AlertingSystem,
    MonitoringSystem,
    HealthStatus,
    MetricType,
    AlertSeverity,
    AlertStatus,
    AlertChannel,
    CommonAlertRules
} = require('../src/monitoring');

// Mock logger to prevent console output during tests
jest.mock('../src/logging', () => ({
    createApiLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    })
}));

describe('HealthMonitor', () => {
    let healthMonitor;

    beforeEach(() => {
        healthMonitor = new HealthMonitor({
            checkInterval: 1000,
            healthTimeout: 500
        });
    });

    afterEach(() => {
        healthMonitor.stopMonitoring();
    });

    describe('Component Registration', () => {
        test('should register health check component', () => {
            const healthCheck = jest.fn().mockResolvedValue({ status: HealthStatus.HEALTHY });
            
            healthMonitor.registerComponent('test-component', healthCheck, {
                critical: true,
                timeout: 1000
            });

            const component = healthMonitor.components.get('test-component');
            expect(component).toBeDefined();
            expect(component.name).toBe('test-component');
            expect(component.config.critical).toBe(true);
            expect(component.config.timeout).toBe(1000);
        });

        test('should get component health status', async () => {
            const healthCheck = jest.fn().mockResolvedValue({ status: HealthStatus.HEALTHY });
            healthMonitor.registerComponent('test-component', healthCheck);

            await healthMonitor.performHealthCheck();

            const componentHealth = healthMonitor.getComponentHealth('test-component');
            expect(componentHealth).toBeDefined();
            expect(componentHealth.status).toBe(HealthStatus.HEALTHY);
            expect(componentHealth.totalChecks).toBe(1);
            expect(componentHealth.successfulChecks).toBe(1);
        });
    });

    describe('Health Checking', () => {
        test('should perform health check on all components', async () => {
            const healthyCheck = jest.fn().mockResolvedValue({ status: HealthStatus.HEALTHY });
            const unhealthyCheck = jest.fn().mockRejectedValue(new Error('Component failed'));

            healthMonitor.registerComponent('healthy-component', healthyCheck);
            healthMonitor.registerComponent('unhealthy-component', unhealthyCheck, { critical: true });

            const result = await healthMonitor.performHealthCheck();

            expect(result.status).toBe(HealthStatus.UNHEALTHY);
            expect(result.summary.totalComponents).toBe(2);
            expect(result.summary.failedComponents).toBe(1);
            expect(result.summary.criticalFailures).toBe(1);
        });

        test('should handle component timeout', async () => {
            const slowCheck = jest.fn().mockImplementation(() => 
                new Promise(resolve => setTimeout(resolve, 1000))
            );

            healthMonitor.registerComponent('slow-component', slowCheck, { timeout: 100 });

            const result = await healthMonitor.performHealthCheck();

            expect(result.status).toBe(HealthStatus.UNHEALTHY);
            expect(result.summary.failedComponents).toBe(1);
        });

        test('should track consecutive failures', async () => {
            const failingCheck = jest.fn().mockRejectedValue(new Error('Always fails'));
            healthMonitor.registerComponent('failing-component', failingCheck);

            // Perform multiple health checks
            await healthMonitor.performHealthCheck();
            await healthMonitor.performHealthCheck();
            await healthMonitor.performHealthCheck();

            const componentHealth = healthMonitor.getComponentHealth('failing-component');
            expect(componentHealth.consecutiveFailures).toBe(3);
            expect(componentHealth.failedChecks).toBe(3);
        });
    });

    describe('Performance Metrics', () => {
        test('should record request metrics', () => {
            healthMonitor.recordRequest(100, true);
            healthMonitor.recordRequest(200, false, 'TIMEOUT');

            const metrics = healthMonitor.getPerformanceMetrics();
            expect(metrics.responseTime.samples).toBe(2);
            expect(metrics.throughput.totalRequests).toBe(2);
            expect(metrics.errors.total).toBe(1);
        });

        test('should calculate average response time', () => {
            healthMonitor.recordRequest(100, true);
            healthMonitor.recordRequest(200, true);
            healthMonitor.recordRequest(300, true);

            const metrics = healthMonitor.getPerformanceMetrics();
            expect(metrics.responseTime.average).toBe(200);
            expect(metrics.responseTime.min).toBe(100);
            expect(metrics.responseTime.max).toBe(300);
        });
    });
});

describe('PerformanceCollector', () => {
    let collector;

    beforeEach(() => {
        collector = new PerformanceCollector({
            collectionInterval: 1000,
            enableAutoCollection: false
        });
    });

    afterEach(() => {
        collector.stopCollection();
    });

    describe('Metric Registration', () => {
        test('should register counter metric', () => {
            collector.registerMetric('test_counter', MetricType.COUNTER, {
                description: 'Test counter metric'
            });

            const metric = collector.metrics.get('test_counter');
            expect(metric).toBeDefined();
            expect(metric.type).toBe(MetricType.COUNTER);
            expect(metric.value).toBe(0);
        });

        test('should register gauge metric', () => {
            collector.registerMetric('test_gauge', MetricType.GAUGE);

            const metric = collector.metrics.get('test_gauge');
            expect(metric).toBeDefined();
            expect(metric.type).toBe(MetricType.GAUGE);
            expect(metric.value).toBe(0);
        });

        test('should register histogram metric', () => {
            collector.registerMetric('test_histogram', MetricType.HISTOGRAM, {
                buckets: [0.1, 0.5, 1, 2.5, 5]
            });

            const metric = collector.metrics.get('test_histogram');
            expect(metric).toBeDefined();
            expect(metric.type).toBe(MetricType.HISTOGRAM);
            expect(metric.value.buckets).toEqual({});
            expect(metric.value.count).toBe(0);
            expect(metric.value.sum).toBe(0);
        });
    });

    describe('Metric Recording', () => {
        test('should increment counter', () => {
            collector.registerMetric('requests_total', MetricType.COUNTER);
            
            collector.incrementCounter('requests_total', 5);
            collector.incrementCounter('requests_total', 3);

            const metric = collector.getMetric('requests_total');
            expect(metric).toBe(8);
        });

        test('should set gauge value', () => {
            collector.registerMetric('memory_usage', MetricType.GAUGE);
            
            collector.setGauge('memory_usage', 1024);
            collector.setGauge('memory_usage', 2048);

            const metric = collector.getMetric('memory_usage');
            expect(metric).toBe(2048);
        });

        test('should record histogram observations', () => {
            collector.registerMetric('response_time', MetricType.HISTOGRAM, {
                buckets: [0.1, 0.5, 1, 2.5, 5]
            });
            
            collector.observeHistogram('response_time', 0.3);
            collector.observeHistogram('response_time', 1.2);
            collector.observeHistogram('response_time', 0.8);

            const metric = collector.getMetric('response_time');
            expect(metric.count).toBe(3);
            expect(metric.sum).toBe(2.3);
            expect(metric.buckets['0.5']).toBe(1); // 0.3 falls in 0.5 bucket
            expect(metric.buckets['1']).toBe(2); // 0.3 and 0.8 fall in 1 bucket
        });

        test('should record timer measurements', () => {
            collector.registerMetric('operation_duration', MetricType.TIMER);
            
            collector.recordTimer('operation_duration', 100);
            collector.recordTimer('operation_duration', 200);
            collector.recordTimer('operation_duration', 150);

            const metric = collector.getMetric('operation_duration');
            expect(metric.count).toBe(3);
            expect(metric.sum).toBe(450);
            expect(metric.avg).toBe(150);
            expect(metric.min).toBe(100);
            expect(metric.max).toBe(200);
        });
    });

    describe('Request Recording', () => {
        test('should record HTTP request metrics', () => {
            collector.recordRequest('GET', '/api/test', 200, 150);
            collector.recordRequest('POST', '/api/test', 500, 300);

            const requestsTotal = collector.getMetric('http_requests_total');
            const errorsTotal = collector.getMetric('http_errors_total');
            
            expect(requestsTotal).toBe(2);
            expect(errorsTotal).toBe(1);
        });

        test('should record operation metrics', () => {
            collector.recordOperation('process_contact', 250, true);
            collector.recordOperation('process_contact', 400, false, 'TIMEOUT');

            const operationsTotal = collector.getMetric('operations_total');
            const operationErrors = collector.getMetric('operation_errors_total');
            
            expect(operationsTotal).toBe(2);
            expect(operationErrors).toBe(1);
        });
    });

    describe('Time Series', () => {
        test('should maintain time series data', () => {
            collector.registerMetric('test_counter', MetricType.COUNTER);
            
            collector.incrementCounter('test_counter', 1);
            collector.incrementCounter('test_counter', 2);
            collector.incrementCounter('test_counter', 3);

            const timeSeries = collector.getTimeSeries('test_counter');
            expect(timeSeries).toHaveLength(3);
            expect(timeSeries[0].value).toBe(1);
            expect(timeSeries[1].value).toBe(3); // Cumulative
            expect(timeSeries[2].value).toBe(6); // Cumulative
        });

        test('should filter time series by duration', () => {
            collector.registerMetric('test_gauge', MetricType.GAUGE);
            
            // Record some old data
            const oldTimestamp = Date.now() - 7200000; // 2 hours ago
            collector.timeSeries.get('test_gauge').push({
                timestamp: oldTimestamp,
                value: 100,
                labels: {}
            });
            
            // Record recent data
            collector.setGauge('test_gauge', 200);

            const recentSeries = collector.getTimeSeries('test_gauge', 3600000); // Last hour
            expect(recentSeries).toHaveLength(1);
            expect(recentSeries[0].value).toBe(200);
        });
    });

    describe('Performance Summary', () => {
        test('should generate performance summary', () => {
            // Record some metrics
            collector.recordRequest('GET', '/api/test', 200, 100);
            collector.recordRequest('POST', '/api/test', 201, 150);
            collector.recordRequest('GET', '/api/test', 500, 200);

            const summary = collector.getPerformanceSummary();
            
            expect(summary.requests.total).toBe(3);
            expect(summary.requests.errorRate).toBe('33.33%');
            expect(summary.requests.avgResponseTime).toBe('150.00ms');
            expect(summary.isCollecting).toBe(false);
        });
    });
});

describe('AlertingSystem', () => {
    let alertingSystem;

    beforeEach(() => {
        alertingSystem = new AlertingSystem({
            enableAlerting: true,
            suppressionWindow: 1000
        });
    });

    describe('Alert Rule Registration', () => {
        test('should register alert rule', () => {
            const rule = {
                condition: (metrics) => metrics.errorRate > 0.1,
                severity: AlertSeverity.ERROR,
                message: 'High error rate: {errorRate}%'
            };

            alertingSystem.registerAlertRule('high_error_rate', rule);

            const registeredRule = alertingSystem.alertRules.get('high_error_rate');
            expect(registeredRule).toBeDefined();
            expect(registeredRule.severity).toBe(AlertSeverity.ERROR);
            expect(registeredRule.enabled).toBe(true);
        });

        test('should register alert channel', () => {
            alertingSystem.registerAlertChannel('webhook', AlertChannel.WEBHOOK, {
                url: 'https://example.com/webhook',
                timeout: 5000
            });

            const channel = alertingSystem.channels.get('webhook');
            expect(channel).toBeDefined();
            expect(channel.type).toBe(AlertChannel.WEBHOOK);
            expect(channel.config.url).toBe('https://example.com/webhook');
        });
    });

    describe('Alert Evaluation', () => {
        test('should trigger alert when condition is met', () => {
            const rule = {
                condition: (metrics) => metrics.errorRate > 0.1,
                severity: AlertSeverity.ERROR,
                message: 'High error rate: {errorRate}%',
                channels: ['log']
            };

            alertingSystem.registerAlertRule('high_error_rate', rule);

            const metrics = { errorRate: 0.15 };
            alertingSystem.evaluateAlerts(metrics);

            const activeAlerts = alertingSystem.getActiveAlerts();
            expect(activeAlerts).toHaveLength(1);
            expect(activeAlerts[0].ruleName).toBe('high_error_rate');
            expect(activeAlerts[0].severity).toBe(AlertSeverity.ERROR);
        });

        test('should not trigger alert when condition is not met', () => {
            const rule = {
                condition: (metrics) => metrics.errorRate > 0.1,
                severity: AlertSeverity.ERROR,
                message: 'High error rate: {errorRate}%'
            };

            alertingSystem.registerAlertRule('high_error_rate', rule);

            const metrics = { errorRate: 0.05 };
            alertingSystem.evaluateAlerts(metrics);

            const activeAlerts = alertingSystem.getActiveAlerts();
            expect(activeAlerts).toHaveLength(0);
        });

        test('should resolve alert when condition is no longer met', () => {
            const rule = {
                condition: (metrics) => metrics.errorRate > 0.1,
                severity: AlertSeverity.ERROR,
                message: 'High error rate: {errorRate}%'
            };

            alertingSystem.registerAlertRule('high_error_rate', rule);

            // Trigger alert
            alertingSystem.evaluateAlerts({ errorRate: 0.15 });
            expect(alertingSystem.getActiveAlerts()).toHaveLength(1);

            // Resolve alert
            alertingSystem.evaluateAlerts({ errorRate: 0.05 });
            expect(alertingSystem.getActiveAlerts()).toHaveLength(0);
        });

        test('should respect suppression window', () => {
            const rule = {
                condition: (metrics) => metrics.errorRate > 0.1,
                severity: AlertSeverity.ERROR,
                message: 'High error rate: {errorRate}%',
                suppressionWindow: 5000
            };

            alertingSystem.registerAlertRule('high_error_rate', rule);

            // Trigger alert twice quickly
            alertingSystem.evaluateAlerts({ errorRate: 0.15 });
            alertingSystem.evaluateAlerts({ errorRate: 0.20 });

            const activeAlerts = alertingSystem.getActiveAlerts();
            expect(activeAlerts).toHaveLength(1); // Should only have one alert due to suppression
        });
    });

    describe('Manual Alert Triggering', () => {
        test('should trigger alert manually', () => {
            const rule = {
                condition: () => false, // Never triggers automatically
                severity: AlertSeverity.CRITICAL,
                message: 'Manual alert triggered'
            };

            alertingSystem.registerAlertRule('manual_alert', rule);
            alertingSystem.triggerAlert('manual_alert', { reason: 'Testing' });

            const activeAlerts = alertingSystem.getActiveAlerts();
            expect(activeAlerts).toHaveLength(1);
            expect(activeAlerts[0].ruleName).toBe('manual_alert');
        });
    });

    describe('Alert Suppression', () => {
        test('should suppress alerts for specific rule', () => {
            const rule = {
                condition: (metrics) => metrics.errorRate > 0.1,
                severity: AlertSeverity.ERROR,
                message: 'High error rate: {errorRate}%'
            };

            alertingSystem.registerAlertRule('high_error_rate', rule);
            alertingSystem.suppressAlerts('high_error_rate', 1000);

            // Try to trigger alert while suppressed
            alertingSystem.evaluateAlerts({ errorRate: 0.15 });

            const activeAlerts = alertingSystem.getActiveAlerts();
            expect(activeAlerts).toHaveLength(0);
        });
    });

    describe('Statistics', () => {
        test('should track alert statistics', () => {
            const rule = {
                condition: (metrics) => metrics.errorRate > 0.1,
                severity: AlertSeverity.ERROR,
                message: 'High error rate: {errorRate}%'
            };

            alertingSystem.registerAlertRule('high_error_rate', rule);

            // Trigger some alerts
            alertingSystem.evaluateAlerts({ errorRate: 0.15 });
            alertingSystem.evaluateAlerts({ errorRate: 0.05 }); // Resolve
            alertingSystem.evaluateAlerts({ errorRate: 0.20 }); // Trigger again

            const stats = alertingSystem.getStats();
            expect(stats.totalAlerts).toBe(2);
            expect(stats.alertsBySeverity[AlertSeverity.ERROR]).toBe(2);
            expect(stats.alertsByRule['high_error_rate']).toBe(2);
        });
    });
});

describe('MonitoringSystem Integration', () => {
    let monitoringSystem;

    beforeEach(() => {
        monitoringSystem = new MonitoringSystem({
            enableHealthMonitoring: true,
            enablePerformanceCollection: true,
            enableAlerting: true,
            healthCheckInterval: 1000,
            metricsCollectionInterval: 1000,
            alertEvaluationInterval: 1000
        });
    });

    afterEach(() => {
        monitoringSystem.stop();
    });

    describe('System Integration', () => {
        test('should start and stop monitoring system', () => {
            expect(monitoringSystem.isRunning).toBe(false);
            
            monitoringSystem.start();
            expect(monitoringSystem.isRunning).toBe(true);
            
            monitoringSystem.stop();
            expect(monitoringSystem.isRunning).toBe(false);
        });

        test('should register components across all systems', () => {
            const healthCheck = jest.fn().mockResolvedValue({ status: HealthStatus.HEALTHY });
            
            monitoringSystem.registerHealthCheck('test-component', healthCheck);
            monitoringSystem.registerMetric('test_metric', MetricType.COUNTER);
            monitoringSystem.registerAlertRule('test_alert', {
                condition: () => false,
                severity: AlertSeverity.INFO,
                message: 'Test alert'
            });

            expect(monitoringSystem.healthMonitor.components.has('test-component')).toBe(true);
            expect(monitoringSystem.performanceCollector.metrics.has('test_metric')).toBe(true);
            expect(monitoringSystem.alertingSystem.alertRules.has('test_alert')).toBe(true);
        });

        test('should record requests across all systems', () => {
            monitoringSystem.recordRequest('GET', '/api/test', 200, 150);

            const performanceMetrics = monitoringSystem.getPerformanceMetrics();
            const healthMetrics = monitoringSystem.healthMonitor.getPerformanceMetrics();

            expect(performanceMetrics.http_requests_total.value).toBe(1);
            expect(healthMetrics.throughput.totalRequests).toBe(1);
        });

        test('should get comprehensive status', async () => {
            const healthCheck = jest.fn().mockResolvedValue({ status: HealthStatus.HEALTHY });
            monitoringSystem.registerHealthCheck('test-component', healthCheck);
            
            const status = await monitoringSystem.getStatus();

            expect(status).toHaveProperty('timestamp');
            expect(status).toHaveProperty('isRunning');
            expect(status).toHaveProperty('health');
            expect(status).toHaveProperty('performance');
            expect(status).toHaveProperty('alerting');
            expect(status).toHaveProperty('system');
        });
    });

    describe('Express Middleware', () => {
        test('should create Express middleware', () => {
            const middleware = monitoringSystem.createExpressMiddleware();
            expect(typeof middleware).toBe('function');
            expect(middleware.length).toBe(3); // req, res, next
        });
    });

    describe('Operation Wrapper', () => {
        test('should wrap operation with monitoring', async () => {
            const testOperation = jest.fn().mockResolvedValue('success');
            const wrappedOperation = monitoringSystem.wrapOperation('test_op', testOperation);

            const result = await wrappedOperation('arg1', 'arg2');

            expect(result).toBe('success');
            expect(testOperation).toHaveBeenCalledWith('arg1', 'arg2');
            
            const metrics = monitoringSystem.getPerformanceMetrics();
            expect(metrics.operations_total.value).toBe(1);
        });

        test('should handle operation errors', async () => {
            const testOperation = jest.fn().mockRejectedValue(new Error('Test error'));
            const wrappedOperation = monitoringSystem.wrapOperation('test_op', testOperation);

            await expect(wrappedOperation()).rejects.toThrow('Test error');
            
            const metrics = monitoringSystem.getPerformanceMetrics();
            expect(metrics.operations_total.value).toBe(1);
            expect(metrics.operation_errors_total.value).toBe(1);
        });
    });
});

describe('Common Alert Rules', () => {
    test('should create high error rate rule', () => {
        const rule = CommonAlertRules.highErrorRate(0.1);
        
        expect(rule.condition({ errorRate: 0.15 })).toBe(true);
        expect(rule.condition({ errorRate: 0.05 })).toBe(false);
        expect(rule.severity).toBe(AlertSeverity.ERROR);
    });

    test('should create high response time rule', () => {
        const rule = CommonAlertRules.highResponseTime(1000);
        
        expect(rule.condition({ avgResponseTime: 1500 })).toBe(true);
        expect(rule.condition({ avgResponseTime: 500 })).toBe(false);
        expect(rule.severity).toBe(AlertSeverity.WARNING);
    });

    test('should create service unavailable rule', () => {
        const rule = CommonAlertRules.serviceUnavailable();
        
        expect(rule.condition({}, { serviceStatus: 'unavailable' })).toBe(true);
        expect(rule.condition({}, { serviceStatus: 'available' })).toBe(false);
        expect(rule.severity).toBe(AlertSeverity.CRITICAL);
    });
});