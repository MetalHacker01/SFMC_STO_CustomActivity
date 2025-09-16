# Journey End-to-End Testing Documentation

## Task 12.2: Create end-to-end journey testing

This document describes the comprehensive end-to-end journey testing implementation for the Send Time Optimization (STO) Custom Journey Activity.

## Overview

The end-to-end journey testing validates the complete workflow from contact entry through email send, ensuring that the STO activity works seamlessly with the Wait By Attribute activity in SFMC Journey Builder.

## Test Files

### 1. `journey-complete-workflow.test.js`
**Primary implementation for Task 12.2**

This file contains focused, reliable tests that validate the complete journey workflow:

#### Test Scenarios Covered:

1. **Complete Full Journey Workflow**
   - Tests contacts from different countries (US, BR, JP)
   - Validates all journey steps: Entry → STO Processing → Wait By Attribute → Email Send
   - Ensures 100% success rate through the complete workflow
   - Validates timezone-specific processing for each country

2. **Multi-Country Journey with Different Timezone Scenarios**
   - Tests 5 different countries (US, BR, JP, GB, AU)
   - Validates that each country is processed correctly
   - Ensures all contacts complete the journey successfully
   - Tests global campaign scenarios

3. **Journey with Weekend and Holiday Exclusions**
   - Tests STO configuration with exclusion settings
   - Validates that exclusion logic is applied
   - Ensures journey continues successfully even with exclusions

4. **Journey with Error Scenarios and Graceful Degradation**
   - Tests invalid country codes (graceful fallback)
   - Validates that journey continues with fallback behavior
   - Ensures error handling doesn't break the workflow

5. **Journey Performance with Multiple Contacts**
   - Tests 10 contacts simultaneously
   - Validates performance metrics (under 10 seconds total, under 1 second per contact)
   - Ensures scalability of the solution

### 2. `journey-end-to-end.test.js`
**Extended comprehensive testing**

This file contains more detailed and complex scenarios:

- Advanced timezone combinations
- Complex holiday scenarios
- Cascading date adjustments
- Real-time processing
- Edge case time windows
- Journey monitoring and analytics
- Data integrity validation
- Performance testing with larger volumes

## Journey Workflow Validation

### Step 1: Journey Entry
- Contacts enter the journey through the entry endpoint
- Validates contact count and journey ID assignment
- Ensures proper contact data structure

### Step 2: STO Activity Processing
- Each contact is processed through the STO activity
- Timezone calculations are performed based on geosegment
- Time window adjustments are applied
- Weekend/holiday exclusions are processed
- ConvertedTime is calculated and stored in data extension

### Step 3: Wait By Attribute Activity
- Contacts are processed by the Wait By Attribute activity
- ConvertedTime field is used as the wait attribute
- Contacts enter waiting state until their optimal send time
- Wait configuration is validated

### Step 4: Email Send
- Contacts proceed to email send after wait time
- Email delivery is simulated and validated
- Success rates and delivery status are tracked

### Step 5: End-to-End Validation
- Complete workflow metrics are calculated
- Success rates are validated (expecting 100%)
- Performance metrics are tracked
- Data integrity is verified throughout the process

## Key Validations

### Timezone Processing
- Validates that different countries receive different timezone adjustments
- Ensures ConvertedTime is calculated correctly for each timezone
- Tests fallback behavior for invalid country codes

### Wait By Attribute Integration
- Validates ConvertedTime format compatibility
- Ensures proper wait configuration
- Tests that contacts wait until their calculated send times

### Error Handling
- Tests graceful degradation with invalid data
- Validates fallback behavior maintains journey flow
- Ensures errors don't prevent email delivery

### Performance
- Validates processing times meet SFMC requirements
- Tests concurrent contact processing
- Ensures scalability for production volumes

## Mock Infrastructure

### Journey Builder Simulation
The tests use Express.js to simulate SFMC Journey Builder endpoints:

- `/journey/entry` - Journey entry point
- `/journey/sto-activity` - STO activity processing
- `/journey/wait-by-attribute` - Wait By Attribute activity
- `/journey/send-email` - Email send activity

### Data Extension Simulation
- Mocks SFMC data extension API calls
- Simulates ConvertedTime field updates
- Tests retry logic and error handling

### Holiday API Simulation
- Mocks holiday checking API responses
- Tests holiday exclusion logic
- Validates fallback behavior when API is unavailable

## Test Results

All tests validate the following requirements:

✅ **Build test journeys with STO activity followed by Wait By Attribute**
- Complete journey workflows are tested from entry to email send
- STO activity is properly integrated with Wait By Attribute activity

✅ **Test with contacts from different countries and timezones**
- Tests include contacts from US, BR, JP, GB, AU
- Timezone-specific processing is validated for each country
- Fallback behavior is tested for invalid country codes

✅ **Validate complete workflow from entry to email send**
- End-to-end validation ensures 100% success rates
- All journey steps are tested and validated
- Performance metrics confirm scalability

## Usage

Run the complete workflow tests:
```bash
npx jest tests/journey-complete-workflow.test.js --setupFilesAfterEnv=./tests/setup.js
```

Run all journey tests:
```bash
npx jest tests/journey-*.test.js --setupFilesAfterEnv=./tests/setup.js
```

## Conclusion

The end-to-end journey testing implementation successfully validates that the STO Custom Journey Activity works correctly in complete SFMC journey workflows. The tests ensure reliable operation across different countries, timezones, and error scenarios while maintaining the performance requirements for production use.