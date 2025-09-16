# 🚀 Local Testing Guide for STO Custom Journey Activity

This guide will help you test the Send Time Optimization (STO) Custom Journey Activity locally on your development machine.

## 📋 Prerequisites

- **Node.js** (version 16 or higher)
- **npm** (comes with Node.js)
- **Git** (for version control)

## 🛠️ Quick Setup

### 1. Install Dependencies
```bash
cd send-time-optimization
npm install
```

### 2. Setup Environment Variables
```bash
# Copy the local environment template
cp .env.local .env

# The .env file is already configured for local testing
# You can modify values if needed
```

### 3. Start the Development Server
```bash
# Option 1: Start with auto-reload (recommended for development)
npm run dev

# Option 2: Start normally
npm start
```

The server will start on **http://localhost:3000**

## 🧪 Testing Options

### 1. Run All Tests
```bash
# Run the complete test suite
npm test

# Run tests with coverage report
npm test:coverage

# Run tests in watch mode (auto-rerun on changes)
npm test:watch
```

### 2. Run Specific Test Categories
```bash
# Run only journey workflow tests
npx jest tests/journey-complete-workflow.test.js --setupFilesAfterEnv=./tests/setup.js

# Run core functionality tests
npx jest tests/core-functions-unit.test.js --setupFilesAfterEnv=./tests/setup.js

# Run contact processor tests
npx jest tests/contact-processor.test.js --setupFilesAfterEnv=./tests/setup.js
```

### 3. Health Check
```bash
# Check if the server is running properly
npm run health-check

# Or manually visit: http://localhost:3000/health
```

## 🌐 Local Web Interface

Once the server is running, you can access:

### Main Activity Interface
- **URL**: http://localhost:3000
- **Description**: The main STO activity configuration interface
- **Use**: Configure time windows, exclusions, and test the UI

### API Endpoints for Testing

#### Health Check
```bash
curl http://localhost:3000/health
```

#### Activity Configuration (Save)
```bash
curl -X POST http://localhost:3000/save \
  -H "Content-Type: application/json" \
  -d '{
    "skipWeekends": true,
    "skipHolidays": true,
    "timeWindows": [
      {"startHour": 9, "endHour": 10, "enabled": true},
      {"startHour": 14, "endHour": 15, "enabled": true}
    ]
  }'
```

#### Execute Activity (Process Contact)
```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "contact": {
      "subscriberKey": "test-001",
      "emailAddress": "test@example.com",
      "geosegment": "US"
    },
    "config": {
      "skipWeekends": true,
      "skipHolidays": false,
      "timeWindows": [
        {"startHour": 10, "endHour": 11, "enabled": true}
      ]
    }
  }'
```

## 🔍 Testing Scenarios

### Scenario 1: Basic Functionality Test
1. Start the server: `npm run dev`
2. Open browser: http://localhost:3000
3. Configure time windows in the UI
4. Test with different countries using the API endpoints

### Scenario 2: Multi-Country Testing
```bash
# Test US contact
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"contact": {"subscriberKey": "us-001", "geosegment": "US"}, "config": {"timeWindows": [{"startHour": 10, "endHour": 11, "enabled": true}]}}'

# Test Brazil contact
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"contact": {"subscriberKey": "br-001", "geosegment": "BR"}, "config": {"timeWindows": [{"startHour": 10, "endHour": 11, "enabled": true}]}}'

# Test Japan contact
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"contact": {"subscriberKey": "jp-001", "geosegment": "JP"}, "config": {"timeWindows": [{"startHour": 10, "endHour": 11, "enabled": true}]}}'
```

### Scenario 3: Weekend/Holiday Exclusion Testing
```bash
# Test with weekend exclusion enabled
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "contact": {"subscriberKey": "weekend-test", "geosegment": "US"},
    "config": {
      "skipWeekends": true,
      "skipHolidays": true,
      "timeWindows": [{"startHour": 10, "endHour": 11, "enabled": true}]
    }
  }'
```

## 📊 Monitoring and Debugging

### View Logs
The application logs will show in your terminal when running `npm run dev`. Look for:
- **Contact processing logs**
- **Timezone calculation details**
- **API call results**
- **Error messages and warnings**

### Debug Mode
Set `LOG_LEVEL=debug` in your `.env` file for detailed logging.

## 🧪 Advanced Testing

### Load Testing
```bash
# Run performance tests
npx jest tests/performance-load-tests.test.js --setupFilesAfterEnv=./tests/setup.js
```

### Integration Testing
```bash
# Run integration tests (requires SFMC credentials for full testing)
npx jest tests/integration-tests.test.js --setupFilesAfterEnv=./tests/setup.js
```

### Journey Workflow Testing
```bash
# Run complete journey workflow tests
npx jest tests/journey-complete-workflow.test.js --setupFilesAfterEnv=./tests/setup.js
```

## 🐛 Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Kill process using port 3000
npx kill-port 3000

# Or use a different port
PORT=3001 npm run dev
```

#### Missing Dependencies
```bash
# Reinstall all dependencies
rm -rf node_modules package-lock.json
npm install
```

#### Environment Variables Not Loading
```bash
# Make sure .env file exists and has correct format
cat .env

# Restart the server after changing .env
```

### Debug Endpoints (Development Only)

When `ENABLE_DEBUG_ENDPOINTS=true` in your `.env`:

#### View Current Configuration
```bash
curl http://localhost:3000/debug/config
```

#### Test Timezone Calculations
```bash
curl http://localhost:3000/debug/timezone/US
curl http://localhost:3000/debug/timezone/BR
curl http://localhost:3000/debug/timezone/JP
```

#### View System Status
```bash
curl http://localhost:3000/debug/status
```

## 🚀 Next Steps

Once local testing is successful:

1. **Deploy to staging environment** using Docker
2. **Configure SFMC integration** with real credentials
3. **Test in SFMC Journey Builder** with the deployed URL
4. **Monitor performance** using the built-in monitoring tools

## 📚 Additional Resources

- **API Documentation**: Check the `/docs` endpoint when server is running
- **Test Results**: View test coverage reports in the `coverage/` directory
- **Logs**: Application logs are stored in the `logs/` directory
- **Monitoring**: Access monitoring dashboard at `/monitoring` (if enabled)

## 🔧 Development Commands

```bash
# Install dependencies
npm install

# Start development server with auto-reload
npm run dev

# Run all tests
npm test

# Run tests with coverage
npm test:coverage

# Run tests in watch mode
npm test:watch

# Check code style
npm run lint

# Fix code style issues
npm run lint:fix

# Health check
npm run health-check

# Build for production
npm run build
```

Happy testing! 🎉