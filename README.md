# 🌟 AI'm Camila: The Ultimate Dual-LLM WhatsApp Agent

> A production-grade, highly personalizable WhatsApp AI Assistant powered by Node.js.

AI'm Camila is an advanced WhatsApp agent designed to simulate a natural, context-aware human presence. By employing a **Dual-LLM Strategy Pattern**, it intelligently harnesses the power of both OpenAI and Google Gemini models. With a sophisticated personality engine, native sticker handling, and powerful command execution, Camila goes beyond simple chatbots to provide a truly seamless conversational experience.

## ✨ Core Features

*   **Dual-LLM Strategy Pattern**: Hot-swap seamlessly between OpenAI (GPT-5.4) and Google Gemini (3.1 Flash/Pro) at runtime. Get the best of both worlds depending on your latency or reasoning needs.
*   **Advanced Personality Engine**: Delivers highly context-aware prompting. The agent adapts to user absence, dynamically responds to relationship-based tones, and maintains a consistent, human-like persona.
*   **Native Sticker Interceptor**: Conversations are more expressive! When the LLM outputs `[STICKER: exact_name]`, the engine intercepts the tag and natively sends the corresponding local `.webp` file to the chat.
*   **Relay Directives (Command Center)**: Safely route LLM-generated messages—complete with stickers—to third-party contacts using the powerful command interface.
*   **Professional Bilingual Documentation**: Built with maintainability in mind. The codebase strictly adheres to an American English standard for JSDoc and architectural documentation, while utilizing Spanish for intuitive inline logic comments.

## 🚀 Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/whatsapp-ai-agent.git
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

# Active LLM Selection (Choose 'openai' or 'gemini')
ACTIVE_LLM=gemini
```

## 🛠️ Master Commands

Take control of Camila dynamically using these master commands within WhatsApp (sent from the owner's device):

*   **`!motor <openai|gemini>`**: Hot-swap the active language model engine on the fly.
    *   *Example:* `!motor openai` switches the routing to GPT-5.4.
*   **`!dile <contact_number/name> <message>`**: The Relay Directive. Commands the agent to send a specific message (including anticipated sticker triggers) directly to a third-party contact.
    *   *Example:* `!dile Carlos Hello! [STICKER: happy_cat]`

---

**Note on Documentation:** To ensure a globally accessible yet locally contextualized codebase, we enforce American English for all JSDoc class/method headers and architecture docs, while intricate inline logic steps are commented in Spanish.
