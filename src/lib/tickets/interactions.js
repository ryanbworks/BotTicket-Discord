import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import { createEmbed, errorEmbed, successEmbed } from "../../utils/embed.js";
import { getCategory, getColors, getMessage, getRatingsConfig } from "../config.js";
import { getTicketByChannel, getTicketById, getTicketRating, saveTicketRating } from "../database.js";
import { getTicketManager } from "./manager.js";
import { createTranscript } from "./transcript.js";

/**
 * Handler para botões do ticket
 */
export async function handleTicketButton(interaction, client) {
    const customId = interaction.customId;

    // Botões de avaliação (rating_X_ticketId)
    if (customId.startsWith("rating_")) {
        await handleRatingButton(interaction, client);
        return;
    }

    // Botões de criação de ticket (do painel)
    if (customId.startsWith("ticket_create_")) {
        const categoryId = customId.replace("ticket_create_", "");
        await handleTicketCreate(interaction, client, categoryId);
        return;
    }

    // Botões de ação do ticket
    switch (customId) {
        case "ticket_close":
            await handleTicketClose(interaction, client);
            break;
        case "ticket_close_confirm":
            await handleTicketCloseConfirm(interaction, client);
            break;
        case "ticket_close_cancel":
            await handleTicketCloseCancel(interaction);
            break;
        case "ticket_claim":
            await handleTicketClaim(interaction, client);
            break;
        case "ticket_unclaim":
            await handleTicketUnclaim(interaction, client);
            break;
        case "ticket_transcript":
            await handleTicketTranscript(interaction, client);
            break;
        case "ticket_reopen":
            await handleTicketReopen(interaction, client);
            break;
    }
}

/**
 * Handler para select menus do ticket
 */
export async function handleTicketSelectMenu(interaction, client) {
    const customId = interaction.customId;

    if (customId === "ticket_category_select") {
        const categoryId = interaction.values[0];
        await handleTicketCreate(interaction, client, categoryId);
    }
}

/**
 * Handler para modals do ticket
 */
export async function handleTicketModal(interaction, client) {
    const customId = interaction.customId;

    if (customId.startsWith("ticket_modal_")) {
        const categoryId = customId.replace("ticket_modal_", "");
        await handleTicketModalSubmit(interaction, client, categoryId);
    }

    if (customId === "ticket_close_reason_modal") {
        await handleCloseReasonModal(interaction, client);
    }

    if (customId.startsWith("rating_comment_modal_")) {
        await handleRatingCommentModal(interaction, client);
    }
}

/**
 * Inicia criação de ticket (abre modal se necessário)
 */
async function handleTicketCreate(interaction, client, categoryId) {
    const category = getCategory(categoryId);

    if (!category) {
        await interaction.reply({
            embeds: [errorEmbed("❌ Erro", "Categoria não encontrada!")],
            ephemeral: true,
        });
        return;
    }

    // Se tem perguntas, mostrar modal
    if (category.questions && category.questions.length > 0) {
        const modal = createTicketModal(categoryId, category);
        await interaction.showModal(modal);
        return;
    }

    // Criar ticket diretamente
    await createTicketDirect(interaction, client, categoryId);
}

/**
 * Cria modal com perguntas da categoria
 */
function createTicketModal(categoryId, category) {
    const modal = new ModalBuilder().setCustomId(`ticket_modal_${categoryId}`).setTitle(category.name.substring(0, 45));

    const questions = category.questions.slice(0, 5); // Discord limita a 5 campos

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];

        const input = new TextInputBuilder()
            .setCustomId(`question_${i}`)
            .setLabel(q.label.substring(0, 45))
            .setStyle(q.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setRequired(q.required !== false)
            .setPlaceholder(q.placeholder || "");

        if (q.minLength) input.setMinLength(q.minLength);
        if (q.maxLength) input.setMaxLength(q.maxLength);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
    }

    return modal;
}

/**
 * Processa submissão do modal
 */
