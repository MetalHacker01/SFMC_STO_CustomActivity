/**
 * Execution Engine Tests
 * Tests for the core execution engine functionality
 */

const { ExecutionEngine } = require('../src/execution');

describe('ExecutionEngine', () => {
    let executionEngine;
    let mockLogger;

    beforeEach(() => {
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        executionEngine = new ExecutionEngine({
            defaultTimezone: 'America/Chicago',
            holidayApiEnabled: false, // Disable for testing
            maxRetries: 1,
            retryDelay: 100
        }, mockLogger);
    });

    afterEach(() => {
        if (executionEngine) {
            executionEngine.cleanup();
        }
    });

    describe('executeContact', () => {
        it('should successfully process a contact', async () => {
            const contact = {
                subscriberKey: 'test123',
                geosegment: 'US',
                emailAddress: 'test@example.com',
                entryTime: new Date()
            };

            const activityConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true },
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            const context = {
                journeyId: 'journey123',
                activityId: 'activity123'
            };

            const result = await executionEngine.executeContact(contact, activityConfig, context);

            expect(result.success).toBe(true);
            expect(result.subscriberKey).toBe('test123');
            expect(result.convertedTime).toBeDefined();
            expect(result.engineProcessingTime).toBeGreaterThan(0);
            expect(result.engineId).toBeDefined();
        });

        it('should handle invalid contact data', async () => {
            const contact = {
                // Missing subscriberKey
                geosegment: 'US'
            };

            const activityConfig = {
                skipWeekends: false,
                skipHolidays: false
            };

            const result = await executionEngine.executeContact(contact, activityConfig, {});

            expect(result.success).toBe(false);
            expect(result.error).toContain('SubscriberKey is required');
        });

        it('should handle missing activity configuration', async () => {
            const contact = {
                subscriberKey: 'test123',
                geosegment: 'US'
            };

            const result = await executionEngine.executeContact(contact, null, {});

            expect(result.success).toBe(false);
            expect(result.error).toContain('Activity configuration is required');
        });
    });

    describe('executeBatch', () => {
        it('should process multiple contacts', async () => {
            const contacts = [
                {
                    subscriberKey: 'test1',
                    geosegment: 'US',
                    entryTime: new Date()
                },
                {
                    subscriberKey: 'test2',
                    geosegment: 'CA',
                    entryTime: new Date()
                }
            ];

            const activityConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 10, endHour: 11, enabled: true }
                ]
            };

            const result = await executionEngine.executeBatch(contacts, activityConfig, {});

            expect(result.success).toBe(true);
            expect(result.totalContacts).toBe(2);
            expect(result.successful).toBe(2);
            expect(result.failed).toBe(0);
            expect(result.results).toHaveLength(2);
            expect(result.engineProcessingTime).toBeGreaterThan(0);
        });

        it('should handle empty contacts array', async () => {
            const result = await executionEngine.executeBatch([], {}, {});

            expect(result.success).toBe(false);
            expect(result.error).toContain('must not be empty');
        });
    });

    describe('createContactProcessingPipeline', () => {
        it('should create a comprehensive processing pipeline', async () => {
            const contact = {
                subscriberKey: 'pipeline_test',
                geosegment: 'US',
                entryTime: new Date()
            };

            const activityConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true }
                ]
            };

            const pipeline = await executionEngine.createContactProcessingPipeline(
                contact, 
                activityConfig, 
                {}
            );

            expect(pipeline.id).toBeDefined();
            expect(pipeline.contact).toEqual(contact);
            expect(pipeline.config).toEqual(activityConfig);
            expect(pipeline.steps).toBeInstanceOf(Array);
            expect(pipeline.steps.length).toBeGreaterThan(0);
            expect(pipeline.startTime).toBeDefined();
            expect(pipeline.endTime).toBeDefined();
            expect(pipeline.totalProcessingTime).toBeGreaterThan(0);
            expect(pipeline.success).toBe(true);
            expect(pipeline.result).toBeDefined();

            // Check that all steps have proper structure
            pipeline.steps.forEach(step => {
                expect(step.step).toBeDefined();
                expect(step.startTime).toBeDefined();
                expect(step.status).toBeDefined();
                expect(['completed', 'failed'].includes(step.status)).toBe(true);
            });
        });

        it('should handle pipeline failures gracefully', async () => {
            const contact = {
                // Invalid contact data to trigger pipeline failure
                geosegment: 'US'
                // Missing subscriberKey
            };

            const activityConfig = {
                skipWeekends: false,
                skipHolidays: false
            };

            const pipeline = await executionEngine.createContactProcessingPipeline(
                contact, 
                activityConfig, 
                {}
            );

            expect(pipeline.success).toBe(false);
            expect(pipeline.error).toBeDefined();
            expect(pipeline.steps.length).toBeGreaterThan(0);
            
            // Check that at least one step failed
            const failedSteps = pipeline.steps.filter(step => step.status === 'failed');
            expect(failedSteps.length).toBeGreaterThan(0);
        });
    });

    describe('getEngineStats', () => {
        it('should return comprehensive engine statistics', async () => {
            // Process a contact to generate some stats
            const contact = {
                subscriberKey: 'stats_test',
                geosegment: 'US',
                entryTime: new Date()
            };

            const activityConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [{ startHour: 10, endHour: 11, enabled: true }]
            };

            await executionEngine.executeContact(contact, activityConfig, {});

            const stats = executionEngine.getEngineStats();

            expect(stats.engine).toBeDefined();
            expect(stats.engine.totalRequests).toBeGreaterThan(0);
            expect(stats.engine.singleRequests).toBeGreaterThan(0);
            expect(stats.engine.totalContactsProcessed).toBeGreaterThan(0);
            expect(stats.engine.uptime).toBeGreaterThan(0);
            expect(stats.engine.timestamp).toBeDefined();

            expect(stats.contactProcessor).toBeDefined();
            expect(stats.executionLogging).toBeDefined();
            expect(stats.performance).toBeDefined();
            expect(stats.sendTimeCalculator).toBeDefined();
        });
    });

    describe('healthCheck', () => {
        it('should return health status', async () => {
            const health = await executionEngine.healthCheck();

            expect(health.status).toBeDefined();
            expect(['healthy', 'degraded', 'unhealthy'].includes(health.status)).toBe(true);
            expect(health.engine).toBeDefined();
            expect(health.contactProcessor).toBeDefined();
            expect(health.timestamp).toBeDefined();
        });
    });

    describe('resetEngineStats', () => {
        it('should reset all statistics', async () => {
            // Generate some stats first
            const contact = {
                subscriberKey: 'reset_test',
                geosegment: 'US',
                entryTime: new Date()
            };

            await executionEngine.executeContact(contact, {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [{ startHour: 10, endHour: 11, enabled: true }]
            }, {});

            // Verify stats exist
            let stats = executionEngine.getEngineStats();
            expect(stats.engine.totalRequests).toBeGreaterThan(0);

            // Reset stats
            executionEngine.resetEngineStats();

            // Verify stats are reset
            stats = executionEngine.getEngineStats();
            expect(stats.engine.totalRequests).toBe(0);
            expect(stats.engine.singleRequests).toBe(0);
            expect(stats.engine.totalContactsProcessed).toBe(0);
        });
    });
});