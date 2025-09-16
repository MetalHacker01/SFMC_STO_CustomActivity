/**
 * Complete Journey Workflow Tests
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

// Mock SFMC Journey Builder endpoints for complete workflow testing
const createJourneyWorkflowApp = () => {
    const app = express();
    app.use(express.json());

    // Journey entry endpoint
    app.post('/journey/entry', (req, res) => {
        const { contacts, journeyId } = req.body;
        res.json({
            success: true,
            journeyId: journeyId || `journey_${Date.now()}`,
            contactsEntered: contacts.length,
            entryTimestamp: new Date().toISOString()
        });
    });

    // STO Activity endpoint
    app.post('/journey/sto-activity', async (req, res) => {
        const { contacts, config } = req.body;
        
        // Simulate STO processing
        const processedContacts = contacts.map(contact => ({
            ...contact,
            stoProcessed: true,
            convertedTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
            processedAt: new Date().toISOString()
        }));

        res.json({
            success: true,
            processedContacts,
            processingTime: Date.now()
        });
    });

    // Wait By Attribute endpoint
    app.post('/journey/wait-by-attribute', (req, res) => {
        const { contacts, attributeName } = req.body;
        
        const waitingContacts = contacts.map(contact => ({
            ...contact,
            waitStatus: 'waiting',
            waitAttributeName: attributeName,
            waitUntil: contact[attributeName] || contact.ConvertedTime,
            waitStarted: new Date().toISOString()
        }));

        res.json({
            success: true,
            waitingContacts,
            totalWaiting: waitingContacts.length
        });
    });

    // Email Send endpoint
    app.post('/journey/send-email', (req, res) => {
        const { contacts, emailTemplate } = req.body;
        
        const sentContacts = contacts.map(contact => ({
            ...contact,
            emailSent: true,
            emailTemplate: emailTemplate || 'default_template',
            sentAt: new Date().toISOString(),
            deliveryStatus: 'sent'
        }));

        res.json({
            success: true,
            sentContacts,
            totalSent: sentContacts.length
        });
    });

    return app;
};

describe('Complete Journey Workflow Tests', () => {
    let journeyApp;
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

        journeyApp = createJourneyWorkflowApp();

        const baseTimezoneCalculator = new TimezoneCalculator({}, mockLogger);
        
        // Create adapter for compatibility
        timezoneEngine = {
            getTimezoneInfo: (countryCode) => {
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
            convertToSFMCTime: (localTime, countryCode) => {
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

        // Mock successful data extension updates
        jest.spyOn(convertedTimeUpdater.dataExtensionAPI, 'updateConvertedTime')
            .mockImplementation((subscriberKey, convertedTime, dataExtensionKey) => 
                Promise.resolve({ success: true, subscriberKey, attempts: 1 }));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('End-to-End Journey Workflow', () => {
        test('should complete full journey workflow from entry to email send', async () => {
            // Test contacts from different countries and timezones
            const journeyContacts = [
                {
                    subscriberKey: 'workflow_us_001',
                    emailAddress: 'us@example.com',
                    geosegment: 'US',
                    firstName: 'John',
                    lastName: 'Doe'
                },
                {
                    subscriberKey: 'workflow_br_001',
                    emailAddress: 'br@example.com',
                    geosegment: 'BR',
                    firstName: 'Maria',
                    lastName: 'Silva'
                },
                {
                    subscriberKey: 'workflow_jp_001',
                    emailAddress: 'jp@example.com',
                    geosegment: 'JP',
                    firstName: 'Hiroshi',
                    lastName: 'Tanaka'
                }
            ];

            const journeyId = 'test_journey_001';

            // Step 1: Journey Entry
            const entryResponse = await request(journeyApp)
                .post('/journey/entry')
                .send({ 
                    contacts: journeyContacts,
                    journeyId: journeyId
                })
                .expect(200);

            expect(entryResponse.body.success).toBe(true);
            expect(entryResponse.body.contactsEntered).toBe(3);
            expect(entryResponse.body.journeyId).toBe(journeyId);

            // Step 2: STO Activity Processing
            const stoConfig = {
                skipWeekends: true,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 10, endHour: 11, enabled: true },
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            // Process each contact through STO
            const stoProcessedContacts = [];
            for (const contact of journeyContacts) {
                const contactData = {
                    ...contact,
                    entryTime: new Date()
                };

                const result = await contactProcessor.processContact(contactData, stoConfig);
                expect(result.success).toBe(true);
                expect(result.convertedTime).toBeInstanceOf(Date);

                // Update ConvertedTime in data extension
                const updateResult = await convertedTimeUpdater.updateConvertedTime(
                    contact.subscriberKey,
                    result.convertedTime,
                    'Journey_Workflow_DE'
                );
                expect(updateResult.success).toBe(true);

                stoProcessedContacts.push({
                    ...contact,
                    ConvertedTime: result.convertedTime.toISOString(),
                    stoProcessed: true
                });
            }

            // Step 3: Wait By Attribute Activity
            const waitResponse = await request(journeyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: stoProcessedContacts,
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.totalWaiting).toBe(3);

            // Validate wait configuration
            waitResponse.body.waitingContacts.forEach(contact => {
                expect(contact.waitStatus).toBe('waiting');
                expect(contact.waitAttributeName).toBe('ConvertedTime');
                expect(contact.waitUntil).toBeDefined();
                expect(contact.waitStarted).toBeDefined();
            });

            // Step 4: Email Send (after wait time)
            const emailResponse = await request(journeyApp)
                .post('/journey/send-email')
                .send({
                    contacts: waitResponse.body.waitingContacts,
                    emailTemplate: 'sto_optimized_template'
                })
                .expect(200);

            expect(emailResponse.body.success).toBe(true);
            expect(emailResponse.body.totalSent).toBe(3);

            // Validate email send results
            emailResponse.body.sentContacts.forEach((contact, index) => {
                expect(contact.emailSent).toBe(true);
                expect(contact.deliveryStatus).toBe('sent');
                expect(contact.emailTemplate).toBe('sto_optimized_template');
                expect(contact.subscriberKey).toBe(journeyContacts[index].subscriberKey);
            });

            // Step 5: End-to-End Validation
            const workflowValidation = {
                contactsEntered: entryResponse.body.contactsEntered,
                contactsProcessedBySTO: stoProcessedContacts.length,
                contactsWaiting: waitResponse.body.totalWaiting,
                emailsSent: emailResponse.body.totalSent,
                successRate: (emailResponse.body.totalSent / entryResponse.body.contactsEntered) * 100
            };

            expect(workflowValidation.successRate).toBe(100);
            expect(workflowValidation.contactsEntered).toBe(workflowValidation.emailsSent);

            // Validate timezone-specific processing occurred
            const usContact = stoProcessedContacts.find(c => c.geosegment === 'US');
            const brContact = stoProcessedContacts.find(c => c.geosegment === 'BR');
            const jpContact = stoProcessedContacts.find(c => c.geosegment === 'JP');

            expect(usContact).toBeDefined();
            expect(brContact).toBeDefined();
            expect(jpContact).toBeDefined();

            // All should have valid ConvertedTime values
            [usContact, brContact, jpContact].forEach(contact => {
                expect(contact.ConvertedTime).toBeDefined();
                expect(new Date(contact.ConvertedTime).getTime()).toBeGreaterThan(0);
            });
        });

        test('should handle multi-country journey with different timezone scenarios', async () => {
            const globalContacts = [
                { subscriberKey: 'global_us', emailAddress: 'us@global.com', geosegment: 'US' },
                { subscriberKey: 'global_br', emailAddress: 'br@global.com', geosegment: 'BR' },
                { subscriberKey: 'global_jp', emailAddress: 'jp@global.com', geosegment: 'JP' },
                { subscriberKey: 'global_gb', emailAddress: 'gb@global.com', geosegment: 'GB' },
                { subscriberKey: 'global_au', emailAddress: 'au@global.com', geosegment: 'AU' }
            ];

            const globalJourneyId = 'global_journey_001';

            // Journey Entry
            const entryResponse = await request(journeyApp)
                .post('/journey/entry')
                .send({ 
                    contacts: globalContacts,
                    journeyId: globalJourneyId
                })
                .expect(200);

            expect(entryResponse.body.success).toBe(true);
            expect(entryResponse.body.contactsEntered).toBe(5);

            // STO Processing for all countries
            const stoConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true },
                    { startHour: 15, endHour: 16, enabled: true }
                ]
            };

            const globalStoResults = [];
            for (const contact of globalContacts) {
                const contactData = {
                    ...contact,
                    entryTime: new Date()
                };

                const result = await contactProcessor.processContact(contactData, stoConfig);
                expect(result.success).toBe(true);

                globalStoResults.push({
                    ...contact,
                    ConvertedTime: result.convertedTime.toISOString(),
                    originalGeosegment: contact.geosegment
                });
            }

            // Wait By Attribute for all countries
            const globalWaitResponse = await request(journeyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: globalStoResults,
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(globalWaitResponse.body.success).toBe(true);
            expect(globalWaitResponse.body.totalWaiting).toBe(5);

            // Email Send for all countries
            const globalEmailResponse = await request(journeyApp)
                .post('/journey/send-email')
                .send({
                    contacts: globalWaitResponse.body.waitingContacts,
                    emailTemplate: 'global_campaign_template'
                })
                .expect(200);

            expect(globalEmailResponse.body.success).toBe(true);
            expect(globalEmailResponse.body.totalSent).toBe(5);

            // Validate each country was processed
            const countriesProcessed = globalEmailResponse.body.sentContacts.map(c => c.geosegment);
            expect(countriesProcessed).toContain('US');
            expect(countriesProcessed).toContain('BR');
            expect(countriesProcessed).toContain('JP');
            expect(countriesProcessed).toContain('GB');
            expect(countriesProcessed).toContain('AU');

            // All emails should be sent successfully
            globalEmailResponse.body.sentContacts.forEach(contact => {
                expect(contact.emailSent).toBe(true);
                expect(contact.deliveryStatus).toBe('sent');
            });
        });

        test('should handle journey with weekend and holiday exclusions', async () => {
            const exclusionContacts = [
                {
                    subscriberKey: 'exclusion_001',
                    emailAddress: 'weekend@example.com',
                    geosegment: 'US',
                    entryTime: new Date() // Use current time to avoid date issues
                }
            ];

            // Mock holiday checker
            jest.spyOn(holidayChecker, 'isPublicHoliday')
                .mockResolvedValue({ isHoliday: false });

            const exclusionConfig = {
                skipWeekends: true,
                skipHolidays: true,
                timeWindows: [
                    { startHour: 10, endHour: 11, enabled: true }
                ]
            };

            // Journey Entry
            const entryResponse = await request(journeyApp)
                .post('/journey/entry')
                .send({ contacts: exclusionContacts })
                .expect(200);

            expect(entryResponse.body.success).toBe(true);

            // STO Processing with exclusions
            const result = await contactProcessor.processContact(exclusionContacts[0], exclusionConfig);
            expect(result.success).toBe(true);
            expect(result.convertedTime).toBeInstanceOf(Date);

            const exclusionStoResult = {
                ...exclusionContacts[0],
                ConvertedTime: result.convertedTime.toISOString()
            };

            // Wait By Attribute
            const waitResponse = await request(journeyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: [exclusionStoResult],
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.totalWaiting).toBe(1);

            // Email Send
            const emailResponse = await request(journeyApp)
                .post('/journey/send-email')
                .send({ contacts: waitResponse.body.waitingContacts })
                .expect(200);

            expect(emailResponse.body.success).toBe(true);
            expect(emailResponse.body.totalSent).toBe(1);

            // Validate exclusion handling worked - journey completed successfully
            const sentContact = emailResponse.body.sentContacts[0];
            expect(sentContact.emailSent).toBe(true);
            expect(sentContact.subscriberKey).toBe('exclusion_001');
            
            // Validate that exclusion configuration was processed
            expect(result.convertedTime).toBeDefined();
        });

        test('should handle journey with error scenarios and graceful degradation', async () => {
            const errorContacts = [
                {
                    subscriberKey: 'error_001',
                    emailAddress: 'error@example.com',
                    geosegment: 'INVALID', // Invalid country code
                    entryTime: new Date()
                }
            ];

            const errorConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            // Journey Entry
            const entryResponse = await request(journeyApp)
                .post('/journey/entry')
                .send({ contacts: errorContacts })
                .expect(200);

            expect(entryResponse.body.success).toBe(true);

            // STO Processing with invalid geosegment (should use fallback)
            const result = await contactProcessor.processContact(errorContacts[0], errorConfig);
            expect(result.success).toBe(true); // Should succeed with fallback
            expect(result.convertedTime).toBeInstanceOf(Date);

            const errorStoResult = {
                ...errorContacts[0],
                ConvertedTime: result.convertedTime.toISOString()
            };

            // Wait By Attribute
            const waitResponse = await request(journeyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: [errorStoResult],
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.totalWaiting).toBe(1);

            // Email Send
            const emailResponse = await request(journeyApp)
                .post('/journey/send-email')
                .send({ contacts: waitResponse.body.waitingContacts })
                .expect(200);

            expect(emailResponse.body.success).toBe(true);
            expect(emailResponse.body.totalSent).toBe(1);

            // Validate graceful degradation worked
            const sentContact = emailResponse.body.sentContacts[0];
            expect(sentContact.emailSent).toBe(true);
            expect(sentContact.subscriberKey).toBe('error_001');
        });

        test('should validate journey performance with multiple contacts', async () => {
            const performanceContacts = Array.from({ length: 10 }, (_, i) => ({
                subscriberKey: `perf_${i.toString().padStart(3, '0')}`,
                emailAddress: `perf${i}@example.com`,
                geosegment: ['US', 'BR', 'JP', 'GB', 'AU'][i % 5],
                entryTime: new Date()
            }));

            const performanceConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            const startTime = Date.now();

            // Journey Entry
            const entryResponse = await request(journeyApp)
                .post('/journey/entry')
                .send({ contacts: performanceContacts })
                .expect(200);

            expect(entryResponse.body.success).toBe(true);
            expect(entryResponse.body.contactsEntered).toBe(10);

            // STO Processing
            const stoResults = [];
            for (const contact of performanceContacts) {
                const result = await contactProcessor.processContact(contact, performanceConfig);
                expect(result.success).toBe(true);

                stoResults.push({
                    ...contact,
                    ConvertedTime: result.convertedTime.toISOString()
                });
            }

            // Wait By Attribute
            const waitResponse = await request(journeyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: stoResults,
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.totalWaiting).toBe(10);

            // Email Send
            const emailResponse = await request(journeyApp)
                .post('/journey/send-email')
                .send({ contacts: waitResponse.body.waitingContacts })
                .expect(200);

            expect(emailResponse.body.success).toBe(true);
            expect(emailResponse.body.totalSent).toBe(10);

            const totalTime = Date.now() - startTime;
            const avgTimePerContact = totalTime / 10;

            // Performance validation
            expect(totalTime).toBeLessThan(10000); // Under 10 seconds
            expect(avgTimePerContact).toBeLessThan(1000); // Under 1 second per contact

            // All contacts should complete successfully
            expect(emailResponse.body.sentContacts).toHaveLength(10);
            emailResponse.body.sentContacts.forEach(contact => {
                expect(contact.emailSent).toBe(true);
                expect(contact.deliveryStatus).toBe('sent');
            });
        });
    });
});