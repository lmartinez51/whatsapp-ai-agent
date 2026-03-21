const pino = require('pino');
const path = require('path');
const fs = require('fs');

const logsDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
}, pino.multistream([
  { stream: process.stdout },
  { stream: pino.destination(path.join(logsDir, 'app.log')) },
  { level: 'error', stream: pino.destination(path.join(logsDir, 'errors.log')) }
]));

module.exports = logger;