async function handleTicketModalSubmit(interaction, client, categoryId) {
    // Responder imediatamente para evitar timeout
    try {
        await interaction.deferReply({ ephemeral: true });
    } catch (error) {
        console.error("Erro ao fazer defer do modal:", error.message);
        return;
    }

    const category = getCategory(categoryId);
    if (!category) {
        await interaction
            .editReply({
                embeds: [errorEmbed("❌ Erro", "Categoria não encontrada!")],
            })
            .catch(() => {});
        return;
    }

    // Extrair respostas
    const responses = [];
    const questions = category.questions || [];

    for (let i = 0; i < questions.length; i++) {
        const answer = interaction.fields.getTextInputValue(`question_${i}`);
        responses.push({
            question: questions[i].label,
            answer: answer,
        });
    }

    // Criar ticket
    const manager = getTicketManager(client);
    const result = await manager.create({
        guild: interaction.guild,
        user: interaction.user,
        categoryId: categoryId,
        responses: responses,
    });

    if (result.success) {
        await interaction.editReply({
            embeds: [
                successEmbed(
                    "✅ Ticket Criado!",
                    getMessage("success", "ticketCreated", { channel: result.channel.toString() })
                ),
            ],
        });
    } else {
        await interaction.editReply({
            embeds: [errorEmbed("❌ Erro", result.error)],
        });
    }
}

/**
 * Cria ticket sem modal
 */
async function createTicketDirect(interaction, client, categoryId) {
    await interaction.deferReply({ ephemeral: true });

    const manager = getTicketManager(client);
    const result = await manager.create({
        guild: interaction.guild,
        user: interaction.user,
        categoryId: categoryId,
    });

    if (result.success) {
        await interaction.editReply({
            embeds: [
                successEmbed(
                    "✅ Ticket Criado!",
                    getMessage("success", "ticketCreated", { channel: result.channel.toString() })
                ),
            ],
        });
    } else {
        await interaction.editReply({
            embeds: [errorEmbed("❌ Erro", result.error)],
        });
    }
}

/**
 * Mostra confirmação de fechamento
 */
async function handleTicketClose(interaction, client) {
    const ticket = await getTicketByChannel(interaction.channel.id);

    if (!ticket) {
        await interaction.reply({
            embeds: [errorEmbed("❌ Erro", getMessage("errors", "ticketNotFound"))],
            ephemeral: true,
        });
        return;
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_close_confirm").setLabel("✅ Confirmar").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("ticket_close_cancel").setLabel("❌ Cancelar").setStyle(ButtonStyle.Secondary)
    );

    const embed = createEmbed("warning")
        .setTitle("⚠️ Fechar Ticket")
        .setDescription("Tem certeza que deseja fechar este ticket?\n\nUma transcrição será gerada automaticamente.");

    await interaction.reply({
        embeds: [embed],
        components: [row],
    });
}

/**
 * Confirma fechamento do ticket
 */
async function handleTicketCloseConfirm(interaction, client) {
    await interaction.deferUpdate();

    const manager = getTicketManager(client);
    const result = await manager.close(interaction.channel, interaction.user);

    if (!result.success) {
        await interaction.followUp({
            embeds: [errorEmbed("❌ Erro", result.error)],
            ephemeral: true,
        });
    }
}

/**
 * Cancela fechamento
 */
async function handleTicketCloseCancel(interaction) {
    await interaction.update({
        embeds: [createEmbed("info").setDescription("❌ Fechamento cancelado.")],
        components: [],
    });

    setTimeout(() => {
        interaction.deleteReply().catch(() => {});
    }, 3000);
}

/**
 * Assume um ticket
 */
async function handleTicketClaim(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const manager = getTicketManager(client);
    const result = await manager.claim(interaction.channel, interaction.user);

    if (result.success) {
        await interaction.editReply({
            embeds: [successEmbed("✅ Sucesso", getMessage("success", "ticketClaimed"))],
        });

        // Notificar no canal
        await interaction.channel.send({
            embeds: [createEmbed("success").setDescription(`🙋 **${interaction.user}** assumiu este ticket.`)],
        });
    } else {
        await interaction.editReply({
            embeds: [errorEmbed("❌ Erro", result.error)],
        });
    }
}

