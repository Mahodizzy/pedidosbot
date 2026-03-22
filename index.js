const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');

// 1. CONFIGURACIÓN DE FIREBASE
// Usaremos variables de entorno para no subir nuestras llaves a GitHub
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const GRUPO_REFS = process.env.GRUPO_REFERENCIAS_ID;

// 2. LÓGICA DE LOS BOTONES
bot.on('callback_query', async (ctx) => {
    const callbackData = ctx.callbackQuery.data; // Ejemplo: "accept_REF-1710..."
    const [accion, orderId] = callbackData.split('_');

    const orderRef = db.collection('orders').doc(orderId);

    try {
        if (accion === 'accept') {
            await orderRef.update({ status: 'entregado' });
            await ctx.answerCbQuery("✅ Pedido Aceptado");
            await ctx.editMessageCaption(`✅ *PEDIDO ENTREGADO*\nID: ${orderId}\n\nEl cliente ya puede verlo en su historial.`, { parse_mode: 'Markdown' });
        }

        if (accion === 'reject') {
            await orderRef.update({ status: 'rechazado' });
            await ctx.answerCbQuery("❌ Pedido Rechazado");
            await ctx.editMessageCaption(`❌ *PEDIDO RECHAZADO*\nID: ${orderId}\n\nSe ha marcado como rechazado.`, { parse_mode: 'Markdown' });
        }

        if (accion === 'ref') {
            const doc = await orderRef.get();
            if (!doc.exists) return ctx.answerCbQuery("Error: Pedido no encontrado");
            
            const pedido = doc.data();
            const productos = pedido.items.map(i => `${i.quantity}x ${i.name}`).join(', ');

            // Mensaje para el grupo de referencias
            const mensajeRef = `✅ *REFERENCIA EXITOSA*\n\n🆔 *Pedido:* ${pedido.id}\n👤 *Cliente:* ${pedido.cliente}\n🛒 *Compra:* ${productos}\n\n🙏 Gracias por su confianza.`;

            // Enviar al grupo (solo texto y la misma foto del comprobante)
            await ctx.telegram.sendPhoto(GRUPO_REFS, ctx.callbackQuery.message.photo[0].file_id, {
                caption: mensajeRef,
                parse_mode: 'Markdown'
            });

            await ctx.answerCbQuery("📢 Publicado en Referencias");
        }
    } catch (error) {
        console.error("Error procesando botón:", error);
        ctx.answerCbQuery("Hubo un error");
    }
});

console.log("Bot escuchando...");
bot.launch();