# Activity Lifecycle Management

This document describes the enhanced activity lifecycle management implementation for the Send Time Optimization (STO) custom Journey Builder activity.

## Overview

The lifecycle management system provides comprehensive handling of Journey Builder activity operations including save, validate, and publish with proper error handling, state management, and logging as required by specifications 7.1 and 7.4.

## Components

### ActivityLifecycleManager

The main component responsible for managing the complete lifecycle of activities in Journey Builder.

**Key Features:**
- Comprehensive configuration validation
- Activity state management
- Dependency validation (SFMC API, Holiday API, Timezone Engine)
- Pre-publish readiness checks
- Caching for performance optimization
- Detailed logging and monitoring

**Methods:**
- `handleSave(payload)` - Processes save operations with validation
- `handleValidate(payload)` - Performs comprehensive validation checks
- `handlePublish(payload)` - Handles publish operations with readiness verification
- `getActivityState(activityObjectID)` - Retrieves current activity state
- `getStats()` - Returns lifecycle statistics

### LifecycleErrorHandler

Specialized error handling component for lifecycle operations with comprehensive logging and recovery mechanisms.

**Key Features:**
- Error classification and categorization
- Detailed error logging with context
- Recovery recommendations
- Error statistics tracking
- User-friendly error messages

**Error Types Handled:**
- Network errors (ECONNREFUSED, ENOTFOUND)
- Timeout errors (ETIMEDOUT)
- HTTP client/server errors (4xx/5xx)
- Validation errors
- Authentication errors
- Programming errors

## Enhanced Endpoints

### POST /save
- Validates configuration before saving
- Stores activity state with versioning
- Provides detailed error responses
- Logs all operations with timing metrics

### POST /validate
- Performs comprehensive validation (configuration, context, dependencies)
- Caches validation results for performance
- Returns detailed validation information
- Supports incremental validation

### POST /publish
- Validates configuration and dependencies
- Performs pre-publish readiness checks
- Updates activity state to published
- Executes post-publish setup tasks

### Additional Endpoints

#### GET /stats
Returns comprehensive statistics including:
- Processor statistics
- Lifecycle management statistics
- Error statistics

#### GET /activity/:activityObjectID/state
Returns current state of a specific activity including:
- Configuration details
- Status (saved/published)
- Version information
- Last operation timestamps

#### POST /lifecycle/cleanup
Performs manual cleanup of:
- Old validation cache entries
- Expired activity states
- Error statistics reset

## Error Handling Implementation

### Requirements Compliance

**Requirement 7.1**: Log detailed error information including contact ID, timestamp, and error details
- All errors are logged with comprehensive context
- Timestamps are included in all log entries
- Activity and journey IDs are tracked
- Error stack traces are preserved in development mode

**Requirement 7.4**: Retry operation according to configured retry policies
- Errors are classified as recoverable or non-recoverable
- Retry delays are provided based on error type
- Maximum retry counts are specified
- Circuit breaker patterns are implemented for high error rates

### Error Response Structure

```json
{
  "success": false,
  "error": "User-friendly error message",
  "details": "Detailed error information (development only)",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "errorType": "NETWORK_ERROR",
  "recoverable": true,
  "retryAfter": 5000,
  "maxRetries": 3
}
```

## State Management

### Activity States
- **saved**: Configuration has been saved and validated
- **published**: Activity is ready for production use

### State Information
- Activity configuration
- Version tracking
- Operation timestamps
- Validation results
- Publish readiness status

## Performance Optimizations

### Caching
- Validation results are cached to avoid repeated computations
- Holiday data is pre-warmed for common countries
- Cache size limits prevent memory leaks

### Cleanup
- Automatic periodic cleanup every hour
- Manual cleanup endpoint available
- Old cache entries are removed
- Expired activity states are purged

## Monitoring and Observability

### Logging
- Structured logging with consistent format
- Different log levels (debug, info, warn, error)
- Operation timing metrics
- Error statistics tracking

### Statistics
- Total activities managed
- Validation cache performance
- Error rates by operation type
- Processing time metrics

## Configuration

The lifecycle manager is configured through environment variables and server configuration:

```javascript
const lifecycleManager = new ActivityLifecycleManager({
    sfmc: sfmcConfig,
    holidayApiUrl: stoConfig.holidayApiUrl,
    holidayApiEnabled: stoConfig.holidayApiEnabled,
    cacheTimeout: stoConfig.cacheTimeout
}, logger);
```

## Testing

Comprehensive test coverage includes:
- Unit tests for all lifecycle operations
- Integration tests for API endpoints
- Error handling scenarios
- State management verification
- Performance and caching tests

## Usage Example

```javascript
// Save operation
const saveResult = await lifecycleManager.handleSave({
    activityObjectID: 'activity-123',
    journeyId: 'journey-456',
    inArguments: [{ activityConfig: { /* config */ } }],
    outArguments: []
});

// Validate operation
const validateResult = await lifecycleManager.handleValidate(payload);

// Publish operation
const publishResult = await lifecycleManager.handlePublish(payload);

// Get activity state
const state = lifecycleManager.getActivityState('activity-123');
```

This implementation ensures robust, scalable, and maintainable lifecycle management for the STO custom activity while meeting all specified requirements for error handling and logging.