/**
 * Libera um ticket assumido
 */
async function handleTicketUnclaim(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const manager = getTicketManager(client);
    const result = await manager.unclaim(interaction.channel, interaction.user);

    if (result.success) {
        await interaction.editReply({
            embeds: [successEmbed("✅ Sucesso", getMessage("success", "ticketUnclaimed"))],
        });

        // Notificar no canal
        await interaction.channel.send({
            embeds: [
                createEmbed("warning").setDescription(
                    `📤 **${interaction.user}** não está mais responsável por este ticket.`
                ),
            ],
        });
    } else {
        await interaction.editReply({
            embeds: [errorEmbed("❌ Erro", result.error)],
        });
    }
}

/**
 * Gera transcrição
 */
async function handleTicketTranscript(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const ticket = await getTicketByChannel(interaction.channel.id);

    if (!ticket) {
        await interaction.editReply({
            embeds: [errorEmbed("❌ Erro", getMessage("errors", "ticketNotFound"))],
        });
        return;
    }

    try {
        const transcript = await createTranscript(interaction.channel, client, ticket);

        if (transcript) {
            await interaction.editReply({
                embeds: [successEmbed("✅ Sucesso", "Transcrição gerada com sucesso!")],
                files: [transcript],
            });
        } else {
            await interaction.editReply({
                embeds: [errorEmbed("❌ Erro", "Não foi possível gerar a transcrição.")],
            });
        }
    } catch (error) {
        console.error("Erro ao gerar transcrição:", error);
        await interaction.editReply({
            embeds: [errorEmbed("❌ Erro", "Erro ao gerar transcrição.")],
        });
    }
}

/**
 * Reabre um ticket fechado
 */
async function handleTicketReopen(interaction, client) {
    // Implementar se necessário
    await interaction.reply({
        embeds: [errorEmbed("❌ Erro", "Função não implementada.")],
        ephemeral: true,
    });
}

// ════════════════════════════════════════════════════════════════════════════
// SISTEMA DE AVALIAÇÃO
// ════════════════════════════════════════════════════════════════════════════

/**
 * Handler para botões de avaliação (1-5 estrelas)
 */
async function handleRatingButton(interaction, client) {
    const customId = interaction.customId;
    // Formato: rating_X_ticketId (ex: rating_5_123)
    const parts = customId.split("_");
    const rating = parseInt(parts[1]);
    const ticketId = parseInt(parts[2]);

    // Verificar se já avaliou
    const existingRating = await getTicketRating(ticketId);
    if (existingRating) {
        await interaction.reply({
            embeds: [errorEmbed("❌ Erro", "Você já avaliou este ticket!")],
            ephemeral: true,
        });
        return;
    }

    // Verificar se o ticket existe
    const ticket = await getTicketById(ticketId);
    if (!ticket) {
        await interaction.reply({
            embeds: [errorEmbed("❌ Erro", "Ticket não encontrado!")],
            ephemeral: true,
        });
        return;
    }

    // Mostrar modal para comentário
    const modal = new ModalBuilder()
        .setCustomId(`rating_comment_modal_${ticketId}_${rating}`)
        .setTitle("📝 Comentário da Avaliação");

    const commentInput = new TextInputBuilder()
        .setCustomId("rating_comment")
        .setLabel("Deixe um comentário (opcional)")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Conte-nos como foi seu atendimento...")
        .setRequired(false)
        .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(commentInput));

    await interaction.showModal(modal);
}

/**
 * Handler para modal de comentário da avaliação
 */
