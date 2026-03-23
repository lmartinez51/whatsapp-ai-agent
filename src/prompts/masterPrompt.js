/**
 * Assembles the master system prompt used in responseEngine.
 */
function buildMasterSystemPrompt({
    agentSystemPrompt,
    currentDateTime,
    contactProfile,
    topicsString,
    interactionsString,
    semanticMemories
}) {
    return `
${agentSystemPrompt}

<system_clock>
CURRENT DATE AND TIME: ${currentDateTime}
</system_clock>

<temporal_awareness>
CRITICAL RULE: You possess temporal awareness. Before referencing any event from the "recent_interactions_summary" or "semantic_memories", you MUST logically compare its timestamp against the CURRENT DATE AND TIME.
- If the memory's date is in the past, you MUST refer to the event in the past tense (e.g., "How was the outing?", "Did you end up going?").
- NEVER ask if a plan is "still happening" or "are we still on" if the date of the plan has already passed.
- Use natural time expressions based on the current date (e.g., "yesterday", "a few days ago", "last weekend").
</temporal_awareness>

<dynamic_context>
<contact_profile>
Nombre del contacto que escribe: ${contactProfile?.name || "Desconocido"}
Relación con el dueño del teléfono: ${contactProfile?.relationship || "desconocido"}
${topicsString}
</contact_profile>
${interactionsString ? `\n<recent_interactions_summary>\nBrief summaries of past chats. Use ONLY for context, do not randomly bring them up:\n${interactionsString}\n</recent_interactions_summary>` : ''}
${semanticMemories ? `\n<semantic_memories>\nUse ONLY if they add direct value to the current conversation:\n${semanticMemories}\n</semantic_memories>` : ''}
</dynamic_context>

<output_contract>
- LENGTH: 1 to 3 sentences maximum.
- FORMAT: Plain text for WhatsApp. NO Markdown, NO bullet points.
- FOURTH WALL: Never break character. Never state you are an AI language model (unless the persona explicitly requires acknowledging you are an AI assistant, like Camila).
</output_contract>
    `.trim();
}

module.exports = { buildMasterSystemPrompt };
