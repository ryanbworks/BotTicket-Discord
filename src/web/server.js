import cookieParser from "cookie-parser";
import express from "express";
import { readFileSync, writeFileSync } from "fs";
import { createServer } from "http";
import { dirname, join } from "path";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import {
    authenticateUser,
    authMiddleware,
    changePassword,
    isFirstAccess,
    setInitialPassword,
    socketAuthMiddleware,
} from "./auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.NODE_ENV === "production" ? true : "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true,
    },
    allowEIO3: true,
    cookie: {
        name: "io",
        httpOnly: true,
        sameSite: "lax",
    },
});

// Middleware
app.use(express.json());
app.use(cookieParser());

// Rotas públicas (sem autenticação)

// Verificar se é primeiro acesso
app.post("/api/check-first-access", (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ error: "Usuário é obrigatório" });
    }

    const firstAccess = isFirstAccess(username);
    res.json({ firstAccess });
});

// Definir senha inicial
app.post("/api/set-initial-password", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Usuário e senha são obrigatórios" });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: "A senha deve ter no mínimo 6 caracteres" });
    }

    const success = await setInitialPassword(username, password);

    if (!success) {
        return res
            .status(400)
            .json({ error: "Não foi possível definir a senha. O usuário pode já ter uma senha configurada." });
    }

    res.json({ success: true, message: "Senha definida com sucesso! Faça login agora." });
});

app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Usuário e senha são obrigatórios" });
    }

    const result = await authenticateUser(username, password);

    if (!result) {
        return res.status(401).json({ error: "Usuário ou senha inválidos" });
    }

    // Definir cookie com token
    res.cookie("token", result.token, {
        httpOnly: false, // Permitir acesso via JavaScript para Socket.IO
        secure: false, // Permitir em HTTP (desenvolvimento)
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    });

    res.json({ success: true, username: result.username });
});

app.post("/api/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ success: true });
});

app.get("/api/me", authMiddleware, (req, res) => {
    res.json({ username: req.user.username });
});

// Trocar senha (rota protegida)
app.post("/api/change-password", authMiddleware, async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: "Senha atual e nova senha são obrigatórias" });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: "A nova senha deve ter no mínimo 6 caracteres" });
    }

    const result = await changePassword(req.user.username, oldPassword, newPassword);

    if (!result.success) {
        return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: "Senha alterada com sucesso!" });
});

// Servir arquivos estáticos (deve vir depois das rotas de API)
app.use(express.static(join(__dirname, "../../web/dist")));

// Estado do bot
let botStatus = "offline";
let botProcess = null;
let botStartTime = null;

// Interceptar console.log para capturar logs do bot
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Função para enviar log para o painel
const sendLogToPanel = (message, level = "info") => {
    // Evitar loop infinito não enviando logs do próprio servidor web
    if (
        message.includes("🌐 Servidor web") ||
        message.includes("Cliente conectado") ||
        message.includes("Cliente desconectado") ||
        message.includes("Servidor web rodando") ||
        message.includes("Painel de controle disponível")
    ) {
        return;
    }

    // Determinar o nível baseado em emojis e palavras-chave
    let logLevel = level;
    if (message.includes("✅") || message.includes("carregado:") || message.includes("conectado como")) {
        logLevel = "success";
    } else if (message.includes("❌") || message.includes("erro") || message.includes("Erro")) {
        logLevel = "error";
    } else if (message.includes("⚠️") || message.includes("Aviso")) {
        logLevel = "warning";
    }

    io.emit("bot-log", { message: String(message), level: logLevel });
};

// Sobrescrever console.log
console.log = (...args) => {
    const message = args.map(arg => (typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg))).join(" ");
    originalConsoleLog(...args);
    sendLogToPanel(message, "info");
};

// Sobrescrever console.error
console.error = (...args) => {
    const message = args.map(arg => (typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg))).join(" ");
    originalConsoleError(...args);

    // Não enviar logs de erro do próprio servidor
    if (!message.includes("Erro ao ler config.yml")) {
        sendLogToPanel(message, "error");
    }
};

