'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Assets MCP Server
// Wraps file upload, retrieval, and artifact management
// with a standardised MCP tool interface.
// ══════════════════════════════════════════════════════════

const registry = require('../mcp/mcp.registry');
const { buildToolDescriptor, SCHEMA_TYPES } = require('../mcp/mcp.schemas');
const storageService = require('../services/storage/storage.service');

function register() {
  // ── get_signed_url ─────────────────────────────────────
  registry.registerTool(
    buildToolDescriptor({
      id:          'assets.get_signed_url',
      name:        'Get Asset Signed URL',
      description: 'Get a signed download URL for a stored asset by its storage key',
      version:     '1.0.0',
      category:    'assets',
      inputSchema: {
        properties: {
          key:       { type: SCHEMA_TYPES.STRING },
          expiresIn: { type: SCHEMA_TYPES.NUMBER, minimum: 60, maximum: 86400 },
        },
        required: ['key'],
      },
      outputSchema: {
        properties: {
          url:       { type: SCHEMA_TYPES.STRING },
          expiresIn: { type: SCHEMA_TYPES.NUMBER },
        },
        required: ['url'],
      },
    }),
    async (input, _context) => {
      const url = await storageService.getSignedUrl(input.key, input.expiresIn || 3600);
      return { url, expiresIn: input.expiresIn || 3600 };
    }
  );

  // ── get_upload_url ─────────────────────────────────────
  registry.registerTool(
    buildToolDescriptor({
      id:          'assets.get_upload_url',
      name:        'Get Asset Upload URL',
      description: 'Get a pre-signed upload URL for uploading a new asset',
      version:     '1.0.0',
      category:    'assets',
      inputSchema: {
        properties: {
          filename:    { type: SCHEMA_TYPES.STRING },
          contentType: { type: SCHEMA_TYPES.STRING },
        },
        required: ['filename', 'contentType'],
      },
      outputSchema: {
        properties: {
          uploadUrl: { type: SCHEMA_TYPES.STRING },
          key:       { type: SCHEMA_TYPES.STRING },
        },
        required: ['uploadUrl', 'key'],
      },
    }),
    async (input, context) => {
      const key       = storageService.buildUploadKey(context.userId, input.filename);
      const uploadUrl = await storageService.getSignedPutUrl(key, input.contentType);
      return { uploadUrl, key };
    }
  );

  // ── delete_asset ───────────────────────────────────────
  registry.registerTool(
    buildToolDescriptor({
      id:               'assets.delete',
      name:             'Delete Asset',
      description:      'Permanently delete a stored asset by its storage key',
      version:          '1.0.0',
      category:         'assets',
      requiresApproval: true,
      inputSchema: {
        properties: {
          key: { type: SCHEMA_TYPES.STRING },
        },
        required: ['key'],
      },
      outputSchema: {
        properties: {
          deleted: { type: SCHEMA_TYPES.BOOLEAN },
        },
        required: ['deleted'],
      },
    }),
    async (input, _context) => {
      await storageService.deleteObject(input.key);
      return { deleted: true, key: input.key };
    }
  );

  // ── storage_stats ──────────────────────────────────────
  registry.registerTool(
    buildToolDescriptor({
      id:          'assets.storage_stats',
      name:        'Storage Statistics',
      description: 'Get storage usage statistics for a given prefix/project',
      version:     '1.0.0',
      category:    'assets',
      inputSchema: {
        properties: {
          prefix: { type: SCHEMA_TYPES.STRING },
        },
        required: [],
      },
      outputSchema: {
        properties: {
          stats: { type: SCHEMA_TYPES.OBJECT },
        },
        required: ['stats'],
      },
    }),
    async (input, _context) => {
      const stats = await storageService.getStorageStats(input.prefix || '');
      return { stats };
    }
  );
}

module.exports = { register };
