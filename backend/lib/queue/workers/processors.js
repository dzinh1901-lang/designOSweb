'use strict';

function createGenerationProcessors({ textToImagePipeline, imageToImagePipeline }) {
  return {
    TEXT_TO_IMAGE: textToImagePipeline,
    IMAGE_TO_IMAGE: imageToImagePipeline,
  };
}

module.exports = { createGenerationProcessors };
