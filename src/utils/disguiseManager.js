const fs = require("fs");
const path = require("path");
const { MessageMedia } = require("whatsapp-web.js");

async function applyDisguise(client, activeAgent) {
  try {
    const profilePicPath = path.join(
      process.cwd(),
      "assets",
      `${activeAgent}.png`,
    );
    const storyVidPath = path.join(
      process.cwd(),
      "assets",
      `${activeAgent}_story.mp4`,
    );
    const storyImgPath = path.join(
      process.cwd(),
      "assets",
      `${activeAgent}_story.png`,
    );
    const cachePath = path.join(process.cwd(), "data", "story_cache.json");

    // ==========================================
    // 1. CAMBIAR FOTO DE PERFIL (Aplica para ambos)
    // ==========================================
    if (fs.existsSync(profilePicPath)) {
      const profileMedia = MessageMedia.fromFilePath(profilePicPath);
      await client.setProfilePicture(profileMedia);
      console.log(`📸 Disfraz actualizado a: ${activeAgent.toUpperCase()}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    // ==========================================
    // 2. LÓGICA DE ESTADOS (Solo Camila)
    // ==========================================
    if (activeAgent === "camila") {
      const today = new Date().toLocaleDateString("es-MX", {
        timeZone: "America/Ciudad_Juarez",
      });
      let alreadyPosted = false;

      // EL PARCHE DE CONFIANZA CIEGA: Si el JSON coincide con hoy, no hacemos preguntas.
      if (fs.existsSync(cachePath)) {
        try {
          const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
          if (cache.date === today && cache.agent === "camila") {
            alreadyPosted = true;
            console.log(
              `ℹ️ La Story ya está registrada hoy en el caché. Confiando ciegamente para evitar duplicados.`,
            );
          }
        } catch (e) {
          console.error("Error leyendo caché de stories.");
        }
      }

      if (!alreadyPosted) {
        let storyMedia = fs.existsSync(storyVidPath)
          ? MessageMedia.fromFilePath(storyVidPath)
          : fs.existsSync(storyImgPath)
            ? MessageMedia.fromFilePath(storyImgPath)
            : null;

        if (storyMedia) {
          // 🛡️ ZONA DE CUARENTENA: Aislamos el envío del Status
          try {
            const statusMsg = await client.sendMessage(
              "status@broadcast",
              storyMedia,
              { caption: "Camila's here. I'll take care of things. 💅" },
            );

            fs.writeFileSync(
              cachePath,
              JSON.stringify({
                date: today,
                agent: activeAgent,
                messageId: statusMsg.id._serialized,
              }),
            );
            console.log(`🟢 Camila's story published successfully.`);
          } catch (statusError) {
            // Si Meta rompe la API de Estados, lo atrapamos aquí sin crashear el bot entero
            console.log(
              `\x1b[33m[⚠️ ADVERTENCIA DE STATUS]\x1b[0m WhatsApp actualizó su interfaz y bloqueó la subida de la historia. Camila seguirá funcionando normalmente sin historia.`,
            );
          }
        }
      }
    } else if (activeAgent === "lorenzo") {
      // ==========================================
      // 🧹 OPERACIÓN LIMPIEZA INTERNA
      // ==========================================
      if (fs.existsSync(cachePath)) {
        try {
          fs.unlinkSync(cachePath);
          console.log(
            `🧹 Lorenzo al mando: Memoria caché de Camila destruida automáticamente.`,
          );
          console.log(
            `📱 (Recuerda borrar la Story manualmente en tu celular si así lo deseas)`,
          );
        } catch (e) {
          console.error("❌ Error borrando el caché interno:", e);
        }
      }
    }
  } catch (error) {
    console.error("❌ Error crítico general en el disfraz:", error);
  }
}

module.exports = { applyDisguise };
