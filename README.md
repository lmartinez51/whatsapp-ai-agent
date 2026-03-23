# 🌟 AI'm Camila: The Ultimate Dual-LLM WhatsApp Agent

> A production-grade, highly personalizable WhatsApp AI Assistant powered by Node.js.

AI'm Camila is an advanced WhatsApp agent designed to simulate a natural, context-aware human presence. By employing a **Dual-LLM Strategy Pattern**, it intelligently harnesses the power of both OpenAI and Google Gemini models. With a sophisticated personality engine, native multimodal vision, active listening, and powerful command execution, Camila goes beyond simple chatbots to provide a truly seamless conversational experience.

## ✨ Core Features

* **Dual-LLM Strategy Pattern**: Hot-swap seamlessly between OpenAI (GPT-4o/5.4) and Google Gemini (3.1 Flash/Pro) at runtime. Get the best of both worlds depending on your latency or reasoning needs.
* **Multimodal Vision (Nervio Óptico)**: Native support for processing images and stickers. The engine intercepts media, converts it to Base64, and feeds it directly to the active LLM, allowing the agent to "see" and react to visual context.
* **Smart Message Debouncing**: A built-in 7-second queue system groups rapid-fire messages into a single cohesive block, preventing LLM race conditions, mimicking human reading speeds, and optimizing API costs.
* **Active Listening Protocol**: The agent understands human conversational flow. It detects storytelling or incomplete thoughts (e.g., "Guess what...") and responds with natural continuers (e.g., "👀", "👂🏻") instead of interrupting with full paragraphs.
* **Wizard of Oz Mode**: Seamlessly take over the chat. Manual messages sent from the host phone are silently injected into the agent's context memory, allowing the AI to seamlessly adapt to your real-world interventions without breaking character.
* **Native Sticker Interceptor**: Conversations are more expressive! When the LLM outputs `[STICKER: exact_name]`, the engine intercepts the tag and natively sends the corresponding local `.webp` file to the chat.
* **Professional Bilingual Documentation**: Built with maintainability in mind. The codebase strictly adheres to an American English standard for JSDoc and architectural documentation, while utilizing Spanish for intuitive inline logic comments.

## 🚀 Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/your-username/whatsapp-ai-agent.git](https://github.com/your-username/whatsapp-ai-agent.git)
    cd whatsapp-ai-agent
    ```

2.  **Install dependencies:**
    Ensure you have Node.js installed, then run:
    ```bash
    npm install whatsapp-web.js @google/genai dotenv openai
    ```

3.  **Authentication:**
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
