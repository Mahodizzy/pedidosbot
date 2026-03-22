const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');
const Jimp = require('jimp');

// 1. CONFIGURACIÓN
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
            console.log("Iniciando proceso de referencia para:", orderId);
            await ctx.answerCbQuery("Generando referencia... ⏳");
            
            const doc = await orderRef.get();
            if (!doc.exists) return ctx.answerCbQuery("Error: Pedido no encontrado");
            const pedido = doc.data();

            // 1. Obtener imagen del comprobante
            const photo = ctx.callbackQuery.message.photo;
            const fileId = photo[photo.length - 1].file_id;
            const fileLink = await ctx.telegram.getFileLink(fileId);
            
            console.log("Descargando imagen...");
            const image = await Jimp.read(fileLink.href);
            const w = image.bitmap.width;
            const h = image.bitmap.height;

            // --- 2. CENSURAR NOMBRE DEL CLIENTE (MÉTODO SEGURO) ---
            console.log("Aplicando censura...");
            const altoCensura = Math.floor(h * 0.16);
            const inicioCensuraY = Math.floor(h * 0.47);

            // Creamos una caja negra del tamaño de la censura
            const box = new Jimp(w, altoCensura, '#1a1a1a'); 
            
            // Ponemos la caja negra sobre la imagen original
            image.composite(box, 0, inicioCensuraY);

            // Intentar poner texto sobre la censura
            try {
                const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
                image.print(font, 50, inicioCensuraY + (altoCensura / 4), "DATOS PROTEGIDOS - REFILLS EC");
            } catch (e) { console.log("No se pudo cargar la fuente, saltando texto."); }

            // --- 3. AÑADIR MARCA DE AGUA (LOGO) ---
            if (LOGO_URL) {
                console.log("Cargando logo desde:", LOGO_URL);
                try {
                    const logo = await Jimp.read(LOGO_URL);
                    logo.resize(Math.floor(w * 0.35), Jimp.AUTO); // Logo al 35% del ancho
                    
                    // Posición: Esquina inferior derecha
                    const posX = w - logo.bitmap.width - 30;
                    const posY = h - logo.bitmap.height - 30;

                    image.composite(logo, posX, posY, {
                        mode: Jimp.BLEND_SOURCE_OVER,
                        opacitySource: 0.5 // 50% de transparencia
                    });
                    console.log("Logo aplicado correctamente.");
                } catch (logoError) {
                    console.log("Error al cargar el logo, se enviará sin marca de agua:", logoError.message);
                }
            }

            // 4. Convertir a Buffer y enviar
            console.log("Generando buffer final...");
            const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);

            const productos = pedido.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
            const primerNombre = pedido.cliente.split(' ')[0];
            
            const mensajeRef = `✅ *NUEVA REFERENCIA EXITOSA*\n\n🆔 *Pedido:* ${pedido.id}\n👤 *Cliente:* ${primerNombre} ***\n🛒 *Compra:* ${productos}\n\n🙏 ¡Gracias por confiar en Refills EC!`;

            console.log("Enviando foto al grupo...");
            await ctx.telegram.sendPhoto(GRUPO_REFS, { source: buffer }, {
                caption: mensajeRef,
                parse_mode: 'Markdown'
            });

            await ctx.editMessageCaption(`✅ *PEDIDO ENTREGADO*\nID: ${orderId}\n\n📢 _Referencia publicada con éxito._`, { 
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [] } 
            });

            console.log("Proceso completado con éxito.");
        }
    } catch (error) {
        console.error("ERROR CRÍTICO:", error);
        ctx.answerCbQuery("Hubo un error al procesar la imagen.");
    }
});

bot.launch().then(() => console.log("Bot iniciado con correcciones de Jimp"));
