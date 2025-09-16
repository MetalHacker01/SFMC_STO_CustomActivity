/**
 * Example usage of the Timezone Engine
 * 
 * This file demonstrates how to use the timezone calculation engine
 * in the Send Time Optimization activity.
 */

const { TimezoneEngine } = require('../src/timezone-engine');

// Initialize the timezone engine
const timezoneEngine = new TimezoneEngine(console, {
    defaultFallbackCountry: 'US',
    logValidationIssues: true,
    enableDetailedLogging: false
});

console.log('=== Timezone Engine Usage Examples ===\n');

// Example 1: Get timezone information for different countries
console.log('1. Getting timezone information:');
const countries = ['US', 'BR', 'JP', 'GB', 'AU', 'XX']; // XX is invalid for testing

countries.forEach(country => {
    const info = timezoneEngine.getTimezoneInfo(country, {
        subscriberKey: `test-${country}`,
        journey: 'example-journey'
    });
    
    console.log(`${country}: ${info.timezone.countryName} (${info.timezone.primaryTimezone})`);
    console.log(`  UTC Offset: ${info.summary.formattedOffset}`);
    console.log(`  Offset from SFMC: ${info.summary.offsetFromSFMC} hours`);
    console.log(`  Fallback used: ${info.validation.fallbackUsed}`);
    console.log('');
});

// Example 2: Convert local times to SFMC time
console.log('2. Converting local times to SFMC time:');
const localTime = new Date('2024-01-15T14:30:00Z'); // 2:30 PM UTC

countries.slice(0, 5).forEach(country => {
    const conversion = timezoneEngine.convertToSFMCTime(localTime, country);
    
    if (conversion.success) {
        console.log(`${country}: ${localTime.toISOString()} -> ${conversion.sfmcTime.toISOString()}`);
        console.log(`  Offset from SFMC: ${conversion.offsetFromSFMC} hours`);
    } else {
        console.log(`${country}: Conversion failed - ${conversion.error}`);
    }
    console.log('');
});

// Example 3: Convert SFMC time to local times
console.log('3. Converting SFMC time to local times:');
const sfmcTime = new Date('2024-01-15T12:00:00Z'); // Noon in SFMC time

countries.slice(0, 5).forEach(country => {
    const conversion = timezoneEngine.convertFromSFMCTime(sfmcTime, country);
    
    if (conversion.success) {
        console.log(`${country}: ${sfmcTime.toISOString()} -> ${conversion.localTime.toISOString()}`);
    } else {
        console.log(`${country}: Conversion failed - ${conversion.error}`);
    }
    console.log('');
});

// Example 4: Validate multiple countries at once
console.log('4. Validating multiple countries:');
const testCountries = ['US', 'BR', 'JP', 'XX', 'YY', 'GB', 'INVALID'];
const validation = timezoneEngine.validateMultipleCountries(testCountries);

console.log(`Total countries tested: ${validation.total}`);
console.log(`Valid: ${validation.valid}, Invalid: ${validation.invalid}`);
console.log('Results:');
validation.results.forEach(result => {
    console.log(`  ${result.originalCode}: ${result.validation.isValid ? 'Valid' : 'Invalid'}`);
    if (!result.validation.isValid) {
        console.log(`    Reason: ${result.validation.message}`);
        console.log(`    Fallback: ${result.validation.fallbackValue}`);
    }
});
console.log('');

// Example 5: Get comprehensive timezone summary
console.log('5. Comprehensive timezone summary for Brazil:');
const summary = timezoneEngine.getTimezoneSummary('BR');
console.log(JSON.stringify(summary, null, 2));
console.log('');

// Example 6: Engine statistics
console.log('6. Engine statistics:');
const stats = timezoneEngine.getEngineStats();
console.log(`Supported countries: ${stats.supportedCountriesCount}`);
console.log(`Validation stats:`, stats.validationStats);
console.log(`Configuration:`, stats.configuration);
console.log('');

// Example 7: Troubleshooting information
console.log('7. Troubleshooting information:');
const troubleshooting = timezoneEngine.getTroubleshootingInfo();
console.log('Common issues:');
troubleshooting.commonIssues.slice(0, 3).forEach((issue, index) => {
    console.log(`  ${index + 1}. Issue: ${issue.issue}`);
    console.log(`     Solution: ${issue.solution}`);
    console.log(`     Fallback: ${issue.fallback}`);
    console.log('');
});

console.log('=== End of Examples ===');

// Export for use in other modules
module.exports = {
    timezoneEngine,
    demonstrateUsage: () => {
        console.log('Run this file directly to see timezone engine examples');
    }
};