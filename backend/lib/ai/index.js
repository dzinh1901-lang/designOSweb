'use strict';

const { OpenAIImageProvider } = require('./providers/openai-image.provider');
const { ReplicateModalProvider } = require('./providers/replicate-modal.provider');
const { ImageGenerationPipeline } = require('./pipeline/image-generation.pipeline');
const { createGenerationRepositories } = require('./pipeline/generation.repositories');
const { createGenerationSystem } = require('./generation-system');

module.exports = {
  OpenAIImageProvider,
  ReplicateModalProvider,
  ImageGenerationPipeline,
  createGenerationRepositories,
  createGenerationSystem,
};
