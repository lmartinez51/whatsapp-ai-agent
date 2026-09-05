const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const confidenceEngine = require('./confidenceEngine');
const semanticMemory = require('../memory/semanticMemory');
const contactMemory = require('../memory/contactMemory');
const conversationContext = require('../memory/conversationContext');
const responseEngine = require('../ai/responseEngine');
const memoryIngestionManager = require('../memory/memoryIngestionManager');
const personalityEngine = require('../personality/personalityEngine');
const escalationManager = require('./escalationManager');
const presenceManager = require('../utils/PresenceManager');
const { applyDisguise } = require('../utils/disguiseManager');
const { MessageMedia } = require('whatsapp-web.js');
const { buildRelayDirectivePrompt } = require('../prompts');
const { normalizeStickerName, resolveStickerPath } = require('../utils/stickerUtils');

class MessageProcessor {
    constructor() {
        // 🧺 Aquí guardaremos los mensajes mientras los contactos terminan de escribir
        this.messageQueues = new Map();
        // ⏱️ Tiempo de espera (en milisegundos) antes de dar por terminado el "chisme"
        this.DEBOUNCE_TIME = 7000; 
    }

    _scheduleQueueProcessing(realId, contact) {
        return setTimeout(() => {
            this._processDebouncedQueue(realId, contact)
                .catch(error => logger.error({ err: error, realId }, 'Error processing debounced message queue'));
        }, this.DEBOUNCE_TIME);
    }

