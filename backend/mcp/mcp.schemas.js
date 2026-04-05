'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · MCP Type Schemas
// Standardised input/output contracts for MCP tools
// ══════════════════════════════════════════════════════════

/**
 * MCP Protocol version
 */
const MCP_VERSION = '1.0';

/**
 * Tool status values
 */
const TOOL_STATUS = Object.freeze({
  SUCCESS: 'success',
  ERROR:   'error',
  PENDING: 'pending',
});

/**
 * Schema primitive types
 */
const SCHEMA_TYPES = Object.freeze({
  STRING:  'string',
  NUMBER:  'number',
  BOOLEAN: 'boolean',
  OBJECT:  'object',
  ARRAY:   'array',
});

/**
 * Validate an input object against a JSON Schema-style descriptor.
 * Returns { valid: boolean, errors: string[] }
 */
function validateSchema(schema, data) {
  const errors = [];

  if (!schema || !schema.properties) {
    return { valid: true, errors: [] };
  }

  const required = schema.required || [];

  for (const field of required) {
    if (data[field] === undefined || data[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  for (const [key, def] of Object.entries(schema.properties || {})) {
    const value = data[key];
    if (value === undefined) continue;

    if (def.type === SCHEMA_TYPES.STRING && typeof value !== 'string') {
      errors.push(`Field '${key}' must be a string`);
    } else if (def.type === SCHEMA_TYPES.NUMBER && typeof value !== 'number') {
      errors.push(`Field '${key}' must be a number`);
    } else if (def.type === SCHEMA_TYPES.BOOLEAN && typeof value !== 'boolean') {
      errors.push(`Field '${key}' must be a boolean`);
    } else if (def.type === SCHEMA_TYPES.ARRAY && !Array.isArray(value)) {
      errors.push(`Field '${key}' must be an array`);
    } else if (def.type === SCHEMA_TYPES.OBJECT && (typeof value !== 'object' || Array.isArray(value))) {
      errors.push(`Field '${key}' must be an object`);
    }

    if (def.type === SCHEMA_TYPES.STRING && typeof value === 'string') {
      if (def.minLength !== undefined && value.length < def.minLength) {
        errors.push(`Field '${key}' must be at least ${def.minLength} characters`);
      }
      if (def.maxLength !== undefined && value.length > def.maxLength) {
        errors.push(`Field '${key}' must be at most ${def.maxLength} characters`);
      }
      if (def.enum && !def.enum.includes(value)) {
        errors.push(`Field '${key}' must be one of: ${def.enum.join(', ')}`);
      }
    }

    if (def.type === SCHEMA_TYPES.NUMBER && typeof value === 'number') {
      if (def.minimum !== undefined && value < def.minimum) {
        errors.push(`Field '${key}' must be >= ${def.minimum}`);
      }
      if (def.maximum !== undefined && value > def.maximum) {
        errors.push(`Field '${key}' must be <= ${def.maximum}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Build a standardised MCP tool result envelope.
 */
function buildResult(status, data, meta = {}) {
  return {
    status,
    data:  status !== TOOL_STATUS.ERROR ? (data || null) : null,
    meta:  { version: MCP_VERSION, timestamp: new Date().toISOString(), ...meta },
    error: status === TOOL_STATUS.ERROR ? (typeof data === 'string' ? data : (data?.message || 'Unknown error')) : null,
  };
}

/**
 * Build a standardised MCP tool descriptor.
 */
function buildToolDescriptor({
  id, name, description, version, category,
  inputSchema, outputSchema, requiresApproval = false,
}) {
  return {
    id,
    name,
    description,
    version:          version || '1.0.0',
    category:         category || 'general',
    inputSchema:      inputSchema  || { properties: {}, required: [] },
    outputSchema:     outputSchema || { properties: {}, required: [] },
    requiresApproval: Boolean(requiresApproval),
  };
}

module.exports = {
  MCP_VERSION,
  TOOL_STATUS,
  SCHEMA_TYPES,
  validateSchema,
  buildResult,
  buildToolDescriptor,
};
