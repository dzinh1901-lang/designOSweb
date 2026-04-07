'use strict';

class ReplicateModalProvider {
  constructor({
    apiToken = process.env.REPLICATE_API_TOKEN,
    endpoint = process.env.REPLICATE_ENDPOINT || 'https://api.replicate.com/v1/predictions',
    version = process.env.REPLICATE_MODEL_VERSION,
    fetchImpl = global.fetch,
  } = {}) {
    this.apiToken = apiToken;
    this.endpoint = endpoint;
    this.version = version;
    this.fetch = fetchImpl;
    this.name = 'replicate';
  }

  async moderate() {
    return { flagged: false, categories: {}, source: this.name, skipped: true };
  }

  async generateImage(params) {
    if (!this.apiToken || !this.version) {
      const err = new Error('Replicate adapter disabled: REPLICATE_API_TOKEN or REPLICATE_MODEL_VERSION missing');
      err.retryable = false;
      throw err;
    }

    const input = {
      prompt: params.prompt,
      negative_prompt: params.negative_prompt || '',
      width: params.width || 1024,
      height: params.height || 1024,
      num_outputs: params.n || 1,
      scheduler: params.scheduler || 'K_EULER',
      guidance_scale: params.guidance_scale || 7,
      num_inference_steps: params.steps || 28,
      control_image: params.control_image || null,
      lora_weights: params.lora_weights || null,
    };

    const response = await this.fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Token ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ version: this.version, input }),
    });

    if (!response.ok) {
      const message = await response.text();
      const err = new Error(`Replicate request failed: ${message}`);
      err.status = response.status;
      throw err;
    }

    const prediction = await response.json();
    const outputs = (prediction.output || []).map((url, index) => ({
      index,
      url,
      revisedPrompt: null,
    }));

    return { provider: this.name, outputs, raw: prediction };
  }
}

module.exports = { ReplicateModalProvider };