// Sobrescrever console.warn
console.warn = (...args) => {
    const message = args.map(arg => (typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg))).join(" ");
    originalConsoleWarn(...args);
    sendLogToPanel(message, "warning");
};

// Função para carregar config.yml
const getConfigPath = () => join(__dirname, "../../config.yml");

const loadConfig = () => {
    try {
        return readFileSync(getConfigPath(), "utf8");
    } catch (error) {
        console.error("Erro ao ler config.yml:", error);
        return "";
    }
};

// Função para salvar config.yml
const saveConfig = content => {
    try {
        writeFileSync(getConfigPath(), content, "utf8");
        return true;
    } catch (error) {
        console.error("Erro ao salvar config.yml:", error);
        return false;
    }
};

// Função para obter métricas do sistema
const getMetrics = () => {
    const cpuUsage = process.cpuUsage();
    const memUsage = process.memoryUsage();

    // Calcular uptime do bot
    let uptime = "--";
    if (botStartTime && botStatus === "online") {
        const diff = Date.now() - botStartTime;
        const seconds = Math.floor(diff / 1000) % 60;
        const minutes = Math.floor(diff / (1000 * 60)) % 60;
        const hours = Math.floor(diff / (1000 * 60 * 60)) % 24;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days > 0) {
            uptime = `${days}d ${hours}h`;
        } else if (hours > 0) {
            uptime = `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            uptime = `${minutes}m ${seconds}s`;
        } else {
            uptime = `${seconds}s`;
        }
    }

    return {
        cpu: (cpuUsage.user / 1000000).toFixed(1), // em %
        ram: (memUsage.heapUsed / 1024 / 1024).toFixed(0), // em MB
        uptime: uptime,
    };
};

// Socket.IO com autenticação
io.use(socketAuthMiddleware);

io.on("connection", socket => {
    console.log("🔌 Cliente autenticado conectado:", socket.id, "- Usuário:", socket.user.username);

    // Enviar status inicial
    socket.emit("bot-status", botStatus);
    socket.emit("config-loaded", loadConfig());
    socket.emit("bot-log", { message: "Conectado ao painel de controle", level: "success" });

    // Receber solicitação de status
    socket.on("get-status", () => {
        socket.emit("bot-status", botStatus);
    });

    // Receber solicitação de config
    socket.on("get-config", () => {
        socket.emit("config-loaded", loadConfig());
    });

    // Função auxiliar para iniciar o bot
    const startBotProcess = async () => {
        if (botStatus === "offline") {
            try {
                botStatus = "starting";
                io.emit("bot-status", botStatus);
                io.emit("bot-log", { message: "Iniciando bot...", level: "info" });

                // Limpar cache do módulo para forçar reimportação
                const modulePath = "../index.js";
                const absolutePath = new URL(modulePath, import.meta.url).href;

                // Importar e iniciar o bot com timeout
                const { startBot } = await import(absolutePath + "?t=" + Date.now());

                // Adicionar timeout de 30 segundos
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Timeout ao conectar ao Discord")), 30000)
                );

                botProcess = await Promise.race([startBot(), timeoutPromise]);

                // Adicionar listeners de eventos do Discord
                if (botProcess) {
                    botProcess.on("error", error => {
                        io.emit("bot-log", { message: `❌ Erro no Discord: ${error.message}`, level: "error" });
                    });

                    botProcess.on("warn", info => {
                        io.emit("bot-log", { message: `⚠️  ${info}`, level: "warning" });
                    });

                    botProcess.on("disconnect", () => {
                        io.emit("bot-log", { message: "⚠️  Bot desconectado do Discord", level: "warning" });
                    });
                }

                botStatus = "online";
                botStartTime = Date.now();
                io.emit("bot-status", botStatus);
                io.emit("bot-log", { message: "Bot iniciado com sucesso!", level: "success" });
            } catch (error) {
                botStatus = "offline";
                io.emit("bot-status", botStatus);
                io.emit("bot-log", { message: `Erro ao iniciar: ${error.message}`, level: "error" });
                console.error("Erro detalhado:", error);
            }
        }
    };

    // Função auxiliar para parar o bot
    const stopBotProcess = async () => {
        if (botStatus === "online") {
            try {
                botStatus = "stopping";
                io.emit("bot-status", botStatus);
                io.emit("bot-log", { message: "Parando bot...", level: "info" });

                if (botProcess) {
                    await botProcess.destroy();
                    botProcess = null;
                }

                botStatus = "offline";
                botStartTime = null;
                io.emit("bot-status", botStatus);
                io.emit("bot-log", { message: "Bot parado.", level: "error" });
            } catch (error) {
                io.emit("bot-log", { message: `Erro ao parar: ${error.message}`, level: "error" });
            }
        }
    };

    // Iniciar bot
    socket.on("bot-start", startBotProcess);

    // Parar bot
    socket.on("bot-stop", stopBotProcess);

    // Reiniciar bot
    socket.on("bot-restart", async () => {
        io.emit("bot-log", { message: "Reiniciando bot...", level: "info" });

        // Parar o bot
        if (botProcess && botStatus === "online") {
            try {
                botStatus = "stopping";
                io.emit("bot-status", botStatus);

                await botProcess.destroy();
                botProcess = null;

                botStatus = "offline";
                io.emit("bot-status", botStatus);
                io.emit("bot-log", { message: "Bot desligado.", level: "info" });
            } catch (error) {
                io.emit("bot-log", { message: `Erro ao desligar: ${error.message}`, level: "error" });
            }
        }

        // Aguardar 2 segundos antes de reiniciar
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Iniciar novamente
        await startBotProcess();
    });

    // Salvar config
    socket.on("save-config", content => {
        const success = saveConfig(content);
        if (success) {
            io.emit("bot-log", { message: "config.yml salvo com sucesso!", level: "success" });
            io.emit("config-saved", { success: true });

            // Se o bot estiver online, avisar que precisa reiniciar
            if (botStatus === "online") {
                io.emit("bot-log", {
                    message: "⚠️  Reinicie o bot para aplicar as alterações.",
                    level: "warning",
                });
            }
        } else {
            io.emit("bot-log", { message: "Erro ao salvar config.yml", level: "error" });
            io.emit("config-saved", { success: false });
        }
    });

    socket.on("disconnect", () => {
        console.log("❌ Cliente desconectado:", socket.id);
    });
});

// Enviar métricas a cada 1 segundo
setInterval(() => {
    if (botStatus === "online") {
        io.emit("bot-metrics", getMetrics());
    }
}, 1000);

// API REST
app.get("/api/status", (req, res) => {
    res.json({ status: botStatus, metrics: getMetrics() });
});

app.get("/api/config", (req, res) => {
    res.json({ content: loadConfig() });
});

app.post("/api/config", (req, res) => {
    const { content } = req.body;
    const success = saveConfig(content);
    res.json({ success });
});

// Iniciar servidor
const PORT = process.env.WEB_PORT || 27015;
httpServer.listen(PORT, () => {
    console.log(`\n🌐 Servidor web rodando em http://localhost:${PORT}`);
    console.log(`🎮 Painel de controle disponível em http://localhost:3000\n`);
});

// Garantir que o bot seja desligado quando o servidor for encerrado
const gracefulShutdown = async () => {
    console.log("\n🛑 Encerrando servidor...");

    if (botProcess && botStatus === "online") {
        console.log("🤖 Desligando bot Discord...");
        try {
            await botProcess.destroy();
            console.log("✅ Bot desligado com sucesso");
        } catch (error) {
            console.error("❌ Erro ao desligar bot:", error);
        }
    }

    httpServer.close(() => {
        console.log("✅ Servidor encerrado");
        process.exit(0);
    });

    // Forçar encerramento após 5 segundos
    setTimeout(() => {
        console.error("⚠️  Forçando encerramento...");
        process.exit(1);
    }, 5000);
};

// Handlers de encerramento
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

export { botProcess, botStatus, io };
