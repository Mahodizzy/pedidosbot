const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');

// 1. CONFIGURACIÓN DE FIREBASE
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const GRUPO_REFS = process.env.GRUPO_REFERENCIAS_ID;

// 2. LÓGICA DE LOS BOTONES
bot.on('callback_query', async (ctx) => {
    const callbackData = ctx.callbackQuery.data;
    console.log("Botón presionado:", callbackData); // Esto aparecerá en los logs de Render

    const [accion, orderId] = callbackData.split('_');
    const orderRef = db.collection('orders').doc(orderId);

    try {
        // --- CASO: ACEPTAR PEDIDO ---
        if (accion === 'accept') {
            console.log("Aceptando pedido:", orderId);
            await orderRef.update({ status: 'entregado' });
            
            await ctx.answerCbQuery("✅ Pedido Aceptado");

            await ctx.editMessageCaption(`✅ *PEDIDO ENTREGADO*\nID: ${orderId}\n\nEl cliente ya puede verlo en su historial. Ahora puedes publicarlo:`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📢 Enviar a Referencias", callback_data: `ref_${orderId}` }]
                    ]
                }
            });
        }

        // --- CASO: RECHAZAR PEDIDO ---
        else if (accion === 'reject') {
            console.log("Rechazando pedido:", orderId);
            await orderRef.update({ status: 'rechazado' });
            await ctx.answerCbQuery("❌ Pedido Rechazado");
            await ctx.editMessageCaption(`❌ *PEDIDO RECHAZADO*\nID: ${orderId}`, { 
                reply_markup: { inline_keyboard: [] } 
            });
        }

        // --- CASO: ENVIAR A REFERENCIAS ---
        else if (accion === 'ref') {
            console.log("Enviando a referencias:", orderId);
            const doc = await orderRef.get();
            if (!doc.exists) return ctx.answerCbQuery("Error: Pedido no encontrado");
            
            const pedido = doc.data();
            const productos = pedido.items.map(i => `${i.quantity}x ${i.name}`).join(', ');

            const mensajeRef = `✅ *REFERENCIA EXITOSA*\n\n🆔 *Pedido:* ${pedido.id}\n👤 *Cliente:* ${pedido.cliente}\n🛒 *Compra:* ${productos}\n\n🙏 Gracias por su confianza.`;

            await ctx.telegram.sendPhoto(GRUPO_REFS, ctx.callbackQuery.message.photo[0].file_id, {
                caption: mensajeRef,
                parse_mode: 'Markdown'
            });

            await ctx.answerCbQuery("📢 Publicado con éxito");
            
            await ctx.editMessageCaption(`✅ *PEDIDO ENTREGADO*\nID: ${orderId}\n\n📢 _Publicado en Referencias_`, { 
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [] } 
            });
        }
    } catch (error) {
        console.error("Error procesando botón:", error);
        ctx.answerCbQuery("Hubo un error técnico");
    }
});

// ESTA LÍNEA ES VITAL:
console.log("Iniciando Bot...");
bot.launch().then(() => console.log("Bot en línea y escuchando."));

// Manejo de cierre seguro
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
