import { useState, useRef, useEffect } from "react";

const COLORS = {
    violet: "#3B1F8C",
    red: "#C8102E",
    lightViolet: "#EDE9F8",
};

const REPORT_ID = "fc37e583-dd73-43f8-9514-6700689f40ad";
const TENANT_ID = "604f1a96-cbe8-43f8-abbf-f8eaf5d85730";

const PAGES = [
    { id: "home", label: "Accueil", icon: "🏠", pageId: "b503507b87db0e55793a" },
    { id: "finance", label: "KPIs Financiers", icon: "💰", pageId: "67a4d1f4c77349ffd16b" },
    { id: "commercial", label: "Performance Commerciale", icon: "📈", pageId: "7d7432665c3a85d68660" },
    { id: "frais", label: "Analyse Frais Dossiers", icon: "🗂️", pageId: "14e72335e0b08e531189" },
    { id: "logistique", label: "Suivi Logistique", icon: "🚢", pageId: "9b5a809b7f100c6b0dc7" },
    { id: "balance", label: "Balance Comptable", icon: "⚖️", pageId: "741df08f0180ac3e5e90" },
];

const ROLE_PAGES = {
    CEO: ["home", "finance", "commercial", "frais", "logistique", "balance"],
    LOG: ["frais", "logistique"],
};

const ACTION_ICONS = {
    etl: "⚙️",
    predict_marge: "🔮",
    segment: "🎯",
    analyse_dashboard: "📊",
    list: "📋",
    hors_scope: "🚫",
    chat: "💬",
};

