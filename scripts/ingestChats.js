const fs = require('fs');
const path = require('path');
const readline = require('readline');
const logger = require('../src/utils/logger');
const styleAnalyzer = require('../src/personality/styleAnalyzer');
const phraseFingerprint = require('../src/personality/phraseFingerprint');

const rawChatsDir = path.join(__dirname, '..', 'data', 'raw_chats');
const personalityFile = path.join(__dirname, '..', 'data', 'personality.json');

// To identify user messages in standard WhatsApp export.
// Example line format: "2/15/23, 10:45 PM - Username: Message text"
// Pass the user's exact WhatsApp name as an argument
const userName = process.argv[2];

if (!userName) {
  console.error("Usage: npm run ingest <Your_WhatsApp_Name_Exactly_As_In_Chats>");
  process.exit(1);
}

async function processFile(filePath) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  // Simple regex to extract name and message from standard WA export
  // Date formats can vary wildly, so we match looking for " - Name: "
  const nameRegex = new RegExp(`-\\s+${userName}:\\s+(.*)`, 'i');

  logger.info(`Processing file: ${path.basename(filePath)}`);

  for await (const line of rl) {
    const match = line.match(nameRegex);
    if (match && match[1]) {
      const msgText = match[1].trim();
      // Skip media dropped messages in exports
      if (msgText === "<Media omitted>" || msgText === "<Multimedia omitido>") continue;
      
      styleAnalyzer.addMessage(msgText);
      phraseFingerprint.addMessage(msgText);
    }
  }
}

async function runIngestion() {
  if (!fs.existsSync(rawChatsDir)) {
    fs.mkdirSync(rawChatsDir, { recursive: true });
    logger.warn(`Created ${rawChatsDir}. Please place .txt Whatsapp exports there and run again.`);
    process.exit(0);
  }

  const files = fs.readdirSync(rawChatsDir).filter(f => f.endsWith('.txt'));

  if (files.length === 0) {
    logger.warn(`No .txt files found in ${rawChatsDir}`);
    process.exit(0);
  }

  for (const file of files) {
    await processFile(path.join(rawChatsDir, file));
  }

  const styleProfile = styleAnalyzer.analyze();
  const fingerprint = phraseFingerprint.analyze();

  const finalProfile = {
    generated_at: new Date().toISOString(),
    user: userName,
    style: styleProfile,
    fingerprint: fingerprint
  };

  fs.writeFileSync(personalityFile, JSON.stringify(finalProfile, null, 2), 'utf8');
  logger.info(`Personality profile cleanly generated at ${personalityFile}`);
}

runIngestion().catch(err => logger.error({ err }, "Ingestion failed"));
