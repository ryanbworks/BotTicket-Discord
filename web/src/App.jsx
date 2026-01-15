import {
    Activity,
    Check,
    Clock,
    Copy,
    Cpu,
    FileCode,
    Globe,
    HardDrive,
    LayoutDashboard,
    LogOut,
    Play,
    RotateCcw,
    Save,
    Square,
    Terminal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Login from "./Login";

// --- COMPONENTES AUXILIARES ---

const MetricCard = ({ icon: Icon, label, value, subLabel, colorClass }) => (
    <div className="bg-[#16171d] p-3 md:p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
        <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Icon size={14} />
            <span className="text-[10px] md:text-xs font-semibold uppercase tracking-wider">{label}</span>
        </div>
        <div className="flex items-end justify-between">
            <span className={`text-lg md:text-xl font-bold ${colorClass || "text-white"}`}>{value}</span>
            {subLabel && <span className="text-[10px] text-slate-600 mb-1">{subLabel}</span>}
        </div>
    </div>
);

// --- COMPONENTE PRINCIPAL ---

const App = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [socket, setSocket] = useState(null);
    const [activeTab, setActiveTab] = useState("console");
    const [status, setStatus] = useState("offline");
    const [logs, setLogs] = useState([]);
    const [metrics, setMetrics] = useState({ cpu: 0, ram: 0, uptime: "--" });
    const [copied, setCopied] = useState(false);
    const [saved, setSaved] = useState(false);
    const [configContent, setConfigContent] = useState("");
    const scrollRef = useRef(null);
    const socketRef = useRef(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);

    // Verificar autenticação ao carregar
    useEffect(() => {
        const checkAuth = async () => {
            const isAuth = localStorage.getItem("isAuthenticated");
            if (isAuth === "true") {
                try {
                    const response = await fetch("/api/me", {
                        credentials: "include",
                    });

                    if (response.ok) {
                        const data = await response.json();
                        setCurrentUser(data.username);
                        setIsAuthenticated(true);
                    } else {
                        localStorage.removeItem("isAuthenticated");
                    }
                } catch (error) {
                    console.error("Erro ao verificar autenticação:", error);
                    localStorage.removeItem("isAuthenticated");
                }
            }
        };

        checkAuth();
    }, []);

    // Funções de autenticação
    const handleLoginSuccess = username => {
        setCurrentUser(username);
        setIsAuthenticated(true);
    };

    const handleLogout = async () => {
        try {
            await fetch("/api/logout", {
                method: "POST",
                credentials: "include",
            });
        } catch (error) {
            console.error("Erro ao fazer logout:", error);
        }

        localStorage.removeItem("isAuthenticated");
        setIsAuthenticated(false);
        setCurrentUser(null);

        if (socketRef.current) {
            socketRef.current.close();
            socketRef.current = null;
            setSocket(null);
        }
    };

    // Criar conexão Socket.IO após autenticação
    useEffect(() => {
        if (!isAuthenticated) return;

        // Conectar ao servidor Socket.IO com autenticação
        const socketUrl = window.location.origin.includes("3000") ? "http://localhost:3001" : window.location.origin;
        const newSocket = io(socketUrl, {
            withCredentials: true,
            auth: {
                token: document.cookie
                    .split("; ")
                    .find(row => row.startsWith("token="))
                    ?.split("=")[1],
            },
        });

        newSocket.on("connect_error", error => {
            console.error("Erro de conexão Socket.IO:", error);
            if (error.message === "Autenticação inválida") {
                handleLogout();
            }
        });

        socketRef.current = newSocket;
        setSocket(newSocket);

        return () => {
            newSocket.close();
        };
    }, [isAuthenticated]);

    // Socket.IO: Receber atualizações do servidor
    useEffect(() => {
        if (!socket) return;

        // Status do bot
        socket.on("bot-status", newStatus => {
            setStatus(newStatus);
        });

        // Logs do bot
        socket.on("bot-log", ({ message, level }) => {
            addLog(message, level);
        });

        // Métricas
        socket.on("bot-metrics", newMetrics => {
            setMetrics(newMetrics);
        });

        // Config carregado
        socket.on("config-loaded", content => {
            setConfigContent(content);
        });

        // Config salvo
        socket.on("config-saved", ({ success }) => {
            if (success) {
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            }
        });

        // Solicitar status inicial
        socket.emit("get-status");
        socket.emit("get-config");

        return () => {
            socket.off("bot-status");
            socket.off("bot-log");
            socket.off("bot-metrics");
            socket.off("config-loaded");
            socket.off("config-saved");
        };
    }, [socket]);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [logs, activeTab]);

    const addLog = (msg, level = "info") => {
        const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setLogs(prev => [...prev, { timestamp, msg, level }]);
    };

    const startBot = () => {
        if (!socket) return;
        socket.emit("bot-start");
        addLog("Solicitando inicialização do bot...", "info");
    };

    const stopBot = () => {
        if (!socket) return;
        socket.emit("bot-stop");
        addLog("Solicitando parada do bot...", "info");
    };

    const restartBot = () => {
        if (!socket) return;
        socket.emit("bot-restart");
        addLog("Solicitando reinicialização do bot...", "info");
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(configContent);
        setCopied(true);
        addLog("Conteúdo do config.yml copiado para a área de transferência.", "info");
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSave = () => {
        if (!socket) return;
        socket.emit("save-config", configContent);
        addLog("Salvando config.yml...", "info");
    };

    // Renderização condicional (DEPOIS de todos os hooks)
    if (!isAuthenticated) {
        return <Login onLoginSuccess={handleLoginSuccess} />;
    }

    if (!socket) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-slate-900 flex items-center justify-center">
                <div className="text-white text-xl">Conectando...</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row h-screen bg-[#0d0e12] text-slate-300 font-sans overflow-hidden">
            {/* SIDEBAR (PC) */}
            <aside className="hidden md:flex w-64 bg-[#16171d] border-r border-slate-800 flex-col">
                <div className="p-6 flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-red-500/20">
                        <Globe size={18} className="text-white" />
                    </div>
                    <span className="font-bold text-white tracking-tight">FOZ RP Panel</span>
                </div>
                <nav className="flex-1 px-4 space-y-2 mt-4">
                    <button
                        onClick={() => setActiveTab("console")}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                            activeTab === "console"
                                ? "bg-red-600/10 text-red-400 border border-red-500/20"
                                : "hover:bg-slate-800"
                        }`}
                    >
                        <LayoutDashboard size={18} /> Consola
                    </button>
                    <button
                        onClick={() => setActiveTab("settings")}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                            activeTab === "settings"
                                ? "bg-red-600/10 text-red-400 border border-red-500/20"
                                : "hover:bg-slate-800"
                        }`}
                    >
                        <FileCode size={18} /> config.yml
                    </button>
                </nav>

                {/* Logout no Sidebar */}
                <div className="p-4 border-t border-slate-800 space-y-2">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-slate-400">Logado como:</span>
                        <span className="text-sm font-semibold text-white">{currentUser}</span>
                    </div>
                    <button
                        onClick={() => setShowPasswordModal(true)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors text-sm"
                    >
                        <Key size={16} />
                        Alterar Senha
                    </button>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 rounded-lg transition-colors text-sm"
                    >
                        <LogOut size={16} />
                        Sair
                    </button>
                </div>
            </aside>

            {/* MOBILE HEADER */}
            <header className="md:hidden flex items-center justify-between p-4 bg-[#16171d] border-b border-slate-800 z-20">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
                        <Globe size={16} className="text-white" />
                    </div>
                    <h1 className="font-bold text-white">FOZ RP Panel</h1>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-2 py-1 bg-black/30 rounded-full border border-slate-700">
                        <div
                            className={`w-2 h-2 rounded-full ${
                                status === "online" ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                            }`}
                        ></div>
                        <span className="text-[10px] font-medium uppercase">{status}</span>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="text-slate-400 hover:text-red-400 transition-colors"
                        title="Sair"
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </header>

            {/* CONTEÚDO PRINCIPAL */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* DESKTOP HEADER */}
                <header className="hidden md:flex items-center justify-between p-6 bg-[#16171d] border-b border-slate-800">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
                        <p className="text-sm text-slate-500">Painel de controle do bot FOZ RP</p>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-black/30 rounded-full border border-slate-700">
                        <div
                            className={`w-2 h-2 rounded-full ${
                                status === "online" ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                            }`}
                        ></div>
                        <span className="text-xs font-medium uppercase">{status}</span>
                    </div>
                </header>

                {/* MAIN CONTENT */}
                <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 space-y-4 md:space-y-6">
                    {/* Métricas (Sempre visíveis) */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
                        <MetricCard
                            icon={Activity}
                            label="Estado"
                            value={status === "online" ? "ON" : "OFF"}
                            colorClass={status === "online" ? "text-emerald-400" : "text-rose-400"}
                        />
                        <MetricCard icon={Clock} label="Uptime" value={status === "online" ? metrics.uptime : "--"} />
                        <MetricCard icon={Cpu} label="CPU" value={`${metrics.cpu}%`} />
                        <MetricCard icon={HardDrive} label="RAM" value={metrics.ram} subLabel="MB" />
                    </div>

                    {activeTab === "console" && (
                        <div className="flex flex-col gap-4 h-full">
                            {/* Controles do Bot */}
                            <div className="grid grid-cols-3 gap-2 md:flex md:gap-4">
                                <button
                                    onClick={startBot}
                                    disabled={status !== "offline"}
                                    className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 bg-emerald-600/90 active:bg-emerald-700 disabled:opacity-30 disabled:cursor-not-allowed text-white p-3 rounded-xl font-bold transition shadow-lg shadow-emerald-900/10 text-xs md:text-sm"
                                >
                                    <Play size={20} fill="currentColor" /> <span>Iniciar</span>
                                </button>
                                <button
                                    onClick={restartBot}
                                    disabled={status === "offline"}
                                    className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 bg-amber-600/90 active:bg-amber-700 disabled:opacity-30 disabled:cursor-not-allowed text-white p-3 rounded-xl font-bold transition text-xs md:text-sm"
                                >
                                    <RotateCcw size={20} /> <span>Reiniciar</span>
                                </button>
                                <button
                                    onClick={stopBot}
                                    disabled={status === "offline"}
                                    className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 bg-rose-600/90 active:bg-rose-700 disabled:opacity-30 disabled:cursor-not-allowed text-white p-3 rounded-xl font-bold transition text-xs md:text-sm"
                                >
                                    <Square size={20} fill="currentColor" /> <span>Parar</span>
                                </button>
                            </div>

                            {/* Terminal */}
                            <div className="flex-1 min-h-[300px] md:min-h-0 bg-black rounded-xl border border-slate-800 flex flex-col overflow-hidden shadow-inner">
                                <div className="bg-[#16171d] px-3 py-2 border-b border-slate-800 flex items-center justify-between">
                                    <span className="text-[10px] text-slate-500 font-mono">root@fozrp:~</span>
                                    <button
                                        onClick={() => setLogs([])}
                                        className="text-[10px] text-slate-400 uppercase p-1"
                                    >
                                        Limpar
                                    </button>
                                </div>
                                <div
                                    ref={scrollRef}
                                    className="flex-1 p-3 font-mono text-xs md:text-sm overflow-y-auto custom-scrollbar break-all"
                                >
                                    {logs.length === 0 && (
                                        <p className="text-slate-700 italic text-center mt-10">
                                            À espera de comandos...
                                        </p>
                                    )}
                                    {logs.map((log, i) => (
                                        <div key={i} className="mb-1.5 leading-snug">
                                            <span className="text-slate-600 text-[10px] block md:inline md:mr-2">
                                                {log.timestamp}
                                            </span>
                                            <span
                                                className={` ${
                                                    log.level === "success"
                                                        ? "text-emerald-400"
                                                        : log.level === "error"
                                                        ? "text-rose-400"
                                                        : "text-blue-300"
                                                } `}
                                            >
                                                {log.msg}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "settings" && (
                        <div className="flex flex-col gap-4 pb-20 animate-in fade-in duration-300 h-full">
                            {/* Barra de Ferramentas do Editor */}
                            <div className="flex items-center justify-between bg-[#16171d] p-3 rounded-xl border border-slate-800 sticky top-0 z-10 shadow-lg">
                                <div className="flex items-center gap-2">
                                    <FileCode size={18} className="text-red-500" />
                                    <span className="text-sm font-bold text-white">config.yml</span>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleCopy}
                                        className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-xs font-medium transition"
                                    >
                                        {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                        <span className="hidden md:inline">{copied ? "Copiado!" : "Copiar"}</span>
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={saved}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg transition text-xs font-bold ${
                                            saved
                                                ? "bg-emerald-600 text-white shadow-emerald-500/20"
                                                : "bg-red-600 hover:bg-red-500 text-white shadow-red-500/20"
                                        }`}
                                    >
                                        {saved ? <Check size={16} /> : <Save size={16} />}
                                        <span>{saved ? "Salvo!" : "Salvar"}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Aviso de Reinicialização */}
                            {saved && (
                                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3 animate-in fade-in duration-300">
                                    <div className="text-amber-400 mt-0.5">⚠️</div>
                                    <div className="flex-1">
                                        <p className="text-amber-300 font-medium text-sm">
                                            Configuração salva com sucesso!
                                        </p>
                                        <p className="text-amber-200/70 text-xs mt-1">
                                            É necessário reiniciar o bot para aplicar as alterações.
                                        </p>
                                    </div>
                                    {status === "online" && (
                                        <button
                                            onClick={restartBot}
                                            className="bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
                                        >
                                            Reiniciar Agora
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Editor de Texto Simples (TextArea) */}
                            <div className="flex-1 relative">
                                <textarea
                                    value={configContent}
                                    onChange={e => setConfigContent(e.target.value)}
                                    className="w-full h-[70vh] md:h-full bg-[#16171d] p-4 rounded-xl border border-slate-800 font-mono text-xs md:text-sm text-red-100 outline-none focus:ring-1 focus:ring-red-500/50 resize-none leading-relaxed"
                                    spellCheck="false"
                                />
                                <div className="absolute bottom-4 right-4 text-[10px] text-slate-600 pointer-events-none bg-[#16171d]/80 px-2 py-1 rounded">
                                    {configContent.length} caracteres
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {/* NAVBAR MOBILE */}
            <nav className="md:hidden fixed bottom-0 left-0 w-full bg-[#16171d] border-t border-slate-800 flex justify-around items-center px-2 py-2 pb-safe z-30 shadow-2xl">
                <button
                    onClick={() => setActiveTab("console")}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl w-20 transition ${
                        activeTab === "console" ? "text-red-400 bg-red-500/10" : "text-slate-500"
                    }`}
                >
                    <Terminal size={20} />
                    <span className="text-[10px] font-medium">Consola</span>
                </button>
                <div className="relative -top-6">
                    <button
                        onClick={status === "offline" ? startBot : stopBot}
                        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg border-4 border-[#0d0e12] transition-all transform active:scale-95 ${
                            status === "offline" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
                        }`}
                    >
                        {status === "offline" ? (
                            <Play size={24} fill="currentColor" className="ml-1" />
                        ) : (
                            <Square size={24} fill="currentColor" />
                        )}
                    </button>
                </div>
                <button
                    onClick={() => setActiveTab("settings")}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl w-20 transition ${
                        activeTab === "settings" ? "text-red-400 bg-red-500/10" : "text-slate-500"
                    }`}
                >
                    <FileCode size={20} />
                    <span className="text-[10px] font-medium">Config</span>
                </button>
            </nav>

            <style
                dangerouslySetInnerHTML={{
                    __html: ` 
        .pb-safe { padding-bottom: env(safe-area-inset-bottom); } 
        .custom-scrollbar::-webkit-scrollbar { width: 4px; } 
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } 
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; } 
      `,
                }}
            />

            {/* Modal de Alterar Senha */}
            <ChangePasswordModal
                isOpen={showPasswordModal}
                onClose={() => setShowPasswordModal(false)}
                currentUser={currentUser}
            />
        </div>
    );
};

export default App;
