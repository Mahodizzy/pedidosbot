bot.on('callback_query', async (ctx) => {
    const callbackData = ctx.callbackQuery.data;
    const [accion, orderId] = callbackData.split('_');
    const orderRef = db.collection('orders').doc(orderId);

    try {
        // --- CASO: ACEPTAR PEDIDO ---
        if (accion === 'accept') {
            await orderRef.update({ status: 'entregado' });
            await ctx.answerCbQuery("✅ Pedido Aceptado");

            // Editamos el mensaje: Cambiamos texto y ponemos el botón de referencias
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
        if (accion === 'reject') {
            await orderRef.update({ status: 'rechazado' });
            await ctx.answerCbQuery("❌ Pedido Rechazado");
            // Quitamos los botones al rechazar
            await ctx.editMessageCaption(`❌ *PEDIDO RECHAZADO*\nID: ${orderId}`, { reply_markup: { inline_keyboard: [] } });
        }

        // --- CASO: ENVIAR A REFERENCIAS ---
        if (accion === 'ref') {
            const doc = await orderRef.get();
            if (!doc.exists) return ctx.answerCbQuery("Error: Pedido no encontrado");
            
            const pedido = doc.data();
            const productos = pedido.items.map(i => `${i.quantity}x ${i.name}`).join(', ');

            const mensajeRef = `✅ *REFERENCIA EXITOSA*\n\n🆔 *Pedido:* ${pedido.id}\n👤 *Cliente:* ${pedido.cliente}\n🛒 *Compra:* ${productos}\n\n🙏 Gracias por su confianza.`;

            // Enviar al grupo de referencias
            await ctx.telegram.sendPhoto(GRUPO_REFS, ctx.callbackQuery.message.photo[0].file_id, {
                caption: mensajeRef,
                parse_mode: 'Markdown'
            });

            await ctx.answerCbQuery("📢 Publicado con éxito");
            
            // Editamos el mensaje final para quitar el botón ya usado
            await ctx.editMessageCaption(`✅ *PEDIDO ENTREGADO*\nID: ${orderId}\n\n📢 _Publicado en Referencias_`, { 
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [] } 
            });
        }
    } catch (error) {
        console.error("Error procesando botón:", error);
        ctx.answerCbQuery("Hubo un error");
    }
});
