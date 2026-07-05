import { useState } from "react";

const COLORS = {
    violet: "#3B1F8C",
    violetDark: "#2A1566",
    red: "#C8102E",
};

export default function ResetPassword() {
    const token = new URLSearchParams(window.location.search).get("token") || "";
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [message, setMessage] = useState("");
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (password.length < 6) { setMessage("Le mot de passe doit contenir au moins 6 caractères."); return; }
        if (password !== confirm) { setMessage("Les mots de passe ne correspondent pas."); return; }

        setLoading(true);
        setMessage("");
        try {
            const res = await fetch("/api/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, newPassword: password }),
            });
            const data = await res.json();
            if (!res.ok) {
                setMessage(data.message || "Lien invalide ou expiré.");
                return;
            }
            setSuccess(true);
            setMessage(data.message);
        } catch {
            setMessage("Erreur de connexion au serveur.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            width: "100vw", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Segoe UI', sans-serif", background: "#0a0a1a",
        }}>
            <div style={{ width: "100%", maxWidth: 400, background: "#fff", borderRadius: 16, padding: "2.5rem", boxShadow: "0 25px 60px rgba(0,0,0,0.4)" }}>
                <div style={{ textAlign: "center", marginBottom: "2rem" }}>
                    <div style={{ width: 56, height: 56, borderRadius: 14, background: `linear-gradient(135deg, ${COLORS.violet}, #5B3FBC)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", margin: "0 auto 1rem" }}>🔑</div>
                    <h2 style={{ margin: "0 0 0.25rem", fontSize: "1.3rem", fontWeight: 800, color: COLORS.violetDark }}>Réinitialiser le mot de passe</h2>
                </div>

                {!token && (
                    <div style={{ color: COLORS.red, fontSize: "0.85rem", textAlign: "center" }}>
                        Lien invalide — aucun token trouvé dans l'URL.
                    </div>
                )}

                {token && !success && (
                    <>
                        <div style={{ marginBottom: "1.25rem" }}>
                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#374151", marginBottom: "0.375rem" }}>Nouveau mot de passe</label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                style={{ width: "100%", padding: "0.625rem 0.875rem", border: "1.5px solid #d1d5db", borderRadius: 8, fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }} />
                        </div>
                        <div style={{ marginBottom: "1.25rem" }}>
                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#374151", marginBottom: "0.375rem" }}>Confirmer le mot de passe</label>
                            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                                style={{ width: "100%", padding: "0.625rem 0.875rem", border: "1.5px solid #d1d5db", borderRadius: 8, fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }} />
                        </div>
                        {message && <div style={{ color: COLORS.red, fontSize: "0.8rem", marginBottom: "1rem" }}>{message}</div>}
                        <button onClick={handleSubmit} disabled={loading}
                            style={{ width: "100%", padding: "0.75rem", background: loading ? "#9ca3af" : COLORS.violet, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: "0.9rem", cursor: loading ? "not-allowed" : "pointer" }}>
                            {loading ? "⏳ Envoi..." : "Réinitialiser"}
                        </button>
                    </>
                )}

                {success && (
                    <div style={{ textAlign: "center" }}>
                        <div style={{ color: "#16a34a", fontWeight: 600, marginBottom: "1rem" }}>✅ {message}</div>
                        <a href="/" style={{ color: COLORS.violet, fontSize: "0.85rem", fontWeight: 600 }}>Retour à la connexion</a>
                    </div>
                )}
            </div>
        </div>
    );
}
