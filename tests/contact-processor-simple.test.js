/**
 * Simple Contact Processor Test
 * Basic test to verify the contact processor can be instantiated
 */

describe('ContactProcessor Simple Test', () => {
    test('should be able to import ContactProcessor', () => {
        const ContactProcessor = require('../src/execution/contact-processor');
        expect(typeof ContactProcessor).toBe('function');
    });

    test('should be able to create ContactProcessor instance', () => {
        const ContactProcessor = require('../src/execution/contact-processor');
        
        const mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        const processor = new ContactProcessor({
            holidayApiEnabled: false
        }, mockLogger);

        expect(processor).toBeDefined();
        expect(typeof processor.processContact).toBe('function');
        expect(typeof processor.getStats).toBe('function');
    });
});