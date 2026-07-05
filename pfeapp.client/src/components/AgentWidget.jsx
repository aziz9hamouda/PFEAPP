import { useState, useRef, useEffect } from "react";
import { apiFetch } from "../lib/api";

const COLORS = {
    violet: "#3B1F8C",
    red: "#C8102E",
    lightViolet: "#EDE9F8",
};

const DASHBOARD_LABELS = {
    home: "Accueil",
    finance: "KPIs Financiers",
    commercial: "Performance Commerciale",
    frais: "Analyse Frais Dossiers",
    logistique: "Suivi Logistique",
    balance: "Balance Comptable",
};

const QUICK_QUESTIONS = {
    finance: ["Quel est le CA total ?", "Évolution mensuelle du CA ?", "Top article vendu ?", "Top pays par CA ?"],
    commercial: ["Top 5 clients ?", "Taux de rétention clients ?"],
    frais: ["Marge moyenne des dossiers ?", "Nombre de dossiers ?"],
    logistique: ["Nombre de bookings ?", "Top navires ?"],
    balance: ["Total débit/crédit ?", "Solde net par nature comptable ?"],
    home: ["Analyse ce dashboard", "Quel est le CA total ?"],
};

const ETL_PACKAGE_LABELS = {
    dimensions: "Dimensions",
    faits: "Faits",
    master: "Master (alimentation complète)",
};

const ACTION_ICONS = {
    etl: "⚙️",
    analyse_dashboard: "📊",
    ask_dashboard: "📋",
    ask_etl_package: "⚙️",
    list: "📋",
    hors_scope: "🚫",
    chat: "💬",
};

const ROLE_GUIDES = {
    CEO: "👋 Bienvenue ! En tant que **Directeur Général**, vous avez accès à :\n\n" +
        "📊 Tous les dashboards Power BI (Finance, Commercial, Frais, Logistique, Balance)\n" +
        "🔮 Prédiction de marge\n🎯 Segmentation clients\n\n" +
        "Posez-moi une question sur un dashboard ou demandez une prédiction !",
    LOG: "👋 Bienvenue ! En tant que **Directeur Logistique**, vous avez accès à :\n\n" +
        "📊 Dashboards Frais Dossiers et Suivi Logistique\n🔮 Prédiction de marge\n\n" +
        "Posez-moi vos questions sur ces dashboards !",
    ADMIN: "👋 Bienvenue ! En tant qu'**Administrateur**, vous gérez :\n\n" +
        "👥 Gestion des utilisateurs (activer/désactiver)\n" +
        "⚙️ Historique et exécution des packages ETL\n🧠 Suivi des modèles ML\n\n" +
        "Vous avez aussi accès à tous les dashboards et outils métier.",
};

