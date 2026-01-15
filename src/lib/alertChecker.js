import { EmbedBuilder } from "discord.js";
import { getColors, getConfig } from "./config.js";
import { getExpiredAlerts, markAlertExecuted } from "./database.js";
import { getTicketManager } from "./tickets/manager.js";

let alertCheckInterval = null;

/**
 * Inicia o sistema de verificação de alertas
 * @param {Client} client - Cliente Discord
 */
export function startAlertChecker(client) {
    const config = getConfig();
    const alertsConfig = config.alerts || {};

    if (!alertsConfig.enabled) {
        console.log("⏸️  Sistema de alertas desativado.");
        return;
    }

    console.log("⏰ Sistema de alertas iniciado.");

    // Verificar a cada 1 minuto
    alertCheckInterval = setInterval(() => {
        checkExpiredAlerts(client);
    }, 60000); // 60 segundos

    // Verificar imediatamente ao iniciar
    checkExpiredAlerts(client);
}

/**
 * Para o sistema de verificação de alertas
 */
export function stopAlertChecker() {
    if (alertCheckInterval) {
        clearInterval(alertCheckInterval);
        alertCheckInterval = null;
        console.log("⏹️  Sistema de alertas parado.");
    }
}

/**
 * Verifica e processa alertas expirados
 * @param {Client} client - Cliente Discord
 */
async function checkExpiredAlerts(client) {
    try {
        const expiredAlerts = getExpiredAlerts();

        if (expiredAlerts.length === 0) return;

        const config = getConfig();
        const alertsConfig = config.alerts || {};
        const colors = getColors();
        const manager = getTicketManager(client);

        for (const alert of expiredAlerts) {
            try {
                // Buscar o canal
                const channel = await client.channels.fetch(alert.channel_id).catch(() => null);

                if (!channel) {
                    // Canal não existe mais, marcar como executado
                    markAlertExecuted(alert.id);
                    continue;
                }

                // Enviar mensagem de fechamento
                const closeEmbed = new EmbedBuilder()
                    .setColor(colors.error)
                    .setTitle("🔒 Ticket Encerrado por Inatividade")
                    .setDescription(
                        alertsConfig.closeMessage ||
                            "Este ticket foi fechado automaticamente pois não houve resposta ao alerta enviado."
                    )
                    .addFields(
                        {
                            name: "📋 Ticket",
                            value: `#${alert.ticket_number.toString().padStart(4, "0")}`,
                            inline: true,
                        },
                        { name: "⏰ Alerta enviado há", value: `${alert.duration_minutes} minuto(s)`, inline: true }
                    )
                    .setTimestamp();

                if (alert.reason) {
                    closeEmbed.addFields({ name: "📝 Motivo do alerta", value: alert.reason, inline: false });
                }

                await channel.send({ embeds: [closeEmbed] });

                // Buscar o usuário que alertou para fechar
                const alertedBy = await client.users.fetch(alert.alerted_by).catch(() => ({
                    id: alert.alerted_by,
                    username: "Sistema",
                    toString: () => "Sistema",
                }));

                // Marcar alerta como executado antes de fechar
                markAlertExecuted(alert.id);

                // Fechar o ticket
                await manager.close(channel, alertedBy, `Fechado automaticamente - sem resposta ao alerta`);

                console.log(`🔒 Ticket #${alert.ticket_number} fechado por alerta expirado.`);
            } catch (error) {
                console.error(`Erro ao processar alerta ${alert.id}:`, error.message);
                // Marcar como executado mesmo em caso de erro para não ficar em loop
                markAlertExecuted(alert.id);
            }
        }
    } catch (error) {
        console.error("Erro ao verificar alertas expirados:", error);
    }
}

export default {
    startAlertChecker,
    stopAlertChecker,
};
