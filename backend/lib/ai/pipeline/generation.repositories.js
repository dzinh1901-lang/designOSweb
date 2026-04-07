'use strict';

const { v4: uuidv4 } = require('uuid');

function createGenerationRepositories({ firestoreDb, logger }) {
  if (!firestoreDb) {
    return {
      async persistCharacter() {},
      async markGenerationComplete() {},
      async markGenerationFailed() {},
    };
  }

  return {
    async persistCharacter({ generationJobId, userId, projectId, imageUrl, metadata }) {
      const id = uuidv4();
      const now = new Date();
      const character = {
        id,
        generationJobId,
        userId,
        projectId,
        imageUrl,
        metadata,
        createdAt: now,
        updatedAt: now,
      };

      await firestoreDb.collection('characters').doc(id).set(character);
      return character;
    },

    async markGenerationComplete({ generationJobId, outputs, provider, moderation }) {
      if (!generationJobId) return;
      const now = new Date();
      await firestoreDb.collection('jobs').doc(generationJobId).update({
        status: 'complete',
        outputUrls: outputs.map((o) => o.url),
        outputMetadata: outputs.map((o) => ({ url: o.url, metadataUrl: o.metadataUrl, hash: o.metadata.deterministicHash })),
        provider,
        moderation,
        updatedAt: now,
      });
    },

    async markGenerationFailed({ generationJobId, error }) {
      if (!generationJobId) return;
      await firestoreDb.collection('jobs').doc(generationJobId).update({
        status: 'failed',
        errorMessage: error.message,
        updatedAt: new Date(),
      });
      logger?.error?.('Generation job failed', { generationJobId, error: error.message });
    },
  };
}

module.exports = { createGenerationRepositories };
