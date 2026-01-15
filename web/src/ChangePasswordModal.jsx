import { Lock, X } from "lucide-react";
import { useState } from "react";

const ChangePasswordModal = ({ isOpen, onClose, currentUser }) => {
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async e => {
        e.preventDefault();
        setError("");
        setSuccess(false);

        if (newPassword.length < 6) {
            setError("A nova senha deve ter no mínimo 6 caracteres");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("As novas senhas não coincidem");
            return;
        }

        setLoading(true);

        try {
            const response = await fetch("/api/change-password", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ oldPassword, newPassword }),
                credentials: "include",
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess(true);
                setOldPassword("");
                setNewPassword("");
                setConfirmPassword("");
                setTimeout(() => {
                    onClose();
                    setSuccess(false);
                }, 2000);
            } else {
                setError(data.error || "Erro ao alterar senha");
            }
        } catch (err) {
            setError("Erro de conexão com o servidor");
            console.error("Erro ao alterar senha:", err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
                            <Lock size={20} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Alterar Senha</h3>
                            <p className="text-xs text-slate-400">Usuário: {currentUser}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-slate-700"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Senha Atual */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Senha Atual</label>
                        <input
                            type="password"
                            value={oldPassword}
                            onChange={e => setOldPassword(e.target.value)}
                            className="w-full bg-slate-900/50 border border-slate-600 rounded-lg py-2.5 px-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                            placeholder="Digite sua senha atual"
                            required
                            disabled={loading || success}
                        />
                    </div>

                    {/* Nova Senha */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Nova Senha</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            className="w-full bg-slate-900/50 border border-slate-600 rounded-lg py-2.5 px-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                            placeholder="Digite a nova senha (mín. 6 caracteres)"
                            required
                            minLength={6}
                            disabled={loading || success}
                        />
                    </div>

                    {/* Confirmar Nova Senha */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Confirmar Nova Senha</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            className="w-full bg-slate-900/50 border border-slate-600 rounded-lg py-2.5 px-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                            placeholder="Digite a nova senha novamente"
                            required
                            minLength={6}
                            disabled={loading || success}
                        />
                    </div>

                    {/* Mensagens */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="bg-emerald-500/10 border border-emerald-500/50 rounded-lg p-3 text-emerald-400 text-sm">
                            ✓ Senha alterada com sucesso!
                        </div>
                    )}

                    {/* Botões */}
                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2.5 px-4 rounded-lg transition"
                            disabled={loading}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading || success}
                            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg transition flex items-center justify-center"
                        >
                            {loading ? (
                                <>
                                    <svg
                                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
                                    Alterando...
                                </>
                            ) : (
                                "Alterar Senha"
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ChangePasswordModal;
