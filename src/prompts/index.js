const { buildLorenzoPrompt } = require('./lorenzoPrompt');
const { buildCamilaPrompt } = require('./camilaPrompt');
const { buildMasterSystemPrompt } = require('./masterPrompt');
const { getStickerInstruction } = require('./sharedPrompts');
const { buildRelayDirectivePrompt } = require('./commandPrompts');

module.exports = {
    buildLorenzoPrompt,
    buildCamilaPrompt,
    buildMasterSystemPrompt,
    getStickerInstruction,
    buildRelayDirectivePrompt
};
