"use strict";

const SOL_MODEL = "gpt-6.2-sol";
const PREVIOUS_SOL_MODEL = "gpt-6.1-sol";

// Existing installations may explicitly pin the former Sol model in .env.
function upgradeSolModel(model) {
  return model === PREVIOUS_SOL_MODEL ? SOL_MODEL : model;
}

module.exports = { SOL_MODEL, PREVIOUS_SOL_MODEL, upgradeSolModel };
