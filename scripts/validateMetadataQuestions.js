const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { TypeSafeClient } = require('@typesafe-ai/sdk');
const {
  METADATA_QUESTIONS,
  WORTH_STORING_THRESHOLD,
  TOPIC_LABELS,
  TYPESAFE_MODEL,
  buildExchangeState,
  generatePlainTextSummary
} = require('../src/memory/metadataQuestions');

const FIXTURE_PATH = path.join(__dirname, 'validation_fixture.json');

/**
 * Persona-free summary generation using shared generatePlainTextSummary.
 * Falls back to deterministic topic label if LLM call returns null/empty.
 *
 * @param {string} userMessage
 * @param {string} assistantReply
 * @param {string} agentName
 * @param {string} topic
 * @returns {Promise<string>} One-sentence summary in Spanish
 */
async function generateSummary(userMessage, assistantReply, agentName = 'Camila', topic = 'otro') {
  const summary = await generatePlainTextSummary(userMessage, assistantReply, agentName);
  if (summary) {
    return summary;
  }
  console.warn(`[WARN] generatePlainTextSummary returned null/empty for topic "${topic}"; using fallback label.`);
  const label = TOPIC_LABELS[topic] || topic;
  return `El usuario y ${agentName} hablaron sobre ${label}.`;
}

/**
 * Runs offline validation against validation_fixture.json.
 */
async function runValidation() {
  console.log('='.repeat(70));
  console.log('  TypeSafe System One (Jev) Metadata Extraction Validation');
  console.log('='.repeat(70));
  console.log(`TypeSafe Pinned Model:          ${TYPESAFE_MODEL}`);
  console.log(`Active Threshold (worth_storing): ${WORTH_STORING_THRESHOLD}`);
  console.log(`Active LLM for Summaries:       ${process.env.ACTIVE_LLM || 'openai'}`);
  console.log('-'.repeat(70));

  if (!process.env.TYPESAFE_API_KEY) {
    console.error('ERROR: TYPESAFE_API_KEY is missing from environment.');
    process.exit(1);
  }

  if (!fs.existsSync(FIXTURE_PATH)) {
    console.warn(`\n[!] Fixture file not found: ${FIXTURE_PATH}`);
    printEmptyFixtureGuide();
    return;
  }

  let fixtureContent = [];
  try {
    const raw = fs.readFileSync(FIXTURE_PATH, 'utf-8');
    fixtureContent = JSON.parse(raw);
  } catch (err) {
    console.error(`ERROR: Failed to parse ${FIXTURE_PATH}:`, err.message);
    process.exit(1);
  }

  if (!Array.isArray(fixtureContent) || fixtureContent.length === 0) {
    console.warn(`\n[!] Fixture file is empty (${FIXTURE_PATH}).`);
    printEmptyFixtureGuide();
    return;
  }

  console.log(`Loaded ${fixtureContent.length} test pairs from fixture.\nEvaluating with Jev (${TYPESAFE_MODEL})...`);

  const client = new TypeSafeClient({
    apiKey: process.env.TYPESAFE_API_KEY,
    defaultModel: TYPESAFE_MODEL
  });
  const results = [];

  for (let i = 0; i < fixtureContent.length; i++) {
    const item = fixtureContent[i];
    const agentName = item.agent_name || 'Camila';
    const state = buildExchangeState(item.user_message, item.assistant_reply, agentName);

    process.stdout.write(`  [${i + 1}/${fixtureContent.length}] Evaluating ${item.id} (${item.category})... `);

    try {
      const response = await client.systemOne({
        state,
        questions: METADATA_QUESTIONS,
        model: TYPESAFE_MODEL
      });

      if (fixtureContent.length === 1 || process.env.VERBOSE === 'true') {
        console.log('\n[DEBUG] Raw TypeSafe Response Object:');
        console.dir(response, { depth: null });
      }

      const topicAnswer = response.answers.topic;
      const worthStoringAnswer = response.answers.worth_storing;

      const topic = topicAnswer.choice;
      const confidence = topicAnswer.confidence;
      const worthProb = worthStoringAnswer.noul;
      const stored = worthProb >= WORTH_STORING_THRESHOLD;

      let summary = null;
      let isNarrativeSummary = false;
      if (stored) {
        summary = await generateSummary(item.user_message, item.assistant_reply, agentName, topic);
        const fallbackPrefix = `El usuario y ${agentName} hablaron sobre`;
        isNarrativeSummary = summary && !summary.startsWith(fallbackPrefix);
      }

      const passWorthStoring = item.expected_worth_storing !== undefined
        ? (stored === item.expected_worth_storing)
        : null;

      const passTopic = item.expected_topic
        ? (Array.isArray(item.expected_topic) ? item.expected_topic.includes(topic) : item.expected_topic === topic)
        : null;

      results.push({
        id: item.id,
        category: item.category,
        worthProb: Number(worthProb.toFixed(3)),
        stored,
        expectedStored: item.expected_worth_storing,
        passWorthStoring,
        topic,
        confidence: Number(confidence.toFixed(3)),
        expectedTopic: item.expected_topic,
        passTopic,
        summary,
        isNarrativeSummary
      });

      console.log(`OK (stored=${stored}, topic=${topic}, conf=${confidence.toFixed(2)})`);
    } catch (err) {
      console.log(`ERROR (${err.message})`);
      results.push({
        id: item.id,
        category: item.category,
        error: err.message
      });
    }
  }

  printResultsSummary(results);
}

