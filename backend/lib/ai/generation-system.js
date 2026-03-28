'use strict';

const logger = require('../../shared/utils/logger');
const storageService = require('../../services/storage/storage.service');
const { OpenAIImageProvider } = require('./providers/openai-image.provider');
const { ReplicateModalProvider } = require('./providers/replicate-modal.provider');
const { ImageGenerationPipeline } = require('./pipeline/image-generation.pipeline');
const { createGenerationRepositories } = require('./pipeline/generation.repositories');
const {
  createRetryPolicy,
  DeadLetterQueue,
  GenerationJobProducer,
  GenerationWorker,
  InMemoryQueue,
  createGenerationProcessors,
  progressBus,
} = require('../queue');

function createGenerationSystem({ firestoreDb, queue, provider = 'openai' } = {}) {
  const workQueue = queue || new InMemoryQueue();
  const repositories = createGenerationRepositories({ firestoreDb, logger });

  const imageProvider = provider === 'replicate'
    ? new ReplicateModalProvider()
    : new OpenAIImageProvider();

  const textToImagePipeline = new ImageGenerationPipeline({
    provider: imageProvider,
    storage: storageService,
    repositories,
  });

  const imageToImagePipeline = new ImageGenerationPipeline({
    provider: imageProvider,
    storage: storageService,
    repositories,
  });

  const pipelineByType = createGenerationProcessors({
    textToImagePipeline,
    imageToImagePipeline,
  });

  const retryPolicy = createRetryPolicy();
  const deadLetterQueue = new DeadLetterQueue();

  const producer = new GenerationJobProducer({ queue: workQueue });
  const worker = new GenerationWorker({
    queue: workQueue,
    retryPolicy,
    deadLetterQueue,
    pipelineByType,
  });

  return {
    producer,
    worker,
    progressBus,
    deadLetterQueue,
    repositories,
    queue: workQueue,
  };
}

module.exports = { createGenerationSystem };
