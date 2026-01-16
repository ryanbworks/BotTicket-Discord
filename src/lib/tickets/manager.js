import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits,
} from "discord.js";
import { formatTime } from "../../utils/embed.js";
import { getLogger } from "../../utils/logger.js";
import {
    checkBusinessHours,
    getCategory,
    getColors,
    getMessage,
    getRatingsConfig,
    getTranscriptConfig,
} from "../config.js";
import {
    addTicketMember,
    checkCooldown,
    claimTicket,
    createTicket,
    getCategoryOpenTickets,
    getTicketByChannel,
    getTicketMembers,
    getUserOpenTickets,
    removeTicketMember,
    saveTicketResponses,
    setCooldown,
    unclaimTicket,
    updateTicketStatus,
} from "../database.js";
import { createTranscript } from "./transcript.js";

/**
 * Classe gerenciadora do sistema de tickets
 */
class TicketManager {
    constructor(client) {
        this.client = client;
    }

    /**
     * Cria um novo ticket
     * @param {Object} options - Opções de criação
     * @returns {Promise<Object>} Resultado da criação
     */
    async create(options) {
        const { guild, user, categoryId, responses = [] } = options;
        const category = getCategory(categoryId);

        if (!category) {
            return { success: false, error: "Categoria não encontrada!" };
        }

        // Verificar cooldown
        const cooldownRemaining = await checkCooldown(user.id, categoryId);
        if (cooldownRemaining > 0) {
            return {
                success: false,
                error: getMessage("errors", "cooldownActive", { time: formatTime(cooldownRemaining) }),
            };
        }

        // Verificar limite do usuário
        const userTickets = await getUserOpenTickets(user.id, categoryId);
        if (userTickets.length >= (category.memberLimit || 1)) {
            return { success: false, error: getMessage("errors", "ticketLimitReached") };
        }

        // Verificar limite total
        const categoryTickets = await getCategoryOpenTickets(categoryId);
        if (categoryTickets.length >= (category.totalLimit || 50)) {
            return { success: false, error: getMessage("errors", "totalLimitReached") };
        }

        try {
            // Criar o canal
            const discordCategory = await guild.channels.fetch(category.discordCategory).catch(() => null);
            if (!discordCategory) {
                return { success: false, error: "Categoria do Discord não encontrada!" };
            }

            // Salvar no banco primeiro para obter o número
            const ticketData = await createTicket({
                guildId: guild.id,
                userId: user.id,
                categoryId: categoryId,
                channelId: "temp", // Será atualizado
            });

            // Formatar nome do canal
            const channelName = (category.channelName || "ticket-{number}")
                .replace("{number}", ticketData.ticketNumber.toString().padStart(4, "0"))
                .replace("{username}", user.username.toLowerCase().replace(/[^a-z0-9]/g, ""))
                .replace("{userid}", user.id)
                .replace("{category}", categoryId);

            // Permissões do canal
            const permissionOverwrites = [
                // Negar para @everyone
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                // Permitir para o usuário
                {
                    id: user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.EmbedLinks,
                    ],
                },
                // Permitir para o bot
                {
                    id: this.client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageChannels,
                        PermissionFlagsBits.ManageMessages,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.EmbedLinks,
                    ],
                },
            ];

