/**
 * Server Tests
 * Basic tests for server endpoints
 */

const request = require('supertest');
const app = require('../server');

describe('Server Endpoints', () => {
    describe('GET /health', () => {
        it('should return health status', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);
            
            expect(response.body).toHaveProperty('status', 'healthy');
            expect(response.body).toHaveProperty('service', 'Send Time Optimization Activity');
        });
    });

    describe('GET /', () => {
        it('should serve the configuration UI', async () => {
            const response = await request(app)
                .get('/')
                .expect(200);
            
            expect(response.text).toContain('Send Time Optimization Configuration');
        });
    });

    describe('POST /save', () => {
        it('should require JWT token', async () => {
            await request(app)
                .post('/save')
                .expect(401);
        });
    });

    describe('POST /validate', () => {
        it('should require JWT token', async () => {
            await request(app)
                .post('/validate')
                .expect(401);
        });
    });

    describe('POST /publish', () => {
        it('should require JWT token', async () => {
            await request(app)
                .post('/publish')
                .expect(401);
        });
    });

    describe('POST /execute', () => {
        it('should require JWT token', async () => {
            await request(app)
                .post('/execute')
                .expect(401);
        });
    });
});