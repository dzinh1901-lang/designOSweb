'use strict';

class OpenAIImageProvider {
  constructor({ apiKey = process.env.OPENAI_API_KEY, fetchImpl = global.fetch } = {}) {
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
    this.name = 'openai';
  }

  async moderate(input) {
    if (!this.apiKey) {
      return { flagged: false, categories: {}, source: this.name, skipped: true };
    }

    const response = await this.fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'omni-moderation-latest', input }),
    });

    if (!response.ok) {
      const message = await response.text();
      const err = new Error(`OpenAI moderation failed: ${message}`);
      err.status = response.status;
      throw err;
    }

    const payload = await response.json();
    const result = payload.results?.[0] || {};
    return {
      flagged: !!result.flagged,
      categories: result.categories || {},
      source: this.name,
      skipped: false,
    };
  }

  async generateImage(params) {
    if (!this.apiKey) {
      const err = new Error('OPENAI_API_KEY is not configured');
      err.retryable = false;
      throw err;
    }

    const requestBody = {
      model: params.model || 'gpt-image-1',
      prompt: params.prompt,
      size: params.size || '1024x1024',
      quality: params.quality || 'high',
      background: params.background || 'auto',
      output_format: params.output_format || 'png',
      n: params.n || 1,
    };

    if (params.image) requestBody.image = params.image;
    if (params.mask) requestBody.mask = params.mask;

    const response = await this.fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const message = await response.text();
      const err = new Error(`OpenAI image generation failed: ${message}`);
      err.status = response.status;
      throw err;
    }

    const payload = await response.json();
    const outputs = (payload.data || []).map((item, index) => ({
      index,
      b64_json: item.b64_json || null,
      revisedPrompt: item.revised_prompt || null,
    }));

    return { provider: this.name, outputs, raw: payload };
  }
}

module.exports = { OpenAIImageProvider };
