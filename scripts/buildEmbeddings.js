const fs = require("fs");
const path = require("path");
const readline = require("readline");

const semanticMemory = require("../src/memory/semanticMemory");
const logger = require("../src/utils/logger");

const rawChatsDir = path.join(__dirname, "..", "data", "raw_chats");

const userName = process.argv[2];

if (!userName) {
  console.error('Usage: npm run embeddings "Your WhatsApp Name"');
  process.exit(1);
}

const CHUNK_SIZE = 8;
const BATCH_SIZE = 32;

async function processFile(filePath) {

  const contactId = `${path.parse(filePath).name}@c.us`
    .replace(/[^a-zA-Z0-9@.-]/g, "");

  logger.info(`Processing chat: ${path.basename(filePath)}`);

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  });

  const regex = /(.+?)\s-\s([^:]+):\s+(.*)/;

  let messageBuffer = [];
  let batch = [];
  let total = 0;

  for await (const line of rl) {

    const match = line.match(regex);
    if (!match) continue;

    const sender = match[2].trim();
    const msg = match[3].trim();

    if (
      msg === "<Media omitted>" ||
      msg === "<Multimedia omitido>" ||
      msg.length < 2
    ) continue;

    const role =
      sender.toLowerCase() === userName.toLowerCase()
        ? "Lorenzo"
        : "Contact";

    messageBuffer.push(`${role}: ${msg}`);

    if (messageBuffer.length >= CHUNK_SIZE) {

      batch.push({
        text: messageBuffer.join("\n"),
        timestamp: Date.now()
      });

      messageBuffer = [];
    }

    if (batch.length >= BATCH_SIZE) {

      await semanticMemory.storeMemoriesBatch(contactId, batch, "history_chunk");

      total += batch.length;

      logger.info(`Generated ${total} embeddings for ${contactId}`);

      batch = [];
    }
  }

  if (messageBuffer.length) {
    batch.push({
      text: messageBuffer.join("\n"),
      timestamp: Date.now()
    });
  }

  if (batch.length) {

    await semanticMemory.storeMemoriesBatch(contactId, batch, "history_chunk");

    total += batch.length;
  }

  logger.info(`Finished ${contactId} → ${total} embeddings`);
}

async function run() {

  if (!fs.existsSync(rawChatsDir)) {
    logger.warn("No chat directory found");
    return;
  }

  const files = fs.readdirSync(rawChatsDir)
    .filter(f => f.endsWith(".txt"));

  logger.info(`Found ${files.length} chat files`);

  for (const file of files) {

    await processFile(path.join(rawChatsDir, file));

  }

  logger.info("All embeddings completed");
}

run().catch(err =>
  logger.error({ err }, "Embedding process failed")
);