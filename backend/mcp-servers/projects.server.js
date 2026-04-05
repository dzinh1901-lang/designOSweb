'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Projects MCP Server
// Wraps the Projects service with a standardised MCP tool
// interface: CRUD + lifecycle management.
// ══════════════════════════════════════════════════════════

const registry = require('../mcp/mcp.registry');
const { buildToolDescriptor, SCHEMA_TYPES } = require('../mcp/mcp.schemas');
const projectService = require('../services/projects/projects.service');

function register() {
  // ── list_projects ──────────────────────────────────────
  registry.registerTool(
    buildToolDescriptor({
      id:          'projects.list',
      name:        'List Projects',
      description: 'List all projects for the authenticated user',
      version:     '1.0.0',
      category:    'projects',
      inputSchema: {
        properties: {
          page:  { type: SCHEMA_TYPES.NUMBER, minimum: 1 },
          limit: { type: SCHEMA_TYPES.NUMBER, minimum: 1, maximum: 100 },
          sort:  { type: SCHEMA_TYPES.STRING },
        },
        required: [],
      },
      outputSchema: {
        properties: {
          projects: { type: SCHEMA_TYPES.ARRAY },
          total:    { type: SCHEMA_TYPES.NUMBER },
          page:     { type: SCHEMA_TYPES.NUMBER },
        },
        required: ['projects'],
      },
    }),
    async (input, context) => {
      return projectService.listProjects({
        userId: context.userId,
        page:   input.page  || 1,
        limit:  input.limit || 20,
        sort:   input.sort  || '-createdAt',
      });
    }
  );

  // ── create_project ─────────────────────────────────────
  registry.registerTool(
    buildToolDescriptor({
      id:          'projects.create',
      name:        'Create Project',
      description: 'Create a new project for the authenticated user',
      version:     '1.0.0',
      category:    'projects',
      inputSchema: {
        properties: {
          name:        { type: SCHEMA_TYPES.STRING, minLength: 1, maxLength: 120 },
          industry:    { type: SCHEMA_TYPES.STRING, maxLength: 80 },
          description: { type: SCHEMA_TYPES.STRING, maxLength: 1000 },
        },
        required: ['name'],
      },
      outputSchema: {
        properties: {
          project: { type: SCHEMA_TYPES.OBJECT },
        },
        required: ['project'],
      },
    }),
    async (input, context) => {
      return projectService.createProject({
        userId:      context.userId,
        name:        input.name,
        industry:    input.industry,
        description: input.description,
      });
    }
  );

  // ── get_project ────────────────────────────────────────
  registry.registerTool(
    buildToolDescriptor({
      id:          'projects.get',
      name:        'Get Project',
      description: 'Get a single project by ID',
      version:     '1.0.0',
      category:    'projects',
      inputSchema: {
        properties: {
          projectId: { type: SCHEMA_TYPES.STRING },
        },
        required: ['projectId'],
      },
      outputSchema: {
        properties: {
          project: { type: SCHEMA_TYPES.OBJECT },
        },
        required: ['project'],
      },
    }),
    async (input, context) => {
      return projectService.getProject({ projectId: input.projectId, userId: context.userId });
    }
  );

  // ── delete_project ─────────────────────────────────────
  registry.registerTool(
    buildToolDescriptor({
      id:               'projects.delete',
      name:             'Delete Project',
      description:      'Permanently delete a project and all associated jobs',
      version:          '1.0.0',
      category:         'projects',
      requiresApproval: true,
      inputSchema: {
        properties: {
          projectId: { type: SCHEMA_TYPES.STRING },
        },
        required: ['projectId'],
      },
      outputSchema: { properties: {}, required: [] },
    }),
    async (input, context) => {
      await projectService.deleteProject({ projectId: input.projectId, userId: context.userId });
      return { deleted: true, projectId: input.projectId };
    }
  );

  // ── list_jobs ──────────────────────────────────────────
  registry.registerTool(
    buildToolDescriptor({
      id:          'projects.list_jobs',
      name:        'List Project Jobs',
      description: 'List generation jobs belonging to a project',
      version:     '1.0.0',
      category:    'projects',
      inputSchema: {
        properties: {
          projectId: { type: SCHEMA_TYPES.STRING },
          page:      { type: SCHEMA_TYPES.NUMBER, minimum: 1 },
          limit:     { type: SCHEMA_TYPES.NUMBER, minimum: 1, maximum: 100 },
        },
        required: ['projectId'],
      },
      outputSchema: {
        properties: {
          jobs:  { type: SCHEMA_TYPES.ARRAY },
          total: { type: SCHEMA_TYPES.NUMBER },
        },
        required: ['jobs'],
      },
    }),
    async (input, context) => {
      return projectService.listJobs({
        projectId: input.projectId,
        userId:    context.userId,
        page:      input.page  || 1,
        limit:     input.limit || 20,
      });
    }
  );
}

module.exports = { register };
