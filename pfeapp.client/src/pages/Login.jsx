import { useState } from "react";

const COLORS = {
    violet: "#3B1F8C",
    violetDark: "#2A1566",
    violetLight: "#5B3FBC",
    red: "#C8102E",
    redDark: "#A00D25",
};

export default function Login({ onLogin }) {
    const [step, setStep] = useState("email"); // "email" | "password"
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPwd, setShowPwd] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleEmailNext = () => {
        const trimmed = email.trim().toLowerCase();
        if (!trimmed.includes("@")) {
            setError("Entrez une adresse e-mail valide.");
            return;
        }
        if (!trimmed.endsWith("@tandem.tn")) {
            setError("Veuillez utiliser votre adresse @tandem.tn");
            return;
        }
        setError("");
        setStep("password");
    };

    const handleLogin = async () => {
        if (!password) { setError("Entrez votre mot de passe."); return; }
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), password }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setError(data.message || "Email ou mot de passe incorrect.");
                setLoading(false);
                return;
            }
            onLogin(data);
        } catch {
            setError("Erreur de connexion au serveur.");
            setLoading(false);
        }
    };

    return (
        <div style={{
            width: "100vw", minHeight: "100vh", display: "flex",
            fontFamily: "'Segoe UI', sans-serif",
            position: "relative", overflow: "hidden", background: "#0a0a1a",
        }}>
            {/* Fond décoratif */}
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${COLORS.violetDark}ee 0%, ${COLORS.violet}cc 40%, #1a0a3a99 70%, #0a0a1a 100%)`, zIndex: 1 }} />
            <div style={{ position: "absolute", inset: 0, zIndex: 2, backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`, backgroundSize: "60px 60px" }} />
            <div style={{ position: "absolute", top: "-200px", left: "-200px", width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle, ${COLORS.violetLight}33 0%, transparent 70%)`, zIndex: 2 }} />
            <div style={{ position: "absolute", bottom: "-150px", right: "30%", width: 400, height: 400, borderRadius: "50%", background: `radial-gradient(circle, ${COLORS.red}22 0%, transparent 70%)`, zIndex: 2 }} />

            <div style={{ position: "relative", zIndex: 10, display: "flex", width: "100%", minHeight: "100vh" }}>

                {/* Gauche — branding */}
                <div style={{ flex: 1.2, display: "flex", flexDirection: "column", justifyContent: "center", padding: "4rem 5rem", color: "#fff" }}>
                    <div style={{ marginBottom: "3rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                            <div style={{ width: 52, height: 52, borderRadius: 12, background: `linear-gradient(135deg, ${COLORS.red}, ${COLORS.redDark})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: 900, color: "#fff", boxShadow: `0 4px 20px ${COLORS.red}66` }}>D</div>
                            <div>
                                <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#fff" }}>Dynamix Services</div>
                                <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Business Intelligence & Analytics</div>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginBottom: "2rem" }}>
                        <div style={{ display: "inline-block", background: `linear-gradient(90deg, ${COLORS.red}, ${COLORS.violetLight})`, borderRadius: 4, padding: "4px 12px", fontSize: "0.75rem", fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
                            Plateforme BI & Intelligence Artificielle
                        </div>
                        <h1 style={{ margin: 0, fontSize: "3.5rem", fontWeight: 900, lineHeight: 1.1, color: "#fff" }}>
                            Tandem
                            <span style={{ display: "block", background: `linear-gradient(90deg, ${COLORS.red}, #ff6b8a)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Logistics</span>
                            <span style={{ fontSize: "2rem", color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>Analytics Hub</span>
                        </h1>
                    </div>

                    <p style={{ fontSize: "1rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.7, maxWidth: 480 }}>
                        Pilotez votre performance logistique et financière grâce à une plateforme intégrée de Business Intelligence, d'ETL automatisé et de prédiction par Intelligence Artificielle.
                    </p>
                </div>

                {/* Droite — formulaire */}
                <div style={{ width: 480, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", background: "rgba(255,255,255,0.03)", backdropFilter: "blur(20px)", borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ width: "100%", maxWidth: 400, background: "#fff", borderRadius: 16, padding: "2.5rem", boxShadow: "0 25px 60px rgba(0,0,0,0.4)" }}>

                        {/* Header */}
                        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
                            <div style={{ width: 56, height: 56, borderRadius: 14, background: `linear-gradient(135deg, ${COLORS.violet}, ${COLORS.violetLight})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", margin: "0 auto 1rem", boxShadow: `0 8px 24px ${COLORS.violet}44` }}>🔐</div>
                            <h2 style={{ margin: "0 0 0.25rem", fontSize: "1.3rem", fontWeight: 800, color: COLORS.violetDark }}>
                                {step === "email" ? "Connexion" : "Mot de passe"}
                            </h2>
                            <p style={{ margin: 0, fontSize: "0.82rem", color: "#6b7280" }}>
                                {step === "email" ? "Espace analytique Tandem Logistics" : email}
                            </p>
                        </div>

                        {/* Étape email */}
                        {step === "email" && (
                            <>
                                <div style={{ marginBottom: "1.25rem" }}>
                                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#374151", marginBottom: "0.375rem" }}>
                                        Adresse e-mail professionnelle
                                    </label>
                                    <input
                                        type="email" value={email} autoFocus
                                        onChange={(e) => { setEmail(e.target.value); setError(""); }}
                                        onKeyDown={(e) => e.key === "Enter" && handleEmailNext()}
                                        placeholder="prenom@tandem.tn"
                                        style={{ width: "100%", padding: "0.625rem 0.875rem", border: `1.5px solid ${error ? "#dc2626" : "#d1d5db"}`, borderRadius: 8, fontSize: "0.9rem", outline: "none", boxSizing: "border-box", fontFamily: "'Segoe UI', sans-serif" }}
                                    />
                                    {error && <div style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: "0.375rem" }}>⚠️ {error}</div>}
                                </div>

                                {/* Badge domaine */}
                                <div style={{ marginBottom: "1.5rem", padding: "0.625rem 0.875rem", background: "#f0f7ff", borderRadius: 8, border: "1px solid #bfdbfe", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    <span style={{ fontSize: "0.9rem" }}>🏢</span>
                                    <span style={{ fontSize: "0.78rem", color: "#1e40af" }}>Utilisez votre adresse <strong>@tandem.tn</strong></span>
                                </div>

                                <button onClick={handleEmailNext}
                                    style={{ width: "100%", padding: "0.75rem", background: COLORS.violet, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: "0.9rem", cursor: "pointer" }}>
                                    Suivant →
                                </button>
                            </>
                        )}

                        {/* Étape mot de passe */}
                        {step === "password" && (
                            <>
                                {/* Chip email */}
                                <div onClick={() => { setStep("email"); setError(""); }}
                                    style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.875rem", border: "1.5px solid #e5e7eb", borderRadius: 20, cursor: "pointer", marginBottom: "1.25rem", width: "fit-content" }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = "#f9fafb"}
                                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                                    <span style={{ fontSize: "0.85rem" }}>👤</span>
                                    <span style={{ fontSize: "0.82rem", color: "#374151" }}>{email}</span>
                                    <span style={{ fontSize: "0.7rem", color: "#9ca3af" }}>✕</span>
                                </div>

                                <div style={{ marginBottom: "1.25rem", position: "relative" }}>
                                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#374151", marginBottom: "0.375rem" }}>Mot de passe</label>
                                    <input
                                        type={showPwd ? "text" : "password"} value={password} autoFocus
                                        onChange={(e) => { setPassword(e.target.value); setError(""); }}
                                        onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                                        placeholder="••••••••"
                                        style={{ width: "100%", padding: "0.625rem 2.5rem 0.625rem 0.875rem", border: `1.5px solid ${error ? "#dc2626" : "#d1d5db"}`, borderRadius: 8, fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
                                    />
                                    <span onClick={() => setShowPwd(!showPwd)}
                                        style={{ position: "absolute", right: "0.875rem", top: "2rem", cursor: "pointer", fontSize: "1rem", color: "#6b7280" }}>
                                        {showPwd ? "🙈" : "👁️"}
                                    </span>
                                    {error && <div style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: "0.375rem" }}>⚠️ {error}</div>}
                                </div>

                                <button onClick={handleLogin} disabled={loading}
                                    style={{ width: "100%", padding: "0.75rem", background: loading ? "#9ca3af" : COLORS.violet, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: "0.9rem", cursor: loading ? "not-allowed" : "pointer" }}>
                                    {loading ? "⏳ Connexion..." : "Se connecter"}
                                </button>
                            </>
                        )}

                        {/* Footer */}
                        <div style={{ marginTop: "1.5rem", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                            <div style={{ width: 5, height: 5, borderRadius: "50%", background: COLORS.red }} />
                            <span style={{ fontSize: "0.7rem", color: "#9ca3af" }}>Dynamix Services · Tandem Logistics</span>
                            <div style={{ width: 5, height: 5, borderRadius: "50%", background: COLORS.violet }} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}