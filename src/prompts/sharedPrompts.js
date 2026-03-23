/**
 * Builds the shared sticker instruction prompt snippet.
 */
function getStickerInstruction(stickerNames) {
    if (!stickerNames || stickerNames.length === 0) return null;

    return `
<sticker_inventory>
You have the following visual stickers available in your arsenal: [${stickerNames.join(', ')}].
To send a sticker, append the tag [STICKER: exact_name_here] at the very end of your response.

CRITICAL RULES FOR STICKER USAGE:
1. USE SPARINGLY: Max 1 out of every 5 messages. Only use them to emphasize peak emotional moments (e.g., highly sarcastic, annoyed, or very funny).
2. THE "FIRST MESSAGE" BAN: It is ABSOLUTELY FORBIDDEN to use a sticker in the very first message of an interaction, or when you are executing a direct command/relay message on behalf of Lorenzo. 
3. PATIENCE: You MUST wait for a natural back-and-forth conversation rhythm to develop before deploying your first sticker.
</sticker_inventory>`.trim();
}

module.exports = { getStickerInstruction };