            // Adicionar permissões para staff roles
            for (const roleId of category.staffRoles || []) {
                permissionOverwrites.push({
                    id: roleId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.EmbedLinks,
                        PermissionFlagsBits.ManageMessages,
                    ],
                });
            }

            // Criar canal
            const channel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: discordCategory.id,
                permissionOverwrites,
            });

            // Atualizar canal no banco
            const pool = (await import("../database.js")).getPool();
            await pool.query("UPDATE tickets SET channel_id = ? WHERE id = ?", [channel.id, ticketData.id]);
            ticketData.channelId = channel.id;

            // Salvar respostas do modal
            if (responses.length > 0) {
                await saveTicketResponses(ticketData.id, responses);
            }

            // Criar mensagem de abertura
            const openingEmbed = await this.createOpeningEmbed(user, category, responses, ticketData.ticketNumber);
            const actionRow = this.createTicketButtons();

            // Ping roles se configurado
            let pingContent = "";
            if (category.pingRoles && category.pingRoles.length > 0) {
                pingContent = category.pingRoles
                    .filter(id => id && id !== "COLOQUE_O_ID_DO_CARGO_PARA_PING_AQUI")
                    .map(id => `<@&${id}>`)
                    .join(" ");
            }

            await channel.send({
                content: pingContent || `${user}`,
                embeds: [openingEmbed],
                components: [actionRow],
            });

            // Verificar horário de atendimento
            const businessHours = checkBusinessHours();
            if (!businessHours.isOpen && businessHours.message) {
                // Enviar mensagem de fora do horário como embed
                const colors = getColors();
                const outsideHoursEmbed = new EmbedBuilder()
                    .setColor(colors.error)
                    .setDescription(businessHours.message.replace("{user}", user.toString()))
                    .setTimestamp();

                await channel.send({ embeds: [outsideHoursEmbed] });
            }

            // Definir cooldown
            if (category.cooldown) {
                await setCooldown(user.id, categoryId, category.cooldown);
            }

            // Log
            const logger = getLogger(this.client);
            await logger.log("ticketCreate", {
                channel,
                user,
                category,
                ticketId: ticketData.id,
            });

            return {
                success: true,
                channel,
                ticketNumber: ticketData.ticketNumber,
            };
        } catch (error) {
            console.error("Erro ao criar ticket:", error);
            return { success: false, error: "Erro ao criar o ticket. Verifique as permissões do bot." };
        }
    }

    /**
     * Cria a embed de abertura do ticket
     */
    async createOpeningEmbed(user, category, responses, ticketNumber) {
        const colors = getColors();

        // Formatar mensagem de abertura
        let description = (category.openingMessage || "Bem-vindo ao seu ticket!")
            .replace("{user}", user.toString())
            .replace("{username}", user.username)
            .replace("{userid}", user.id)
            .replace("{category}", category.name);

        const embed = new EmbedBuilder()
            .setColor(colors.error)
            .setAuthor({
                name: `Ticket #${ticketNumber.toString().padStart(4, "0")}`,
                iconURL: user.displayAvatarURL(),
            })
            .setDescription(description)
            .addFields(
                { name: "👤 Aberto por", value: user.toString(), inline: true },
                { name: "📁 Categoria", value: category.name, inline: true }
            )
            .setTimestamp();

        // Adicionar respostas do modal
        if (responses.length > 0) {
            embed.addFields({ name: "\u200B", value: "**📝 Informações fornecidas:**" });

            for (const response of responses) {
                embed.addFields({
                    name: response.question,
                    value: response.answer || "Não respondido",
                    inline: false,
                });
            }
        }

        return embed;
    }

    /**
     * Cria os botões de ação do ticket
     */
    createTicketButtons(claimed = false) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("ticket_close")
                .setLabel(getMessage("buttons", "close"))
                .setStyle(ButtonStyle.Danger)
                .setEmoji("🔒"),
            new ButtonBuilder()
                .setCustomId(claimed ? "ticket_unclaim" : "ticket_claim")
                .setLabel(claimed ? getMessage("buttons", "unclaim") : getMessage("buttons", "claim"))
                .setStyle(claimed ? ButtonStyle.Secondary : ButtonStyle.Success)
                .setEmoji(claimed ? "📤" : "🙋"),
            new ButtonBuilder()
                .setCustomId("ticket_transcript")
                .setLabel(getMessage("buttons", "transcript"))
                .setStyle(ButtonStyle.Primary)
                .setEmoji("📝")
        );

        return row;
    }

    /**
     * Fecha um ticket
     */
    async close(channel, closedBy, reason = null) {
        const ticket = await getTicketByChannel(channel.id);
        if (!ticket) {
            return { success: false, error: getMessage("errors", "ticketNotFound") };
        }

        const transcriptConfig = getTranscriptConfig();
        const ratingsConfig = getRatingsConfig();

        try {
            // Gerar transcrição antes de fechar
            if (transcriptConfig.enabled) {
                await createTranscript(channel, this.client, ticket);
            }

            // Atualizar status no banco
            await updateTicketStatus(channel.id, "closed", closedBy.id, reason);

            // Log
            const logger = getLogger(this.client);
            await logger.log("ticketClose", {
                ticketNumber: ticket.ticket_number,
                closedBy,
                reason,
                ticketId: ticket.id,
            });

            // Enviar DM de avaliação
            if (ratingsConfig.enabled) {
                await this.sendRatingRequest(ticket, closedBy);
            }

            // Deletar canal
            await channel.delete();

            return { success: true };
        } catch (error) {
            console.error("Erro ao fechar ticket:", error);
            return { success: false, error: "Erro ao fechar o ticket." };
        }
    }

    /**
     * Envia a solicitação de avaliação por DM
     */
    async sendRatingRequest(ticket, closedBy) {
        const ratingsConfig = getRatingsConfig();
        const colors = getColors();

        try {
            const user = await this.client.users.fetch(ticket.user_id);
            if (!user) return;

            const category = getCategory(ticket.category_id);

            // Substituir variáveis na mensagem
            let description =
                ratingsConfig.requestMessage ||
                "Obrigado por entrar em contato conosco!\nPor favor, avalie o atendimento que recebeu.";
            description = description
                .replace("{ticket}", `#${ticket.ticket_number.toString().padStart(4, "0")}`)
                .replace("{category}", category?.name || ticket.category_id)
                .replace("{user}", user.toString());

            const ratingEmbed = new EmbedBuilder()
                .setColor(colors.error)
                .setTitle("⭐ Avalie seu Atendimento")
                .setDescription(description)
                .addFields(
                    {
                        name: "📋 Ticket",
                        value: `#${ticket.ticket_number.toString().padStart(4, "0")}`,
                        inline: true,
                    },
                    { name: "📁 Categoria", value: category?.name || ticket.category_id, inline: true }
                )
                .setFooter({ text: "Clique em uma estrela para avaliar" })
                .setTimestamp();

            // Criar botões de avaliação (1-5 estrelas)
            const ratingButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`rating_1_${ticket.id}`)
                    .setLabel("1")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji("⭐"),
                new ButtonBuilder()
                    .setCustomId(`rating_2_${ticket.id}`)
                    .setLabel("2")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji("⭐"),
                new ButtonBuilder()
                    .setCustomId(`rating_3_${ticket.id}`)
                    .setLabel("3")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji("⭐"),
                new ButtonBuilder()
                    .setCustomId(`rating_4_${ticket.id}`)
                    .setLabel("4")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji("⭐"),
                new ButtonBuilder()
                    .setCustomId(`rating_5_${ticket.id}`)
                    .setLabel("5")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji("⭐")
            );

            await user.send({
                embeds: [ratingEmbed],
                components: [ratingButtons],
            });
        } catch (error) {
            // Usuário pode ter DMs desabilitadas
            console.log(`Não foi possível enviar DM de avaliação para ${ticket.user_id}:`, error.message);
        }
    }

    /**
     * Assume um ticket
     */
    async claim(channel, staff) {
        const ticket = await getTicketByChannel(channel.id);
        if (!ticket) {
            return { success: false, error: getMessage("errors", "ticketNotFound") };
        }

        if (ticket.claimed_by) {
            return { success: false, error: getMessage("errors", "alreadyClaimed") };
        }

        await claimTicket(channel.id, staff.id);

        // Atualizar botões
        const messages = await channel.messages.fetch({ limit: 10 });
        const botMessage = messages.find(m => m.author.id === this.client.user.id && m.components.length > 0);

        if (botMessage) {
            await botMessage.edit({
                components: [this.createTicketButtons(true)],
            });
        }

        // Log
        const logger = getLogger(this.client);
        await logger.log("ticketClaim", {
            channel,
            staff,
            ticketId: ticket.id,
        });

        return { success: true };
    }

    /**
     * Libera um ticket assumido
     */
    async unclaim(channel, staff) {
        const ticket = await getTicketByChannel(channel.id);
        if (!ticket) {
            return { success: false, error: getMessage("errors", "ticketNotFound") };
        }

        if (!ticket.claimed_by) {
            return { success: false, error: getMessage("errors", "notClaimed") };
        }

        if (ticket.claimed_by !== staff.id) {
            return { success: false, error: getMessage("errors", "cannotCloseOther") };
        }

        await unclaimTicket(channel.id);

        // Atualizar botões
        const messages = await channel.messages.fetch({ limit: 10 });
        const botMessage = messages.find(m => m.author.id === this.client.user.id && m.components.length > 0);

        if (botMessage) {
            await botMessage.edit({
                components: [this.createTicketButtons(false)],
            });
        }

        // Log
        const logger = getLogger(this.client);
        await logger.log("ticketUnclaim", {
            channel,
            staff,
            ticketId: ticket.id,
        });

        return { success: true };
    }

    /**
     * Adiciona um usuário ao ticket
     */
    async addUser(channel, user, addedBy) {
        const ticket = await getTicketByChannel(channel.id);
        if (!ticket) {
            return { success: false, error: getMessage("errors", "ticketNotFound") };
        }

        const members = await getTicketMembers(ticket.id);
        if (members.some(m => m.user_id === user.id)) {
            return { success: false, error: getMessage("errors", "userAlreadyInTicket") };
        }

        // Adicionar permissões
        await channel.permissionOverwrites.create(user.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            EmbedLinks: true,
        });

        await addTicketMember(ticket.id, user.id, addedBy.id);

        // Log
        const logger = getLogger(this.client);
        await logger.log("userAdd", {
            channel,
            user,
            addedBy,
            ticketId: ticket.id,
        });

        return { success: true };
    }

    /**
     * Remove um usuário do ticket
     */
    async removeUser(channel, user, removedBy) {
        const ticket = await getTicketByChannel(channel.id);
        if (!ticket) {
            return { success: false, error: getMessage("errors", "ticketNotFound") };
        }

        // Não permitir remover o criador
        if (user.id === ticket.user_id) {
            return { success: false, error: "Não é possível remover o criador do ticket!" };
        }

        const members = await getTicketMembers(ticket.id);
        if (!members.some(m => m.user_id === user.id)) {
            return { success: false, error: getMessage("errors", "userNotInTicket") };
        }

        // Remover permissões
        await channel.permissionOverwrites.delete(user.id);

        await removeTicketMember(ticket.id, user.id);

        // Log
        const logger = getLogger(this.client);
        await logger.log("userRemove", {
            channel,
            user,
            removedBy,
            ticketId: ticket.id,
        });

        return { success: true };
    }
}

let managerInstance = null;

/**
 * Obtém a instância do gerenciador de tickets
 * @param {Client} client - Cliente Discord
 * @returns {TicketManager}
 */
export function getTicketManager(client) {
    if (!managerInstance && client) {
        managerInstance = new TicketManager(client);
    }
    return managerInstance;
}

export default TicketManager;