function printEmptyFixtureGuide() {
  console.log('\nExpected structure for scripts/validation_fixture.json:');
  console.log(JSON.stringify([
    {
      id: "greeting_01",
      category: "greeting_emoji",
      expected_worth_storing: false,
      expected_topic: "saludo_plática",
      user_message: "Hola, qué onda?",
      assistant_reply: "Hola! Todo bien y tú?",
      agent_name: "Camila"
    },
    {
      id: "tech_01",
      category: "technical_specific",
      expected_worth_storing: true,
      expected_topic: "tecnologia_gadgets",
      user_message: "Estoy configurando un microcontrolador ESP32-S3 para enviar telemetría por MQTT",
      assistant_reply: "Qué chido, estás usando ESP-IDF o Arduino core?",
      agent_name: "Camila"
    }
  ], null, 2));
  console.log('\nPopulate the file with the 30 pairs planned in Section 4 before running validation.\n');
}

function printResultsSummary(results) {
  console.log('\n' + '='.repeat(100));
  console.log('                                  DETAILED RESULTS');
  console.log('='.repeat(100));

  const tableRows = results.map(r => ({
    ID: r.id,
    Category: r.category,
    'Worth Prob': r.worthProb !== undefined ? r.worthProb : 'ERR',
    'Stored?': r.stored !== undefined ? (r.stored ? 'YES' : 'NO') : 'ERR',
    'Exp Stored': r.expectedStored !== undefined ? (r.expectedStored ? 'YES' : 'NO') : '-',
    'Gate OK?': r.passWorthStoring === null ? '-' : (r.passWorthStoring ? 'PASS' : 'FAIL'),
    Topic: r.topic || 'ERR',
    Conf: r.confidence !== undefined ? r.confidence : '-',
    Summary: r.summary ? (r.summary.length > 40 ? r.summary.slice(0, 37) + '...' : r.summary) : '(none)'
  }));

  console.table(tableRows);

  console.log('\n' + '='.repeat(100));
  console.log('                               SUCCESS CRITERIA EVALUATION');
  console.log('='.repeat(100));

  // 1. All filler/sticker/greeting pairs -> stored === false
  const fillerCategories = new Set(['greeting_emoji', 'sticker_only', 'short_ack']);
  const fillerPairs = results.filter(r => fillerCategories.has(r.category));
  const fillerPassed = fillerPairs.every(r => r.stored === false);
  const fillerFailedCount = fillerPairs.filter(r => r.stored !== false).length;

  console.log(`1. Filler/sticker/greeting pairs stored=false: ` +
    (fillerPairs.length === 0 ? 'SKIPPED (no filler items in fixture)' :
      (fillerPassed ? `PASS (${fillerPairs.length}/${fillerPairs.length} rejected)` : `FAIL (${fillerFailedCount}/${fillerPairs.length} falsely stored)`)));

  // 2. All substantive pairs -> stored === true and topic !== 'otro'
  const substantiveCategories = new Set(['substantive_emotional', 'technical_specific', 'plans_outings', 'mixed_media']);
  const substantivePairs = results.filter(r => substantiveCategories.has(r.category));
  const substantivePassed = substantivePairs.every(r => r.stored === true && r.topic !== 'otro');
  const substantiveFailedCount = substantivePairs.filter(r => r.stored !== true || r.topic === 'otro').length;

  console.log(`2. Substantive pairs stored=true and topic!='otro': ` +
    (substantivePairs.length === 0 ? 'SKIPPED (no substantive items in fixture)' :
      (substantivePassed ? `PASS (${substantivePairs.length}/${substantivePairs.length} stored with valid topic)` : `FAIL (${substantiveFailedCount}/${substantivePairs.length} missed or classified as 'otro')`)));

  // 3. >= 25/30 pairs -> topic confidence >= 0.60
  const highConfPairs = results.filter(r => r.confidence >= 0.60);
  const confPassed = results.length > 0 && (highConfPairs.length / results.length >= (25 / 30));

  console.log(`3. Topic confidence >= 0.60 on >= 25/30 pairs: ` +
    (results.length === 0 ? 'SKIPPED' :
      (confPassed ? `PASS (${highConfPairs.length}/${results.length} pairs)` : `FAIL (${highConfPairs.length}/${results.length} pairs, required: 83.3%)`)));

  // 4. Spot check: at least 3 of 5 substantive-emotional pairs -> summary is narrative
  const emotionalPairs = results.filter(r => r.category === 'substantive_emotional');
  const narrativeEmotional = emotionalPairs.filter(r => r.isNarrativeSummary);
  const narrativePassed = emotionalPairs.length === 0 || narrativeEmotional.length >= 3;

  console.log(`4. Narrative summary on >= 3 substantive-emotional pairs: ` +
    (emotionalPairs.length === 0 ? 'SKIPPED (no substantive-emotional items in fixture)' :
      (narrativePassed ? `PASS (${narrativeEmotional.length}/${emotionalPairs.length} narrative)` : `FAIL (${narrativeEmotional.length}/${emotionalPairs.length} narrative, required >= 3)`)));

  console.log('='.repeat(100));
}

if (require.main === module) {
  runValidation().catch(err => {
    console.error('Fatal error during validation:', err);
    process.exit(1);
  });
}

module.exports = {
  runValidation,
  generateSummary
};
