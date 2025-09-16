#!/usr/bin/env node

/**
 * Local Testing Script for STO Custom Journey Activity
 * This script tests the main functionality locally
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3002';

async function testHealthCheck() {
    console.log('🏥 Testing Health Check...');
    try {
        const response = await axios.get(`${BASE_URL}/health`, {
            timeout: 5000,
            headers: {
                'User-Agent': 'STO-Local-Test/1.0'
            }
        });
        console.log('✅ Health Check:', response.data);
        return true;
    } catch (error) {
        console.error('❌ Health Check Failed:', error.response?.status || error.code || error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
        return false;
    }
}

async function testContactProcessing() {
    console.log('\n👤 Testing Contact Processing...');
    
    const testContacts = [
        {
            name: 'US Contact',
            contact: {
                subscriberKey: 'test-us-001',
                emailAddress: 'test-us@example.com',
                geosegment: 'US'
            }
        },
        {
            name: 'Brazil Contact',
            contact: {
                subscriberKey: 'test-br-001',
                emailAddress: 'test-br@example.com',
                geosegment: 'BR'
            }
        },
        {
            name: 'Japan Contact',
            contact: {
                subscriberKey: 'test-jp-001',
                emailAddress: 'test-jp@example.com',
                geosegment: 'JP'
            }
        }
    ];

    const config = {
        skipWeekends: true,
        skipHolidays: false,
        timeWindows: [
            { startHour: 9, endHour: 10, enabled: true },
            { startHour: 14, endHour: 15, enabled: true }
        ]
    };

    for (const testCase of testContacts) {
        try {
            console.log(`\n  Testing ${testCase.name}...`);
            const response = await axios.post(`${BASE_URL}/execute`, {
                contact: testCase.contact,
                config: config
            });

            if (response.data.success) {
                console.log(`  ✅ ${testCase.name}:`, {
                    subscriberKey: response.data.subscriberKey,
                    convertedTime: response.data.convertedTime,
                    timezone: response.data.workflow?.timezone?.timezone || 'N/A'
                });
            } else {
                console.log(`  ❌ ${testCase.name} Failed:`, response.data.error);
            }
        } catch (error) {
            console.error(`  ❌ ${testCase.name} Error:`, error.response?.data || error.message);
        }
    }
}

async function testActivityConfiguration() {
    console.log('\n⚙️  Testing Activity Configuration...');
    
    const config = {
        skipWeekends: true,
        skipHolidays: true,
        timeWindows: [
            { startHour: 9, endHour: 10, enabled: true },
            { startHour: 14, endHour: 16, enabled: true }
        ]
    };

    try {
        const response = await axios.post(`${BASE_URL}/save`, config);
        console.log('✅ Configuration Save:', response.data);
    } catch (error) {
        console.error('❌ Configuration Save Failed:', error.response?.data || error.message);
    }
}

async function testValidation() {
    console.log('\n✅ Testing Activity Validation...');
    
    const config = {
        skipWeekends: true,
        skipHolidays: true,
        timeWindows: [
            { startHour: 9, endHour: 10, enabled: true }
        ]
    };

    try {
        const response = await axios.post(`${BASE_URL}/validate`, config);
        console.log('✅ Validation:', response.data);
    } catch (error) {
        console.error('❌ Validation Failed:', error.response?.data || error.message);
    }
}

async function runAllTests() {
    console.log('🚀 Starting Local STO Activity Tests...\n');
    
    const healthOk = await testHealthCheck();
    if (!healthOk) {
        console.log('\n❌ Server is not healthy. Please check if the server is running on port 3000.');
        process.exit(1);
    }

    await testActivityConfiguration();
    await testValidation();
    await testContactProcessing();
    
    console.log('\n🎉 Local testing completed!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Open http://localhost:3000 in your browser to see the UI');
    console.log('   2. Test the configuration interface');
    console.log('   3. Run the full test suite: npm test');
    console.log('   4. Check the monitoring dashboard (if enabled)');
}

// Run tests if this script is executed directly
if (require.main === module) {
    runAllTests().catch(error => {
        console.error('\n💥 Test execution failed:', error.message);
        process.exit(1);
    });
}

module.exports = { runAllTests };