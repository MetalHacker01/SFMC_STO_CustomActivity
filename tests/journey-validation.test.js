/**
 * Journey Validation Tests
 * Task 12.2: Create end-to-end journey testing - Validation Component
 * - Validate complete workflow from entry to email send
 * - Test journey state transitions and data consistency
 * - Verify error handling and recovery scenarios
 * Requirements: 9.5
 */

const request = require('supertest');
const express = require('express');
const ContactProcessor = require('../src/execution/contact-processor');
const ConvertedTimeUpdater = require('../src/dataextension/converted-time-updater');
const { TimezoneCalculator } = require('../src/timezone-calculator');
const HolidayChecker = require('../src/holiday-checker');

// Mock SFMC Journey Builder with state tracking
const createJourneyValidationApp = () => {
    const app = express();
    app.use(express.json());

    // Journey state tracking
    const journeyState = {
        entries: new Map(),
        waitingContacts: new Map(),
        sentEmails: new Map()
    };

    // Journey entry with state tracking
    app.post('/journey/entry', (req, res) => {
        const { contacts, journeyId } = req.body;
        const entryId = `entry_${Date.now()}`;
        
        contacts.forEach(contact => {
            journeyState.entries.set(contact.subscriberKey, {
                ...contact,
                entryId,
                journeyId,
                entryTime: new Date().toISOString(),
                status: 'entered'
            });
        });

        res.json({
            success: true,
            entryId,
            journeyId,
            contactsEntered: contacts.length,
            timestamp: new Date().toISOString()
        });
    });

    // STO Activity processing with validation
    app.post('/journey/sto-activity', (req, res) => {
        const { contacts, config } = req.body;
        const processedContacts = [];

        contacts.forEach(contact => {
            const entryData = journeyState.entries.get(contact.subscriberKey);
            if (!entryData) {
                throw new Error(`Contact ${contact.subscriberKey} not found in journey`);
            }

            // Update state
            journeyState.entries.set(contact.subscriberKey, {
                ...entryData,
                ...contact,
                stoProcessed: true,
                stoConfig: config,
                status: 'sto_processed'
            });

            processedContacts.push({
                ...contact,
                stoProcessed: true
            });
        });

        res.json({
            success: true,
            processedContacts,
            processedCount: processedContacts.length
        });
    });

    // Wait By Attribute with state validation
    app.post('/journey/wait-by-attribute', (req, res) => {
        const { contacts, attributeName, waitUntil } = req.body;
        const processedContacts = [];

        contacts.forEach(contact => {
            const entryData = journeyState.entries.get(contact.subscriberKey);
            if (!entryData) {
                throw new Error(`Contact ${contact.subscriberKey} not found in journey`);
            }

            if (!entryData.stoProcessed) {
                throw new Error(`Contact ${contact.subscriberKey} has not been processed by STO activity`);
            }

            const waitUntilTime = contact[attributeName] || waitUntil;
            const waitingContact = {
                ...contact,
                waitStatus: 'waiting',
                waitUntil: waitUntilTime,
                waitStartTime: new Date().toISOString(),
                attributeName
            };

            // Update state
            journeyState.waitingContacts.set(contact.subscriberKey, waitingContact);
            journeyState.entries.set(contact.subscriberKey, {
                ...entryData,
                status: 'waiting',
                waitUntil: waitUntilTime
            });

            processedContacts.push(waitingContact);
        });

        res.json({
            success: true,
            processedContacts,
            waitingCount: processedContacts.length
        });
    });

    // Email send with final validation
    app.post('/journey/send-email', (req, res) => {
        const { contacts } = req.body;
        const sentContacts = [];

        contacts.forEach(contact => {
            const entryData = journeyState.entries.get(contact.subscriberKey);
            const waitingData = journeyState.waitingContacts.get(contact.subscriberKey);

            if (!entryData) {
                throw new Error(`Contact ${contact.subscriberKey} not found in journey`);
            }

            if (!waitingData) {
                throw new Error(`Contact ${contact.subscriberKey} was not in waiting state`);
            }

            // Simulate wait time validation
            const waitUntilTime = new Date(waitingData.waitUntil);
            const currentTime = new Date();
            
            const sentContact = {
                ...contact,
                emailSent: true,
                sentAt: currentTime.toISOString(),
                deliveryStatus: 'sent',
                waitTimeCompleted: currentTime >= waitUntilTime,
                journeyCompleted: true
            };

            // Update final state
            journeyState.sentEmails.set(contact.subscriberKey, sentContact);
            journeyState.entries.set(contact.subscriberKey, {
                ...entryData,
                status: 'completed',
                completedAt: currentTime.toISOString()
            });

            sentContacts.push(sentContact);
        });

        res.json({
            success: true,
            sentContacts,
            sentCount: sentContacts.length
        });
    });

    // Journey state inspection endpoint
    app.get('/journey/state/:subscriberKey', (req, res) => {
        const { subscriberKey } = req.params;
        const entryData = journeyState.entries.get(subscriberKey);
        const waitingData = journeyState.waitingContacts.get(subscriberKey);
        const sentData = journeyState.sentEmails.get(subscriberKey);

        res.json({
            subscriberKey,
            entryData,
            waitingData,
            sentData,
            currentStatus: entryData?.status || 'not_found'
        });
    });

    // Journey analytics endpoint
    app.get('/journey/analytics', (req, res) => {
        const analytics = {
            totalEntries: journeyState.entries.size,
            waitingContacts: journeyState.waitingContacts.size,
            sentEmails: journeyState.sentEmails.size,
            statusDistribution: {},
            averageJourneyTime: 0
        };

        // Calculate status distribution
        journeyState.entries.forEach(entry => {
            analytics.statusDistribution[entry.status] = 
                (analytics.statusDistribution[entry.status] || 0) + 1;
        });

        res.json(analytics);
    });

    return { app, journeyState };
};

