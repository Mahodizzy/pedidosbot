const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');
const Jimp = require('jimp');
const express = require('express');

// --- SERVIDOR DE VIDA ---
const app = express();
app.get('/', (req, res) => res.send('Bot Online ✅'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));

// --- CONFIGURACIÓN FIREBASE ---
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const GRUPO_REFS = process.env.GRUPO_REFERENCIAS_ID;
const LOGO_URL = process.env.LOGO_URL; 

bot.on('callback_query', async (ctx) => {
    const callbackData = ctx.callbackQuery.data;
    const [accion, orderId] = callbackData.split('_');
    const orderRef = db.collection('orders').doc(orderId);

    try {
        if (accion === 'accept') {
            await orderRef.update({ status: 'entregado' });
            await ctx.answerCbQuery("✅ Pedido Aceptado");
            // Usamos HTML aquí también
            await ctx.editMessageCaption(`✅ <b>PEDIDO ENTREGADO</b>\nID: ${orderId}\n\nEl cliente ya puede verlo en su historial. Ahora puedes publicarlo:`, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: "📢 Enviar a Referencias", callback_data: `ref_${orderId}` }]]
                }
            });
        }

        else if (accion === 'reject') {
            await orderRef.update({ status: 'rechazado' });
            await ctx.answerCbQuery("❌ Pedido Rechazado");
            await ctx.editMessageCaption(`❌ <b>PEDIDO RECHAZADO</b>\nID: ${orderId}`, { 
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [] } 
            });
        }

        else if (accion === 'ref') {
            console.log("--- Iniciando proceso de imagen ---");
            await ctx.answerCbQuery("Generando referencia... ⏳");
            
            const doc = await orderRef.get();
            if (!doc.exists) return ctx.answerCbQuery("Error: Pedido no encontrado");
            const pedido = doc.data();

            const photo = ctx.callbackQuery.message.photo;
            const fileId = photo[photo.length - 1].file_id;
            const fileLink = await ctx.telegram.getFileLink(fileId);
            
            const image = await Jimp.read(fileLink.href);
            const w = Math.round(image.bitmap.width);
            const h = Math.round(image.bitmap.height);

            // --- CENSURA ---
            const altoCensura = Math.round(h * 0.16);
            const inicioCensuraY = Math.round(h * 0.47);
            const box = new Jimp(w, altoCensura, '#1a1a1a'); 
            image.composite(box, 0, inicioCensuraY);

            // --- LOGO / MARCA DE AGUA ---
            if (LOGO_URL) {
                try {
                    const logo = await Jimp.read(LOGO_URL);
                    logo.resize(Math.round(w * 0.35), Jimp.AUTO);
                    const posX = Math.round(w - logo.bitmap.width - 30);
                    const posY = Math.round(h - logo.bitmap.height - 30);
                    image.composite(logo, posX, posY, {
                        mode: Jimp.BLEND_SOURCE_OVER,
                        opacitySource: 0.5 
                    });
                } catch (err) { console.log("Error logo:", err.message); }
            }

            const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);

            // --- MENSAJE EN HTML (Más seguro que Markdown) ---
            const productos = pedido.items.map(i => `• ${i.quantity}x ${i.name}`).join('\n');
            const primerNombre = pedido.cliente.split(' ')[0];
            
            let mensajeRef = `✅ <b>NUEVA REFERENCIA EXITOSA</b>\n\n`;
            mensajeRef += `🆔 <b>Pedido:</b> ${pedido.id}\n`;
            mensajeRef += `👤 <b>Cliente:</b> ${primerNombre} ***\n`;
            mensajeRef += `🛒 <b>Compra:</b>\n${productos}\n\n`;
            mensajeRef += `🙏 ¡Gracias por confiar en <b>Refills EC</b>!`;

            await ctx.telegram.sendPhoto(GRUPO_REFS, { source: buffer }, {
                caption: mensajeRef,
                parse_mode: 'HTML' // Cambiado a HTML
            });

            await ctx.editMessageCaption(`✅ <b>PEDIDO ENTREGADO</b>\nID: ${orderId}\n\n📢 <i>Referencia publicada con éxito.</i>`, { 
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [] } 
            });
            console.log("¡Enviado con éxito!");
        }
    } catch (error) {
        console.error("ERROR:", error);
        ctx.answerCbQuery("Error al enviar la referencia.");
    }
});

bot.launch().then(() => console.log("Bot listo con HTML"));
