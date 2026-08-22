# 🌟 AI'm Camila: The Ultimate Dual-LLM WhatsApp Agent

> A production-grade, highly personalizable WhatsApp AI Assistant powered by Node.js.

AI'm Camila is an advanced WhatsApp agent designed to simulate a natural, context-aware human presence. By employing a **Dual-LLM Strategy Pattern**, it intelligently harnesses the power of both OpenAI and Google Gemini models. With a sophisticated personality engine, native multimodal vision, active listening, and powerful command execution, Camila goes beyond simple chatbots to provide a truly seamless conversational experience.

## ✨ Core Features

* **Dual-LLM Swarm Architecture**: Hot-swap seamlessly between OpenAI (GPT-4o / GPT-5-series) and Google Gemini (e.g. `gemini-3.5-flash`) at runtime with support for configurable thinking budgets and model content caching. The system uses a microservices approach where OpenAI acts as a high-speed intent classifier and memory router in the background, while the active LLM drives the conversational persona.
* **True Multimodality (Nervio Óptico & Oído Biónico)**: Native support for processing images, stickers, and **voice notes**. The engine intercepts media, converts it to Base64, and feeds it directly to the active LLM. Gemini can natively "listen" to audio tone and "see" visual context, while the OpenAI fallback gracefully handles media state without crashing.
* **Smart Message Debouncing**: A built-in 7-second queue system groups rapid-fire messages into a single cohesive block, preventing LLM race conditions, mimicking human reading speeds, and optimizing API costs.
* **Active Listening Protocol**: The agent understands human conversational flow. It detects storytelling or incomplete thoughts (e.g., "Guess what...") and responds with natural continuers (e.g., "👀", "👂🏻") instead of interrupting with full paragraphs.
* **Advanced Wizard of Oz Mode**: Seamlessly take over the chat. Manual texts, *images, and voice notes* sent from the host phone are silently injected into the agent's context memory, allowing the AI to adapt to your real-world interventions without breaking character or missing a beat.
* **Multi-Agent Disguise Manager**: Automated profile avatar, "about" bio, and WhatsApp Stories publisher for multi-agent switching (e.g., Camila vs. Lorenzo) with built-in cache management and error isolation.
* **Hardened Sticker Pipeline**: Safe sticker naming and resolution utility (`stickerUtils`) preventing directory traversal, with instant sticker tagging (`[STICKER: exact_name]`) and sticker capture commands.
* **Automated Syntax Check & Test Suite**: Built-in test suite using Node's native test runner (`npm test`) and syntax validation (`npm run check`) for zero-dependency test verification.
* **Professional Bilingual Documentation**: Built with maintainability in mind. The codebase strictly adheres to an American English standard for JSDoc and architectural documentation, while utilizing Spanish for intuitive inline logic comments.

## 🚀 Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/whatsapp-ai-agent.git
    cd whatsapp-ai-agent
    ```

2.  **Install dependencies:**
    Ensure you have Node.js installed, then run:
    ```bash
    npm install
    ```

3.  **Run tests & checks:**
    ```bash
    npm run check
    npm test
    ```

4.  **Authentication:**
    On the first run, the agent will generate a QR code in the terminal. Scan it with your WhatsApp mobile app (Linked Devices) to authenticate the session.

## ⚙️ Configuration (.env)

Create a `.env` file in the root of your project and configure your environment variables. Ensure you specify both API keys and set your preferred default language model.

```env
# API Keys
OPENAI_API_KEY=your_openai_api_key_here
GEMINI_API_KEY=your_google_gemini_api_key_here

# Master Control
MASTER_NUMBER=5215512345678@c.us

# Active LLM Selection (Choose 'openai' or 'gemini')
ACTIVE_LLM=gemini

# Active Persona / Disguise ('camila' or 'lorenzo')
ACTIVE_AGENT=camila
```

## 🕹️ Running the Application

### Option 1: Convenience PowerShell Scripts (Recommended on Windows)

The `scripts/` directory includes helper scripts to manage the complete bot runtime, ChromaDB background server, and logs:

* **Start Bot & ChromaDB:**
  ```powershell
  # Launch with default agent defined in .env
  .\scripts\start-chatbot.ps1

  # Launch specifying an agent persona override
  .\scripts\start-chatbot.ps1 -Agent camila
  .\scripts\start-chatbot.ps1 -Agent lorenzo
  ```
  *What it does:*
  - Checks if ChromaDB is running on port 8000; if not, launches it in the background with redirected standard and error streams to `logs/`.
  - Injects the active agent environment variable (`$env:ACTIVE_AGENT`).
  - Launches the Node.js application in an interactive terminal window.

* **Stop Bot & ChromaDB:**
  ```powershell
  .\scripts\stop-chatbot.ps1
  ```
  *Terminates active Node and ChromaDB processes and clears the story visual cache.*

* **Auto-Restart Watchdog (Continuous Monitoring):**
  ```powershell
  .\scripts\monitor-chatbot.ps1
  ```
  *Monitors the Node process every 10 seconds and automatically restarts it if it crashes.*

---

### Option 2: Direct NPM Commands

You can also run individual tasks directly using Node / NPM:

```bash
# Start the WhatsApp agent directly
npm start

# Ingest and analyze WhatsApp export files to generate personality profile
npm run ingest "Your WhatsApp Name"

# Build ChromaDB vector embeddings from chat history
npm run embeddings "Your WhatsApp Name"

# Validate syntax across all JavaScript files
npm run check

# Run the automated unit tests
npm test
```

