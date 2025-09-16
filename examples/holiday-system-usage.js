/**
 * Holiday System Usage Example
 * Demonstrates how to use the holiday checking system components together
 */

const HolidayChecker = require('../src/holiday-checker');

async function demonstrateHolidaySystem() {
    console.log('=== Holiday System Demonstration ===\n');

    // Create holiday checker with custom configuration
    const holidayChecker = new HolidayChecker({
        enabled: true,
        fallbackBehavior: 'ignore',
        maxLookAheadDays: 14,
        cache: {
            ttl: 3600, // 1 hour cache
            warmupCountries: ['US', 'CA', 'GB', 'BR']
        }
    });

    try {
        // 1. Check API availability
        console.log('1. Checking API availability...');
        const apiAvailable = await holidayChecker.isAPIAvailable();
        console.log(`   API Available: ${apiAvailable}\n`);

        // 2. Warm up cache for common countries
        console.log('2. Warming up cache...');
        const warmupResults = await holidayChecker.warmupCache(['US', 'BR'], [2024]);
        console.log(`   Warmup Results: ${warmupResults.success} success, ${warmupResults.failed} failed\n`);

        // 3. Check specific dates for holidays
        console.log('3. Checking specific dates...');
        
        const testDates = [
            { date: new Date('2024-01-01'), country: 'US', description: 'New Year\'s Day in US' },
            { date: new Date('2024-07-04'), country: 'US', description: 'Independence Day in US' },
            { date: new Date('2024-06-15'), country: 'US', description: 'Regular day in US' },
            { date: new Date('2024-09-07'), country: 'BR', description: 'Independence Day in Brazil' }
        ];

        for (const test of testDates) {
            const isHoliday = await holidayChecker.isPublicHoliday(test.date, test.country);
            console.log(`   ${test.description}: ${isHoliday ? 'HOLIDAY' : 'Regular day'}`);
        }
        console.log();

        // 4. Check business days
        console.log('4. Checking business days...');
        
        const businessDayTests = [
            { date: new Date('2024-01-01'), country: 'US', description: 'New Year\'s Day (Monday)' },
            { date: new Date('2024-01-06'), country: 'US', description: 'Saturday' },
            { date: new Date('2024-01-02'), country: 'US', description: 'Regular Tuesday' }
        ];

        for (const test of businessDayTests) {
            const isBusinessDay = await holidayChecker.isBusinessDay(test.date, test.country, true, true);
            console.log(`   ${test.description}: ${isBusinessDay ? 'BUSINESS DAY' : 'Non-business day'}`);
        }
        console.log();

        // 5. Find next business days
        console.log('5. Finding next business days...');
        
        const nextBusinessDayTests = [
            { date: new Date('2023-12-29'), country: 'US', description: 'Friday before New Year weekend' },
            { date: new Date('2024-07-03'), country: 'US', description: 'Day before Independence Day' }
        ];

        for (const test of nextBusinessDayTests) {
            const nextBusinessDay = await holidayChecker.getNextBusinessDay(test.date, test.country, true, true);
            console.log(`   Next business day after ${test.description}: ${nextBusinessDay.toDateString()}`);
        }
        console.log();

        // 6. Get all holidays for a country and year
        console.log('6. Getting all holidays for US 2024...');
        const usHolidays = await holidayChecker.getHolidays('US', 2024);
        console.log(`   Found ${usHolidays.length} holidays:`);
        usHolidays.slice(0, 5).forEach(holiday => {
            console.log(`   - ${holiday.date}: ${holiday.name}`);
        });
        if (usHolidays.length > 5) {
            console.log(`   ... and ${usHolidays.length - 5} more`);
        }
        console.log();

        // 7. Show statistics
        console.log('7. System statistics:');
        const stats = holidayChecker.getStats();
        console.log(`   API Calls: ${stats.apiCalls}`);
        console.log(`   Cache Hits: ${stats.cacheHits}`);
        console.log(`   Cache Misses: ${stats.cacheMisses}`);
        console.log(`   Cache Hit Rate: ${(stats.cache.hitRate * 100).toFixed(1)}%`);
        console.log(`   Holidays Found: ${stats.holidaysFound}`);
        console.log(`   Business Days Found: ${stats.businessDaysFound}`);
        console.log(`   Errors: ${stats.errors}`);

    } catch (error) {
        console.error('Error during demonstration:', error.message);
    }
}

// Run the demonstration if this file is executed directly
if (require.main === module) {
    demonstrateHolidaySystem()
        .then(() => {
            console.log('\n=== Demonstration Complete ===');
            process.exit(0);
        })
        .catch(error => {
            console.error('Demonstration failed:', error);
            process.exit(1);
        });
}

module.exports = { demonstrateHolidaySystem };