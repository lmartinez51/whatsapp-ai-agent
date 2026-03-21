const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

async function applyDisguise(client, activeAgent) {
    try {
        const profilePicPath = path.join(process.cwd(), 'assets', `${activeAgent}.png`);
        const storyVidPath = path.join(process.cwd(), 'assets', `${activeAgent}_story.mp4`);
        const storyImgPath = path.join(process.cwd(), 'assets', `${activeAgent}_story.png`);
        const cachePath = path.join(process.cwd(), 'data', 'story_cache.json');

        // ==========================================
        // 1. CAMBIAR FOTO DE PERFIL (Aplica para ambos)
        // ==========================================
        if (fs.existsSync(profilePicPath)) {
            const profileMedia = MessageMedia.fromFilePath(profilePicPath);
            await client.setProfilePicture(profileMedia);
            console.log(`📸 Disfraz actualizado a: ${activeAgent.toUpperCase()}`);
        }

        await new Promise(resolve => setTimeout(resolve, 3000));

        // ==========================================
        // 2. LÓGICA DE ESTADOS (Solo Camila)
        // ==========================================
        if (activeAgent === 'camila') {
            const today = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Ciudad_Juarez' });
            let alreadyPosted = false;

            // EL PARCHE DE CONFIANZA CIEGA: Si el JSON coincide con hoy, no hacemos preguntas.
            if (fs.existsSync(cachePath)) {
                try {
                    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                    if (cache.date === today && cache.agent === 'camila') {
                        alreadyPosted = true;
                        console.log(`ℹ️ La Story ya está registrada hoy en el caché. Confiando ciegamente para evitar duplicados.`);
                    }
                } catch (e) {
                    console.error("Error leyendo caché de stories.");
                }
            }

            if (!alreadyPosted) {
                let storyMedia = fs.existsSync(storyVidPath) ? MessageMedia.fromFilePath(storyVidPath) 
                               : fs.existsSync(storyImgPath) ? MessageMedia.fromFilePath(storyImgPath) : null;

                if (storyMedia) {
                    const statusMsg = await client.sendMessage('status@broadcast', storyMedia, { caption: "Camila's here. I'll take care of things. 💅" });
                    
                    fs.writeFileSync(cachePath, JSON.stringify({ 
                        date: today, 
                        agent: activeAgent,
                        messageId: statusMsg.id._serialized
                    }));
                    console.log(`🟢 Camila's story published successfully.`);
                }
            }
        } else if (activeAgent === 'lorenzo') {
            // ==========================================
            // 🧹 OPERACIÓN LIMPIEZA INTERNA
            // ==========================================
            // Ya sabemos que la librería no puede borrar el estado real en WhatsApp.
            // Pero SÍ podemos destruir el archivo JSON para que Camila publique uno nuevo si regresa.
            if (fs.existsSync(cachePath)) {
                try {
                    fs.unlinkSync(cachePath); // Borramos el archivo físicamente
                    console.log(`🧹 Lorenzo al mando: Memoria caché de Camila destruida automáticamente.`);
                    console.log(`📱 (Recuerda borrar la Story manualmente en tu celular si así lo deseas)`);
                } catch (e) {
                    console.error("❌ Error borrando el caché interno:", e);
                }
            }
        }
    } catch (error) {
        console.error('❌ Error crítico en el disfraz:', error);
    }
}

module.exports = { applyDisguise };