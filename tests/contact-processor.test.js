/**
 * Contact Processor Tests
 * Tests for the main contact processing workflow
 */

const ContactProcessor = require('../src/execution/contact-processor');

describe('ContactProcessor', () => {
    let processor;
    let mockLogger;

    beforeEach(() => {
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        processor = new ContactProcessor({
            defaultTimezone: 'America/Chicago',
            holidayApiEnabled: false, // Disable for testing
            maxRetries: 1,
            retryDelay: 100
        }, mockLogger);
    });

    describe('processContact', () => {
        test('should process a valid contact successfully', async () => {
            const contact = {
                subscriberKey: '12345',
                geosegment: 'US',
                entryTime: new Date('2024-01-15T10:00:00Z')
            };

            const activityConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true },
                    { startHour: 10, endHour: 11, enabled: true }
                ]
            };

            const result = await processor.processContact(contact, activityConfig);

            expect(result.success).toBe(true);
            expect(result.subscriberKey).toBe('12345');
            expect(result.convertedTime).toBeInstanceOf(Date);
            expect(result.adjustments).toBeInstanceOf(Array);
            expect(result.processingTime).toBeGreaterThan(0);
        });

        test('should handle missing subscriberKey', async () => {
            const contact = {
                geosegment: 'US'
            };

            const activityConfig = {
                skipWeekends: false,
                skipHolidays: false
            };

            const result = await processor.processContact(contact, activityConfig);

            expect(result.success).toBe(false);
            expect(result.error).toContain('SubscriberKey is required');
        });

        test('should handle invalid country code with fallback', async () => {
            const contact = {
                subscriberKey: '12345',
                geosegment: 'INVALID',
                entryTime: new Date('2024-01-15T10:00:00Z')
            };

            const activityConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true }
                ]
            };

            const result = await processor.processContact(contact, activityConfig);

            expect(result.success).toBe(true);
            expect(result.subscriberKey).toBe('12345');
            expect(result.adjustments.some(adj => adj.type === 'timezone_fallback')).toBe(true);
        });

        test('should handle missing geosegment with default', async () => {
            const contact = {
                subscriberKey: '12345',
                entryTime: new Date('2024-01-15T10:00:00Z')
            };

            const activityConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true }
                ]
            };

            const result = await processor.processContact(contact, activityConfig);

            expect(result.success).toBe(true);
            expect(result.subscriberKey).toBe('12345');
            expect(result.convertedTime).toBeInstanceOf(Date);
        });
    });

    describe('processBatch', () => {
        test('should process multiple contacts', async () => {
            const contacts = [
                {
                    subscriberKey: '12345',
                    geosegment: 'US',
                    entryTime: new Date('2024-01-15T10:00:00Z')
                },
                {
                    subscriberKey: '67890',
                    geosegment: 'BR',
                    entryTime: new Date('2024-01-15T10:00:00Z')
                }
            ];

            const activityConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true }
                ]
            };

            const result = await processor.processBatch(contacts, activityConfig);

            expect(result.success).toBe(true);
            expect(result.totalContacts).toBe(2);
            expect(result.successful).toBe(2);
            expect(result.failed).toBe(0);
            expect(result.results).toHaveLength(2);
        });

        test('should handle empty contacts array', async () => {
            const result = await processor.processBatch([], {});

            expect(result.success).toBe(false);
            expect(result.error).toContain('No contacts provided');
        });

        test('should handle mixed success and failure', async () => {
            const contacts = [
                {
                    subscriberKey: '12345',
                    geosegment: 'US',
                    entryTime: new Date('2024-01-15T10:00:00Z')
                },
                {
                    // Missing subscriberKey - should fail
                    geosegment: 'BR',
                    entryTime: new Date('2024-01-15T10:00:00Z')
                }
            ];

            const activityConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true }
                ]
            };

            const result = await processor.processBatch(contacts, activityConfig);

            expect(result.success).toBe(false); // Overall failure due to one failed contact
            expect(result.totalContacts).toBe(2);
            expect(result.successful).toBe(1);
            expect(result.failed).toBe(1);
        });
    });

    describe('getStats', () => {
        test('should return processing statistics', () => {
            const stats = processor.getStats();

            expect(stats).toHaveProperty('totalProcessed');
            expect(stats).toHaveProperty('successful');
            expect(stats).toHaveProperty('failed');
            expect(stats).toHaveProperty('timezone');
            expect(stats).toHaveProperty('holiday');
            expect(stats.totalProcessed).toBe(0); // No processing done yet
        });
    });

    describe('healthCheck', () => {
        test('should return health status', async () => {
            const health = await processor.healthCheck();

            expect(health).toHaveProperty('status');
            expect(health).toHaveProperty('components');
            expect(health).toHaveProperty('timestamp');
            expect(health.components).toHaveProperty('timezone');
            expect(health.components).toHaveProperty('holiday');
            expect(health.components).toHaveProperty('dataExtension');
        });
    });

    describe('resetStats', () => {
        test('should reset all statistics', () => {
            // Manually set some stats
            processor.stats.totalProcessed = 10;
            processor.stats.successful = 8;
            processor.stats.failed = 2;

            processor.resetStats();

            const stats = processor.getStats();
            expect(stats.totalProcessed).toBe(0);
            expect(stats.successful).toBe(0);
            expect(stats.failed).toBe(0);
        });
    });
});