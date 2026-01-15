import Database from "better-sqlite3";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, "../../data/tickets.db");

let db = null;

/**
 * Inicializa o banco de dados SQLite
 */
export function initDatabase() {
    db = new Database(dbPath);

    // Criar tabelas
    db.exec(`
        -- Tabela de tickets
        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_number INTEGER NOT NULL,
            channel_id TEXT UNIQUE NOT NULL,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            category_id TEXT NOT NULL,
            status TEXT DEFAULT 'open',
            claimed_by TEXT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            closed_at DATETIME DEFAULT NULL,
            closed_by TEXT DEFAULT NULL,
            close_reason TEXT DEFAULT NULL,
            last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Tabela de membros do ticket
        CREATE TABLE IF NOT EXISTS ticket_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            added_by TEXT,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id),
            UNIQUE(ticket_id, user_id)
        );

        -- Tabela de respostas do modal
        CREATE TABLE IF NOT EXISTS ticket_responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id)
        );

        -- Tabela de cooldowns
        CREATE TABLE IF NOT EXISTS cooldowns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            category_id TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            UNIQUE(user_id, category_id)
        );

        -- Tabela de configuração do servidor
        CREATE TABLE IF NOT EXISTS guild_config (
            guild_id TEXT PRIMARY KEY,
            ticket_count INTEGER DEFAULT 0
        );

        -- Índices para performance
        CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(channel_id);
        CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
        CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
        CREATE INDEX IF NOT EXISTS idx_cooldowns_user ON cooldowns(user_id, category_id);

        -- Tabela de avaliações
        CREATE TABLE IF NOT EXISTS ticket_ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            rating INTEGER NOT NULL,
            comment TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id)
        );

        -- Tabela de alertas de tickets
        CREATE TABLE IF NOT EXISTS ticket_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            alerted_by TEXT NOT NULL,
            reason TEXT,
            duration_minutes INTEGER NOT NULL,
            expires_at DATETIME NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id)
        );

        -- Índice para alertas pendentes
        CREATE INDEX IF NOT EXISTS idx_alerts_status ON ticket_alerts(status, expires_at);

        -- Tabela de usuários do painel
        CREATE TABLE IF NOT EXISTS panel_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Criar usuário admin se não existir
        INSERT OR IGNORE INTO panel_users (username, password_hash) VALUES ('admin', NULL);
    `);

    console.log("✅ Banco de dados inicializado!");
    return db;
}

/**
 * Obtém a instância do banco de dados
 */
export function getDatabase() {
    if (!db) {
        return initDatabase();
    }
    return db;
}

// ════════════════════════════════════════════════════════════════════════════
// TICKETS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Cria um novo ticket no banco de dados
 */
