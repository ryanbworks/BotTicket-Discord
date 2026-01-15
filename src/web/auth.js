import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDatabase } from "../lib/database.js";

// Chave secreta para JWT (deve estar no .env em produção)
const JWT_SECRET = process.env.JWT_SECRET || "fozbot-secret-key-change-in-production";

// Gerar hash de senha (para criar novos usuários)
export async function hashPassword(password) {
    return await bcrypt.hash(password, 10);
}

// Verificar senha
export async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

// Verificar se é primeiro acesso (senha não definida)
export function isFirstAccess(username) {
    const db = getDatabase();
    const user = db.prepare("SELECT password_hash FROM panel_users WHERE username = ?").get(username);
    return user && user.password_hash === null;
}

// Definir senha inicial
export async function setInitialPassword(username, password) {
    const db = getDatabase();
    const passwordHash = await hashPassword(password);

    const result = db
        .prepare(
            `
        UPDATE panel_users 
        SET password_hash = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE username = ? AND password_hash IS NULL
    `
        )
        .run(passwordHash, username);

    return result.changes > 0;
}

// Alterar senha (apenas se já estiver autenticado)
export async function changePassword(username, oldPassword, newPassword) {
    const db = getDatabase();
    const user = db.prepare("SELECT password_hash FROM panel_users WHERE username = ?").get(username);

    if (!user || !user.password_hash) {
        return { success: false, error: "Usuário não encontrado" };
    }

    const isValid = await verifyPassword(oldPassword, user.password_hash);
    if (!isValid) {
        return { success: false, error: "Senha atual incorreta" };
    }

    const newPasswordHash = await hashPassword(newPassword);
    db.prepare(
        `
        UPDATE panel_users 
        SET password_hash = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE username = ?
    `
    ).run(newPasswordHash, username);

    return { success: true };
}

// Autenticar usuário
export async function authenticateUser(username, password) {
    const db = getDatabase();
    const user = db.prepare("SELECT username, password_hash FROM panel_users WHERE username = ?").get(username);

    if (!user) {
        return null;
    }

    // Se não tem senha definida (primeiro acesso), não permite login
    if (user.password_hash === null) {
        return null;
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
        return null;
    }

    // Gerar token JWT
    const token = jwt.sign({ username: user.username }, JWT_SECRET, {
        expiresIn: "7d", // Token válido por 7 dias
    });

    return { username: user.username, token };
}

// Verificar token JWT
export function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

// Middleware para verificar autenticação
export function authMiddleware(req, res, next) {
    const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
        return res.status(401).json({ error: "Não autenticado" });
    }

    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({ error: "Token inválido" });
    }

    req.user = decoded;
    next();
}

// Middleware para Socket.IO
export function socketAuthMiddleware(socket, next) {
    // Tentar pegar token de múltiplas fontes
    const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.cookie?.match(/token=([^;]+)/)?.[1] ||
        socket.request.headers.cookie?.match(/token=([^;]+)/)?.[1];

    console.log("🔐 Socket.IO Auth - Cookie:", socket.handshake.headers.cookie?.substring(0, 50) + "...");
    console.log("🔐 Socket.IO Auth - Token extraído:", token ? token.substring(0, 20) + "..." : "não encontrado");

    if (!token) {
        console.log("❌ Socket.IO Auth - Token não encontrado");
        return next(new Error("Não autenticado"));
    }

    const decoded = verifyToken(token);

    if (!decoded) {
        console.log("❌ Socket.IO Auth - Token inválido");
        return next(new Error("Token inválido"));
    }

    console.log("✅ Socket.IO Auth - Usuário autenticado:", decoded.username);
    socket.user = decoded;
    next();
}