async function handleRatingCommentModal(interaction, client) {
    const customId = interaction.customId;
    // Formato: rating_comment_modal_ticketId_rating
    const parts = customId.split("_");
    const ticketId = parseInt(parts[3]);
    const rating = parseInt(parts[4]);

    const comment = interaction.fields.getTextInputValue("rating_comment") || null;

    // Verificar se já avaliou
    const existingRating = await getTicketRating(ticketId);
    if (existingRating) {
        await interaction.reply({
            embeds: [errorEmbed("❌ Erro", "Você já avaliou este ticket!")],
            ephemeral: true,
        });
        return;
    }

    // Salvar avaliação
    await saveTicketRating(ticketId, interaction.user.id, rating, comment);

    const ratingsConfig = getRatingsConfig();
    const colors = getColors();

    // Gerar estrelas visuais
    const stars = "⭐".repeat(rating) + "☆".repeat(5 - rating);

    // Mensagem de agradecimento
    let thankYouMessage =
        ratingsConfig.thankYouMessage || "Obrigado pela sua avaliação! Sua opinião é muito importante para nós.";

    const successEmbed = new EmbedBuilder()
        .setColor(colors.error)
        .setTitle("✅ Avaliação Registrada!")
        .setDescription(thankYouMessage)
        .addFields({ name: "⭐ Nota", value: `${stars} (${rating}/5)`, inline: true })
        .setTimestamp();

    if (comment) {
        successEmbed.addFields({ name: "💬 Comentário", value: comment, inline: false });
    }

    // Atualizar a mensagem original (desabilitar botões)
    try {
        await interaction.update({
            embeds: [successEmbed],
            components: [], // Remove os botões
        });
    } catch {
        await interaction.reply({
            embeds: [successEmbed],
            ephemeral: true,
        });
    }

    // Enviar para o canal de avaliações se configurado
    if (ratingsConfig.channelId && ratingsConfig.channelId !== "COLOQUE_O_ID_DO_CANAL_AQUI") {
        await sendRatingToChannel(client, ticketId, interaction.user, rating, comment);
    }
}

/**
 * Envia a avaliação para o canal configurado
 */
async function sendRatingToChannel(client, ticketId, user, rating, comment) {
    const ratingsConfig = getRatingsConfig();
    const colors = getColors();

    try {
        const channel = await client.channels.fetch(ratingsConfig.channelId);
        if (!channel) return;

        const ticket = await getTicketById(ticketId);
        const category = ticket ? getCategory(ticket.category_id) : null;
        const stars = "⭐".repeat(rating) + "☆".repeat(5 - rating);

        // Cor baseada na nota
        let embedColor;
        if (rating >= 4) embedColor = colors.success;
        else if (rating === 3) embedColor = colors.error;
        else embedColor = colors.error;

        const ratingEmbed = new EmbedBuilder()
            .setColor(colors.error)
            .setTitle("📊 Nova Avaliação de Ticket Recebida")
            .setDescription(
                `**Um ticket foi avaliado! Veja os detalhes abaixo:**\n\n` +
                    `**👤 Usuário:** ${user} (${user.tag})\n` +
                    `**📋 Ticket:** #${ticket?.ticket_number?.toString().padStart(4, "0") || ticketId}\n` +
                    `**📁 Categoria:** ${category?.name || "N/A"}\n` +
                    `**⭐ Avaliação:** ${stars} (${rating}/5)`
            )
            .setTimestamp();

        if (comment) {
            ratingEmbed.addFields({ name: "💬 Comentário do Usuário", value: comment, inline: false });
        }

        // Adicionar quem atendeu se houver
        if (ticket?.claimed_by) {
            try {
                const staff = await client.users.fetch(ticket.claimed_by);
                ratingEmbed.addFields({ name: "👨‍💼 Atendente Responsável", value: `${staff}`, inline: true });
            } catch {
                // Ignorar erro ao buscar staff
            }
        }

        await channel.send({ embeds: [ratingEmbed] });
    } catch (error) {
        console.error("Erro ao enviar avaliação para canal:", error.message);
    }
}

export default {
    handleTicketButton,
    handleTicketSelectMenu,
    handleTicketModal,
};