describe('Journey Validation Tests', () => {
    let mockJourneyApp;
    let journeyState;
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

        const { app, journeyState: state } = createJourneyValidationApp();
        mockJourneyApp = app;
        journeyState = state;

        const baseTimezoneCalculator = new TimezoneCalculator({}, mockLogger);
        
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

        jest.spyOn(convertedTimeUpdater.dataExtensionAPI, 'updateConvertedTime')
            .mockImplementation((subscriberKey, convertedTime, dataExtensionKey) => 
                Promise.resolve({ success: true, subscriberKey, attempts: 1 }));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Complete Journey State Validation', () => {
        test('should validate complete journey state transitions', async () => {
            const journeyId = 'validation_journey_001';
            const testContact = {
                subscriberKey: 'state_001',
                emailAddress: 'state@example.com',
                geosegment: 'US',
                firstName: 'State',
                lastName: 'Test'
            };

            // Step 1: Journey Entry
            const entryResponse = await request(mockJourneyApp)
                .post('/journey/entry')
                .send({ 
                    contacts: [testContact],
                    journeyId 
                })
                .expect(200);

            expect(entryResponse.body.success).toBe(true);
            expect(entryResponse.body.contactsEntered).toBe(1);

            // Validate entry state
            const entryStateResponse = await request(mockJourneyApp)
                .get(`/journey/state/${testContact.subscriberKey}`)
                .expect(200);

            expect(entryStateResponse.body.currentStatus).toBe('entered');
            expect(entryStateResponse.body.entryData.journeyId).toBe(journeyId);

            // Step 2: STO Activity Processing
            const stoConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            const stoResult = await contactProcessor.processContact({
                ...testContact,
                entryTime: new Date()
            }, stoConfig);

            expect(stoResult.success).toBe(true);

            // Update journey state through STO activity endpoint
            const stoActivityResponse = await request(mockJourneyApp)
                .post('/journey/sto-activity')
                .send({
                    contacts: [{
                        ...testContact,
                        convertedTime: stoResult.convertedTime.toISOString()
                    }],
                    config: stoConfig
                })
                .expect(200);

            expect(stoActivityResponse.body.success).toBe(true);

            // Validate STO processing state
            const stoStateResponse = await request(mockJourneyApp)
                .get(`/journey/state/${testContact.subscriberKey}`)
                .expect(200);

            expect(stoStateResponse.body.currentStatus).toBe('sto_processed');
            expect(stoStateResponse.body.entryData.stoProcessed).toBe(true);

            // Step 3: Data Extension Update
            const updateResult = await convertedTimeUpdater.updateConvertedTime(
                testContact.subscriberKey,
                stoResult.convertedTime,
                'Validation_Journey_DE'
            );

            expect(updateResult.success).toBe(true);

            // Step 4: Wait By Attribute
            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: [{
                        subscriberKey: testContact.subscriberKey,
                        emailAddress: testContact.emailAddress,
                        ConvertedTime: stoResult.convertedTime.toISOString()
                    }],
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);
            expect(waitResponse.body.waitingCount).toBe(1);

            // Validate waiting state
            const waitStateResponse = await request(mockJourneyApp)
                .get(`/journey/state/${testContact.subscriberKey}`)
                .expect(200);

            expect(waitStateResponse.body.currentStatus).toBe('waiting');
            expect(waitStateResponse.body.waitingData.waitStatus).toBe('waiting');
            expect(waitStateResponse.body.waitingData.waitUntil).toBe(stoResult.convertedTime.toISOString());

            // Step 5: Email Send
            const emailResponse = await request(mockJourneyApp)
                .post('/journey/send-email')
                .send({ contacts: waitResponse.body.processedContacts })
                .expect(200);

            expect(emailResponse.body.success).toBe(true);
            expect(emailResponse.body.sentCount).toBe(1);

            // Validate final completed state
            const finalStateResponse = await request(mockJourneyApp)
                .get(`/journey/state/${testContact.subscriberKey}`)
                .expect(200);

            expect(finalStateResponse.body.currentStatus).toBe('completed');
            expect(finalStateResponse.body.sentData.emailSent).toBe(true);
            expect(finalStateResponse.body.sentData.journeyCompleted).toBe(true);

            // Validate complete journey analytics
            const analyticsResponse = await request(mockJourneyApp)
                .get('/journey/analytics')
                .expect(200);

            expect(analyticsResponse.body.totalEntries).toBe(1);
            expect(analyticsResponse.body.sentEmails).toBe(1);
            expect(analyticsResponse.body.statusDistribution.completed).toBe(1);
        });

        test('should validate journey with multiple contacts and different paths', async () => {
            const journeyId = 'multi_path_journey_001';
            const testContacts = [
                {
                    subscriberKey: 'path_001',
                    emailAddress: 'path1@example.com',
                    geosegment: 'US',
                    entryTime: new Date('2024-01-15T10:00:00Z')
                },
                {
                    subscriberKey: 'path_002',
                    emailAddress: 'path2@example.com',
                    geosegment: 'BR',
                    entryTime: new Date('2024-01-15T11:00:00Z')
                },
                {
                    subscriberKey: 'path_003',
                    emailAddress: 'path3@example.com',
                    geosegment: 'JP',
                    entryTime: new Date('2024-01-15T12:00:00Z')
                }
            ];

            // Journey Entry
            const entryResponse = await request(mockJourneyApp)
                .post('/journey/entry')
                .send({ 
                    contacts: testContacts,
                    journeyId 
                })
                .expect(200);

            expect(entryResponse.body.contactsEntered).toBe(3);

            // Process each contact through STO with different configurations
            const stoConfigs = [
                { skipWeekends: true, skipHolidays: false, timeWindows: [{ startHour: 9, endHour: 10, enabled: true }] },
                { skipWeekends: false, skipHolidays: true, timeWindows: [{ startHour: 14, endHour: 15, enabled: true }] },
                { skipWeekends: true, skipHolidays: true, timeWindows: [{ startHour: 16, endHour: 17, enabled: true }] }
            ];

            const processedContacts = [];
            for (let i = 0; i < testContacts.length; i++) {
                const contact = testContacts[i];
                const config = stoConfigs[i];

                const stoResult = await contactProcessor.processContact(contact, config);
                expect(stoResult.success).toBe(true);

                // Update journey state
                await request(mockJourneyApp)
                    .post('/journey/sto-activity')
                    .send({
                        contacts: [{
                            ...contact,
                            convertedTime: stoResult.convertedTime.toISOString()
                        }],
                        config
                    })
                    .expect(200);

                processedContacts.push({
                    ...contact,
                    convertedTime: stoResult.convertedTime,
                    config
                });
            }

            // Validate all contacts are in STO processed state
            for (const contact of testContacts) {
                const stateResponse = await request(mockJourneyApp)
                    .get(`/journey/state/${contact.subscriberKey}`)
                    .expect(200);

                expect(stateResponse.body.currentStatus).toBe('sto_processed');
            }

            // Process through Wait By Attribute
            const waitByAttributeContacts = processedContacts.map(contact => ({
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

            expect(waitResponse.body.waitingCount).toBe(3);

            // Validate all contacts are in waiting state
            for (const contact of testContacts) {
                const stateResponse = await request(mockJourneyApp)
                    .get(`/journey/state/${contact.subscriberKey}`)
                    .expect(200);

                expect(stateResponse.body.currentStatus).toBe('waiting');
                expect(stateResponse.body.waitingData.waitStatus).toBe('waiting');
            }

            // Send emails
            const emailResponse = await request(mockJourneyApp)
                .post('/journey/send-email')
                .send({ contacts: waitResponse.body.processedContacts })
                .expect(200);

            expect(emailResponse.body.sentCount).toBe(3);

            // Validate all contacts completed the journey
            for (const contact of testContacts) {
                const stateResponse = await request(mockJourneyApp)
                    .get(`/journey/state/${contact.subscriberKey}`)
                    .expect(200);

                expect(stateResponse.body.currentStatus).toBe('completed');
                expect(stateResponse.body.sentData.emailSent).toBe(true);
            }

            // Validate final analytics
            const analyticsResponse = await request(mockJourneyApp)
                .get('/journey/analytics')
                .expect(200);

            expect(analyticsResponse.body.totalEntries).toBe(3);
            expect(analyticsResponse.body.sentEmails).toBe(3);
            expect(analyticsResponse.body.statusDistribution.completed).toBe(3);
        });
    });

    describe('Journey Error Recovery Validation', () => {
        test('should validate journey recovery from STO processing failures', async () => {
            const testContact = {
                subscriberKey: 'error_recovery_001',
                emailAddress: 'error@example.com',
                geosegment: 'US',
                entryTime: 'invalid-date' // This will cause processing issues
            };

            // Journey Entry
            await request(mockJourneyApp)
                .post('/journey/entry')
                .send({ 
                    contacts: [testContact],
                    journeyId: 'error_recovery_journey' 
                })
                .expect(200);

            // STO Processing with error handling
            const stoConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            const stoResult = await contactProcessor.processContact(testContact, stoConfig);
            
            // Should succeed with fallback behavior
            expect(stoResult.success).toBe(true);
            expect(stoResult.convertedTime).toBeInstanceOf(Date);

            // Continue journey despite initial error
            await request(mockJourneyApp)
                .post('/journey/sto-activity')
                .send({
                    contacts: [{
                        ...testContact,
                        convertedTime: stoResult.convertedTime.toISOString()
                    }],
                    config: stoConfig
                })
                .expect(200);

            // Validate recovery state
            const stateResponse = await request(mockJourneyApp)
                .get(`/journey/state/${testContact.subscriberKey}`)
                .expect(200);

            expect(stateResponse.body.currentStatus).toBe('sto_processed');

            // Complete journey successfully
            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: [{
                        subscriberKey: testContact.subscriberKey,
                        emailAddress: testContact.emailAddress,
                        ConvertedTime: stoResult.convertedTime.toISOString()
                    }],
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);

            const emailResponse = await request(mockJourneyApp)
                .post('/journey/send-email')
                .send({ contacts: waitResponse.body.processedContacts })
                .expect(200);

            expect(emailResponse.body.success).toBe(true);

            // Validate successful completion despite initial error
            const finalStateResponse = await request(mockJourneyApp)
                .get(`/journey/state/${testContact.subscriberKey}`)
                .expect(200);

            expect(finalStateResponse.body.currentStatus).toBe('completed');
        });

        test('should validate journey with data extension update failures', async () => {
            const testContact = {
                subscriberKey: 'de_failure_001',
                emailAddress: 'defailure@example.com',
                geosegment: 'US',
                entryTime: new Date()
            };

            // Mock data extension failure
            convertedTimeUpdater.dataExtensionAPI.updateConvertedTime
                .mockResolvedValueOnce({
                    success: false,
                    error: 'Data extension update failed',
                    gracefulDegradation: {
                        type: 'continue_journey',
                        impact: 'Contact will proceed without optimized send time'
                    }
                });

            // Journey Entry
            await request(mockJourneyApp)
                .post('/journey/entry')
                .send({ 
                    contacts: [testContact],
                    journeyId: 'de_failure_journey' 
                })
                .expect(200);

            // STO Processing
            const stoConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            const stoResult = await contactProcessor.processContact(testContact, stoConfig);
            expect(stoResult.success).toBe(true);

            // Data Extension Update (will fail)
            const updateResult = await convertedTimeUpdater.updateConvertedTime(
                testContact.subscriberKey,
                stoResult.convertedTime,
                'Failure_Test_DE'
            );

            expect(updateResult.success).toBe(false);
            expect(updateResult.gracefulDegradation).toBeDefined();

            // Journey should continue despite DE failure
            await request(mockJourneyApp)
                .post('/journey/sto-activity')
                .send({
                    contacts: [{
                        ...testContact,
                        convertedTime: stoResult.convertedTime.toISOString()
                    }],
                    config: stoConfig
                })
                .expect(200);

            // Continue with Wait By Attribute (using calculated time despite DE failure)
            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: [{
                        subscriberKey: testContact.subscriberKey,
                        emailAddress: testContact.emailAddress,
                        ConvertedTime: stoResult.convertedTime.toISOString()
                    }],
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            expect(waitResponse.body.success).toBe(true);

            // Complete journey
            const emailResponse = await request(mockJourneyApp)
                .post('/journey/send-email')
                .send({ contacts: waitResponse.body.processedContacts })
                .expect(200);

            expect(emailResponse.body.success).toBe(true);

            // Validate journey completed successfully despite DE failure
            const finalStateResponse = await request(mockJourneyApp)
                .get(`/journey/state/${testContact.subscriberKey}`)
                .expect(200);

            expect(finalStateResponse.body.currentStatus).toBe('completed');
        });
    });

    describe('Journey Data Consistency Validation', () => {
        test('should validate data consistency throughout journey lifecycle', async () => {
            const testContact = {
                subscriberKey: 'consistency_001',
                emailAddress: 'consistency@example.com',
                geosegment: 'BR',
                firstName: 'Consistency',
                lastName: 'Test',
                customField1: 'CustomValue1',
                entryTime: new Date('2024-01-15T10:00:00Z')
            };

            const journeyId = 'consistency_journey_001';

            // Track data consistency throughout journey
            const dataConsistencyTracker = {
                entry: null,
                stoProcessing: null,
                waitByAttribute: null,
                emailSend: null
            };

            // Step 1: Journey Entry
            const entryResponse = await request(mockJourneyApp)
                .post('/journey/entry')
                .send({ 
                    contacts: [testContact],
                    journeyId 
                })
                .expect(200);

            dataConsistencyTracker.entry = {
                subscriberKey: testContact.subscriberKey,
                emailAddress: testContact.emailAddress,
                geosegment: testContact.geosegment,
                timestamp: entryResponse.body.timestamp
            };

            // Step 2: STO Processing
            const stoConfig = {
                skipWeekends: true,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            const stoResult = await contactProcessor.processContact(testContact, stoConfig);
            expect(stoResult.success).toBe(true);

            dataConsistencyTracker.stoProcessing = {
                subscriberKey: stoResult.subscriberKey,
                originalEntryTime: testContact.entryTime,
                convertedTime: stoResult.convertedTime,
                geosegment: testContact.geosegment
            };

            // Validate data consistency after STO
            expect(dataConsistencyTracker.stoProcessing.subscriberKey)
                .toBe(dataConsistencyTracker.entry.subscriberKey);

            // Step 3: Wait By Attribute
            const waitResponse = await request(mockJourneyApp)
                .post('/journey/wait-by-attribute')
                .send({
                    contacts: [{
                        subscriberKey: testContact.subscriberKey,
                        emailAddress: testContact.emailAddress,
                        geosegment: testContact.geosegment,
                        ConvertedTime: stoResult.convertedTime.toISOString(),
                        customField1: testContact.customField1
                    }],
                    attributeName: 'ConvertedTime'
                })
                .expect(200);

            const waitingContact = waitResponse.body.processedContacts[0];
            dataConsistencyTracker.waitByAttribute = {
                subscriberKey: waitingContact.subscriberKey,
                emailAddress: waitingContact.emailAddress,
                geosegment: waitingContact.geosegment,
                waitUntil: waitingContact.waitUntil,
                customField1: waitingContact.customField1
            };

            // Validate data consistency in Wait By Attribute
            expect(dataConsistencyTracker.waitByAttribute.subscriberKey)
                .toBe(dataConsistencyTracker.entry.subscriberKey);
            expect(dataConsistencyTracker.waitByAttribute.emailAddress)
                .toBe(dataConsistencyTracker.entry.emailAddress);
            expect(dataConsistencyTracker.waitByAttribute.geosegment)
                .toBe(dataConsistencyTracker.entry.geosegment);
            expect(dataConsistencyTracker.waitByAttribute.waitUntil)
                .toBe(stoResult.convertedTime.toISOString());

            // Step 4: Email Send
            const emailResponse = await request(mockJourneyApp)
                .post('/journey/send-email')
                .send({ contacts: [waitingContact] })
                .expect(200);

            const sentContact = emailResponse.body.sentContacts[0];
            dataConsistencyTracker.emailSend = {
                subscriberKey: sentContact.subscriberKey,
                emailAddress: sentContact.emailAddress,
                geosegment: sentContact.geosegment,
                emailSent: sentContact.emailSent,
                sentAt: sentContact.sentAt,
                customField1: sentContact.customField1
            };

            // Validate final data consistency
            expect(dataConsistencyTracker.emailSend.subscriberKey)
                .toBe(dataConsistencyTracker.entry.subscriberKey);
            expect(dataConsistencyTracker.emailSend.emailAddress)
                .toBe(dataConsistencyTracker.entry.emailAddress);
            expect(dataConsistencyTracker.emailSend.geosegment)
                .toBe(dataConsistencyTracker.entry.geosegment);
            expect(dataConsistencyTracker.emailSend.customField1)
                .toBe(testContact.customField1);

            // Validate complete data consistency chain
            const allSubscriberKeys = [
                dataConsistencyTracker.entry.subscriberKey,
                dataConsistencyTracker.stoProcessing.subscriberKey,
                dataConsistencyTracker.waitByAttribute.subscriberKey,
                dataConsistencyTracker.emailSend.subscriberKey
            ];

            const uniqueSubscriberKeys = new Set(allSubscriberKeys);
            expect(uniqueSubscriberKeys.size).toBe(1); // All should be the same

            const allEmailAddresses = [
                dataConsistencyTracker.entry.emailAddress,
                dataConsistencyTracker.waitByAttribute.emailAddress,
                dataConsistencyTracker.emailSend.emailAddress
            ];

            const uniqueEmailAddresses = new Set(allEmailAddresses);
            expect(uniqueEmailAddresses.size).toBe(1); // All should be the same
        });

        test('should validate timezone data consistency across journey steps', async () => {
            const timezoneTestContacts = [
                { subscriberKey: 'tz_001', emailAddress: 'tz1@example.com', geosegment: 'US' },
                { subscriberKey: 'tz_002', emailAddress: 'tz2@example.com', geosegment: 'BR' },
                { subscriberKey: 'tz_003', emailAddress: 'tz3@example.com', geosegment: 'JP' }
            ];

            const stoConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 14, endHour: 15, enabled: true }
                ]
            };

            const timezoneConsistencyData = [];

            // Process each contact and track timezone consistency
            for (const contact of timezoneTestContacts) {
                const contactData = {
                    ...contact,
                    entryTime: new Date('2024-01-15T12:00:00Z')
                };

                // STO Processing
                const stoResult = await contactProcessor.processContact(contactData, stoConfig);
                expect(stoResult.success).toBe(true);

                // Extract timezone information from processing
                const timezoneInfo = timezoneEngine.getTimezoneInfo(contact.geosegment);
                const conversionResult = timezoneEngine.convertToSFMCTime(
                    contactData.entryTime,
                    contact.geosegment
                );

                timezoneConsistencyData.push({
                    subscriberKey: contact.subscriberKey,
                    geosegment: contact.geosegment,
                    originalEntryTime: contactData.entryTime,
                    convertedTime: stoResult.convertedTime,
                    timezoneInfo,
                    conversionResult,
                    sfmcTime: conversionResult.success ? conversionResult.sfmcTime : null
                });
            }

            // Validate timezone consistency
            timezoneConsistencyData.forEach(data => {
                expect(data.timezoneInfo.countryCode).toBe(data.geosegment);
                expect(data.convertedTime).toBeInstanceOf(Date);
                
                if (data.conversionResult.success) {
                    expect(data.sfmcTime).toBeInstanceOf(Date);
                    // Converted time should be in SFMC timezone (CST)
                    expect(data.convertedTime.getTime()).toBeGreaterThan(Date.now());
                }
            });

            // Process through complete journey to ensure timezone consistency is maintained
            for (const data of timezoneConsistencyData) {
                const waitResponse = await request(mockJourneyApp)
                    .post('/journey/wait-by-attribute')
                    .send({
                        contacts: [{
                            subscriberKey: data.subscriberKey,
                            emailAddress: timezoneTestContacts.find(c => c.subscriberKey === data.subscriberKey).emailAddress,
                            ConvertedTime: data.convertedTime.toISOString()
                        }],
                        attributeName: 'ConvertedTime'
                    })
                    .expect(200);

                const waitingContact = waitResponse.body.processedContacts[0];
                
                // Validate timezone consistency in Wait By Attribute
                expect(waitingContact.waitUntil).toBe(data.convertedTime.toISOString());
                expect(new Date(waitingContact.waitUntil).getTime()).toBe(data.convertedTime.getTime());
            }
        });
    });
});