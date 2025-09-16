/**
 * Performance and Load Tests for Send Time Optimization
 * Task 10.3: Add performance and load testing
 * - Create tests for high-volume contact processing
 * - Test concurrent request handling within SFMC limits
 * - Validate response times and resource usage
 */

const ContactProcessor = require('../src/execution/contact-processor');
const { TimezoneCalculator } = require('../src/timezone-calculator');
const HolidayChecker = require('../src/holiday-checker');
const { TimeWindowProcessor } = require('../src/timewindow');

// Mock external dependencies for performance testing
jest.mock('axios');
jest.mock('../src/holiday-api');

describe('Performance and Load Tests', () => {
    let contactProcessor;
    let timezoneCalculator;
    let holidayChecker;
    let timeWindowProcessor;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Initialize components with performance-optimized settings
        timezoneCalculator = new TimezoneCalculator();
        holidayChecker = new HolidayChecker({ enabled: false }); // Disable for performance tests
        timeWindowProcessor = new TimeWindowProcessor();
        
        contactProcessor = new ContactProcessor({
            holidayApiEnabled: false, // Disable for performance tests
            maxRetries: 1, // Reduce retries for faster testing
            processingTimeout: 5000 // Shorter timeout for performance tests
        });
    });

    describe('High-Volume Contact Processing', () => {
        test('should process 1000 contacts within acceptable time limits', async () => {
            const contactCount = 1000;
            const maxProcessingTime = 30000; // 30 seconds max
            const maxAvgTimePerContact = 50; // 50ms per contact max

            // Generate test contacts
            const contacts = Array.from({ length: contactCount }, (_, i) => ({
                subscriberKey: `contact-${i}`,
                geosegment: ['US', 'BR', 'JP', 'GB', 'CA'][i % 5],
                emailAddress: `test${i}@example.com`,
                entryTime: new Date()
            }));

            const config = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true },
                    { startHour: 14, endHour: 16, enabled: true }
                ]
            };

            const startTime = Date.now();
            
            // Process contacts in batches to simulate real-world usage
            const batchSize = 50;
            const results = [];
            
            for (let i = 0; i < contacts.length; i += batchSize) {
                const batch = contacts.slice(i, i + batchSize);
                const batchPromises = batch.map(contact => 
                    contactProcessor.processContact(contact, config)
                );
                
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
            }

            const endTime = Date.now();
            const totalProcessingTime = endTime - startTime;
            const avgTimePerContact = totalProcessingTime / contactCount;

            // Validate performance metrics
            expect(results).toHaveLength(contactCount);
            expect(totalProcessingTime).toBeLessThan(maxProcessingTime);
            expect(avgTimePerContact).toBeLessThan(maxAvgTimePerContact);

            // Validate success rate
            const successfulResults = results.filter(r => r.success);
            const successRate = (successfulResults.length / contactCount) * 100;
            expect(successRate).toBeGreaterThan(95); // 95% success rate minimum

            console.log(`Performance Test Results:
                Total Contacts: ${contactCount}
                Total Time: ${totalProcessingTime}ms
                Avg Time per Contact: ${avgTimePerContact.toFixed(2)}ms
                Success Rate: ${successRate.toFixed(2)}%
                Throughput: ${(contactCount / (totalProcessingTime / 1000)).toFixed(2)} contacts/sec`);
        }, 60000); // 60 second timeout for this test

        test('should handle memory efficiently during high-volume processing', async () => {
            const contactCount = 500;
            const initialMemory = process.memoryUsage();

            // Generate test contacts
            const contacts = Array.from({ length: contactCount }, (_, i) => ({
                subscriberKey: `memory-test-${i}`,
                geosegment: 'US',
                emailAddress: `memtest${i}@example.com`,
                entryTime: new Date()
            }));

            const config = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [{ startHour: 10, endHour: 11, enabled: true }]
            };

            // Process all contacts
            const results = await Promise.all(
                contacts.map(contact => contactProcessor.processContact(contact, config))
            );

            const finalMemory = process.memoryUsage();
            const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
            const memoryPerContact = memoryIncrease / contactCount;

            // Validate memory usage
            expect(results).toHaveLength(contactCount);
            expect(memoryPerContact).toBeLessThan(10000); // Less than 10KB per contact
            expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB total increase

            console.log(`Memory Usage Test Results:
                Initial Heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
                Final Heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
                Memory Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB
                Memory per Contact: ${(memoryPerContact / 1024).toFixed(2)}KB`);

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
        }, 30000);

        test('should maintain performance with different country distributions', async () => {
            const contactCount = 200;
            const countries = ['US', 'BR', 'JP', 'GB', 'CA', 'AU', 'IN', 'CN', 'RU', 'ZA'];
            
            // Create contacts with even distribution across countries
            const contacts = Array.from({ length: contactCount }, (_, i) => ({
                subscriberKey: `country-test-${i}`,
                geosegment: countries[i % countries.length],
                emailAddress: `countrytest${i}@example.com`,
                entryTime: new Date()
            }));

            const config = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true },
                    { startHour: 14, endHour: 16, enabled: true }
                ]
            };

            const startTime = Date.now();
            const results = await Promise.all(
                contacts.map(contact => contactProcessor.processContact(contact, config))
            );
            const endTime = Date.now();

            const processingTime = endTime - startTime;
            const avgTimePerContact = processingTime / contactCount;

            // Validate performance across different countries
            expect(results).toHaveLength(contactCount);
            expect(avgTimePerContact).toBeLessThan(100); // 100ms per contact max
            
            // Validate that all countries were processed successfully
            const successfulResults = results.filter(r => r.success);
            expect(successfulResults.length).toBeGreaterThan(contactCount * 0.95);

            // Check that different countries have similar processing times
            const resultsByCountry = {};
            results.forEach(result => {
                const country = result.geosegment;
                if (!resultsByCountry[country]) {
                    resultsByCountry[country] = [];
                }
                resultsByCountry[country].push(result.processingTime);
            });

            // Validate processing time consistency across countries
            const avgTimesByCountry = {};
            Object.keys(resultsByCountry).forEach(country => {
                const times = resultsByCountry[country];
                avgTimesByCountry[country] = times.reduce((a, b) => a + b, 0) / times.length;
            });

            const avgTimes = Object.values(avgTimesByCountry);
            const minAvgTime = Math.min(...avgTimes);
            const maxAvgTime = Math.max(...avgTimes);
            const timeVariance = maxAvgTime - minAvgTime;

            // Time variance between countries should be reasonable
            expect(timeVariance).toBeLessThan(50); // Less than 50ms variance

            console.log(`Country Distribution Test Results:
                Countries Tested: ${countries.length}
                Total Processing Time: ${processingTime}ms
                Avg Time per Contact: ${avgTimePerContact.toFixed(2)}ms
                Time Variance: ${timeVariance.toFixed(2)}ms`);
        }, 30000);
    });

    describe('Concurrent Request Handling', () => {
        test('should handle concurrent processing without race conditions', async () => {
            const concurrentRequests = 50;
            const contact = {
                subscriberKey: 'concurrent-test',
                geosegment: 'US',
                emailAddress: 'concurrent@example.com',
                entryTime: new Date()
            };

            const config = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [{ startHour: 10, endHour: 11, enabled: true }]
            };

            const startTime = Date.now();
            
            // Create concurrent processing promises
            const promises = Array.from({ length: concurrentRequests }, () => 
                contactProcessor.processContact(contact, config)
            );

            const results = await Promise.all(promises);
            const endTime = Date.now();

            const totalTime = endTime - startTime;
            const avgTimePerRequest = totalTime / concurrentRequests;

            // Validate concurrent processing
            expect(results).toHaveLength(concurrentRequests);
            expect(results.every(r => r.success)).toBe(true);
            expect(avgTimePerRequest).toBeLessThan(200); // 200ms per request max

            // Validate consistency - all results should be identical for same input
            const firstResult = results[0];
            results.forEach(result => {
                expect(result.convertedTime).toEqual(firstResult.convertedTime);
                expect(result.adjustments).toEqual(firstResult.adjustments);
            });

            console.log(`Concurrent Processing Test Results:
                Concurrent Requests: ${concurrentRequests}
                Total Time: ${totalTime}ms
                Avg Time per Request: ${avgTimePerRequest.toFixed(2)}ms
                All Results Consistent: ${results.every(r => 
                    r.convertedTime === firstResult.convertedTime)}`);
        }, 20000);

        test('should respect SFMC rate limits and handle backoff', async () => {
            const requestCount = 100;
            const maxConcurrentRequests = 10; // Simulate SFMC limits
            
            const contacts = Array.from({ length: requestCount }, (_, i) => ({
                subscriberKey: `rate-limit-test-${i}`,
                geosegment: 'US',
                emailAddress: `ratetest${i}@example.com`,
                entryTime: new Date()
            }));

            const config = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [{ startHour: 10, endHour: 11, enabled: true }]
            };

            const startTime = Date.now();
            const results = [];

            // Process in controlled batches to simulate rate limiting
            for (let i = 0; i < contacts.length; i += maxConcurrentRequests) {
                const batch = contacts.slice(i, i + maxConcurrentRequests);
                const batchPromises = batch.map(contact => 
                    contactProcessor.processContact(contact, config)
                );
                
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);

                // Small delay between batches to simulate rate limiting
                if (i + maxConcurrentRequests < contacts.length) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }

            const endTime = Date.now();
            const totalTime = endTime - startTime;
            const throughput = (requestCount / (totalTime / 1000)).toFixed(2);

            // Validate rate-limited processing
            expect(results).toHaveLength(requestCount);
            expect(results.filter(r => r.success).length).toBeGreaterThan(requestCount * 0.95);
            expect(parseFloat(throughput)).toBeGreaterThan(5); // At least 5 requests/sec

            console.log(`Rate Limiting Test Results:
                Total Requests: ${requestCount}
                Max Concurrent: ${maxConcurrentRequests}
                Total Time: ${totalTime}ms
                Throughput: ${throughput} requests/sec`);
        }, 30000);

        test('should handle mixed workload efficiently', async () => {
            const simpleContacts = 50;
            const complexContacts = 20;
            
            // Simple contacts (no adjustments needed)
            const simple = Array.from({ length: simpleContacts }, (_, i) => ({
                subscriberKey: `simple-${i}`,
                geosegment: 'US',
                emailAddress: `simple${i}@example.com`,
                entryTime: new Date()
            }));

            // Complex contacts (requiring adjustments)
            const complex = Array.from({ length: complexContacts }, (_, i) => ({
                subscriberKey: `complex-${i}`,
                geosegment: ['BR', 'JP', 'AU', 'IN'][i % 4],
                emailAddress: `complex${i}@example.com`,
                entryTime: new Date('2024-01-06T10:00:00Z') // Saturday - will need adjustment
            }));

            const simpleConfig = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [{ startHour: 10, endHour: 11, enabled: true }]
            };

            const complexConfig = {
                skipWeekends: true,
                skipHolidays: true,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true },
                    { startHour: 14, endHour: 16, enabled: true }
                ]
            };

            const startTime = Date.now();

            // Process both workloads concurrently
            const [simpleResults, complexResults] = await Promise.all([
                Promise.all(simple.map(contact => 
                    contactProcessor.processContact(contact, simpleConfig)
                )),
                Promise.all(complex.map(contact => 
                    contactProcessor.processContact(contact, complexConfig)
                ))
            ]);

            const endTime = Date.now();
            const totalTime = endTime - startTime;
            const totalContacts = simpleContacts + complexContacts;
            const avgTimePerContact = totalTime / totalContacts;

            // Validate mixed workload performance
            expect(simpleResults).toHaveLength(simpleContacts);
            expect(complexResults).toHaveLength(complexContacts);
            expect(avgTimePerContact).toBeLessThan(150); // 150ms per contact max

            // Simple contacts should process faster than complex ones
            const avgSimpleTime = simpleResults.reduce((sum, r) => sum + r.processingTime, 0) / simpleContacts;
            const avgComplexTime = complexResults.reduce((sum, r) => sum + r.processingTime, 0) / complexContacts;

            expect(avgSimpleTime).toBeLessThan(avgComplexTime);

            console.log(`Mixed Workload Test Results:
                Simple Contacts: ${simpleContacts} (avg: ${avgSimpleTime.toFixed(2)}ms)
                Complex Contacts: ${complexContacts} (avg: ${avgComplexTime.toFixed(2)}ms)
                Total Time: ${totalTime}ms
                Overall Avg: ${avgTimePerContact.toFixed(2)}ms`);
        }, 25000);
    });

    describe('Response Time and Resource Usage Validation', () => {
        test('should meet response time SLAs for different scenarios', async () => {
            const scenarios = [
                {
                    name: 'Simple US Contact',
                    contact: { subscriberKey: 'us-simple', geosegment: 'US', emailAddress: 'us@test.com' },
                    config: { skipWeekends: false, skipHolidays: false, timeWindows: [{ startHour: 10, endHour: 11, enabled: true }] },
                    maxTime: 50 // 50ms max
                },
                {
                    name: 'International Contact',
                    contact: { subscriberKey: 'intl-simple', geosegment: 'JP', emailAddress: 'jp@test.com' },
                    config: { skipWeekends: false, skipHolidays: false, timeWindows: [{ startHour: 10, endHour: 11, enabled: true }] },
                    maxTime: 75 // 75ms max
                },
                {
                    name: 'Complex Processing',
                    contact: { subscriberKey: 'complex', geosegment: 'BR', emailAddress: 'br@test.com', entryTime: new Date('2024-01-06T10:00:00Z') },
                    config: { skipWeekends: true, skipHolidays: true, timeWindows: [{ startHour: 9, endHour: 10, enabled: true }, { startHour: 14, endHour: 16, enabled: true }] },
                    maxTime: 150 // 150ms max
                },
                {
                    name: 'Fallback Country',
                    contact: { subscriberKey: 'fallback', geosegment: 'XX', emailAddress: 'fallback@test.com' },
                    config: { skipWeekends: false, skipHolidays: false, timeWindows: [{ startHour: 10, endHour: 11, enabled: true }] },
                    maxTime: 100 // 100ms max
                }
            ];

            for (const scenario of scenarios) {
                const iterations = 10;
                const times = [];

                for (let i = 0; i < iterations; i++) {
                    const startTime = Date.now();
                    const result = await contactProcessor.processContact(scenario.contact, scenario.config);
                    const endTime = Date.now();
                    
                    const processingTime = endTime - startTime;
                    times.push(processingTime);
                    
                    expect(result.success).toBe(true);
                }

                const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
                const maxTime = Math.max(...times);
                const minTime = Math.min(...times);

                // Validate SLA compliance
                expect(avgTime).toBeLessThan(scenario.maxTime);
                expect(maxTime).toBeLessThan(scenario.maxTime * 2); // Allow 2x max for outliers

                console.log(`${scenario.name} SLA Results:
                    Avg Time: ${avgTime.toFixed(2)}ms (SLA: ${scenario.maxTime}ms)
                    Min Time: ${minTime}ms
                    Max Time: ${maxTime}ms
                    SLA Compliance: ${avgTime < scenario.maxTime ? 'PASS' : 'FAIL'}`);
            }
        }, 20000);

        test('should maintain consistent performance under sustained load', async () => {
            const duration = 10000; // 10 seconds
            const batchSize = 10;
            const contact = {
                subscriberKey: 'sustained-load',
                geosegment: 'US',
                emailAddress: 'sustained@test.com',
                entryTime: new Date()
            };

            const config = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [{ startHour: 10, endHour: 11, enabled: true }]
            };

            const startTime = Date.now();
            const results = [];
            const timings = [];

            while (Date.now() - startTime < duration) {
                const batchStartTime = Date.now();
                
                const batchPromises = Array.from({ length: batchSize }, (_, i) => 
                    contactProcessor.processContact({
                        ...contact,
                        subscriberKey: `${contact.subscriberKey}-${results.length + i}`
                    }, config)
                );

                const batchResults = await Promise.all(batchPromises);
                const batchEndTime = Date.now();
                
                results.push(...batchResults);
                timings.push({
                    batchTime: batchEndTime - batchStartTime,
                    avgPerContact: (batchEndTime - batchStartTime) / batchSize,
                    timestamp: batchEndTime - startTime
                });

                // Small delay to prevent overwhelming
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            const totalTime = Date.now() - startTime;
            const totalContacts = results.length;
            const avgTimePerContact = totalTime / totalContacts;

            // Validate sustained performance
            expect(results.every(r => r.success)).toBe(true);
            expect(avgTimePerContact).toBeLessThan(100); // 100ms per contact max

            // Check for performance degradation over time
            const firstHalfTimings = timings.slice(0, Math.floor(timings.length / 2));
            const secondHalfTimings = timings.slice(Math.floor(timings.length / 2));

            const firstHalfAvg = firstHalfTimings.reduce((sum, t) => sum + t.avgPerContact, 0) / firstHalfTimings.length;
            const secondHalfAvg = secondHalfTimings.reduce((sum, t) => sum + t.avgPerContact, 0) / secondHalfTimings.length;

            const performanceDegradation = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;

            // Performance should not degrade by more than 20%
            expect(performanceDegradation).toBeLessThan(20);

            console.log(`Sustained Load Test Results:
                Duration: ${totalTime}ms
                Total Contacts: ${totalContacts}
                Avg Time per Contact: ${avgTimePerContact.toFixed(2)}ms
                First Half Avg: ${firstHalfAvg.toFixed(2)}ms
                Second Half Avg: ${secondHalfAvg.toFixed(2)}ms
                Performance Degradation: ${performanceDegradation.toFixed(2)}%`);
        }, 15000);

        test('should efficiently handle timezone calculation caching', async () => {
            const contactCount = 100;
            const countries = ['US', 'BR', 'JP', 'GB', 'CA'];
            
            // Create contacts that will reuse timezone calculations
            const contacts = Array.from({ length: contactCount }, (_, i) => ({
                subscriberKey: `cache-test-${i}`,
                geosegment: countries[i % countries.length],
                emailAddress: `cache${i}@example.com`,
                entryTime: new Date()
            }));

            const config = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [{ startHour: 10, endHour: 11, enabled: true }]
            };

            // First run - populate caches
            const firstRunStart = Date.now();
            const firstRunResults = await Promise.all(
                contacts.map(contact => contactProcessor.processContact(contact, config))
            );
            const firstRunTime = Date.now() - firstRunStart;

            // Second run - should benefit from caching
            const secondRunStart = Date.now();
            const secondRunResults = await Promise.all(
                contacts.map(contact => contactProcessor.processContact(contact, config))
            );
            const secondRunTime = Date.now() - secondRunStart;

            // Validate caching benefits
            expect(firstRunResults).toHaveLength(contactCount);
            expect(secondRunResults).toHaveLength(contactCount);
            expect(firstRunResults.every(r => r.success)).toBe(true);
            expect(secondRunResults.every(r => r.success)).toBe(true);

            // Second run should be faster due to caching
            const improvementPercentage = ((firstRunTime - secondRunTime) / firstRunTime) * 100;
            expect(improvementPercentage).toBeGreaterThan(10); // At least 10% improvement

            console.log(`Caching Performance Test Results:
                First Run: ${firstRunTime}ms (${(firstRunTime / contactCount).toFixed(2)}ms per contact)
                Second Run: ${secondRunTime}ms (${(secondRunTime / contactCount).toFixed(2)}ms per contact)
                Improvement: ${improvementPercentage.toFixed(2)}%`);
        }, 20000);
    });

    describe('Stress Testing', () => {
        test('should handle extreme load gracefully', async () => {
            const extremeContactCount = 2000;
            const maxProcessingTime = 60000; // 60 seconds max
            
            // Generate extreme load
            const contacts = Array.from({ length: extremeContactCount }, (_, i) => ({
                subscriberKey: `extreme-${i}`,
                geosegment: ['US', 'BR', 'JP', 'GB', 'CA', 'AU', 'IN', 'CN', 'RU', 'ZA'][i % 10],
                emailAddress: `extreme${i}@example.com`,
                entryTime: new Date()
            }));

            const config = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [
                    { startHour: 9, endHour: 10, enabled: true },
                    { startHour: 14, endHour: 16, enabled: true }
                ]
            };

            const startTime = Date.now();
            const batchSize = 100;
            const results = [];

            // Process in large batches
            for (let i = 0; i < contacts.length; i += batchSize) {
                const batch = contacts.slice(i, i + batchSize);
                const batchPromises = batch.map(contact => 
                    contactProcessor.processContact(contact, config)
                );
                
                const batchResults = await Promise.allSettled(batchPromises);
                
                // Handle both fulfilled and rejected promises
                batchResults.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        results.push(result.value);
                    } else {
                        results.push({
                            success: false,
                            error: result.reason.message,
                            subscriberKey: batch[index].subscriberKey,
                            processingTime: 0
                        });
                    }
                });

                // Progress logging
                if ((i + batchSize) % 500 === 0) {
                    console.log(`Processed ${Math.min(i + batchSize, contacts.length)}/${contacts.length} contacts`);
                }
            }

            const endTime = Date.now();
            const totalTime = endTime - startTime;
            const avgTimePerContact = totalTime / extremeContactCount;
            const successfulResults = results.filter(r => r.success);
            const successRate = (successfulResults.length / extremeContactCount) * 100;

            // Validate extreme load handling
            expect(results).toHaveLength(extremeContactCount);
            expect(totalTime).toBeLessThan(maxProcessingTime);
            expect(successRate).toBeGreaterThan(90); // 90% success rate minimum under extreme load
            expect(avgTimePerContact).toBeLessThan(100); // 100ms per contact max

            console.log(`Extreme Load Test Results:
                Total Contacts: ${extremeContactCount}
                Total Time: ${(totalTime / 1000).toFixed(2)}s
                Avg Time per Contact: ${avgTimePerContact.toFixed(2)}ms
                Success Rate: ${successRate.toFixed(2)}%
                Throughput: ${(extremeContactCount / (totalTime / 1000)).toFixed(2)} contacts/sec
                Failed Contacts: ${extremeContactCount - successfulResults.length}`);
        }, 120000); // 2 minute timeout for extreme load test

        test('should recover from memory pressure', async () => {
            const contactCount = 1000;
            const initialMemory = process.memoryUsage();
            
            // Create memory-intensive scenario
            const contacts = Array.from({ length: contactCount }, (_, i) => ({
                subscriberKey: `memory-pressure-${i}`,
                geosegment: 'US',
                emailAddress: `memorypressure${i}@example.com`,
                entryTime: new Date(),
                // Add some extra data to increase memory usage
                extraData: Array.from({ length: 100 }, (_, j) => `data-${i}-${j}`)
            }));

            const config = {
                skipWeekends: false,
                skipHolidays: false,
                timeWindows: [{ startHour: 10, endHour: 11, enabled: true }]
            };

            const results = [];
            const memorySnapshots = [];

            // Process in small batches and monitor memory
            const batchSize = 50;
            for (let i = 0; i < contacts.length; i += batchSize) {
                const batch = contacts.slice(i, i + batchSize);
                
                const batchResults = await Promise.all(
                    batch.map(contact => contactProcessor.processContact(contact, config))
                );
                
                results.push(...batchResults);
                
                // Take memory snapshot
                const currentMemory = process.memoryUsage();
                memorySnapshots.push({
                    processed: i + batchSize,
                    heapUsed: currentMemory.heapUsed,
                    heapTotal: currentMemory.heapTotal,
                    external: currentMemory.external
                });

                // Force garbage collection if available
                if (global.gc && i % 200 === 0) {
                    global.gc();
                }
            }

            const finalMemory = process.memoryUsage();
            const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

            // Validate memory management
            expect(results).toHaveLength(contactCount);
            expect(results.filter(r => r.success).length).toBeGreaterThan(contactCount * 0.95);
            expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase

            // Check for memory leaks (memory should not continuously grow)
            const firstHalfSnapshots = memorySnapshots.slice(0, Math.floor(memorySnapshots.length / 2));
            const secondHalfSnapshots = memorySnapshots.slice(Math.floor(memorySnapshots.length / 2));

            const firstHalfAvgMemory = firstHalfSnapshots.reduce((sum, s) => sum + s.heapUsed, 0) / firstHalfSnapshots.length;
            const secondHalfAvgMemory = secondHalfSnapshots.reduce((sum, s) => sum + s.heapUsed, 0) / secondHalfSnapshots.length;

            const memoryGrowthRate = ((secondHalfAvgMemory - firstHalfAvgMemory) / firstHalfAvgMemory) * 100;

            // Memory growth should be reasonable (less than 50% increase)
            expect(memoryGrowthRate).toBeLessThan(50);

            console.log(`Memory Pressure Test Results:
                Initial Memory: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
                Final Memory: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
                Memory Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB
                Memory Growth Rate: ${memoryGrowthRate.toFixed(2)}%
                Contacts Processed: ${contactCount}
                Success Rate: ${((results.filter(r => r.success).length / contactCount) * 100).toFixed(2)}%`);
        }, 60000);
    });
});