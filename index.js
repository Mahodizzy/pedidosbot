const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');
const Jimp = require('jimp');

// 1. CONFIGURACIÓN
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const GRUPO_REFS = process.env.GRUPO_REFERENCIAS_ID;
const LOGO_URL = process.env.LOGO_URL; // Tu logo configurado en Render

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
            await ctx.answerCbQuery("Generando referencia... ⏳");
            
            const doc = await orderRef.get();
            if (!doc.exists) return ctx.answerCbQuery("Error: Pedido no encontrado");
            const pedido = doc.data();

            // 1. Obtener imagen del comprobante y el Logo
            const fileId = ctx.callbackQuery.message.photo[ctx.callbackQuery.message.photo.length - 1].file_id;
            const fileLink = await ctx.telegram.getFileLink(fileId);
            
            const [image, logo] = await Promise.all([
                Jimp.read(fileLink.href),
                Jimp.read(LOGO_URL).catch(() => null) // Si no hay logo, sigue sin error
            ]);

            const w = image.bitmap.width;
            const h = image.bitmap.height;

            // --- 2. CENSURAR NOMBRE DEL CLIENTE ---
            // En Pichincha y Guayaquil, los nombres están en el centro (y=0.48 a 0.62)
            // Creamos un rectángulo de censura elegante (Gris oscuro/Negro)
            const censuraColor = 0x111111FF; // Negro mate
            const inicioCensuraY = h * 0.47;
            const altoCensura = h * 0.16;

            image.scan(0, inicioCensuraY, w, altoCensura, function(x, y, idx) {
                this.bitmap.data[idx] = 20;     // R
                this.bitmap.data[idx + 1] = 20; // G
                this.bitmap.data[idx + 2] = 20; // B
                this.bitmap.data[idx + 3] = 255; // Alpha
            });

            // Texto sobre la censura
            const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
            image.print(font, 50, inicioCensuraY + (altoCensura / 3), "DATOS PROTEGIDOS POR PRIVACIDAD");

            // --- 3. AÑADIR MARCA DE AGUA (LOGO) ---
            if (logo) {
                // Cambiar tamaño del logo (que ocupe el 25% del ancho de la imagen)
                logo.resize(w * 0.3, Jimp.AUTO);
                // Ponerlo en la esquina inferior derecha con opacidad
                image.composite(logo, w - logo.bitmap.width - 20, h - logo.bitmap.height - 20, {
                    mode: Jimp.BLEND_SOURCE_OVER,
                    opacitySource: 0.6
                });
            }

            const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);

            // --- 4. ENVÍO AL GRUPO ---
            const productos = pedido.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
            const primerNombre = pedido.cliente.split(' ')[0];
            
            const mensajeRef = `✅ *NUEVA REFERENCIA EXITOSA*\n\n🆔 *Pedido:* ${pedido.id}\n👤 *Cliente:* ${primerNombre} ***\n🛒 *Compra:* ${productos}\n\n🙏 ¡Gracias por elegir Refills EC!`;

            await ctx.telegram.sendPhoto(GRUPO_REFS, { source: buffer }, {
                caption: mensajeRef,
                parse_mode: 'Markdown'
            });

            await ctx.answerCbQuery("📢 ¡Publicado en Referencias!");
            
            await ctx.editMessageCaption(`✅ *PEDIDO ENTREGADO*\nID: ${orderId}\n\n📢 _Referencia publicada (Censurada)_`, { 
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [] } 
            });
        }
    } catch (error) {
        console.error("Error:", error);
        ctx.answerCbQuery("Error al procesar");
    }
});

bot.launch().then(() => console.log("Bot iniciado con Marca de Agua"));
