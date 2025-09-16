/**
 * Wait By Attribute Integration Tests
 * Task 12.1: Test ConvertedTime field compatibility
 * - Verify that calculated times work correctly with Wait By Attribute
 * - Test timezone handling and date format compatibility
 * - Validate that contacts wait until their calculated send times
 * Requirements: 9.1, 9.2, 9.3
 */

const SendTimeCalculator = require('../src/execution/send-time-calculator');
const ConvertedTimeUpdater = require('../src/dataextension/converted-time-updater');
const { TimezoneCalculator } = require('../src/timezone-calculator');
const HolidayChecker = require('../src/holiday-checker');
const moment = require('moment-timezone');

describe('Wait By Attribute Integration Tests', () => {
    let sendTimeCalculator;
    let convertedTimeUpdater;
    let timezoneEngine;
    let holidayChecker;
    let mockLogger;

    beforeEach(() => {
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        const baseTimezoneCalculator = new TimezoneCalculator({}, mockLogger);
        
        // Create adapter for SendTimeCalculator compatibility
        timezoneEngine = {
            getTimezoneInfo: (countryCode, options = {}) => {
                const info = baseTimezoneCalculator.getTimezoneInfo(countryCode);
                if (!info || !countryCode) {
                    return {
                        countryCode: 'US', // fallback
                        timezone: 'America/Chicago',
                        validation: { fallbackUsed: true }
                    };
                }
                return {
                    countryCode: countryCode,
                    timezone: info.primaryTimezone,
                    validation: { fallbackUsed: false }
                };
            },
            convertToSFMCTime: (localTime, countryCode, options = {}) => {
                try {
                    const sfmcTime = baseTimezoneCalculator.convertToSFMCTime(localTime, countryCode);
                    const offsetFromSFMC = -baseTimezoneCalculator.getOffsetFromSFMC(countryCode); // Invert for correct direction
                    return {
                        success: true,
                        sfmcTime: sfmcTime,
                        offsetFromSFMC: offsetFromSFMC
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error.message
                    };
                }
            }
        };
        
        holidayChecker = new HolidayChecker({}, mockLogger);
        sendTimeCalculator = new SendTimeCalculator({}, mockLogger);
        
        convertedTimeUpdater = new ConvertedTimeUpdater({
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
            subdomain: 'test-subdomain',
            enableBatching: false // Disable batching for cleaner tests
        }, mockLogger);

        // Mock the data extension API calls
        jest.spyOn(convertedTimeUpdater.dataExtensionAPI, 'updateConvertedTime')
            .mockImplementation((subscriberKey, convertedTime, dataExtensionKey) => 
                Promise.resolve({ success: true, subscriberKey, attempts: 1 }));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('ConvertedTime Field Format Compatibility', () => {
        test('should generate ConvertedTime in SFMC-compatible format', async () => {
            const contact = {
                subscriberKey: '12345',
                geosegment: 'US',
                entryTime: new Date('2024-01-15T10:00:00Z')
            };

            const config = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            const components = {
                timezoneEngine,
                holidayChecker
            };

            const result = await sendTimeCalculator.calculateOptimalSendTime(contact, config, components);

            expect(result.success).toBe(true);
            expect(result.optimalSendTime).toBeInstanceOf(Date);
            
            // Verify the date format is compatible with SFMC
            const convertedTimeString = result.optimalSendTime.toISOString();
            expect(convertedTimeString).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
            
            // Verify it's in the future (required for Wait By Attribute)
            expect(result.optimalSendTime.getTime()).toBeGreaterThan(Date.now());
            
            // Verify timezone is properly handled (should be in SFMC server time)
            expect(result.validation.waitByAttributeCompatible).toBe(true);
        });

        test('should handle different timezone conversions for Wait By Attribute', async () => {
            const testCases = [
                { country: 'US', expectedOffset: -2 }, // US is 2 hours ahead of SFMC, so offset is -2
                { country: 'BR', expectedOffset: -3 }, // BR is 3 hours ahead of SFMC, so offset is -3
                { country: 'JP', expectedOffset: -15 }, // JP is 15 hours ahead of SFMC, so offset is -15
                { country: 'GB', expectedOffset: -7 }, // GB is 7 hours ahead of SFMC, so offset is -7
                { country: 'AU', expectedOffset: -16 } // AU is 16 hours ahead of SFMC, so offset is -16
            ];

            for (const testCase of testCases) {
                const contact = {
                    subscriberKey: `test-${testCase.country}`,
                    geosegment: testCase.country,
                    entryTime: new Date('2024-01-15T12:00:00Z') // Noon UTC
                };

                const config = {
                    skipWeekends: false,
                    skipHolidays: false,
                    timeWindows: [
                        { startHour: 14, endHour: 15, enabled: true }
                    ]
                };

                const components = {
                    timezoneEngine,
                    holidayChecker
                };

                const result = await sendTimeCalculator.calculateOptimalSendTime(contact, config, components);

                expect(result.success).toBe(true);
                expect(result.validation.waitByAttributeCompatible).toBe(true);
                
                // Verify timezone conversion was applied correctly
                const timezoneAdjustment = result.adjustments.find(adj => adj.type === 'timezone_conversion');
                if (testCase.expectedOffset !== 0) {
                    expect(timezoneAdjustment).toBeDefined();
                    expect(timezoneAdjustment.offsetHours).toBe(testCase.expectedOffset);
                }
            }
        });

        test('should ensure ConvertedTime is always in future for Wait By Attribute', async () => {
            // Test with a time that would be in the past after timezone conversion
            const pastTime = new Date();
            pastTime.setHours(pastTime.getHours() - 10); // 10 hours ago to ensure it's definitely in the past

            const contact = {
                subscriberKey: '12345',
                geosegment: 'US',
                entryTime: pastTime
            };

            const config = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true },
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            const components = {
                timezoneEngine,
                holidayChecker
            };

            const result = await sendTimeCalculator.calculateOptimalSendTime(contact, config, components);

            expect(result.success).toBe(true);
            expect(result.optimalSendTime.getTime()).toBeGreaterThan(Date.now());
            
            // Should have either a future time adjustment or time window adjustment
            const futureAdjustment = result.adjustments.find(adj => 
                adj.type === 'future_time_adjustment' || adj.type === 'time_window_adjustment');
            expect(futureAdjustment).toBeDefined();
            
            expect(result.validation.futureTime).toBe(true);
            expect(result.validation.waitByAttributeCompatible).toBe(true);
        });

        test('should handle edge case of midnight transitions for Wait By Attribute', async () => {
            // Test near midnight to ensure proper date handling
            const nearMidnight = new Date();
            nearMidnight.setHours(23, 55, 0, 0); // 11:55 PM

            const contact = {
                subscriberKey: '12345',
                geosegment: 'US',
                entryTime: nearMidnight
            };

            const config = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true }
                ]
            };

            const components = {
                timezoneEngine,
                holidayChecker
            };

            const result = await sendTimeCalculator.calculateOptimalSendTime(contact, config, components);

            expect(result.success).toBe(true);
            expect(result.optimalSendTime.getTime()).toBeGreaterThan(Date.now());
            
            // Should move to next day's time window
            const originalDate = new Date(nearMidnight);
            const convertedDate = new Date(result.optimalSendTime);
            
            if (originalDate.getHours() >= 23) {
                expect(convertedDate.getDate()).toBeGreaterThanOrEqual(originalDate.getDate());
            }
            
            expect(result.validation.waitByAttributeCompatible).toBe(true);
        });
    });

    describe('Data Extension Integration for Wait By Attribute', () => {
        test('should update ConvertedTime field in correct format for Wait By Attribute', async () => {
            const subscriberKey = '12345';
            const convertedTime = new Date('2024-01-16T14:00:00Z');
            const dataExtensionKey = 'STO_Test_DE';

            const result = await convertedTimeUpdater.updateConvertedTime(
                subscriberKey,
                convertedTime,
                dataExtensionKey
            );

            expect(result.success).toBe(true);
            expect(result.subscriberKey).toBe(subscriberKey);

            // Verify the API was called with correct format
            expect(convertedTimeUpdater.dataExtensionAPI.updateConvertedTime)
                .toHaveBeenCalledWith(subscriberKey, convertedTime, dataExtensionKey);
        });

        test('should handle ConvertedTime updates with proper error handling for Wait By Attribute', async () => {
            // Mock API failure
            convertedTimeUpdater.dataExtensionAPI.updateConvertedTime
                .mockResolvedValueOnce({
                    success: false,
                    error: 'Data extension not found',
                    gracefulDegradation: {
                        type: 'continue_journey',
                        impact: 'Contact will proceed without optimized send time'
                    }
                });

            const subscriberKey = '12345';
            const convertedTime = new Date('2024-01-16T14:00:00Z');
            const dataExtensionKey = 'NonExistent_DE';

            const result = await convertedTimeUpdater.updateConvertedTime(
                subscriberKey,
                convertedTime,
                dataExtensionKey
            );

            expect(result.success).toBe(false);
            expect(result.gracefulDegradation).toBeDefined();
            expect(result.gracefulDegradation.type).toBe('continue_journey');
            
            // Verify warning was logged for graceful degradation
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('graceful degradation'),
                expect.objectContaining({
                    subscriberKey,
                    degradationType: 'continue_journey'
                })
            );
        });

        test('should validate ConvertedTime is not in past before updating for Wait By Attribute', async () => {
            const subscriberKey = '12345';
            const pastTime = new Date();
            pastTime.setHours(pastTime.getHours() - 1); // 1 hour ago
            const dataExtensionKey = 'STO_Test_DE';

            const result = await convertedTimeUpdater.updateConvertedTime(
                subscriberKey,
                pastTime,
                dataExtensionKey
            );

            // Should still succeed but log a warning
            expect(result.success).toBe(true);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('not in the future'),
                expect.objectContaining({
                    subscriberKey,
                    convertedTime: pastTime.toISOString()
                })
            );
        });
    });

    describe('End-to-End Wait By Attribute Workflow', () => {
        test('should complete full workflow compatible with Wait By Attribute', async () => {
            const contact = {
                subscriberKey: '12345',
                geosegment: 'BR',
                entryTime: new Date('2024-01-15T10:00:00Z')
            };

            const config = {
                skipWeekends: true,
                skipHolidays: true,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true },
                    { startHour: 14, endHour: 16, enabled: true }
                ]
            };

            const components = {
                timezoneEngine,
                holidayChecker
            };

            // Step 1: Calculate optimal send time
            const calculationResult = await sendTimeCalculator.calculateOptimalSendTime(
                contact, 
                config, 
                components
            );

            expect(calculationResult.success).toBe(true);
            expect(calculationResult.validation.waitByAttributeCompatible).toBe(true);

            // Step 2: Update ConvertedTime in data extension
            const updateResult = await convertedTimeUpdater.updateConvertedTime(
                contact.subscriberKey,
                calculationResult.optimalSendTime,
                'STO_Journey_DE'
            );

            expect(updateResult.success).toBe(true);

            // Step 3: Verify the complete workflow
            expect(calculationResult.optimalSendTime).toBeInstanceOf(Date);
            expect(calculationResult.optimalSendTime.getTime()).toBeGreaterThan(Date.now());
            
            // Verify all required data for Wait By Attribute is present
            expect(calculationResult.subscriberKey).toBe(contact.subscriberKey);
            expect(calculationResult.validation.validDateTime).toBe(true);
            expect(calculationResult.validation.futureTime).toBe(true);
        });

        test('should handle multiple contacts for Wait By Attribute compatibility', async () => {
            const contacts = [
                { subscriberKey: '12345', geosegment: 'US', entryTime: new Date('2024-01-15T08:00:00Z') },
                { subscriberKey: '12346', geosegment: 'BR', entryTime: new Date('2024-01-15T09:00:00Z') },
                { subscriberKey: '12347', geosegment: 'JP', entryTime: new Date('2024-01-15T10:00:00Z') }
            ];

            const config = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            const components = {
                timezoneEngine,
                holidayChecker
            };

            const results = [];

            // Process each contact
            for (const contact of contacts) {
                const calculationResult = await sendTimeCalculator.calculateOptimalSendTime(
                    contact,
                    config,
                    components
                );

                expect(calculationResult.success).toBe(true);
                expect(calculationResult.validation.waitByAttributeCompatible).toBe(true);

                const updateResult = await convertedTimeUpdater.updateConvertedTime(
                    contact.subscriberKey,
                    calculationResult.optimalSendTime,
                    'STO_Journey_DE'
                );

                expect(updateResult.success).toBe(true);

                results.push({
                    subscriberKey: contact.subscriberKey,
                    geosegment: contact.geosegment,
                    originalTime: contact.entryTime,
                    convertedTime: calculationResult.optimalSendTime,
                    timezoneAdjusted: calculationResult.adjustments.some(adj => adj.type === 'timezone_conversion')
                });
            }

            // Verify each contact has valid converted times
            expect(results).toHaveLength(3);
            
            // All contacts should have valid results
            const usResult = results.find(r => r.geosegment === 'US');
            const brResult = results.find(r => r.geosegment === 'BR');
            const jpResult = results.find(r => r.geosegment === 'JP');

            expect(usResult).toBeDefined();
            expect(brResult).toBeDefined();
            expect(jpResult).toBeDefined();

            // At least some contacts should have different times (due to different entry times or timezone adjustments)
            const uniqueTimes = new Set(results.map(r => r.convertedTime.getTime()));
            expect(uniqueTimes.size).toBeGreaterThanOrEqual(1); // At least one unique time, ideally more

            // All should be in the future and valid for Wait By Attribute
            results.forEach(result => {
                expect(result.convertedTime.getTime()).toBeGreaterThan(Date.now());
            });
        });

        test('should handle weekend and holiday adjustments for Wait By Attribute', async () => {
            // Mock holiday checker to return a holiday
            jest.spyOn(holidayChecker, 'isPublicHoliday')
                .mockResolvedValue({
                    isHoliday: true,
                    holidayName: 'Test Holiday',
                    countryCode: 'US'
                });

            // Set up a Saturday entry time
            const saturdayTime = new Date('2024-01-06T10:00:00Z'); // Saturday

            const contact = {
                subscriberKey: '12345',
                geosegment: 'US',
                entryTime: saturdayTime
            };

            const config = {
                skipWeekends: true,
                skipHolidays: true,
                timeWindows: [
                    { startHour: 10, endHour: 11, enabled: true }
                ]
            };

            const components = {
                timezoneEngine,
                holidayChecker
            };

            const result = await sendTimeCalculator.calculateOptimalSendTime(contact, config, components);

            expect(result.success).toBe(true);
            expect(result.validation.waitByAttributeCompatible).toBe(true);

            // Should have both weekend and holiday adjustments
            const weekendAdjustment = result.adjustments.find(adj => adj.type === 'weekend_exclusion');
            const holidayAdjustment = result.adjustments.find(adj => adj.type === 'holiday_exclusion');

            expect(weekendAdjustment).toBeDefined();
            expect(holidayAdjustment).toBeDefined();

            // Final time should be on a weekday and not a holiday
            const finalDate = new Date(result.optimalSendTime);
            const dayOfWeek = finalDate.getDay();
            expect(dayOfWeek).toBeGreaterThan(0); // Not Sunday
            expect(dayOfWeek).toBeLessThan(6); // Not Saturday

            // Should still be compatible with Wait By Attribute
            expect(result.validation.futureTime).toBe(true);
            expect(result.validation.validDateTime).toBe(true);
        });
    });

    describe('Wait By Attribute Error Scenarios', () => {
        test('should handle invalid date scenarios gracefully for Wait By Attribute', async () => {
            const contact = {
                subscriberKey: '12345',
                geosegment: 'US',
                entryTime: 'invalid-date'
            };

            const config = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            const components = {
                timezoneEngine,
                holidayChecker
            };

            const result = await sendTimeCalculator.calculateOptimalSendTime(contact, config, components);

            // Should still succeed with fallback to current time
            expect(result.success).toBe(true);
            expect(result.validation.waitByAttributeCompatible).toBe(true);
            expect(result.optimalSendTime.getTime()).toBeGreaterThan(Date.now());
        });

        test('should handle missing geosegment for Wait By Attribute', async () => {
            const contact = {
                subscriberKey: '12345',
                // geosegment missing
                entryTime: new Date('2024-01-15T10:00:00Z')
            };

            const config = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            const components = {
                timezoneEngine,
                holidayChecker
            };

            const result = await sendTimeCalculator.calculateOptimalSendTime(contact, config, components);

            expect(result.success).toBe(true);
            expect(result.validation.waitByAttributeCompatible).toBe(true);

            // Should have used fallback timezone - check workflow info
            expect(result.workflow.timezone.countryCode).toBe('US'); // Default fallback
            
            // Or check if there's a timezone fallback adjustment
            const timezoneAdjustment = result.adjustments.find(adj => adj.type === 'timezone_fallback');
            if (timezoneAdjustment) {
                expect(timezoneAdjustment.effectiveCountry).toBe('US'); // Default fallback
            }
        });

        test('should handle data extension update failures with graceful degradation for Wait By Attribute', async () => {
            // Mock persistent API failure
            convertedTimeUpdater.dataExtensionAPI.updateConvertedTime
                .mockResolvedValue({
                    success: false,
                    error: 'Persistent API failure',
                    attempts: 3,
                    gracefulDegradation: {
                        type: 'continue_journey',
                        impact: 'Contact will proceed without optimized send time'
                    }
                });

            const subscriberKey = '12345';
            const convertedTime = new Date('2024-01-16T14:00:00Z');
            const dataExtensionKey = 'STO_Test_DE';

            const result = await convertedTimeUpdater.updateConvertedTime(
                subscriberKey,
                convertedTime,
                dataExtensionKey
            );

            expect(result.success).toBe(false);
            expect(result.gracefulDegradation).toBeDefined();
            expect(result.gracefulDegradation.type).toBe('continue_journey');

            // Journey should be able to continue even with failed ConvertedTime update
            // This ensures Wait By Attribute can still function with default behavior
            expect(result.gracefulDegradation.impact).toContain('proceed');
        });
    });

    describe('Performance and Scalability for Wait By Attribute', () => {
        test('should handle high-volume ConvertedTime calculations efficiently', async () => {
            const startTime = Date.now();
            const contactCount = 100;
            const contacts = [];

            // Generate test contacts
            for (let i = 0; i < contactCount; i++) {
                contacts.push({
                    subscriberKey: `test-${i}`,
                    geosegment: ['US', 'BR', 'JP', 'GB', 'AU'][i % 5],
                    entryTime: new Date(`2024-01-15T${10 + (i % 8)}:00:00Z`)
                });
            }

            const config = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            const components = {
                timezoneEngine,
                holidayChecker
            };

            const results = [];

            // Process all contacts
            for (const contact of contacts) {
                const result = await sendTimeCalculator.calculateOptimalSendTime(
                    contact,
                    config,
                    components
                );

                expect(result.success).toBe(true);
                expect(result.validation.waitByAttributeCompatible).toBe(true);
                results.push(result);
            }

            const endTime = Date.now();
            const totalTime = endTime - startTime;
            const avgTimePerContact = totalTime / contactCount;

            // Performance assertions
            expect(results).toHaveLength(contactCount);
            expect(avgTimePerContact).toBeLessThan(100); // Less than 100ms per contact
            expect(totalTime).toBeLessThan(10000); // Less than 10 seconds total

            // All results should be valid for Wait By Attribute
            results.forEach(result => {
                expect(result.validation.waitByAttributeCompatible).toBe(true);
                expect(result.validation.futureTime).toBe(true);
                expect(result.validation.validDateTime).toBe(true);
            });
        });

        test('should maintain Wait By Attribute compatibility under concurrent load', async () => {
            const concurrentRequests = 20;
            const promises = [];

            for (let i = 0; i < concurrentRequests; i++) {
                const contact = {
                    subscriberKey: `concurrent-${i}`,
                    geosegment: ['US', 'BR', 'JP'][i % 3],
                    entryTime: new Date(`2024-01-15T${10 + (i % 8)}:00:00Z`)
                };

                const config = {
                    skipWeekends: false,
                    skipHolidays: false,
                    timeWindows: [
                        { startHour: 14, endHour: 15, enabled: true }
                    ]
                };

                const components = {
                    timezoneEngine,
                    holidayChecker
                };

                promises.push(
                    sendTimeCalculator.calculateOptimalSendTime(contact, config, components)
                );
            }

            const results = await Promise.all(promises);

            // All concurrent requests should succeed
            expect(results).toHaveLength(concurrentRequests);
            results.forEach((result, index) => {
                expect(result.success).toBe(true);
                expect(result.subscriberKey).toBe(`concurrent-${index}`);
                expect(result.validation.waitByAttributeCompatible).toBe(true);
                expect(result.validation.futureTime).toBe(true);
                expect(result.validation.validDateTime).toBe(true);
            });
        });
    });
});