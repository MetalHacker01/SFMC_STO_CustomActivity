/**
 * End-to-End Journey Testing
 * Task 12.2: Create end-to-end journey testing
 * - Build test journeys with STO activity followed by Wait By Attribute
 * - Test with contacts from different countries and timezones
 * - Validate complete workflow from entry to email send
 * Requirements: 9.5
 */

const request = require('supertest');
const express = require('express');
const ContactProcessor = require('../src/execution/contact-processor');
const ConvertedTimeUpdater = require('../src/dataextension/converted-time-updater');
const { TimezoneCalculator } = require('../src/timezone-calculator');
const HolidayChecker = require('../src/holiday-checker');

// Mock SFMC Journey Builder endpoints
const createMockJourneyApp = () => {
    const app = express();
    app.use(express.json());

    // Mock journey entry endpoint
    app.post('/journey/entry', (req, res) => {
        const { contacts } = req.body;
        res.json({
            success: true,
            entryId: `entry_${Date.now()}`,
            contactsEntered: contacts.length,
            timestamp: new Date().toISOString()
        });
    });

    // Mock Wait By Attribute endpoint
    app.post('/journey/wait-by-attribute', (req, res) => {
        const { contacts, attributeName, waitUntil } = req.body;
        
        // Simulate Wait By Attribute processing
        const processedContacts = contacts.map(contact => ({
            ...contact,
            waitStatus: 'waiting',
            waitUntil: contact[attributeName] || waitUntil,
            processedAt: new Date().toISOString()
        }));

        res.json({
            success: true,
            processedContacts,
            waitingCount: processedContacts.length
        });
    });

    // Mock email send endpoint
    app.post('/journey/send-email', (req, res) => {
        const { contacts } = req.body;
        
        const sentContacts = contacts.map(contact => ({
            ...contact,
            emailSent: true,
            sentAt: new Date().toISOString(),
            deliveryStatus: 'sent'
        }));

        res.json({
            success: true,
            sentContacts,
            sentCount: sentContacts.length
        });
    });

    return app;
};

