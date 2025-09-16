/**
 * Lifecycle Module Index
 * 
 * Exports all lifecycle management components for Journey Builder integration
 */

const ActivityLifecycleManager = require('./activity-lifecycle-manager');
const LifecycleErrorHandler = require('./lifecycle-error-handler');

module.exports = {
    ActivityLifecycleManager,
    LifecycleErrorHandler
};