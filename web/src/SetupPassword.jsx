import { Key, Lock } from "lucide-react";
import { useState } from "react";

const SetupPassword = ({ onPasswordSet }) => {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async e => {
        e.preventDefault();
        setError("");

        if (password.length < 6) {
            setError("A senha deve ter no mínimo 6 caracteres");
            return;
        }

        if (password !== confirmPassword) {
            setError("As senhas não coincidem");
            return;
        }

        setLoading(true);

        try {
            const response = await fetch("/api/set-initial-password", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ username: "admin", password }),
            });

            const data = await response.json();

            if (response.ok) {
                onPasswordSet();
            } else {
                setError(data.error || "Erro ao definir senha");
            }
        } catch (err) {
            setError("Erro de conexão com o servidor");
            console.error("Erro ao definir senha:", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg shadow-2xl p-8 border border-red-900/50">
                    {/* Logo/Título */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600 rounded-full mb-4">
                            <Key className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-3xl font-bold text-white mb-2">Primeiro Acesso</h1>
                        <p className="text-slate-400">Defina sua senha de administrador</p>
                    </div>

                    {/* Info Box */}
                    <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-4 mb-6">
                        <p className="text-blue-400 text-sm">
                            <strong>Importante:</strong> Esta será a senha de acesso ao painel. Guarde-a em local
                            seguro!
                        </p>
                    </div>

                    {/* Formulário */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Campo de Nova Senha */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                                Nova Senha
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="password"
                                    id="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full bg-slate-900/50 border border-slate-600 rounded-lg py-2.5 pl-11 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    placeholder="Digite sua senha (mín. 6 caracteres)"
                                    required
                                    minLength={6}
                                />
                            </div>
                        </div>

                        {/* Campo de Confirmar Senha */}
                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
                                Confirmar Senha
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="password"
                                    id="confirmPassword"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    className="w-full bg-slate-900/50 border border-slate-600 rounded-lg py-2.5 pl-11 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    placeholder="Digite a senha novamente"
                                    required
                                    minLength={6}
                                />
                            </div>
                        </div>

                        {/* Mensagem de Erro */}
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Botão de Confirmar */}
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
                                    Definindo...
                                </>
                            ) : (
                                "Definir Senha"
                            )}
                        </button>
                    </form>

                    {/* Rodapé */}
                    <div className="mt-6 text-center text-sm text-slate-500">
                        <p>
                            Usuário padrão: <strong className="text-slate-400">admin</strong>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SetupPassword;