    async _downloadMediaWithTimeout(message, timeoutMs, timeoutMessage) {
        let timeoutId;

        try {
            return await Promise.race([
                message.downloadMedia(),
                new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
                })
            ]);
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    }

    // ==========================================
    // 🎯 ADUANA DE STICKERS
    // ==========================================
    async _sendReplyWithStickers(targetId, replyText, client) {
        let finalReplyText = replyText;
        let stickerToSend = null;

        const stickerRegex = /\[STICKER:\s*([^\]]+)\]/i;
        const match = finalReplyText.match(stickerRegex);

        if (match) {
            const requestedSticker = match[1].trim();
            stickerToSend = normalizeStickerName(requestedSticker);
            finalReplyText = finalReplyText.replace(stickerRegex, '').trim();

            if (!stickerToSend) {
                logger.warn({ requestedSticker }, 'Rejected invalid sticker token');
            }
        }

        if (finalReplyText) {
            await client.sendMessage(targetId, finalReplyText);
        }

        if (stickerToSend) {
            const stickersDir = path.join(process.cwd(), 'assets', 'stickers');
            const stickerPath = resolveStickerPath(stickersDir, stickerToSend);
            
            if (stickerPath && fs.existsSync(stickerPath)) {
                const stickerMedia = MessageMedia.fromFilePath(stickerPath);
                await client.sendMessage(targetId, stickerMedia, { sendMediaAsSticker: true });
                console.log(`\x1b[35m🎯 [STICKER DISPARADO a ${targetId}]:\x1b[0m ${stickerToSend}`);
            } else {
                console.log(`⚠️ Intentó usar el sticker [${stickerToSend}], pero el archivo no existe.`);
            }
        }
    }

    // ==========================================
    // 👑 MANEJADOR DE COMANDOS (Ejecución Inmediata)
    // ==========================================
    async _handleCommands(message, chat, commandText, realId) {
        const args = commandText.slice(1).trim().split(/\s+/);
        const command = args[0].toLowerCase();

        if (command === 'switch') {
            const targetAgent = args[1]?.toLowerCase();
            if (personalityEngine.switchAgent(targetAgent)) {
                await chat.sendMessage(`✅ Entendido jefe. Cambiando cerebro y disfraz a: ${targetAgent.toUpperCase()}...`);
                await applyDisguise(message.client, targetAgent); 
                await chat.sendMessage(`🎭 Transformación completada.`);
            } else {
                await chat.sendMessage(`❌ Error: Usa '!switch camila' o '!switch lorenzo'.`);
            }
            return;
        }

        if (command === 'motor') {
            const targetEngine = args[1]?.toLowerCase();
            if (targetEngine === 'openai' || targetEngine === 'gemini') {
                process.env.ACTIVE_LLM = targetEngine;
                await chat.sendMessage(`✅ Motor de IA cambiado a: ${targetEngine.toUpperCase()}`);
                console.log(`\x1b[36m[SISTEMA]\x1b[0m \x1b[35mMotor cambiado a: ${targetEngine.toUpperCase()}\x1b[0m`);
            } else {
                await chat.sendMessage(`❌ Error: Usa '!motor openai' o '!motor gemini'.`);
            }
            return;
        }

        if (command === 'dile' || command === 'cobrar') {
            let rawNumber = "";
            let targetName = "";
            let directive = "";

            if (!args[1]) {
                await chat.sendMessage(`❌ Error: Usa '!${command} numero directiva' o '!${command} @alias directiva'.`);
                return;
            }

            if (args[1].startsWith('@')) {
                const alias = args[1].substring(1).toLowerCase();
                const aliasesPath = path.join(process.cwd(), 'data', 'aliases.json');
                
                if (fs.existsSync(aliasesPath)) {
                    try {
                        const aliases = JSON.parse(fs.readFileSync(aliasesPath, 'utf8'));
                        if (aliases[alias]) {
                            rawNumber = aliases[alias];
                            targetName = alias.charAt(0).toUpperCase() + alias.slice(1);
                        }
                    } catch (err) {
                        await chat.sendMessage(`❌ Error crítico: Tu archivo aliases.json está corrupto.`);
                        return;
                    }
                }
                
                if (!rawNumber) {
                    await chat.sendMessage(`❌ Error: No encontré a nadie llamado '@${alias}'.`);
                    return;
                }
                directive = args.slice(2).join(' ');
            } else {
                rawNumber = args[1];
                directive = args.slice(2).join(' ');
            }

            if (!directive.trim()) {
                await chat.sendMessage(`❌ Error: Te falta la directiva que quieres enviar.`);
                return;
            }

            const cleanNumber = rawNumber.replace('@c.us', '');
            const registeredUser = await message.client.getNumberId(cleanNumber);

            if (!registeredUser) {
                await chat.sendMessage(`❌ Error crítico: WhatsApp dice que el número no existe.`);
                return;
            }

            const targetId = registeredUser._serialized; 
            await chat.sendMessage(`⏳ Procesando directiva para ${targetName || targetId}...`);

            const promptDirectivo = buildRelayDirectivePrompt(directive);

            const targetProfile = await contactMemory.getProfile(targetId); 
            const killerMessage = await responseEngine.generateResponse(promptDirectivo, targetProfile, "", []);

            if (killerMessage) {
                await this._sendReplyWithStickers(targetId, killerMessage, message.client);
                const timeOut = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
                console.log(`\x1b[36m[%s]\x1b[0m \x1b[35m🎯 [DIRECTIVA A ${targetName || targetId}]:\x1b[0m %s`, timeOut, killerMessage);
                await chat.sendMessage(`✅ Mensaje enviado a ${targetName || targetId}.\n\n💬 Lo que le dije fue:\n"${killerMessage}"`);
            } else {
                await chat.sendMessage(`❌ Falló la generación del mensaje.`);
            }
            return;
        }

        if (command === 'guardar-sticker') {
            const stickerName = normalizeStickerName(args[1]);
            if (!stickerName) {
                await chat.sendMessage(`❌ Jefe, ponle un nombre valido. Usa solo letras, numeros, guiones y guion bajo.`);
                return;
            }

            if (message.hasQuotedMsg) {
                const quotedMsg = await message.getQuotedMessage();
                if (quotedMsg.type === 'sticker') {
                    try {
                        const media = await quotedMsg.downloadMedia();
                        const stickersDir = path.join(process.cwd(), 'assets', 'stickers');
                        if (!fs.existsSync(stickersDir)) fs.mkdirSync(stickersDir, { recursive: true });

                        const filePath = resolveStickerPath(stickersDir, stickerName);
                        if (!filePath) {
                            await chat.sendMessage(`❌ Ese nombre de sticker no es seguro.`);
                            return;
                        }
                        fs.writeFileSync(filePath, media.data, 'base64');

                        await chat.sendMessage(`✅ ¡Arsenal actualizado! Sticker guardado como [${stickerName}]. 🥷`);
                        console.log(`📥 Nuevo sticker guardado en: ${filePath}`);
                    } catch (err) {
                        await chat.sendMessage(`❌ Error al robar el sticker: ${err.message}`);
                    }
                } else {
                    await chat.sendMessage(`⚠️ El mensaje al que respondiste no es un sticker.`);
                }
            } else {
                await chat.sendMessage(`⚠️ Tienes que deslizar y *responder* al sticker que quieres guardar.`);
            }
            return;
        }

        await chat.sendMessage(`❌ Comando desconocido. Comandos válidos: !switch, !motor, !dile, !guardar-sticker.`);
    }

    // ==========================================
    // 🚪 PUERTA DE ENTRADA (Filtros y Canasta)
    // ==========================================
    async processIncomingMessage(message, chat) {
        // 1. INTERVENCIÓN MANUAL (Modo Mago de Oz) - Pase Directo
        if (message.fromMe) {
            const manualText = message.body?.trim() || "";
            
            // Si está completamente vacío (sin texto ni media) o es un comando, aborta
            if ((!manualText && !message.hasMedia) || manualText.startsWith('!')) return;

            const targetId = message.to;
            const activeAgent = personalityEngine.activeAgent;
            
            // Si mandaste un audio/sticker sin texto, ponemos una etiqueta descriptiva
            const displayContent = manualText || `[Archivo adjunto: ${message.type}]`;
            
            // Armamos la nota de sistema limitando la intervención de Lorenzo a un "cameo"
            let memoryNote = activeAgent === 'camila' 
                ? `*(System Action: Lorenzo, the real human host, just intervened briefly to send this message: "${displayContent}". CRITICAL DIRECTIVE: The user's next response will likely react to Lorenzo. Do not take it personally. Act as a sassy third-party observer for this specific exchange. Remember that Lorenzo's appearance is a brief cameo; you remain the primary AI assistant in charge of the main conversation with the user.)*`
                : displayContent;

            conversationContext.addMessage(targetId, "assistant", memoryNote);
            console.log(`\x1b[35m[👁️ INTERVENCIÓN HUMANA]\x1b[0m Tú enviaste: ${displayContent}`);
            return; 
        }

        const contact = await message.getContact();
        const realId = contact.id._serialized.endsWith('@c.us') ? contact.id._serialized : `${contact.id.user}@c.us`;

        if (!realId.endsWith('@c.us')) return;

        // 2. COMANDOS DEL JEFE - Pase Directo
        const masterNumber = process.env.MASTER_NUMBER;
        const rawText = message.body?.trim() || "";
        
        if (realId === masterNumber && rawText.startsWith('!')) {
            return this._handleCommands(message, chat, rawText, realId);
        }

        // 3. BLOQUEO DE SEGURIDAD
        if (!personalityEngine.isAllowedContact(contact, realId)) return;

        // 4. LA CANASTA (Debouncer)
        // En lugar de procesar ya, lo metemos a la caja de este contacto
        if (this.messageQueues.has(realId)) {
            // Ya estaba escribiendo: Cancelamos el reloj viejo y metemos el mensaje nuevo
            const queue = this.messageQueues.get(realId);
            clearTimeout(queue.timer);
            queue.messages.push(message);
            queue.chat = chat; // Actualizamos al último objeto de chat por si acaso
            
            // Reiniciamos el reloj
            queue.timer = this._scheduleQueueProcessing(realId, contact);
        } else {
            // Es su primer mensaje: Creamos la caja y arrancamos el reloj
            const timer = this._scheduleQueueProcessing(realId, contact);
            this.messageQueues.set(realId, {
                messages: [message],
                chat: chat,
                timer: timer
            });
        }
    }

    // ==========================================
    // ⚙️ PROCESADOR PESADO (Se activa al terminar de escribir)
    // ==========================================
    async _processDebouncedQueue(realId, contact) {
        // 1. Sacamos la caja de la memoria y la borramos
        const queue = this.messageQueues.get(realId);
        if (!queue) return;
        this.messageQueues.delete(realId);

        const { messages, chat } = queue;
        const contactName = contact.pushname || contact.name || "Desconocido";

        let finalCombinedText = "";
        let finalMediaObject = null;

        // 2. Unimos todo lo que mandó en esos 7 segundos
        for (const msg of messages) {
            let textPiece = msg.body?.trim() || "";

            if (msg.type === 'audio' || msg.type === 'ptt') {
                try {
                    // Carrera contra el tiempo: 8 segundos máximo para descargar el audio.
                    const media = await this._downloadMediaWithTimeout(
                        msg,
                        8000,
                        'Timeout al descargar audio de WA'
                    );

                    if (media && media.data) {
                        finalMediaObject = { data: media.data, mimetype: media.mimetype };
                        if (!textPiece) {
                            textPiece = "*(El usuario te envió esta nota de voz. Escúchala con atención y responde al contenido y al tono.)*";
                        }
                        console.log(`\x1b[36m[👂 OÍDO BIÓNICO]\x1b[0m Audio capturado con éxito (${media.mimetype}).`);
                    } else {
                        // El archivo venía corrupto de WhatsApp
                        if (!textPiece) textPiece = `*(El usuario te envió un audio, pero el archivo estaba corrupto y no se pudo escuchar)*`;
                    }
                } catch (error) {
                    if (!textPiece) textPiece = `*(El usuario intentó enviar un audio pero falló la descarga de WhatsApp)*`;
                    console.log(`\x1b[31m[⚠️ OÍDO BIÓNICO FALLÓ]\x1b[0m ${error.message}`);
                }
            } else if (msg.hasMedia || msg.type === 'image' || msg.type === 'sticker') {
                try {
                    // Carrera contra el tiempo: Si la librería se cuelga (común en stickers animados), la matamos a los 5 segundos.
                    const media = await this._downloadMediaWithTimeout(
                        msg,
                        5000,
                        'Timeout al descargar media de WA'
                    );

                    if (media && media.data) {
                        finalMediaObject = { data: media.data, mimetype: media.mimetype };
                        if (!textPiece) {
                            textPiece = msg.type === 'sticker' 
                                ? "*(El usuario te envió este sticker gráfico)*"
                                : "*(El usuario te envió esta imagen/audio)*";
                        }
                        console.log(`\x1b[36m[👁️ NERVIO ÓPTICO]\x1b[0m Media capturada con éxito.`);
                    } else {
                        // FALLO SILENCIOSO WA: Retornó undefined pero no tiró error.
                        if (!textPiece) textPiece = `*(El usuario te envió un ${msg.type}, pero la imagen no se pudo descargar)*`;
                    }
                } catch (error) {
                    // Si tira error explícito o se agota el timeout
                    if (!textPiece) textPiece = `*(El usuario intentó enviar un ${msg.type} pero el archivo falló)*`;
                    console.log(`\x1b[31m[⚠️ NERVIO ÓPTICO FALLÓ]\x1b[0m ${error.message}`);
                }
            }

            if (textPiece) {
                // Si ya había texto previo, le ponemos un salto de línea
                finalCombinedText += (finalCombinedText ? "\n" : "") + textPiece;
            }
        }

        if (!finalCombinedText && !finalMediaObject) return;

        const timeIn = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
        console.log(`\x1b[36m[%s]\x1b[0m \x1b[33m👤 %s:\x1b[0m %s`, timeIn, contactName, finalCombinedText.replace(/\n/g, ' \\ '));

        try {
            // ESCUDO DE EMERGENCIA
            if (escalationManager.isUrgent(finalCombinedText)) {
                // Tomamos el client del último mensaje recibido
                await escalationManager.alertMaster(messages[messages.length - 1].client, contactName, finalCombinedText);
                return; 
            }

            const contactProfile = await contactMemory.getProfile(realId, contactName);

            const evaluation = await confidenceEngine.shouldRespond(finalCombinedText);
            if (!evaluation.isAllowed) {
                console.log(`\x1b[31m[BLOQUEADO]\x1b[0m Confianza baja (%s)`, evaluation.score.toFixed(2));
                await semanticMemory.storeMemory(realId, finalCombinedText, "human_required");
                return;
            }

            const combinedMemoriesText = await semanticMemory.retrieveMemories(realId, finalCombinedText, 6);
            const recentContext = conversationContext.getContext(realId).slice(-10);

            let finalMemories = Array.isArray(combinedMemoriesText)
                ? (combinedMemoriesText.length > 0 ? combinedMemoriesText.join('\n') : "")
                : (combinedMemoriesText || "");
            const masterNumber = process.env.MASTER_NUMBER;
            
            if (realId === masterNumber) {
                const isCamila = personalityEngine.activeAgent === 'camila';
                const godModeContext = isCamila
                  ? "CRITICAL RULE: You are talking directly to YOUR BOSS AND CREATOR (the real human Lorenzo). Address him as his sarcastic digital assistant."
                  : "CRITICAL RULE: You are talking directly to your human Prime (the real Lorenzo). Help him test the system and chat with him loyally.";
                finalMemories = `<absolute_truth>\n${godModeContext}\n</absolute_truth>\n` + (finalMemories || "");
            }

            // LLAMADA AL LLM
            const responseResult = await responseEngine.generateResponseResult(
                finalCombinedText,
                contactProfile,
                finalMemories, 
                recentContext,
                finalMediaObject 
            );
            const replyText = responseResult?.text;

            if (!replyText) return;
            
            const relationship = contactProfile?.relationship || "desconocido";
            await presenceManager.simulateHumanPresence(chat, realId, contactName, relationship, replyText);

            // Tomamos el client del último mensaje para responder
            await this._sendReplyWithStickers(chat.id._serialized, replyText, messages[messages.length - 1].client);
            
            const timeOut = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
            const agentName = personalityEngine.activeAgent === 'lorenzo' ? 'Lorenzo' : 'Camila';
            console.log(`\x1b[36m[%s]\x1b[0m \x1b[32m🤖 [${agentName}]:\x1b[0m %s`, timeOut, replyText.replace(/\n/g, ' \\ '));

            // GUARDAMOS EN MEMORIA EL BLOQUE COMPLETO
            conversationContext.addMessage(realId, "user", finalCombinedText);
            conversationContext.addMessage(realId, "assistant", replyText, {
                geminiContent: responseResult?.modelContent
            });
            
            setImmediate(() => {
                memoryIngestionManager.handleConversationUpdate(realId, finalCombinedText, replyText)
                .catch(e => logger.error({ err: e, realId }, 'Error in memory sync'));
            });

        } catch (error) {
            logger.error({ err: error }, 'Error en el procesador pesado');
        }
    }
}

module.exports = new MessageProcessor();
