'use strict';

const crypto = require('crypto');

function normalizePrompt(prompt) {
  const clean = String(prompt || '')
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();

  const enhancement = [
    'high detail',
    'professional lighting',
    'clean composition',
  ];

  return {
    original: prompt,
    normalized: clean,
    enhanced: `${clean}, ${enhancement.join(', ')}`,
    enhancementTags: enhancement,
  };
}

function buildDeterministicMetadata({ job, providerName, promptData, params, output, outputIndex }) {
  const stable = {
    generationJobId: job.generationJobId || job.jobId || null,
    queueJobId: job.id,
    jobType: job.type,
    provider: providerName,
    prompt: promptData,
    params,
    outputIndex,
    outputFingerprint: output.url || output.b64_json || null,
  };

  const canonical = JSON.stringify(stable);
  return {
    ...stable,
    deterministicHash: crypto.createHash('sha256').update(canonical).digest('hex'),
    generatedAt: new Date().toISOString(),
  };
}

class ImageGenerationPipeline {
  constructor({ provider, storage, repositories }) {
    this.provider = provider;
    this.storage = storage;
    this.repositories = repositories;
  }

  async run(job, onProgress = () => {}) {
    const promptData = normalizePrompt(job.prompt);
    onProgress({ status: 'processing', stage: 'prompt_normalization', progress: 0.15 });

    const moderation = await this.provider.moderate(promptData.enhanced);
    if (moderation.flagged) {
      const err = new Error('Prompt failed moderation');
      err.retryable = false;
      err.code = 'PROMPT_MODERATION_BLOCKED';
      throw err;
    }
    onProgress({ status: 'processing', stage: 'safety_moderation', progress: 0.3 });

    const structuredParams = {
      prompt: promptData.enhanced,
      model: job.options.model,
      n: job.options.n || 1,
      size: job.options.size,
      quality: job.options.quality,
      image: job.type === 'IMAGE_TO_IMAGE' ? job.input.image : undefined,
      control_image: job.input.controlImage,
      lora_weights: job.options.loraWeights,
      guidance_scale: job.options.guidanceScale,
      steps: job.options.steps,
      width: job.options.width,
      height: job.options.height,
    };

    onProgress({ status: 'processing', stage: 'provider_generation', progress: 0.55 });
    const providerResult = await this.provider.generateImage(structuredParams);

    onProgress({ status: 'processing', stage: 'output_storage', progress: 0.75 });
    const storedOutputs = await Promise.all(providerResult.outputs.map(async (output, index) => {
      let url = output.url || null;

      if (!url && output.b64_json) {
        const buffer = Buffer.from(output.b64_json, 'base64');
        const key = `generated/${job.userId}/${job.generationJobId || job.id}/${Date.now()}-${index}.png`;
        url = await this.storage.uploadBuffer(buffer, key, 'image/png', {
          generationjobid: String(job.generationJobId || ''),
          queuejobid: String(job.id),
          provider: providerResult.provider,
        });
      }

      const metadata = buildDeterministicMetadata({
        job,
        providerName: providerResult.provider,
        promptData,
        params: structuredParams,
        output,
        outputIndex: index,
      });

      const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2));
      const metadataKey = `generated/${job.userId}/${job.generationJobId || job.id}/${Date.now()}-${index}.metadata.json`;
      const metadataUrl = await this.storage.uploadBuffer(metadataBuffer, metadataKey, 'application/json', {
        generationjobid: String(job.generationJobId || ''),
        queuejobid: String(job.id),
      });

      await this.repositories.persistCharacter({
        generationJobId: job.generationJobId,
        userId: job.userId,
        projectId: job.projectId,
        imageUrl: url,
        metadata,
      });

      return {
        index,
        url,
        metadata,
        metadataUrl,
        revisedPrompt: output.revisedPrompt || null,
      };
    }));

    await this.repositories.markGenerationComplete({
      generationJobId: job.generationJobId,
      outputs: storedOutputs,
      provider: providerResult.provider,
      moderation,
    });

    onProgress({ status: 'complete', stage: 'completed', progress: 1, outputs: storedOutputs });

    return { outputs: storedOutputs, moderation, provider: providerResult.provider };
  }
}

module.exports = {
  ImageGenerationPipeline,
  normalizePrompt,
  buildDeterministicMetadata,
};
