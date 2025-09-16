console.log('Testing import...');

try {
    console.log('Requiring contact processor...');
    const ContactProcessor = require('./src/execution/contact-processor');
    console.log('Required successfully. Type:', typeof ContactProcessor);
    console.log('Keys:', Object.keys(ContactProcessor));
    console.log('Constructor:', ContactProcessor.constructor);
    console.log('Prototype:', ContactProcessor.prototype);
    
    if (typeof ContactProcessor === 'function') {
        console.log('Creating instance...');
        const instance = new ContactProcessor();
        console.log('Instance created:', instance);
    } else {
        console.log('Not a constructor function');
    }
} catch (error) {
    console.error('Error:', error);
}