function ChatMessage({ msg }) {
    const isUser = msg.role === "user";
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
                {!isUser && msg.actionType && msg.actionType !== "chat" && msg.actionType !== "list" && (
                    <div style={{ fontSize: "0.68rem", fontWeight: 700, color: COLORS.violet, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.375rem" }}>
                        {ACTION_ICONS[msg.actionType]} Action
                    </div>
                )}
                <div style={{ whiteSpace: "pre-wrap" }}>
                    {msg.content.split(/\*\*(.*?)\*\*/g).map((part, i) =>
                        i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                    )}
                </div>
                {!isUser && msg.actionType && !["chat", "list", "hors_scope"].includes(msg.actionType) && (
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

export default function PowerBiDash({ user }) {
    const allowedPageIds = ROLE_PAGES[user?.roleCode] ?? [];
    const pages = PAGES.filter(p => allowedPageIds.includes(p.id));

    const [activePage, setActivePage] = useState(pages[0]?.id ?? "frais");
    const [iframeLoading, setIframeLoading] = useState(true);
    const [agentOpen, setAgentOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [agentLoading, setAgentLoading] = useState(false);
    const bottomRef = useRef(null);
    const inputRef = useRef(null);

    const currentPage = pages.find(p => p.id === activePage) ?? pages[0];
    const embedUrl = `https://app.powerbi.com/reportEmbed?reportId=${REPORT_ID}&autoAuth=true&ctid=${TENANT_ID}&pageName=${currentPage?.pageId}`;

    // Message de bienvenue quand on ouvre l'agent
    useEffect(() => {
        if (agentOpen && messages.length === 0) {
            setMessages([{
                role: "assistant", actionType: "chat", success: true,
                content: `Bonjour ! Je suis votre assistant IA.\n\nDashboard actif : **${currentPage?.label}**\n\nPosez-moi une question sur ce dashboard ou demandez une action.`,
                time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
            }]);
        }
    }, [agentOpen]);

    // Mettre à jour le message quand le dashboard change
    useEffect(() => {
        if (agentOpen && messages.length > 0) {
            setMessages(prev => [...prev, {
                role: "assistant", actionType: "chat", success: true,
                content: `Dashboard changé → **${currentPage?.label}**\n\nPosez-moi une question sur ce dashboard.`,
                time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
            }]);
        }
    }, [activePage]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const sendMessage = async (text) => {
        const msg = text || input.trim();
        if (!msg || agentLoading) return;
        setInput("");

        const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        setMessages(prev => [...prev, { role: "user", content: msg, actionType: "chat", success: true, time }]);
        setAgentLoading(true);

        try {
            const res = await fetch("/api/agent/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: msg,
                    activeDashboard: activePage,
                    history: messages.map(m => ({ role: m.role, content: m.content }))
                }),
            });
            const data = await res.json();
            setMessages(prev => [...prev, {
                role: "assistant", content: data.message, actionType: data.actionType,
                success: data.success,
                time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
            }]);
        } catch {
            setMessages(prev => [...prev, {
                role: "assistant", content: "❌ Erreur de connexion.", actionType: "chat", success: false,
                time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
            }]);
        } finally {
            setAgentLoading(false);
            inputRef.current?.focus();
        }
    };

    const QUICK_QUESTIONS = {
        finance: ["Quel est le CA total ?", "Quelle est la marge brute ?", "Top article vendu ?", "Top pays par CA ?"],
        commercial: ["Top 5 clients ?", "Répartition des dossiers ?"],
        frais: ["Marge moyenne des dossiers ?", "Nombre de dossiers ?"],
        logistique: ["Nombre de bookings ?", "Top navires ?"],
        balance: ["Total débit/crédit ?"],
        home: ["Analyse ce dashboard", "Quel est le CA total ?"],
    };

    const quickQuestions = QUICK_QUESTIONS[activePage] ?? [];

    return (
        <div style={{ fontFamily: "'Segoe UI', sans-serif", height: "calc(100vh - 60px)", display: "flex", flexDirection: "column", background: "#fff" }}>

            {/* Barre navigation */}
            <div style={{ background: "#fff", borderBottom: `3px solid ${COLORS.violet}`, padding: "0 1.5rem", display: "flex", alignItems: "center", gap: "0.25rem", overflowX: "auto", boxShadow: "0 2px 4px rgba(0,0,0,0.06)", minHeight: 52, flexShrink: 0 }}>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginRight: "1rem", paddingRight: "1rem", borderRight: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>
                    <span style={{ padding: "3px 10px", borderRadius: 12, background: user?.roleCode === "CEO" ? COLORS.lightViolet : "#fff1f2", color: user?.roleCode === "CEO" ? COLORS.violet : COLORS.red, fontSize: "0.75rem", fontWeight: 700 }}>
                        {user?.roleCode === "CEO" ? "👑" : "📋"} {user?.role}
                    </span>
                </div>

                {pages.map((page) => (
                    <button key={page.id} onClick={() => { setActivePage(page.id); setIframeLoading(true); }}
                        style={{ padding: "0.625rem 1rem", background: activePage === page.id ? COLORS.lightViolet : "transparent", border: "none", borderBottom: `3px solid ${activePage === page.id ? COLORS.violet : "transparent"}`, borderRadius: "4px 4px 0 0", color: activePage === page.id ? COLORS.violet : "#6b7280", fontWeight: activePage === page.id ? 700 : 400, fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.375rem", whiteSpace: "nowrap", marginBottom: "-3px" }}>
                        <span>{page.icon}</span>{page.label}
                    </button>
                ))}

                {/* Bouton Agent IA */}
                <button onClick={() => setAgentOpen(!agentOpen)}
                    style={{ marginLeft: "auto", padding: "0.375rem 1rem", borderRadius: 20, background: agentOpen ? COLORS.violet : COLORS.lightViolet, color: agentOpen ? "#fff" : COLORS.violet, border: `1.5px solid ${COLORS.violet}`, fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "0.375rem", flexShrink: 0 }}>
                    🤖 {agentOpen ? "Fermer IA" : "Agent IA"}
                </button>
            </div>

            {/* Contenu principal */}
            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

                {/* Iframe Power BI */}
                <div style={{ flex: 1, position: "relative" }}>
                    {iframeLoading && (
                        <div style={{ position: "absolute", inset: 0, zIndex: 10, background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
                            <div style={{ width: 44, height: 44, borderRadius: "50%", border: `4px solid ${COLORS.lightViolet}`, borderTop: `4px solid ${COLORS.violet}`, animation: "spin 1s linear infinite" }} />
                            <div style={{ color: COLORS.violet, fontWeight: 600 }}>Chargement...</div>
                            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                        </div>
                    )}
                    <iframe key={activePage} title="Power BI" src={embedUrl} style={{ width: "100%", height: "100%", border: "none" }} allowFullScreen onLoad={() => setIframeLoading(false)} />
                </div>

                {/* Panneau Agent IA */}
                {agentOpen && (
                    <div style={{ width: 340, borderLeft: `2px solid ${COLORS.violet}22`, display: "flex", flexDirection: "column", background: "#fafafa", flexShrink: 0 }}>

                        {/* Header agent */}
                        <div style={{ background: COLORS.violet, padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{ fontSize: "1.1rem" }}>🤖</span>
                            <div>
                                <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.875rem" }}>Agent IA</div>
                                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.72rem" }}>{currentPage?.label}</div>
                            </div>
                            <div style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
                        </div>

                        {/* Questions rapides */}
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

                        {/* Messages */}
                        <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem" }}>
                            {messages.map((msg, i) => <ChatMessage key={i} msg={msg} />)}
                            {agentLoading && (
                                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.5rem" }}>
                                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg, ${COLORS.violet}, #5B3FBC)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem" }}>🤖</div>
                                    <div style={{ background: "#fff", borderRadius: 8, padding: "0.5rem 0.75rem", border: "1px solid #e5e7eb", display: "flex", gap: "0.25rem" }}>
                                        {[0, 1, 2].map(i => (
                                            <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.violet, animation: `bounce 1s ease ${i * 0.2}s infinite` }} />
                                        ))}
                                        <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }`}</style>
                                    </div>
                                </div>
                            )}
                            <div ref={bottomRef} />
                        </div>

                        {/* Input */}
                        <div style={{ padding: "0.625rem", borderTop: "1px solid #e5e7eb", display: "flex", gap: "0.5rem" }}>
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                                placeholder="Posez une question..."
                                disabled={agentLoading}
                                style={{ flex: 1, padding: "0.5rem 0.75rem", border: `1.5px solid ${COLORS.violet}44`, borderRadius: 20, fontSize: "0.82rem", outline: "none", background: agentLoading ? "#f9fafb" : "#fff" }}
                            />
                            <button onClick={() => sendMessage()} disabled={agentLoading || !input.trim()}
                                style={{ width: 36, height: 36, borderRadius: "50%", background: agentLoading || !input.trim() ? "#e5e7eb" : COLORS.violet, color: "#fff", border: "none", cursor: agentLoading || !input.trim() ? "not-allowed" : "pointer", fontSize: "0.9rem" }}>
                                ➤
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}