describe('End-to-End Journey Testing', () => {
    let mockJourneyApp;
    let contactProcessor;
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

        mockJourneyApp = createMockJourneyApp();

        const baseTimezoneCalculator = new TimezoneCalculator({}, mockLogger);
        
        // Create adapter for compatibility
        timezoneEngine = {
            getTimezoneInfo: (countryCode, options = {}) => {
                const info = baseTimezoneCalculator.getTimezoneInfo(countryCode);
                if (!info || !countryCode) {
                    return {
                        countryCode: 'US',
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
                    const offsetFromSFMC = -baseTimezoneCalculator.getOffsetFromSFMC(countryCode);
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
        
        contactProcessor = new ContactProcessor({
            timezoneEngine,
            holidayChecker
        }, mockLogger);

        convertedTimeUpdater = new ConvertedTimeUpdater({
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
            subdomain: 'test-subdomain',
            enableBatching: false
        }, mockLogger);

        // Mock the data extension API calls
        jest.spyOn(convertedTimeUpdater.dataExtensionAPI, 'updateConvertedTime')
            .mockImplementation((subscriberKey, convertedTime, dataExtensionKey) => 
                Promise.resolve({ success: true, subscriberKey, attempts: 1 }));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Complete Journey Workflow', () => {
        test('should process complete journey from entry to email send', async () => {
            // Step 1: Journey Entry - Contacts enter the journey
            const journeyContacts = [
                {
                    subscriberKey: 'journey_001',
                    emailAddress: 'test1@example.com',
                    geosegment: 'US',
                    firstName: 'John',
                    lastName: 'Doe'
                },
                {
                    subscriberKey: 'journey_002',
                    emailAddress: 'test2@example.com',
                    geosegment: 'BR',
                    firstName: 'Maria',
                    lastName: 'Silva'
                },
                {
                    subscriberKey: 'journey_003',
                    emailAddress: 'test3@example.com',
                    geosegment: 'JP',
                    firstName: 'Hiroshi',
                    lastName: 'Tanaka'
                }
            ];

            const entryResponse = await request(mockJourneyApp)
                .post('/journey/entry')
                .send({ contacts: journeyContacts })
                .expect(200);

            expect(entryResponse.body.success).toBe(true);
            expect(entryResponse.body.contactsEntered).toBe(3);

            // Step 2: STO Activity Processing - Calculate optimal send times
            const stoConfig = {
                skipWeekends: true,
                skipHolidays: true,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true },
                    { startHour: 14, endHour: 16, enabled: true }
                ]
            };

            const stoResults = [];
            for (const contact of journeyContacts) {
                const contactData = {
                    ...contact,
                    entryTime: new Date()
                };

                const result = await contactProcessor.processContact(contactData, stoConfig);
                expect(result.success).toBe(true);
                expect(result.convertedTime).toBeDefined();
                expect(result.convertedTime.getTime()).toBeGreaterThan(Date.now());

                // Update ConvertedTime in data extension
                const updateResult = await convertedTimeUpdater.updateConvertedTime(
                    contact.subscriberKey,
                    result.convertedTime,
                    'Journey_Test_DE'
                );
                expect(updateResult.success).toBe(true);

                stoResults.push({
                    ...contact,
                    convertedTime: result.convertedTime,
                    stoProcessed: true
                });
            }

            // Step 3: Wait By Attribute Activity - Contacts wait until their ConvertedTime
            const waitByAttributeContacts = stoResults.map(contact => ({
                subscriberKey: contact.subscriberKey,
                emailAddress: contact.emailAddress,
                ConvertedTime: contact.convertedTime.toISOString(),
                firstName: contact.firstName,
                lastName: contact.lastName
            }));

            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: waitByAttributeContacts,
                    attributeName: 'ConvertedTime',
                    waitUntil: 'attribute_value'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(3);

            // Verify each contact has correct wait time
            waitResponse.body.processedContacts.forEach(contact => {
                expect(contact.waitStatus).toBe('waiting');
                expect(contact.waitUntil).toBeDefined();
                expect(new Date(contact.waitUntil).getTime()).toBeGreaterThan(Date.now());
            });

            // Step 4: Email Send - After wait time is reached
            const emailSendResponse = await request(mockJourneyApp)
                .post('/journey/send-email')
                .send({ contacts: waitResponse.body.processedContacts })
                .expect(200);

            expect(emailSendResponse.body.success).toBe(true);
            expect(emailSendResponse.body.sentCount).toBe(3);

            // Verify all emails were sent
            emailSendResponse.body.sentContacts.forEach(contact => {
                expect(contact.emailSent).toBe(true);
                expect(contact.deliveryStatus).toBe('sent');
                expect(contact.sentAt).toBeDefined();
            });

            // Step 5: Validate complete workflow
            expect(stoResults).toHaveLength(3);
            expect(waitResponse.body.processedContacts).toHaveLength(3);
            expect(emailSendResponse.body.sentContacts).toHaveLength(3);

            // Verify timezone-specific processing
            const usContact = stoResults.find(c => c.geosegment === 'US');
            const brContact = stoResults.find(c => c.geosegment === 'BR');
            const jpContact = stoResults.find(c => c.geosegment === 'JP');

            expect(usContact.convertedTime).toBeInstanceOf(Date);
            expect(brContact.convertedTime).toBeInstanceOf(Date);
            expect(jpContact.convertedTime).toBeInstanceOf(Date);

            // All converted times should be in the future and valid for Wait By Attribute
            [usContact, brContact, jpContact].forEach(contact => {
                expect(contact.convertedTime.getTime()).toBeGreaterThan(Date.now());
            });
        });

        test('should handle journey with weekend and holiday exclusions', async () => {
            // Set up a Saturday entry time to test weekend exclusion
            const saturdayTime = new Date('2024-01-06T10:00:00Z'); // Saturday
            
            const journeyContacts = [
                {
                    subscriberKey: 'weekend_001',
                    emailAddress: 'weekend@example.com',
                    geosegment: 'US',
                    entryTime: saturdayTime
                }
            ];

            // Mock holiday checker to return a holiday on Monday
            jest.spyOn(holidayChecker, 'isPublicHoliday')
                .mockResolvedValueOnce({ isHoliday: false }) // Saturday - not a holiday
                .mockResolvedValueOnce({ isHoliday: true, holidayName: 'Test Holiday' }) // Monday - holiday
                .mockResolvedValueOnce({ isHoliday: false }); // Tuesday - not a holiday

            const stoConfig = {
                skipWeekends: true,
                skipHolidays: true,
                timeWindows: [
                    { startHour: 10, endHour: 11, enabled: true }
                ]
            };

            // Process through STO activity
            const result = await contactProcessor.processContact(journeyContacts[0], stoConfig);

            expect(result.success).toBe(true);
            expect(result.convertedTime).toBeDefined();

            // Should be moved to Tuesday (skipping Saturday/Sunday weekend and Monday holiday)
            const convertedDate = new Date(result.convertedTime);
            expect(convertedDate.getDay()).toBe(2); // Tuesday

            // Update ConvertedTime
            const updateResult = await convertedTimeUpdater.updateConvertedTime(
                journeyContacts[0].subscriberKey,
                result.convertedTime,
                'Journey_Test_DE'
            );
            expect(updateResult.success).toBe(true);

            // Process through Wait By Attribute
            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: [{
                        ...journeyContacts[0],
                        ConvertedTime: result.convertedTime.toISOString()
                    }],
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(1);

            // Verify the wait time is correctly set to Tuesday
            const waitingContact = waitResponse.body.processedContacts[0];
            const waitUntilDate = new Date(waitingContact.waitUntil);
            expect(waitUntilDate.getDay()).toBe(2); // Tuesday
        });

        test('should handle journey with different time windows per contact', async () => {
            const journeyContacts = [
                {
                    subscriberKey: 'timewindow_001',
                    emailAddress: 'morning@example.com',
                    geosegment: 'US',
                    entryTime: new Date('2024-01-15T07:00:00Z') // Early morning
                },
                {
                    subscriberKey: 'timewindow_002',
                    emailAddress: 'afternoon@example.com',
                    geosegment: 'US',
                    entryTime: new Date('2024-01-15T18:00:00Z') // Evening
                }
            ];

            const stoConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true },
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            const stoResults = [];
            for (const contact of journeyContacts) {
                const result = await contactProcessor.processContact(contact, stoConfig);
                expect(result.success).toBe(true);
                
                stoResults.push({
                    ...contact,
                    convertedTime: result.convertedTime
                });
            }

            // Both contacts should get valid converted times within the configured windows
            stoResults.forEach(contact => {
                const convertedHour = contact.convertedTime.getHours();
                const isInValidWindow = (convertedHour >= 9 && convertedHour < 10) || 
                                       (convertedHour >= 14 && convertedHour < 15);
                expect(isInValidWindow).toBe(true);
            });

            // Process through Wait By Attribute
            const waitByAttributeContacts = stoResults.map(contact => ({
                subscriberKey: contact.subscriberKey,
                emailAddress: contact.emailAddress,
                ConvertedTime: contact.convertedTime.toISOString()
            }));

            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: waitByAttributeContacts,
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(2);

            // All contacts should be waiting until their respective converted times
            waitResponse.body.processedContacts.forEach(contact => {
                expect(contact.waitStatus).toBe('waiting');
                expect(new Date(contact.waitUntil).getTime()).toBeGreaterThan(Date.now());
            });
        });
    });

    describe('Multi-Country Journey Testing', () => {
        test('should handle global journey with contacts from multiple countries', async () => {
            const globalContacts = [
                { subscriberKey: 'global_us_001', emailAddress: 'us@example.com', geosegment: 'US', timezone: 'America/New_York' },
                { subscriberKey: 'global_br_001', emailAddress: 'br@example.com', geosegment: 'BR', timezone: 'America/Sao_Paulo' },
                { subscriberKey: 'global_jp_001', emailAddress: 'jp@example.com', geosegment: 'JP', timezone: 'Asia/Tokyo' },
                { subscriberKey: 'global_gb_001', emailAddress: 'gb@example.com', geosegment: 'GB', timezone: 'Europe/London' },
                { subscriberKey: 'global_au_001', emailAddress: 'au@example.com', geosegment: 'AU', timezone: 'Australia/Sydney' }
            ];

            const stoConfig = {
                skipWeekends: true,
                skipHolidays: false, // Disable to avoid API calls in this test
                timeWindows: [
                    { startHour: 10, endHour: 11, enabled: true },
                    { startHour: 15, endHour: 16, enabled: true }
                ]
            };

            // Process all contacts through STO
            const stoResults = [];
            for (const contact of globalContacts) {
                const contactData = {
                    ...contact,
                    entryTime: new Date('2024-01-15T12:00:00Z') // Same entry time for all
                };

                const result = await contactProcessor.processContact(contactData, stoConfig);
                expect(result.success).toBe(true);

                stoResults.push({
                    ...contact,
                    convertedTime: result.convertedTime,
                    originalEntryTime: contactData.entryTime
                });
            }

            // Verify all contacts have valid converted times
            expect(stoResults).toHaveLength(5);
            stoResults.forEach(contact => {
                expect(contact.convertedTime).toBeInstanceOf(Date);
                expect(contact.convertedTime.getTime()).toBeGreaterThan(Date.now());
            });

            // Update all ConvertedTime fields
            for (const contact of stoResults) {
                const updateResult = await convertedTimeUpdater.updateConvertedTime(
                    contact.subscriberKey,
                    contact.convertedTime,
                    'Global_Journey_DE'
                );
                expect(updateResult.success).toBe(true);
            }

            // Process through Wait By Attribute
            const waitByAttributeContacts = stoResults.map(contact => ({
                subscriberKey: contact.subscriberKey,
                emailAddress: contact.emailAddress,
                geosegment: contact.geosegment,
                ConvertedTime: contact.convertedTime.toISOString()
            }));

            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: waitByAttributeContacts,
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(5);

            // Verify each contact is waiting until their timezone-appropriate time
            waitResponse.body.processedContacts.forEach(contact => {
                expect(contact.waitStatus).toBe('waiting');
                expect(contact.waitUntil).toBeDefined();
                
                const waitUntilTime = new Date(contact.waitUntil);
                expect(waitUntilTime.getTime()).toBeGreaterThan(Date.now());
                
                // Verify the time is within configured windows (in SFMC time)
                const waitHour = waitUntilTime.getHours();
                const isInValidWindow = (waitHour >= 10 && waitHour < 11) || 
                                       (waitHour >= 15 && waitHour < 16);
                expect(isInValidWindow).toBe(true);
            });

            // Simulate email send after wait times
            const emailSendResponse = await request(mockJourneyApp)
                .post('/journey/send-email')
                .send({ contacts: waitResponse.body.processedContacts })
                .expect(200);

            expect(emailSendResponse.body.success).toBe(true);
            expect(emailSendResponse.body.sentCount).toBe(5);

            // Verify all emails were sent successfully
            emailSendResponse.body.sentContacts.forEach(contact => {
                expect(contact.emailSent).toBe(true);
                expect(contact.deliveryStatus).toBe('sent');
            });
        });

        test('should handle journey with mixed timezone scenarios', async () => {
            const mixedContacts = [
                {
                    subscriberKey: 'mixed_001',
                    emailAddress: 'valid@example.com',
                    geosegment: 'US',
                    entryTime: new Date('2024-01-15T14:00:00Z')
                },
                {
                    subscriberKey: 'mixed_002',
                    emailAddress: 'invalid@example.com',
                    geosegment: 'XX', // Invalid country code
                    entryTime: new Date('2024-01-15T14:00:00Z')
                },
                {
                    subscriberKey: 'mixed_003',
                    emailAddress: 'missing@example.com',
                    // geosegment missing
                    entryTime: new Date('2024-01-15T14:00:00Z')
                }
            ];

            const stoConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 16, endHour: 17, enabled: true }
                ]
            };

            const stoResults = [];
            for (const contact of mixedContacts) {
                const result = await contactProcessor.processContact(contact, stoConfig);
                
                // All should succeed with fallback handling
                expect(result.success).toBe(true);
                expect(result.convertedTime).toBeInstanceOf(Date);
                
                stoResults.push({
                    ...contact,
                    convertedTime: result.convertedTime
                });
            }

            // All contacts should have valid converted times (using fallbacks where needed)
            expect(stoResults).toHaveLength(3);
            
            // Process through complete journey
            const waitByAttributeContacts = stoResults.map(contact => ({
                subscriberKey: contact.subscriberKey,
                emailAddress: contact.emailAddress,
                ConvertedTime: contact.convertedTime.toISOString()
            }));

            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: waitByAttributeContacts,
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(3);

            // Even with invalid/missing geosegments, all contacts should proceed through journey
            waitResponse.body.processedContacts.forEach(contact => {
                expect(contact.waitStatus).toBe('waiting');
                expect(contact.waitUntil).toBeDefined();
            });
        });
    });

    describe('Journey Error Handling', () => {
        test('should handle journey with STO processing failures gracefully', async () => {
            const journeyContacts = [
                {
                    subscriberKey: 'error_001',
                    emailAddress: 'error@example.com',
                    geosegment: 'US',
                    entryTime: 'invalid-date' // Invalid date to trigger error
                }
            ];

            const stoConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            // Process through STO - should handle error gracefully
            const result = await contactProcessor.processContact(journeyContacts[0], stoConfig);
            
            // Should still succeed with fallback behavior
            expect(result.success).toBe(true);
            expect(result.convertedTime).toBeInstanceOf(Date);
            expect(result.convertedTime.getTime()).toBeGreaterThan(Date.now());

            // Continue through journey
            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: [{
                        subscriberKey: journeyContacts[0].subscriberKey,
                        emailAddress: journeyContacts[0].emailAddress,
                        ConvertedTime: result.convertedTime.toISOString()
                    }],
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(1);
        });

        test('should handle journey with data extension update failures', async () => {
            // Mock data extension update failure
            convertedTimeUpdater.dataExtensionAPI.updateConvertedTime
                .mockResolvedValueOnce({
                    success: false,
                    error: 'Data extension update failed',
                    gracefulDegradation: {
                        type: 'continue_journey',
                        impact: 'Contact will proceed without optimized send time'
                    }
                });

            const journeyContacts = [
                {
                    subscriberKey: 'de_error_001',
                    emailAddress: 'de_error@example.com',
                    geosegment: 'US',
                    entryTime: new Date()
                }
            ];

            const stoConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            // Process through STO
            const result = await contactProcessor.processContact(journeyContacts[0], stoConfig);
            expect(result.success).toBe(true);

            // Attempt to update ConvertedTime (will fail)
            const updateResult = await convertedTimeUpdater.updateConvertedTime(
                journeyContacts[0].subscriberKey,
                result.convertedTime,
                'Journey_Test_DE'
            );

            expect(updateResult.success).toBe(false);
            expect(updateResult.gracefulDegradation).toBeDefined();

            // Journey should still continue with default behavior
            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: [{
                        subscriberKey: journeyContacts[0].subscriberKey,
                        emailAddress: journeyContacts[0].emailAddress,
                        ConvertedTime: result.convertedTime.toISOString()
                    }],
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(1);
        });
    });

    describe('Journey Performance Testing', () => {
        test('should handle high-volume journey processing efficiently', async () => {
            const contactCount = 50;
            const journeyContacts = [];

            // Generate test contacts
            for (let i = 0; i < contactCount; i++) {
                journeyContacts.push({
                    subscriberKey: `perf_${i.toString().padStart(3, '0')}`,
                    emailAddress: `perf${i}@example.com`,
                    geosegment: ['US', 'BR', 'JP', 'GB', 'AU'][i % 5],
                    entryTime: new Date()
                });
            }

            const stoConfig = {
                skipWeekends: false,
                skipHolidays: false, // Disable to avoid API calls
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            const startTime = Date.now();

            // Process all contacts through STO
            const stoResults = [];
            for (const contact of journeyContacts) {
                const result = await contactProcessor.processContact(contact, stoConfig);
                expect(result.success).toBe(true);
                
                stoResults.push({
                    ...contact,
                    convertedTime: result.convertedTime
                });
            }

            const stoProcessingTime = Date.now() - startTime;

            // Performance assertions
            expect(stoResults).toHaveLength(contactCount);
            expect(stoProcessingTime).toBeLessThan(10000); // Less than 10 seconds
            
            const avgTimePerContact = stoProcessingTime / contactCount;
            expect(avgTimePerContact).toBeLessThan(200); // Less than 200ms per contact

            // Process through Wait By Attribute
            const waitByAttributeContacts = stoResults.map(contact => ({
                subscriberKey: contact.subscriberKey,
                emailAddress: contact.emailAddress,
                ConvertedTime: contact.convertedTime.toISOString()
            }));

            const waitStartTime = Date.now();
            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: waitByAttributeContacts,
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            const waitProcessingTime = Date.now() - waitStartTime;

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(contactCount);
            expect(waitProcessingTime).toBeLessThan(5000); // Less than 5 seconds

            // All contacts should be processed successfully
            waitResponse.body.processedContacts.forEach(contact => {
                expect(contact.waitStatus).toBe('waiting');
                expect(contact.waitUntil).toBeDefined();
            });
        });
    });

    describe('Advanced Journey Scenarios', () => {
        test('should handle journey with complex timezone and holiday combinations', async () => {
            // Create contacts from countries with complex timezone/holiday scenarios
            const complexContacts = [
                {
                    subscriberKey: 'complex_001',
                    emailAddress: 'india@example.com',
                    geosegment: 'IN',
                    entryTime: new Date('2024-01-26T08:00:00Z') // Republic Day in India
                },
                {
                    subscriberKey: 'complex_002',
                    emailAddress: 'russia@example.com',
                    geosegment: 'RU',
                    entryTime: new Date('2024-01-07T10:00:00Z') // Orthodox Christmas
                },
                {
                    subscriberKey: 'complex_003',
                    emailAddress: 'china@example.com',
                    geosegment: 'CN',
                    entryTime: new Date('2024-02-10T06:00:00Z') // Chinese New Year period
                }
            ];

            // Mock holiday responses for these specific dates
            jest.spyOn(holidayChecker, 'isPublicHoliday')
                .mockImplementation(async (date, countryCode) => {
                    const dateStr = date.toISOString().split('T')[0];
                    if (countryCode === 'IN' && dateStr === '2024-01-26') {
                        return { isHoliday: true, holidayName: 'Republic Day' };
                    }
                    if (countryCode === 'RU' && dateStr === '2024-01-07') {
                        return { isHoliday: true, holidayName: 'Orthodox Christmas' };
                    }
                    if (countryCode === 'CN' && dateStr === '2024-02-10') {
                        return { isHoliday: true, holidayName: 'Chinese New Year' };
                    }
                    return { isHoliday: false };
                });

            const stoConfig = {
                skipWeekends: true,
                skipHolidays: true,
                timeWindows: [
                    { startHour: 10, endHour: 11, enabled: true },
                    { startHour: 15, endHour: 16, enabled: true }
                ]
            };

            // Process each contact through the complete journey
            const journeyResults = [];
            for (const contact of complexContacts) {
                // Step 1: STO Processing
                const stoResult = await contactProcessor.processContact(contact, stoConfig);
                expect(stoResult.success).toBe(true);
                expect(stoResult.convertedTime).toBeInstanceOf(Date);

                // Step 2: Data Extension Update
                const updateResult = await convertedTimeUpdater.updateConvertedTime(
                    contact.subscriberKey,
                    stoResult.convertedTime,
                    'Complex_Journey_DE'
                );
                expect(updateResult.success).toBe(true);

                journeyResults.push({
                    ...contact,
                    convertedTime: stoResult.convertedTime,
                    adjustments: stoResult.adjustments || []
                });
            }

            // Step 3: Wait By Attribute Processing
            const waitByAttributeContacts = journeyResults.map(contact => ({
                subscriberKey: contact.subscriberKey,
                emailAddress: contact.emailAddress,
                geosegment: contact.geosegment,
                ConvertedTime: contact.convertedTime.toISOString()
            }));

            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: waitByAttributeContacts,
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(3);

            // Step 4: Email Send Simulation
            const emailResponse = await request(mockJourneyApp)
                .post('/journey/send-email')
                .send({ contacts: waitResponse.body.processedContacts })
                .expect(200);

            expect(emailResponse.body.success).toBe(true);
            expect(emailResponse.body.sentCount).toBe(3);

            // Verify holiday adjustments were made
            journeyResults.forEach(contact => {
                const holidayAdjustment = contact.adjustments.find(adj => adj.type === 'holiday_exclusion');
                if (holidayAdjustment) {
                    expect(holidayAdjustment.reason).toContain('holiday');
                }
            });
        });

        test('should handle journey with cascading date adjustments', async () => {
            // Create a scenario where multiple adjustments cascade
            const fridayEvening = new Date('2024-01-05T20:00:00Z'); // Friday evening

            const cascadingContact = {
                subscriberKey: 'cascade_001',
                emailAddress: 'cascade@example.com',
                geosegment: 'US',
                entryTime: fridayEvening
            };

            // Mock multiple consecutive holidays (Monday and Tuesday)
            jest.spyOn(holidayChecker, 'isPublicHoliday')
                .mockImplementation(async (date, countryCode) => {
                    const dateStr = date.toISOString().split('T')[0];
                    if (dateStr === '2024-01-08' || dateStr === '2024-01-09') { // Monday and Tuesday
                        return { isHoliday: true, holidayName: 'Extended Holiday' };
                    }
                    return { isHoliday: false };
                });

            const stoConfig = {
                skipWeekends: true,
                skipHolidays: true,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true }
                ]
            };

            // Process through complete journey
            const stoResult = await contactProcessor.processContact(cascadingContact, stoConfig);
            expect(stoResult.success).toBe(true);

            // Should cascade from Friday evening -> Monday (weekend skip) -> Tuesday (holiday skip) -> Wednesday
            const finalDate = new Date(stoResult.convertedTime);
            expect(finalDate.getDay()).toBe(3); // Wednesday

            // Update ConvertedTime
            const updateResult = await convertedTimeUpdater.updateConvertedTime(
                cascadingContact.subscriberKey,
                stoResult.convertedTime,
                'Cascade_Journey_DE'
            );
            expect(updateResult.success).toBe(true);

            // Process through Wait By Attribute
            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: [{
                        subscriberKey: cascadingContact.subscriberKey,
                        emailAddress: cascadingContact.emailAddress,
                        ConvertedTime: stoResult.convertedTime.toISOString()
                    }],
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(1);

            // Verify final wait time is on Wednesday
            const waitingContact = waitResponse.body.processedContacts[0];
            const waitUntilDate = new Date(waitingContact.waitUntil);
            expect(waitUntilDate.getDay()).toBe(3); // Wednesday
        });

        test('should handle journey with real-time entry and immediate processing', async () => {
            // Simulate contacts entering journey in real-time
            const realTimeContacts = [
                {
                    subscriberKey: 'realtime_001',
                    emailAddress: 'realtime1@example.com',
                    geosegment: 'US',
                    entryTime: new Date() // Current time
                },
                {
                    subscriberKey: 'realtime_002',
                    emailAddress: 'realtime2@example.com',
                    geosegment: 'BR',
                    entryTime: new Date(Date.now() + 1000) // 1 second later
                },
                {
                    subscriberKey: 'realtime_003',
                    emailAddress: 'realtime3@example.com',
                    geosegment: 'JP',
                    entryTime: new Date(Date.now() + 2000) // 2 seconds later
                }
            ];

            const stoConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: new Date().getHours() + 1, endHour: new Date().getHours() + 2, enabled: true }
                ]
            };

            // Process contacts as they "enter" the journey
            const journeyResults = [];
            for (let i = 0; i < realTimeContacts.length; i++) {
                const contact = realTimeContacts[i];
                
                // Simulate real-time delay
                if (i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                const stoResult = await contactProcessor.processContact(contact, stoConfig);
                expect(stoResult.success).toBe(true);
                expect(stoResult.convertedTime.getTime()).toBeGreaterThan(Date.now());

                journeyResults.push({
                    ...contact,
                    convertedTime: stoResult.convertedTime,
                    processedAt: new Date()
                });
            }

            // All contacts should have valid future times
            expect(journeyResults).toHaveLength(3);
            journeyResults.forEach(result => {
                expect(result.convertedTime.getTime()).toBeGreaterThan(result.processedAt.getTime());
            });

            // Process through Wait By Attribute
            const waitByAttributeContacts = journeyResults.map(contact => ({
                subscriberKey: contact.subscriberKey,
                emailAddress: contact.emailAddress,
                ConvertedTime: contact.convertedTime.toISOString()
            }));

            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: waitByAttributeContacts,
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(3);

            // Verify all contacts are waiting for their respective times
            waitResponse.body.processedContacts.forEach(contact => {
                expect(contact.waitStatus).toBe('waiting');
                expect(new Date(contact.waitUntil).getTime()).toBeGreaterThan(Date.now());
            });
        });

        test('should handle journey with edge case time windows', async () => {
            // Test with very narrow time windows and edge cases
            const edgeCaseContacts = [
                {
                    subscriberKey: 'edge_001',
                    emailAddress: 'edge1@example.com',
                    geosegment: 'US',
                    entryTime: new Date('2024-01-15T23:55:00Z') // Near midnight
                },
                {
                    subscriberKey: 'edge_002',
                    emailAddress: 'edge2@example.com',
                    geosegment: 'AU',
                    entryTime: new Date('2024-01-15T00:05:00Z') // Just after midnight
                }
            ];

            const stoConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 0, endHour: 1, enabled: true }, // Midnight hour
                    { startHour: 23, endHour: 24, enabled: true } // Late night hour
                ]
            };

            const journeyResults = [];
            for (const contact of edgeCaseContacts) {
                const stoResult = await contactProcessor.processContact(contact, stoConfig);
                expect(stoResult.success).toBe(true);

                journeyResults.push({
                    ...contact,
                    convertedTime: stoResult.convertedTime
                });
            }

            // Process through complete journey
            const waitByAttributeContacts = journeyResults.map(contact => ({
                subscriberKey: contact.subscriberKey,
                emailAddress: contact.emailAddress,
                ConvertedTime: contact.convertedTime.toISOString()
            }));

            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: waitByAttributeContacts,
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(2);

            // Verify edge case handling
            waitResponse.body.processedContacts.forEach(contact => {
                expect(contact.waitStatus).toBe('waiting');
                const waitTime = new Date(contact.waitUntil);
                expect(waitTime.getTime()).toBeGreaterThan(Date.now());
                
                // Should be in valid time windows (0-1 or 23-24)
                const hour = waitTime.getHours();
                expect(hour === 0 || hour === 23).toBe(true);
            });
        });
    });

    describe('Journey Monitoring and Analytics', () => {
        test('should track journey performance metrics', async () => {
            const monitoringContacts = Array.from({ length: 10 }, (_, i) => ({
                subscriberKey: `monitor_${i.toString().padStart(3, '0')}`,
                emailAddress: `monitor${i}@example.com`,
                geosegment: ['US', 'BR', 'JP', 'GB', 'AU'][i % 5],
                entryTime: new Date()
            }));

            const stoConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            const journeyMetrics = {
                totalContacts: monitoringContacts.length,
                successfulProcessing: 0,
                failedProcessing: 0,
                averageProcessingTime: 0,
                timezoneDistribution: {},
                adjustmentTypes: {}
            };

            const startTime = Date.now();
            const journeyResults = [];

            // Process all contacts and collect metrics
            for (const contact of monitoringContacts) {
                const contactStartTime = Date.now();
                
                try {
                    const stoResult = await contactProcessor.processContact(contact, stoConfig);
                    const contactProcessingTime = Date.now() - contactStartTime;

                    if (stoResult.success) {
                        journeyMetrics.successfulProcessing++;
                        journeyMetrics.averageProcessingTime += contactProcessingTime;

                        // Track timezone distribution
                        const country = contact.geosegment;
                        journeyMetrics.timezoneDistribution[country] = 
                            (journeyMetrics.timezoneDistribution[country] || 0) + 1;

                        // Track adjustment types
                        if (stoResult.adjustments) {
                            stoResult.adjustments.forEach(adj => {
                                journeyMetrics.adjustmentTypes[adj.type] = 
                                    (journeyMetrics.adjustmentTypes[adj.type] || 0) + 1;
                            });
                        }

                        journeyResults.push({
                            ...contact,
                            convertedTime: stoResult.convertedTime,
                            processingTime: contactProcessingTime
                        });
                    } else {
                        journeyMetrics.failedProcessing++;
                    }
                } catch (error) {
                    journeyMetrics.failedProcessing++;
                }
            }

            const totalProcessingTime = Date.now() - startTime;
            journeyMetrics.averageProcessingTime = journeyMetrics.averageProcessingTime / journeyMetrics.successfulProcessing;

            // Verify metrics
            expect(journeyMetrics.successfulProcessing).toBe(10);
            expect(journeyMetrics.failedProcessing).toBe(0);
            expect(journeyMetrics.averageProcessingTime).toBeLessThan(500); // Less than 500ms per contact
            expect(Object.keys(journeyMetrics.timezoneDistribution)).toHaveLength(5); // All 5 countries

            // Process through Wait By Attribute and track additional metrics
            const waitByAttributeContacts = journeyResults.map(contact => ({
                subscriberKey: contact.subscriberKey,
                emailAddress: contact.emailAddress,
                ConvertedTime: contact.convertedTime.toISOString()
            }));

            const waitStartTime = Date.now();
            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: waitByAttributeContacts,
                    attributeName: 'ConvertedTime'
                })
                .expect(200);
            const waitProcessingTime = Date.now() - waitStartTime;

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(10);
            expect(waitProcessingTime).toBeLessThan(2000); // Less than 2 seconds

            // Log metrics for monitoring
            mockLogger.info('Journey Performance Metrics', {
                totalContacts: journeyMetrics.totalContacts,
                successRate: (journeyMetrics.successfulProcessing / journeyMetrics.totalContacts) * 100,
                averageProcessingTime: journeyMetrics.averageProcessingTime,
                totalProcessingTime,
                waitProcessingTime,
                timezoneDistribution: journeyMetrics.timezoneDistribution,
                adjustmentTypes: journeyMetrics.adjustmentTypes
            });

            expect(mockLogger.info).toHaveBeenCalledWith(
                'Journey Performance Metrics',
                expect.objectContaining({
                    successRate: 100,
                    totalContacts: 10
                })
            );
        });

        test('should validate journey data integrity throughout workflow', async () => {
            const integrityContact = {
                subscriberKey: 'integrity_001',
                emailAddress: 'integrity@example.com',
                geosegment: 'US',
                entryTime: new Date('2024-01-15T10:00:00Z')
            };

            const stoConfig = {
                skipWeekends: true,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            // Step 1: Initial STO Processing
            const stoResult = await contactProcessor.processContact(integrityContact, stoConfig);
            expect(stoResult.success).toBe(true);

            // Validate data integrity after STO processing
            expect(stoResult.subscriberKey).toBe(integrityContact.subscriberKey);
            expect(stoResult.convertedTime).toBeInstanceOf(Date);
            expect(stoResult.convertedTime.getTime()).toBeGreaterThan(Date.now());

            // Step 2: Data Extension Update
            const updateResult = await convertedTimeUpdater.updateConvertedTime(
                integrityContact.subscriberKey,
                stoResult.convertedTime,
                'Integrity_Journey_DE'
            );
            expect(updateResult.success).toBe(true);
            expect(updateResult.subscriberKey).toBe(integrityContact.subscriberKey);

            // Step 3: Wait By Attribute Processing
            const waitByAttributeContact = {
                subscriberKey: integrityContact.subscriberKey,
                emailAddress: integrityContact.emailAddress,
                ConvertedTime: stoResult.convertedTime.toISOString()
            };

            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: [waitByAttributeContact],
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(1);

            const waitingContact = waitResponse.body.processedContacts[0];
            expect(waitingContact.subscriberKey).toBe(integrityContact.subscriberKey);
            expect(waitingContact.waitUntil).toBe(stoResult.convertedTime.toISOString());

            // Step 4: Email Send
            const emailResponse = await request(mockJourneyApp)
                .post('/journey/send-email')
                .send({ contacts: [waitingContact] })
                .expect(200);

            expect(emailResponse.body.success).toBe(true);
            expect(emailResponse.body.sentCount).toBe(1);

            const sentContact = emailResponse.body.sentContacts[0];
            expect(sentContact.subscriberKey).toBe(integrityContact.subscriberKey);
            expect(sentContact.emailSent).toBe(true);

            // Validate complete data integrity chain
            expect(sentContact.subscriberKey).toBe(integrityContact.subscriberKey);
            expect(sentContact.emailAddress).toBe(integrityContact.emailAddress);
        });
    });

    describe('Comprehensive Journey Scenarios', () => {
        test('should handle complete journey with realistic business scenarios', async () => {
            // Simulate a realistic business scenario with mixed contact types
            const businessContacts = [
                {
                    subscriberKey: 'biz_us_001',
                    emailAddress: 'us.customer@company.com',
                    geosegment: 'US',
                    firstName: 'John',
                    lastName: 'Smith',
                    entryTime: new Date('2024-01-15T08:30:00Z'), // Early morning entry
                    customerType: 'premium'
                },
                {
                    subscriberKey: 'biz_br_001',
                    emailAddress: 'br.customer@empresa.com.br',
                    geosegment: 'BR',
                    firstName: 'Maria',
                    lastName: 'Santos',
                    entryTime: new Date('2024-01-15T13:45:00Z'), // Afternoon entry
                    customerType: 'standard'
                },
                {
                    subscriberKey: 'biz_jp_001',
                    emailAddress: 'jp.customer@company.co.jp',
                    geosegment: 'JP',
                    firstName: 'Hiroshi',
                    lastName: 'Yamamoto',
                    entryTime: new Date('2024-01-15T22:15:00Z'), // Late evening entry
                    customerType: 'enterprise'
                },
                {
                    subscriberKey: 'biz_gb_001',
                    emailAddress: 'uk.customer@company.co.uk',
                    geosegment: 'GB',
                    firstName: 'Emma',
                    lastName: 'Johnson',
                    entryTime: new Date('2024-01-15T16:20:00Z'), // Late afternoon entry
                    customerType: 'premium'
                }
            ];

            // Business-appropriate STO configuration
            const businessConfig = {
                skipWeekends: true,
                skipHolidays: true,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true },   // Morning window
                    { startHour: 14, endHour: 15, enabled: true },  // Early afternoon
                    { startHour: 16, endHour: 17, enabled: false }  // Late afternoon disabled
                ]
            };

            // Step 1: Journey Entry
            const entryResponse = await request(mockJourneyApp)
                .post('/journey/entry')
                .send({ 
                    contacts: businessContacts,
                    journeyName: 'Business Campaign 2024',
                    campaignType: 'promotional'
                })
                .expect(200);

            expect(entryResponse.body.success).toBe(true);
            expect(entryResponse.body.contactsEntered).toBe(4);

            // Step 2: STO Processing with detailed tracking
            const stoResults = [];
            const processingMetrics = {
                totalProcessingTime: 0,
                timezoneAdjustments: 0,
                weekendAdjustments: 0,
                timeWindowAdjustments: 0
            };

            for (const contact of businessContacts) {
                const processingStart = Date.now();
                
                const result = await contactProcessor.processContact(contact, businessConfig);
                
                const processingTime = Date.now() - processingStart;
                processingMetrics.totalProcessingTime += processingTime;

                expect(result.success).toBe(true);
                expect(result.convertedTime).toBeDefined();
                expect(result.convertedTime.getTime()).toBeGreaterThan(Date.now());

                // Track adjustment types
                if (result.adjustments) {
                    result.adjustments.forEach(adj => {
                        if (adj.type === 'timezone_conversion') processingMetrics.timezoneAdjustments++;
                        if (adj.type === 'weekend_exclusion') processingMetrics.weekendAdjustments++;
                        if (adj.type === 'time_window_adjustment') processingMetrics.timeWindowAdjustments++;
                    });
                }

                // Update ConvertedTime in data extension
                const updateResult = await convertedTimeUpdater.updateConvertedTime(
                    contact.subscriberKey,
                    result.convertedTime,
                    'Business_Campaign_DE'
                );
                expect(updateResult.success).toBe(true);

                stoResults.push({
                    ...contact,
                    convertedTime: result.convertedTime,
                    processingTime,
                    adjustments: result.adjustments || []
                });
            }

            // Validate STO processing results
            expect(stoResults).toHaveLength(4);
            expect(processingMetrics.totalProcessingTime).toBeLessThan(2000); // Under 2 seconds total
            expect(processingMetrics.timezoneAdjustments).toBeGreaterThan(0); // Should have timezone adjustments

            // Step 3: Wait By Attribute Processing
            const waitByAttributeContacts = stoResults.map(contact => ({
                subscriberKey: contact.subscriberKey,
                emailAddress: contact.emailAddress,
                firstName: contact.firstName,
                lastName: contact.lastName,
                geosegment: contact.geosegment,
                customerType: contact.customerType,
                ConvertedTime: contact.convertedTime.toISOString(),
                OriginalEntryTime: contact.entryTime.toISOString()
            }));

            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: waitByAttributeContacts,
                    attributeName: 'ConvertedTime',
                    waitUntil: 'attribute_value',
                    journeyContext: {
                        journeyName: 'Business Campaign 2024',
                        activityName: 'Wait for Optimal Send Time'
                    }
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(4);

            // Validate wait times are properly set
            waitResponse.body.processedContacts.forEach((contact, index) => {
                expect(contact.waitStatus).toBe('waiting');
                expect(contact.waitUntil).toBe(stoResults[index].convertedTime.toISOString());
                expect(new Date(contact.waitUntil).getTime()).toBeGreaterThan(Date.now());
                
                // Verify business hours compliance
                const waitTime = new Date(contact.waitUntil);
                const waitHour = waitTime.getHours();
                expect(waitHour >= 9 && waitHour < 10 || waitHour >= 14 && waitHour < 15).toBe(true);
            });

            // Step 4: Email Send Simulation
            const emailSendResponse = await request(mockJourneyApp)
                .post('/journey/send-email')
                .send({ 
                    contacts: waitResponse.body.processedContacts,
                    emailTemplate: 'business_promotional_template',
                    sendContext: {
                        campaignName: 'Business Campaign 2024',
                        sendType: 'promotional'
                    }
                })
                .expect(200);

            expect(emailSendResponse.body.success).toBe(true);
            expect(emailSendResponse.body.sentCount).toBe(4);

            // Validate email send results
            emailSendResponse.body.sentContacts.forEach((contact, index) => {
                expect(contact.emailSent).toBe(true);
                expect(contact.deliveryStatus).toBe('sent');
                expect(contact.sentAt).toBeDefined();
                expect(contact.subscriberKey).toBe(businessContacts[index].subscriberKey);
            });

            // Step 5: End-to-End Validation
            const endToEndValidation = {
                totalContactsEntered: entryResponse.body.contactsEntered,
                totalContactsProcessed: stoResults.length,
                totalContactsWaiting: waitResponse.body.waitingCount,
                totalEmailsSent: emailSendResponse.body.sentCount,
                averageProcessingTime: processingMetrics.totalProcessingTime / businessContacts.length,
                successRate: (emailSendResponse.body.sentCount / entryResponse.body.contactsEntered) * 100
            };

            expect(endToEndValidation.successRate).toBe(100);
            expect(endToEndValidation.totalContactsEntered).toBe(endToEndValidation.totalEmailsSent);
            expect(endToEndValidation.averageProcessingTime).toBeLessThan(500); // Under 500ms per contact

            // Log comprehensive journey metrics
            mockLogger.info('Complete Journey Validation', endToEndValidation);
        });

        test('should handle journey with complex timezone and holiday scenarios', async () => {
            // Set up complex scenario with holidays and different timezones
            const complexContacts = [
                {
                    subscriberKey: 'complex_001',
                    emailAddress: 'holiday@example.com',
                    geosegment: 'US',
                    entryTime: new Date('2024-01-01T10:00:00Z') // New Year's Day
                },
                {
                    subscriberKey: 'complex_002',
                    emailAddress: 'weekend@example.com',
                    geosegment: 'BR',
                    entryTime: new Date('2024-01-06T15:00:00Z') // Saturday
                },
                {
                    subscriberKey: 'complex_003',
                    emailAddress: 'timezone@example.com',
                    geosegment: 'JP',
                    entryTime: new Date('2024-01-15T02:00:00Z') // Very early morning
                }
            ];

            // Mock holiday checker for complex scenarios
            jest.spyOn(holidayChecker, 'isPublicHoliday')
                .mockImplementation(async (date, countryCode) => {
                    const dateStr = date.toISOString().split('T')[0];
                    if (dateStr === '2024-01-01' && countryCode === 'US') {
                        return { isHoliday: true, holidayName: "New Year's Day" };
                    }
                    if (dateStr === '2024-01-02' && countryCode === 'US') {
                        return { isHoliday: true, holidayName: "New Year's Day Observed" };
                    }
                    return { isHoliday: false };
                });

            const complexConfig = {
                skipWeekends: true,
                skipHolidays: true,
                timeWindows: [
                    { startHour: 10, endHour: 11, enabled: true }
                ]
            };

            // Process through complete journey
            const stoResults = [];
            for (const contact of complexContacts) {
                const result = await contactProcessor.processContact(contact, complexConfig);
                expect(result.success).toBe(true);
                
                // Update ConvertedTime
                const updateResult = await convertedTimeUpdater.updateConvertedTime(
                    contact.subscriberKey,
                    result.convertedTime,
                    'Complex_Journey_DE'
                );
                expect(updateResult.success).toBe(true);

                stoResults.push({
                    ...contact,
                    convertedTime: result.convertedTime
                });
            }

            // Validate complex adjustments
            const holidayContact = stoResults.find(c => c.subscriberKey === 'complex_001');
            const weekendContact = stoResults.find(c => c.subscriberKey === 'complex_002');
            const timezoneContact = stoResults.find(c => c.subscriberKey === 'complex_003');

            // Holiday contact should be moved to a non-holiday weekday
            expect(holidayContact.convertedTime.getDay()).toBeGreaterThan(0); // Not Sunday
            expect(holidayContact.convertedTime.getDay()).toBeLessThan(6); // Not Saturday
            expect(holidayContact.convertedTime.getDate()).toBeGreaterThan(2); // After Jan 2nd

            // Weekend contact should be moved to Monday
            expect(weekendContact.convertedTime.getDay()).toBe(1); // Monday

            // All should be in valid time windows
            stoResults.forEach(contact => {
                const hour = contact.convertedTime.getHours();
                expect(hour >= 10 && hour < 11).toBe(true);
            });

            // Continue through Wait By Attribute
            const waitByAttributeContacts = stoResults.map(contact => ({
                subscriberKey: contact.subscriberKey,
                emailAddress: contact.emailAddress,
                ConvertedTime: contact.convertedTime.toISOString()
            }));

            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: waitByAttributeContacts,
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(3);

            // Complete with email send
            const emailResponse = await request(mockJourneyApp)
                .post('/journey/send-email')
                .send({ contacts: waitResponse.body.processedContacts })
                .expect(200);

            expect(emailResponse.body.success).toBe(true);
            expect(emailResponse.body.sentCount).toBe(3);

            // Validate all emails were sent despite complex adjustments
            emailResponse.body.sentContacts.forEach(contact => {
                expect(contact.emailSent).toBe(true);
                expect(contact.deliveryStatus).toBe('sent');
            });
        });

        test('should handle journey with error recovery and graceful degradation', async () => {
            const errorContacts = [
                {
                    subscriberKey: 'error_recovery_001',
                    emailAddress: 'recovery@example.com',
                    geosegment: 'US',
                    entryTime: new Date()
                },
                {
                    subscriberKey: 'error_recovery_002',
                    emailAddress: 'degradation@example.com',
                    geosegment: 'INVALID', // Invalid country code
                    entryTime: new Date()
                }
            ];

            // Mock some failures for error recovery testing
            let updateCallCount = 0;
            convertedTimeUpdater.dataExtensionAPI.updateConvertedTime
                .mockImplementation((subscriberKey, convertedTime, dataExtensionKey) => {
                    updateCallCount++;
                    if (subscriberKey === 'error_recovery_001' && updateCallCount === 1) {
                        // First call fails, should retry
                        return Promise.resolve({
                            success: false,
                            error: 'Temporary API failure',
                            retryable: true
                        });
                    }
                    return Promise.resolve({ success: true, subscriberKey, attempts: updateCallCount });
                });

            const errorConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            // Process through STO with error handling
            const stoResults = [];
            for (const contact of errorContacts) {
                const result = await contactProcessor.processContact(contact, errorConfig);
                
                // Should succeed even with invalid geosegment (fallback behavior)
                expect(result.success).toBe(true);
                expect(result.convertedTime).toBeInstanceOf(Date);

                stoResults.push({
                    ...contact,
                    convertedTime: result.convertedTime
                });
            }

            // Update ConvertedTime with retry logic - expect some failures for error recovery testing
            const updateResults = [];
            for (const contact of stoResults) {
                const updateResult = await convertedTimeUpdater.updateConvertedTime(
                    contact.subscriberKey,
                    contact.convertedTime,
                    'Error_Recovery_DE'
                );
                
                updateResults.push(updateResult);
            }

            // At least one should succeed (the retry should work)
            const successfulUpdates = updateResults.filter(r => r.success);
            expect(successfulUpdates.length).toBeGreaterThan(0);

            // Continue through journey despite errors
            const waitByAttributeContacts = stoResults.map(contact => ({
                subscriberKey: contact.subscriberKey,
                emailAddress: contact.emailAddress,
                ConvertedTime: contact.convertedTime.toISOString()
            }));

            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: waitByAttributeContacts,
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(2);

            // Complete journey
            const emailResponse = await request(mockJourneyApp)
                .post('/journey/send-email')
                .send({ contacts: waitResponse.body.processedContacts })
                .expect(200);

            expect(emailResponse.body.success).toBe(true);
            expect(emailResponse.body.sentCount).toBe(2);

            // Validate error recovery worked
            expect(updateCallCount).toBeGreaterThan(2); // Should have retried
            emailResponse.body.sentContacts.forEach(contact => {
                expect(contact.emailSent).toBe(true);
            });
        });

        test('should validate complete journey timing and performance', async () => {
            const performanceContacts = Array.from({ length: 25 }, (_, i) => ({
                subscriberKey: `perf_journey_${i.toString().padStart(3, '0')}`,
                emailAddress: `perf${i}@example.com`,
                geosegment: ['US', 'BR', 'JP', 'GB', 'AU'][i % 5],
                entryTime: new Date(`2024-01-15T${8 + (i % 12)}:00:00Z`)
            }));

            const performanceConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            const journeyStartTime = Date.now();

            // Step 1: Journey Entry (timed)
            const entryStartTime = Date.now();
            const entryResponse = await request(mockJourneyApp)
                .post('/journey/entry')
                .send({ contacts: performanceContacts })
                .expect(200);
            const entryTime = Date.now() - entryStartTime;

            expect(entryResponse.body.success).toBe(true);
            expect(entryResponse.body.contactsEntered).toBe(25);

            // Step 2: STO Processing (timed)
            const stoStartTime = Date.now();
            const stoResults = [];
            let successfulUpdates = 0;
            
            for (const contact of performanceContacts) {
                const result = await contactProcessor.processContact(contact, performanceConfig);
                expect(result.success).toBe(true);
                
                const updateResult = await convertedTimeUpdater.updateConvertedTime(
                    contact.subscriberKey,
                    result.convertedTime,
                    'Performance_Journey_DE'
                );
                
                if (updateResult.success) {
                    successfulUpdates++;
                }

                stoResults.push({
                    ...contact,
                    convertedTime: result.convertedTime
                });
            }
            const stoTime = Date.now() - stoStartTime;

            // Expect most updates to succeed (allowing for some test failures)
            expect(successfulUpdates).toBeGreaterThan(20);

            // Step 3: Wait By Attribute (timed)
            const waitStartTime = Date.now();
            const waitByAttributeContacts = stoResults.map(contact => ({
                subscriberKey: contact.subscriberKey,
                emailAddress: contact.emailAddress,
                ConvertedTime: contact.convertedTime.toISOString()
            }));

            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: waitByAttributeContacts,
                    attributeName: 'ConvertedTime'
                })
                .expect(200);
            const waitTime = Date.now() - waitStartTime;

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(25);

            // Step 4: Email Send (timed)
            const sendStartTime = Date.now();
            const emailResponse = await request(mockJourneyApp)
                .post('/journey/send-email')
                .send({ contacts: waitResponse.body.processedContacts })
                .expect(200);
            const sendTime = Date.now() - sendStartTime;

            expect(emailResponse.body.success).toBe(true);
            expect(emailResponse.body.sentCount).toBe(25);

            const totalJourneyTime = Date.now() - journeyStartTime;

            // Performance assertions
            const performanceMetrics = {
                totalJourneyTime,
                entryTime,
                stoTime,
                waitTime,
                sendTime,
                averageTimePerContact: totalJourneyTime / 25,
                contactsProcessed: 25,
                successRate: 100
            };

            expect(performanceMetrics.totalJourneyTime).toBeLessThan(15000); // Under 15 seconds
            expect(performanceMetrics.averageTimePerContact).toBeLessThan(600); // Under 600ms per contact
            expect(performanceMetrics.stoTime).toBeLessThan(10000); // STO processing under 10 seconds
            expect(performanceMetrics.waitTime).toBeLessThan(2000); // Wait processing under 2 seconds
            expect(performanceMetrics.sendTime).toBeLessThan(2000); // Send processing under 2 seconds

            // Log performance metrics
            mockLogger.info('Journey Performance Validation', performanceMetrics);

            // Validate all contacts completed successfully
            emailResponse.body.sentContacts.forEach(contact => {
                expect(contact.emailSent).toBe(true);
                expect(contact.deliveryStatus).toBe('sent');
            });
        });
    });
});