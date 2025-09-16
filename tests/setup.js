/**
 * Test Setup Configuration
 * Common setup for all tests
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Mock environment variables for testing
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.APP_EXTENSION_KEY = 'test-app-key';
process.env.SFMC_CLIENT_ID = 'test-client-id';
process.env.SFMC_CLIENT_SECRET = 'test-client-secret';
process.env.SFMC_SUBDOMAIN = 'test-subdomain';
process.env.SFMC_ACCOUNT_ID = 'test-account-id';
process.env.STO_DEFAULT_TIMEZONE = 'America/Chicago';
process.env.STO_HOLIDAY_API_ENABLED = 'false'; // Disable for tests

module.exports = {};