export function createTicket(data) {
    const db = getDatabase();

    // Incrementar contador de tickets
    const guildConfig = db.prepare("SELECT ticket_count FROM guild_config WHERE guild_id = ?").get(data.guildId);
    let ticketNumber;

    if (guildConfig) {
        ticketNumber = guildConfig.ticket_count + 1;
        db.prepare("UPDATE guild_config SET ticket_count = ? WHERE guild_id = ?").run(ticketNumber, data.guildId);
    } else {
        ticketNumber = 1;
        db.prepare("INSERT INTO guild_config (guild_id, ticket_count) VALUES (?, ?)").run(data.guildId, ticketNumber);
    }

    const stmt = db.prepare(`
        INSERT INTO tickets (ticket_number, channel_id, guild_id, user_id, category_id)
        VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(ticketNumber, data.channelId, data.guildId, data.userId, data.categoryId);

    // Adicionar o criador como membro
    db.prepare(
        `
        INSERT INTO ticket_members (ticket_id, user_id, added_by)
        VALUES (?, ?, ?)
    `
    ).run(result.lastInsertRowid, data.userId, data.userId);

    return {
        id: result.lastInsertRowid,
        ticketNumber,
        ...data,
    };
}

/**
 * Obtém um ticket pelo ID do canal
 */
export function getTicketByChannel(channelId) {
    const db = getDatabase();
    return db.prepare("SELECT * FROM tickets WHERE channel_id = ?").get(channelId);
}

/**
 * Obtém um ticket pelo ID
 */
export function getTicketById(ticketId) {
    const db = getDatabase();
    return db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
}

/**
 * Obtém tickets abertos de um usuário em uma categoria
 */
export function getUserOpenTickets(userId, categoryId) {
    const db = getDatabase();
    return db
        .prepare(
            `
        SELECT * FROM tickets 
        WHERE user_id = ? AND category_id = ? AND status = 'open'
    `
        )
        .all(userId, categoryId);
}

/**
 * Obtém todos os tickets abertos de uma categoria
 */
export function getCategoryOpenTickets(categoryId) {
    const db = getDatabase();
    return db
        .prepare(
            `
        SELECT * FROM tickets 
        WHERE category_id = ? AND status = 'open'
    `
        )
        .all(categoryId);
}

/**
 * Atualiza o status do ticket
 */
export function updateTicketStatus(channelId, status, closedBy = null, reason = null) {
    const db = getDatabase();

    if (status === "closed") {
        return db
            .prepare(
                `
            UPDATE tickets 
            SET status = ?, closed_at = CURRENT_TIMESTAMP, closed_by = ?, close_reason = ?
            WHERE channel_id = ?
        `
            )
            .run(status, closedBy, reason, channelId);
    }

    return db
        .prepare(
            `
        UPDATE tickets SET status = ? WHERE channel_id = ?
    `
        )
        .run(status, channelId);
}

/**
 * Define quem assumiu o ticket
 */
export function claimTicket(channelId, userId) {
    const db = getDatabase();
    return db
        .prepare(
            `
        UPDATE tickets SET claimed_by = ? WHERE channel_id = ?
    `
        )
        .run(userId, channelId);
}

/**
 * Remove o responsável do ticket
 */
export function unclaimTicket(channelId) {
    const db = getDatabase();
    return db
        .prepare(
            `
        UPDATE tickets SET claimed_by = NULL WHERE channel_id = ?
    `
        )
        .run(channelId);
}

/**
 * Atualiza timestamp da última mensagem
 */
export function updateLastMessage(channelId) {
    const db = getDatabase();
    return db
        .prepare(
            `
        UPDATE tickets SET last_message_at = CURRENT_TIMESTAMP WHERE channel_id = ?
    `
        )
        .run(channelId);
}

/**
 * Obtém tickets inativos para auto-close
 */
export function getInactiveTickets(inactivityMs) {
    const db = getDatabase();
    const threshold = new Date(Date.now() - inactivityMs).toISOString();

    return db
        .prepare(
            `
        SELECT * FROM tickets 
        WHERE status = 'open' AND last_message_at < ?
    `
        )
        .all(threshold);
}

// ════════════════════════════════════════════════════════════════════════════
// MEMBROS DO TICKET
// ════════════════════════════════════════════════════════════════════════════

/**
 * Adiciona um membro ao ticket
 */
export function addTicketMember(ticketId, userId, addedBy) {
    const db = getDatabase();
    try {
        return db
            .prepare(
                `
            INSERT INTO ticket_members (ticket_id, user_id, added_by)
            VALUES (?, ?, ?)
        `
            )
            .run(ticketId, userId, addedBy);
    } catch (error) {
        // Já existe
        return null;
    }
}

/**
 * Remove um membro do ticket
 */
export function removeTicketMember(ticketId, userId) {
    const db = getDatabase();
    return db
        .prepare(
            `
        DELETE FROM ticket_members WHERE ticket_id = ? AND user_id = ?
    `
        )
        .run(ticketId, userId);
}

/**
 * Obtém membros do ticket
 */
export function getTicketMembers(ticketId) {
    const db = getDatabase();
    return db
        .prepare(
            `
        SELECT * FROM ticket_members WHERE ticket_id = ?
    `
        )
        .all(ticketId);
}

/**
 * Verifica se usuário é membro do ticket
 */
export function isTicketMember(ticketId, userId) {
    const db = getDatabase();
    return (
        db
            .prepare(
                `
        SELECT 1 FROM ticket_members WHERE ticket_id = ? AND user_id = ?
    `
            )
            .get(ticketId, userId) !== undefined
    );
}

// ════════════════════════════════════════════════════════════════════════════
// RESPOSTAS DO MODAL
// ════════════════════════════════════════════════════════════════════════════

/**
 * Salva respostas do modal
 */
export function saveTicketResponses(ticketId, responses) {
    const db = getDatabase();
    const stmt = db.prepare(`
        INSERT INTO ticket_responses (ticket_id, question, answer)
        VALUES (?, ?, ?)
    `);

    const insertMany = db.transaction(items => {
        for (const item of items) {
            stmt.run(ticketId, item.question, item.answer);
        }
    });

    insertMany(responses);
}

/**
 * Obtém respostas do ticket
 */
export function getTicketResponses(ticketId) {
    const db = getDatabase();
    return db
        .prepare(
            `
        SELECT * FROM ticket_responses WHERE ticket_id = ?
    `
        )
        .all(ticketId);
}

// ════════════════════════════════════════════════════════════════════════════
// COOLDOWNS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Verifica cooldown do usuário
 */
export function checkCooldown(userId, categoryId) {
    const db = getDatabase();
    const cooldown = db
        .prepare(
            `
        SELECT expires_at FROM cooldowns 
        WHERE user_id = ? AND category_id = ? AND expires_at > datetime('now')
    `
        )
        .get(userId, categoryId);

    if (cooldown) {
        return new Date(cooldown.expires_at).getTime() - Date.now();
    }
    return 0;
}

/**
 * Define cooldown do usuário
 */
export function setCooldown(userId, categoryId, durationMs) {
    const db = getDatabase();
    const expiresAt = new Date(Date.now() + durationMs).toISOString();

    return db
        .prepare(
            `
        INSERT OR REPLACE INTO cooldowns (user_id, category_id, expires_at)
        VALUES (?, ?, ?)
    `
        )
        .run(userId, categoryId, expiresAt);
}

/**
 * Limpa cooldowns expirados
 */
export function cleanExpiredCooldowns() {
    const db = getDatabase();
    return db
        .prepare(
            `
        DELETE FROM cooldowns WHERE expires_at < datetime('now')
    `
        )
        .run();
}

// ════════════════════════════════════════════════════════════════════════════
// AVALIAÇÕES
// ════════════════════════════════════════════════════════════════════════════

/**
 * Salva uma avaliação de ticket
 */
export function saveTicketRating(ticketId, userId, rating, comment = null) {
    const db = getDatabase();
    return db
        .prepare(
            `
        INSERT INTO ticket_ratings (ticket_id, user_id, rating, comment)
        VALUES (?, ?, ?, ?)
    `
        )
        .run(ticketId, userId, rating, comment);
}

/**
 * Obtém avaliação de um ticket
 */
export function getTicketRating(ticketId) {
    const db = getDatabase();
    return db.prepare("SELECT * FROM ticket_ratings WHERE ticket_id = ?").get(ticketId);
}

/**
 * Obtém todas as avaliações
 */
export function getAllRatings(limit = 100) {
    const db = getDatabase();
    return db
        .prepare(
            `
        SELECT r.*, t.ticket_number, t.category_id, t.claimed_by
        FROM ticket_ratings r
        JOIN tickets t ON r.ticket_id = t.id
        ORDER BY r.created_at DESC
        LIMIT ?
    `
        )
        .all(limit);
}

/**
 * Obtém média de avaliações
 */
export function getAverageRating() {
    const db = getDatabase();
    const result = db
        .prepare(
            `
        SELECT AVG(rating) as average, COUNT(*) as total
        FROM ticket_ratings
    `
        )
        .get();
    return result;
}

// ════════════════════════════════════════════════════════════════════════════
// ALERTAS DE TICKETS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Define um alerta para um ticket
 */
export function setTicketAlert(ticketId, alertedBy, durationMinutes, reason = null) {
    const db = getDatabase();
    const expiresAt = new Date(Date.now() + durationMinutes * 60000).toISOString();

    // Cancelar alertas anteriores pendentes
    db.prepare(`UPDATE ticket_alerts SET status = 'cancelled' WHERE ticket_id = ? AND status = 'pending'`).run(
        ticketId
    );

    return db
        .prepare(
            `
        INSERT INTO ticket_alerts (ticket_id, alerted_by, reason, duration_minutes, expires_at)
        VALUES (?, ?, ?, ?, ?)
    `
        )
        .run(ticketId, alertedBy, reason, durationMinutes, expiresAt);
}

/**
 * Obtém alerta ativo de um ticket
 */
export function getTicketAlert(ticketId) {
    const db = getDatabase();
    return db
        .prepare(
            `SELECT * FROM ticket_alerts WHERE ticket_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`
        )
        .get(ticketId);
}

/**
 * Obtém todos os alertas expirados (pendentes)
 */
export function getExpiredAlerts() {
    const db = getDatabase();
    return db
        .prepare(
            `
        SELECT a.*, t.channel_id, t.guild_id, t.user_id, t.ticket_number
        FROM ticket_alerts a
        JOIN tickets t ON a.ticket_id = t.id
        WHERE a.status = 'pending' AND a.expires_at <= datetime('now')
        AND t.status = 'open'
    `
        )
        .all();
}

/**
 * Cancela um alerta
 */
export function cancelTicketAlert(ticketId) {
    const db = getDatabase();
    return db
        .prepare(`UPDATE ticket_alerts SET status = 'cancelled' WHERE ticket_id = ? AND status = 'pending'`)
        .run(ticketId);
}

/**
 * Marca um alerta como executado
 */
export function markAlertExecuted(alertId) {
    const db = getDatabase();
    return db.prepare(`UPDATE ticket_alerts SET status = 'executed' WHERE id = ?`).run(alertId);
}

/**
 * Cancela alertas de um ticket quando o usuário responde
 */
export function cancelAlertOnResponse(ticketId) {
    const db = getDatabase();
    return db
        .prepare(`UPDATE ticket_alerts SET status = 'cancelled' WHERE ticket_id = ? AND status = 'pending'`)
        .run(ticketId);
}

export default {
    initDatabase,
    getDatabase,
    createTicket,
    getTicketByChannel,
    getTicketById,
    getUserOpenTickets,
    getCategoryOpenTickets,
    updateTicketStatus,
    claimTicket,
    unclaimTicket,
    updateLastMessage,
    getInactiveTickets,
    addTicketMember,
    removeTicketMember,
    getTicketMembers,
    isTicketMember,
    saveTicketResponses,
    getTicketResponses,
    checkCooldown,
    setCooldown,
    cleanExpiredCooldowns,
    saveTicketRating,
    getTicketRating,
    getAllRatings,
    getAverageRating,
    setTicketAlert,
    getTicketAlert,
    getExpiredAlerts,
    cancelTicketAlert,
    markAlertExecuted,
    cancelAlertOnResponse,
};
