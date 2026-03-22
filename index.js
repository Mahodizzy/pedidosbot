const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');
const Jimp = require('jimp');
const express = require('express'); // Añadimos express

// --- 1. SERVIDOR PARA EVITAR TIMEOUT EN RENDER ---
const app = express();
app.get('/', (req, res) => res.send('Bot Online ✅'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor de vida en puerto ${PORT}`));

// --- 2. CONFIGURACIÓN DE FIREBASE ---
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const GRUPO_REFS = process.env.GRUPO_REFERENCIAS_ID;
const LOGO_URL = process.env.LOGO_URL; 

// --- 3. LÓGICA DEL BOT ---
bot.on('callback_query', async (ctx) => {
    const callbackData = ctx.callbackQuery.data;
    const [accion, orderId] = callbackData.split('_');
    const orderRef = db.collection('orders').doc(orderId);

    try {
        if (accion === 'accept') {
            await orderRef.update({ status: 'entregado' });
            await ctx.answerCbQuery("✅ Pedido Aceptado");
            await ctx.editMessageCaption(`✅ *PEDIDO ENTREGADO*\nID: ${orderId}\n\nEl cliente ya puede verlo en su historial.`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: "📢 Enviar a Referencias", callback_data: `ref_${orderId}` }]] }
            });
        }

        else if (accion === 'reject') {
            await orderRef.update({ status: 'rechazado' });
            await ctx.answerCbQuery("❌ Pedido Rechazado");
            await ctx.editMessageCaption(`❌ *PEDIDO RECHAZADO*\nID: ${orderId}`, { reply_markup: { inline_keyboard: [] } });
        }

        else if (accion === 'ref') {
            console.log("--- Iniciando proceso de imagen ---");
            await ctx.answerCbQuery("Generando referencia con marca de agua... ⏳");
            
            const doc = await orderRef.get();
            if (!doc.exists) return ctx.answerCbQuery("Error: Pedido no encontrado");
            const pedido = doc.data();

            // 1. Obtener link de la foto
            const photo = ctx.callbackQuery.message.photo;
            const fileId = photo[photo.length - 1].file_id;
            const fileLink = await ctx.telegram.getFileLink(fileId);
            
            console.log("Descargando imagen del comprobante...");
            const image = await Jimp.read(fileLink.href);
            
            // Forzar medidas a enteros para evitar errores
            const w = Math.round(image.bitmap.width);
            const h = Math.round(image.bitmap.height);

            // --- 2. CENSURAR NOMBRE ---
            console.log("Aplicando rectángulo de censura...");
            const altoCensura = Math.round(h * 0.16);
            const inicioCensuraY = Math.round(h * 0.47);

            // Crear caja negra
            const box = new Jimp(w, altoCensura, '#1a1a1a'); 
            image.composite(box, 0, inicioCensuraY);

            // Texto sobre la censura
            try {
                const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
                image.print(font, 50, Math.round(inicioCensuraY + (altoCensura / 4)), "DATOS PROTEGIDOS - REFILLS EC");
            } catch (e) { console.log("Aviso: No se pudo cargar fuente Jimp."); }

            // --- 3. MARCA DE AGUA (LOGO) ---
            if (LOGO_URL) {
                console.log("Aplicando Logo desde Imgur...");
                try {
                    const logo = await Jimp.read(LOGO_URL);
                    // Redimensionar logo al 35% del ancho de la imagen
                    logo.resize(Math.round(w * 0.35), Jimp.AUTO);
                    
                    const posX = Math.round(w - logo.bitmap.width - 30);
                    const posY = Math.round(h - logo.bitmap.height - 30);

                    image.composite(logo, posX, posY, {
                        mode: Jimp.BLEND_SOURCE_OVER,
                        opacitySource: 0.5 
                    });
                } catch (err) { console.log("Error con el Logo:", err.message); }
            }

            // 4. Generar Buffer y enviar
            console.log("Generando buffer final...");
            const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);

            const productos = pedido.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
            const primerNombre = pedido.cliente.split(' ')[0];
            
            const mensajeRef = `✅ *NUEVA REFERENCIA EXITOSA*\n\n🆔 *Pedido:* ${pedido.id}\n👤 *Cliente:* ${primerNombre} ***\n🛒 *Compra:* ${productos}\n\n🙏 ¡Gracias por confiar en Refills EC!`;

            await ctx.telegram.sendPhoto(GRUPO_REFS, { source: buffer }, {
                caption: mensajeRef,
                parse_mode: 'Markdown'
            });

            await ctx.editMessageCaption(`✅ *PEDIDO ENTREGADO*\nID: ${orderId}\n\n📢 _Referencia publicada correctamente._`, { 
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [] } 
            });
            console.log("Referencia enviada con éxito.");
        }
    } catch (error) {
        console.error("ERROR EN EL PROCESO:", error);
        ctx.answerCbQuery("Error crítico al procesar la imagen.");
    }
});

bot.launch().then(() => console.log("Bot funcionando con Express activo"));

// Manejo de cierre
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
