'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Coordinator Planner
// Converts a natural-language goal into a structured
// execution plan with ordered/parallel steps.
// Supports LLM-driven planning (Claude / GPT) or rule-based
// fallback when no LLM key is configured.
// ══════════════════════════════════════════════════════════

const logger   = require('../shared/utils/logger');
const registry = require('../mcp/mcp.registry');

/**
 * Classify the high-level intent of a goal string.
 * Returns one of: 'project_management' | 'generation' | 'asset_management' | 'analytics' | 'unknown'
 */
function classifyIntent(goal) {
  const lower = goal.toLowerCase();

  if (/\b(creat|new|start|add|build)\b.*\b(project)\b/.test(lower))  return 'project_management';
  if (/\b(generat|render|produc|creat|make)\b.*\b(video|clip|scene|film|cinematic)\b/.test(lower)) return 'generation';
  if (/\b(generat|render|produc)\b/.test(lower)) return 'generation';
  if (/\b(upload|download|asset|file|image|artifact)\b/.test(lower)) return 'asset_management';
  if (/\b(metric|analytic|stat|report|performance|queue)\b/.test(lower)) return 'analytics';
  if (/\b(list|show|get|fetch|find)\b.*\b(project)\b/.test(lower))   return 'project_management';
  if (/\b(list|show|my)\b.*\b(project)\b/.test(lower))               return 'project_management';
  if (/\b(cancel|stop|abort)\b/.test(lower))                          return 'generation';
  if (/\b(delete|remov)\b.*\b(project|asset)\b/.test(lower))         return 'project_management';

  return 'unknown';
}

/**
 * Build a rule-based execution plan from a classified intent.
 * Returns an array of plan steps.
 */
function buildRuleBasedPlan(goal, intent) {
  const availableTools = registry.listTools();
  const toolIds = availableTools.map(t => t.id);

  switch (intent) {
    case 'project_management': {
      const lower = goal.toLowerCase();
      if (/\b(creat|new|start|add)\b/.test(lower) && toolIds.includes('projects.create')) {
        return [
          { stepId: 1, action: 'extract_params', description: 'Extract project name and industry from goal' },
          { stepId: 2, action: 'invoke_tool', toolId: 'projects.create', description: 'Create the project' },
        ];
      }
      if (/\b(list|show)\b/.test(lower) && toolIds.includes('projects.list')) {
        return [
          { stepId: 1, action: 'invoke_tool', toolId: 'projects.list', description: 'List user projects' },
        ];
      }
      if (/\b(delete|remov)\b/.test(lower) && toolIds.includes('projects.delete')) {
        return [
          { stepId: 1, action: 'invoke_tool', toolId: 'projects.list', description: 'List projects to find target' },
          { stepId: 2, action: 'invoke_tool', toolId: 'projects.delete', description: 'Delete the identified project', requiresApproval: true },
        ];
      }
      return [
        { stepId: 1, action: 'invoke_tool', toolId: 'projects.list', description: 'List user projects' },
      ];
    }

    case 'generation': {
      const lower = goal.toLowerCase();
      if (/\b(cancel|stop|abort)\b/.test(lower) && toolIds.includes('generation.cancel')) {
        return [
          { stepId: 1, action: 'invoke_tool', toolId: 'generation.status', description: 'Check current job status' },
          { stepId: 2, action: 'invoke_tool', toolId: 'generation.cancel', description: 'Cancel the job' },
        ];
      }
      if (toolIds.includes('generation.submit')) {
        return [
          { stepId: 1, action: 'extract_params', description: 'Extract prompt, mode, and project from goal' },
          { stepId: 2, action: 'invoke_tool', toolId: 'generation.submit', description: 'Submit the generation job' },
          { stepId: 3, action: 'invoke_tool', toolId: 'generation.status', description: 'Poll job status until complete or failed' },
        ];
      }
      return [];
    }

    case 'asset_management': {
      return [
        { stepId: 1, action: 'invoke_tool', toolId: 'assets.list', description: 'List available assets' },
      ];
    }

    case 'analytics': {
      return [
        { stepId: 1, action: 'invoke_tool', toolId: 'analytics.job_metrics', description: 'Fetch job metrics' },
        { stepId: 2, action: 'invoke_tool', toolId: 'analytics.queue_health', description: 'Check queue health' },
      ];
    }

    default:
      return [
        { stepId: 1, action: 'invoke_tool', toolId: 'projects.list', description: 'List projects as context' },
      ];
  }
}

/**
 * Generate an execution plan for a goal.
 *
 * @param {string} goal       - Natural language goal
 * @param {object} context    - { userId, role, sessionId, tools }
 * @returns {Promise<object>} - { intent, steps[], llmUsed }
 */
async function generatePlan(goal, context = {}) {
  const intent = classifyIntent(goal);
  logger.info('Coordinator planner: classified intent', { intent, userId: context.userId });

  // Attempt LLM-driven planning if API key is available
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey    = process.env.OPENAI_API_KEY;

  if (anthropicKey || openaiKey) {
    try {
      const steps = await _llmPlan(goal, intent, context, anthropicKey, openaiKey);
      return { intent, steps, llmUsed: true };
    } catch (err) {
      logger.warn('LLM planning failed — falling back to rule-based planner', { error: err.message });
    }
  }

  // Rule-based fallback
  const steps = buildRuleBasedPlan(goal, intent);
  return { intent, steps, llmUsed: false };
}

/**
 * LLM-driven planning (Claude preferred, GPT fallback).
 * Returns an array of plan steps.
 */
async function _llmPlan(goal, intent, context, anthropicKey, openaiKey) {
  const availableTools = registry.listTools().map(t => ({
    id:          t.id,
    name:        t.name,
    description: t.description,
    category:    t.category,
  }));

  const systemPrompt = `You are a planning agent for the DesignOS cinematic video generation platform.
Given a user goal and available tools, produce a JSON execution plan.
Respond ONLY with a JSON array of steps, each with: stepId (number), action (string), description (string), and optionally toolId (string from available tools).
Available tools: ${JSON.stringify(availableTools)}`;

  const userMessage = `User goal: "${goal}"\nClassified intent: ${intent}\nGenerate a concise execution plan.`;

  if (anthropicKey) {
    const axios = require('axios');
    const resp  = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model:      'claude-3-haiku-20240307',
        max_tokens: 512,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userMessage }],
      },
      {
        headers: {
          'x-api-key':        anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        timeout: 10000,
      }
    );
    const content = resp.data?.content?.[0]?.text || '[]';
    return JSON.parse(content);
  }

  if (openaiKey) {
    const axios = require('axios');
    const resp  = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model:      'gpt-3.5-turbo',
        max_tokens: 512,
        messages:   [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage },
        ],
      },
      {
        headers: {
          Authorization:  `Bearer ${openaiKey}`,
          'content-type': 'application/json',
        },
        timeout: 10000,
      }
    );
    const content = resp.data?.choices?.[0]?.message?.content || '[]';
    return JSON.parse(content);
  }

  throw new Error('No LLM API key configured');
}

module.exports = { generatePlan, classifyIntent, buildRuleBasedPlan };