function formatTime() {
    return new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function ChatMessage({ msg, onPickDashboard, onPickPackage }) {
    const isUser = msg.role === "user";
    const dashboards = msg.actionType === "ask_dashboard" ? msg.data?.dashboards ?? [] : [];
    const packages = msg.actionType === "ask_etl_package" ? msg.data?.packages ?? [] : [];

    return (
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: "0.75rem" }}>
            {!isUser && (
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg, ${COLORS.violet}, #5B3FBC)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", flexShrink: 0 }}>🤖</div>
            )}
            <div style={{
                maxWidth: "80%", padding: "0.625rem 0.875rem",
                background: isUser ? COLORS.violet : "#fff",
                color: isUser ? "#fff" : "#1f2937",
                borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                fontSize: "0.82rem", lineHeight: 1.5,
                boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                border: isUser ? "none" : "1px solid #e5e7eb",
            }}>
                {!isUser && msg.actionType && !["chat", "list", "ask_dashboard", "ask_etl_package"].includes(msg.actionType) && (
                    <div style={{ fontSize: "0.68rem", fontWeight: 700, color: COLORS.violet, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.375rem" }}>
                        {ACTION_ICONS[msg.actionType]} Action
                    </div>
                )}
                <div style={{ whiteSpace: "pre-wrap" }}>
                    {msg.content.split(/\*\*(.*?)\*\*/g).map((part, i) =>
                        i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                    )}
                </div>
                {dashboards.length > 0 && (
                    <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                        {dashboards.map((d) => (
                            <button key={d} onClick={() => onPickDashboard(d)}
                                style={{ padding: "3px 10px", borderRadius: 12, background: COLORS.lightViolet, color: COLORS.violet, border: "none", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>
                                {DASHBOARD_LABELS[d] ?? d}
                            </button>
                        ))}
                    </div>
                )}
                {packages.length > 0 && (
                    <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                        {packages.map((p) => (
                            <button key={p} onClick={() => onPickPackage(p)}
                                style={{ padding: "3px 10px", borderRadius: 12, background: COLORS.lightViolet, color: COLORS.violet, border: "none", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>
                                {ETL_PACKAGE_LABELS[p] ?? p}
                            </button>
                        ))}
                    </div>
                )}
                {!isUser && msg.actionType && !["chat", "list", "hors_scope", "ask_dashboard", "ask_etl_package"].includes(msg.actionType) && (
                    <div style={{ marginTop: "0.375rem", display: "inline-block", padding: "1px 7px", borderRadius: 8, background: msg.success ? "#dcfce7" : "#fee2e2", color: msg.success ? "#16a34a" : "#dc2626", fontSize: "0.68rem", fontWeight: 600 }}>
                        {msg.success ? "✅ OK" : "❌ Échec"}
                    </div>
                )}
                <div style={{ fontSize: "0.65rem", color: isUser ? "rgba(255,255,255,0.6)" : "#9ca3af", textAlign: "right", marginTop: "0.25rem" }}>{msg.time}</div>
            </div>
            {isUser && (
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: COLORS.red, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", flexShrink: 0 }}>👤</div>
            )}
        </div>
    );
}

// Widget de chat IA flottant, unique sur toutes les pages authentifiées.
// activeDashboard : dashboard Power BI actuellement affiché (vide si l'utilisateur
// n'est pas sur PowerBiDash) — l'agent demande alors quel dashboard analyser (ask_dashboard).
export default function AgentWidget({ user, activeDashboard = "", onUnauthorized, autoOpenGuide = false }) {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [manualDashboard, setManualDashboard] = useState("");
    const bottomRef = useRef(null);
    const inputRef = useRef(null);

    const effectiveDashboard = activeDashboard || manualDashboard;
    const dashboardLabel = DASHBOARD_LABELS[effectiveDashboard] ?? null;
    const quickQuestions = QUICK_QUESTIONS[effectiveDashboard] ?? [];

    useEffect(() => {
        if (open && messages.length === 0) {
            setMessages([{
                role: "assistant", actionType: "chat", success: true,
                content: dashboardLabel
                    ? `Bonjour ! Je suis votre assistant IA.\n\nDashboard actif : **${dashboardLabel}**\n\nPosez-moi une question sur ce dashboard ou demandez une action.`
                    : "Bonjour ! Je suis votre assistant IA.\n\nPosez-moi une question (je vous demanderai quel dashboard analyser si besoin) ou demandez une action ETL.",
                time: formatTime(),
            }]);
        }
    }, [open]);

    useEffect(() => {
        if (open && messages.length > 0 && activeDashboard) {
            setMessages((prev) => [...prev, {
                role: "assistant", actionType: "chat", success: true,
                content: `Dashboard changé → **${dashboardLabel}**\n\nPosez-moi une question sur ce dashboard.`,
                time: formatTime(),
            }]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeDashboard]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Popup automatique une fois par connexion, avec un guide adapté au rôle. AgentWidget est démonté
    // au logout et remonté à chaque nouvelle connexion (voir App.jsx), donc un effet au montage
    // (dépendances vides) suffit à garantir "une fois par session" sans état persistant fragile.
    useEffect(() => {
        if (!autoOpenGuide || !user) return;

        const timer = setTimeout(() => {
            setMessages([{
                role: "assistant", actionType: "chat", success: true,
                content: ROLE_GUIDES[user.roleCode] ?? "👋 Bienvenue ! Je suis votre assistant IA.",
                time: formatTime(),
            }]);
            setOpen(true);
        }, 1000);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const sendMessage = async (text, dashboardOverride) => {
        const msg = text || input.trim();
        if (!msg || loading) return;
        setInput("");

        const time = formatTime();
        setMessages((prev) => [...prev, { role: "user", content: msg, actionType: "chat", success: true, time }]);
        setLoading(true);

        try {
            const res = await apiFetch("/api/agent/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: msg,
                    activeDashboard: dashboardOverride ?? effectiveDashboard,
                    history: messages.map((m) => ({ role: m.role, content: m.content })),
                }),
            }, onUnauthorized);
            const data = await res.json();
            setMessages((prev) => [...prev, {
                role: "assistant", content: data.message, actionType: data.actionType,
                success: data.success, data: data.data,
                time: formatTime(),
            }]);
        } catch {
            setMessages((prev) => [...prev, {
                role: "assistant", content: "❌ Erreur de connexion.", actionType: "chat", success: false,
                time: formatTime(),
            }]);
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    };

    const handlePickDashboard = (dashboardId) => {
        setManualDashboard(dashboardId);
        sendMessage(`Analyse le dashboard ${DASHBOARD_LABELS[dashboardId] ?? dashboardId}`, dashboardId);
    };

    const handlePickPackage = (packageId) => {
        sendMessage(`Lance le package ${ETL_PACKAGE_LABELS[packageId] ?? packageId}`);
    };

    if (!user) return null;

    return (
        <>
            <button
                onClick={() => setOpen((o) => !o)}
                title="Agent IA"
                style={{
                    position: "fixed", bottom: 24, right: 24, zIndex: 1000,
                    width: 56, height: 56, borderRadius: "50%",
                    background: open ? "#1f2937" : COLORS.violet, color: "#fff",
                    border: "none", boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
                    fontSize: "1.5rem", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                }}
            >
                {open ? "✕" : "🤖"}
            </button>

            {open && (
                <div style={{
                    position: "fixed", bottom: 92, right: 24, zIndex: 999,
                    width: 360, height: 520, maxHeight: "70vh",
                    background: "#fafafa", borderRadius: 16, overflow: "hidden",
                    boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
                    border: `2px solid ${COLORS.violet}22`,
                    display: "flex", flexDirection: "column",
                    fontFamily: "'Segoe UI', sans-serif",
                }}>
                    <div style={{ background: COLORS.violet, padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "1.1rem" }}>🤖</span>
                        <div>
                            <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.875rem" }}>Agent IA</div>
                            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.72rem" }}>{dashboardLabel ?? "Aucun dashboard actif"}</div>
                        </div>
                        <div style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
                    </div>

                    {quickQuestions.length > 0 && (
                        <div style={{ padding: "0.625rem", borderBottom: "1px solid #e5e7eb", display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                            {quickQuestions.map((q) => (
                                <button key={q} onClick={() => sendMessage(q)}
                                    style={{ padding: "3px 8px", borderRadius: 12, background: COLORS.lightViolet, color: COLORS.violet, border: "none", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}>
                                    {q}
                                </button>
                            ))}
                        </div>
                    )}

                    <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem" }}>
                        {messages.map((msg, i) => <ChatMessage key={i} msg={msg} onPickDashboard={handlePickDashboard} onPickPackage={handlePickPackage} />)}
                        {loading && (
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.5rem" }}>
                                <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg, ${COLORS.violet}, #5B3FBC)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem" }}>🤖</div>
                                <div style={{ background: "#fff", borderRadius: 8, padding: "0.5rem 0.75rem", border: "1px solid #e5e7eb", display: "flex", gap: "0.25rem" }}>
                                    {[0, 1, 2].map((i) => (
                                        <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.violet, animation: `agentBounce 1s ease ${i * 0.2}s infinite` }} />
                                    ))}
                                    <style>{`@keyframes agentBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }`}</style>
                                </div>
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>

                    <div style={{ padding: "0.625rem", borderTop: "1px solid #e5e7eb", display: "flex", gap: "0.5rem" }}>
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                            placeholder="Posez une question..."
                            disabled={loading}
                            style={{ flex: 1, padding: "0.5rem 0.75rem", border: `1.5px solid ${COLORS.violet}44`, borderRadius: 20, fontSize: "0.82rem", outline: "none", background: loading ? "#f9fafb" : "#fff" }}
                        />
                        <button onClick={() => sendMessage()} disabled={loading || !input.trim()}
                            style={{ width: 36, height: 36, borderRadius: "50%", background: loading || !input.trim() ? "#e5e7eb" : COLORS.violet, color: "#fff", border: "none", cursor: loading || !input.trim() ? "not-allowed" : "pointer", fontSize: "0.9rem" }}>
                            ➤
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
