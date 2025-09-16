/**
 * Debug version of Contact Processor
 */

console.log('Starting contact processor debug...');

try {
    console.log('Importing TimezoneEngine...');
    const { TimezoneEngine } = require('../timezone-engine');
    console.log('TimezoneEngine imported successfully');

    console.log('Importing HolidayChecker...');
    const HolidayChecker = require('../holiday-checker');
    console.log('HolidayChecker imported successfully');

    console.log('Importing TimeWindowProcessor...');
    const { TimeWindowProcessor } = require('../timewindow');
    console.log('TimeWindowProcessor imported successfully');

    console.log('Importing createDataExtensionSuite...');
    const { createDataExtensionSuite } = require('../dataextension');
    console.log('createDataExtensionSuite imported successfully');

    console.log('Creating ContactProcessor class...');
    class ContactProcessor {
        constructor(config = {}, logger = console) {
            console.log('ContactProcessor constructor called');
            this.logger = logger;
            this.config = config;
        }

        async processContact(contact, activityConfig, context = {}) {
            return {
                success: true,
                subscriberKey: contact.subscriberKey,
                message: 'Debug version'
            };
        }

        getStats() {
            return { debug: true };
        }
    }

    console.log('Exporting ContactProcessor...');
    module.exports = ContactProcessor;
    console.log('ContactProcessor exported successfully');

} catch (error) {
    console.error('Error in contact processor debug:', error);
    module.exports = {};
}