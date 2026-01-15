import { Lock, User } from "lucide-react";
import { useEffect, useState } from "react";
import SetupPassword from "./SetupPassword";

const Login = ({ onLoginSuccess }) => {
    const [username, setUsername] = useState("admin");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [isFirstAccess, setIsFirstAccess] = useState(null);
    const [checkingAccess, setCheckingAccess] = useState(true);

    // Verificar se é primeiro acesso
    useEffect(() => {
        checkFirstAccess();
    }, []);

    const checkFirstAccess = async () => {
        try {
            const response = await fetch("/api/check-first-access", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ username: "admin" }),
            });

            const data = await response.json();
            setIsFirstAccess(data.firstAccess);
        } catch (err) {
            console.error("Erro ao verificar primeiro acesso:", err);
            setIsFirstAccess(false);
        } finally {
            setCheckingAccess(false);
        }
    };

    const handlePasswordSet = () => {
        setIsFirstAccess(false);
        setError("");
    };

    const handleSubmit = async e => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const response = await fetch("/api/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ username, password }),
                credentials: "include",
            });

            const data = await response.json();

            if (response.ok) {
                // Salvar token no localStorage também (para verificação no cliente)
                localStorage.setItem("isAuthenticated", "true");
                onLoginSuccess(data.username);
            } else {
                setError(data.error || "Erro ao fazer login");
            }
        } catch (err) {
            setError("Erro de conexão com o servidor");
            console.error("Erro ao fazer login:", err);
        } finally {
            setLoading(false);
        }
    };

    // Mostrar loading enquanto verifica
    if (checkingAccess) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-slate-900 flex items-center justify-center">
                <div className="text-white">
                    <svg
                        className="animate-spin h-8 w-8 mx-auto"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                        ></circle>
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                    </svg>
                </div>
            </div>
        );
    }

    // Se for primeiro acesso, mostrar tela de configuração
    if (isFirstAccess) {
        return <SetupPassword onPasswordSet={handlePasswordSet} />;
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg shadow-2xl p-8 border border-red-900/50">
                    {/* Logo/Título */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600 rounded-full mb-4">
                            <Lock className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-3xl font-bold text-white mb-2">FOZ RP</h1>
                        <p className="text-slate-400">Painel de Controle</p>
                    </div>

                    {/* Formulário */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Campo de Usuário */}
                        <div>
                            <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-2">
                                Usuário
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="text"
                                    id="username"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    className="w-full bg-slate-900/50 border border-slate-600 rounded-lg py-2.5 pl-11 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    placeholder="Digite seu usuário"
                                    required
                                    autoComplete="username"
                                />
                            </div>
                        </div>

                        {/* Campo de Senha */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                                Senha
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="password"
                                    id="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full bg-slate-900/50 border border-slate-600 rounded-lg py-2.5 pl-11 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    placeholder="Digite sua senha"
                                    required
                                    autoComplete="current-password"
                                />
                            </div>
                        </div>

                        {/* Mensagem de Erro */}
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Botão de Login */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center"
                        >
                            {loading ? (
                                <>
                                    <svg
                                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                    >
                                        <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                        ></circle>
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        ></path>
                                    </svg>
                                    Entrando...
                                </>
                            ) : (
                                "Entrar"
                            )}
                        </button>
                    </form>

                    {/* Rodapé */}
                    <div className="mt-6 text-center text-sm text-slate-500">
                        <p>Apenas administradores têm acesso</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
