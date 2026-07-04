import { useState, useRef, useEffect } from "react";

const COLORS = {
  violet: "#3B1F8C",
  red: "#C8102E",
  lightViolet: "#EDE9F8",
};

const ACTION_ICONS = {
  etl:          "⚙️",
  predict_marge:"🔮",
  segment:      "🎯",
  resume:       "📊",
  list:         "📋",
  chat:         "💬",
};

const SUGGESTIONS = [
  "Que peux-tu faire ?",
  "Lance l'alimentation complète",
  "Lance les dimensions",
  "Résume le dashboard KPIs Financiers",
  "Segmente le client CRANE WORLDWIDE avec CA 500000 et fréquence 20",
  "Prédit la marge pour un dossier de 80000 TND avec 2 conteneurs",
];

function Message({ msg }) {
  const isUser = msg.role === "user";
  const icon   = ACTION_ICONS[msg.actionType] ?? "💬";

  return (
    <div style={{
      display: "flex", gap: "0.75rem",
      justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: "1rem", alignItems: "flex-start"
    }}>
      {!isUser && (
        <div style={{
          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
          background: `linear-gradient(135deg, ${COLORS.violet}, #5B3FBC)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1rem", color: "#fff", fontWeight: 700
        }}>
          🤖
        </div>
      )}

      <div style={{
        maxWidth: "75%",
        background: isUser ? COLORS.violet : "#fff",
        color: isUser ? "#fff" : "#1f2937",
        borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
        padding: "0.875rem 1rem",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        border: isUser ? "none" : "1px solid #e5e7eb",
      }}>
        {!isUser && msg.actionType && msg.actionType !== "chat" && (
          <div style={{
            fontSize: "0.72rem", fontWeight: 700, color: COLORS.violet,
            textTransform: "uppercase", letterSpacing: "0.08em",
            marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.375rem"
          }}>
            {icon} Action exécutée
          </div>
        )}

        <div style={{
          fontSize: "0.875rem", lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          color: isUser ? "#fff" : "#1f2937"
        }}>
          {msg.content.split(/\*\*(.*?)\*\*/g).map((part, i) =>
            i % 2 === 1
              ? <strong key={i}>{part}</strong>
              : part
          )}
        </div>

        {/* Badge succès/échec pour les actions */}
        {!isUser && msg.actionType && msg.actionType !== "chat" && msg.actionType !== "list" && (
          <div style={{
            marginTop: "0.625rem",
            display: "inline-block",
            padding: "2px 8px", borderRadius: 10,
            background: msg.success ? "#dcfce7" : "#fee2e2",
            color: msg.success ? "#16a34a" : "#dc2626",
            fontSize: "0.72rem", fontWeight: 600
          }}>
            {msg.success ? "✅ Exécuté" : "❌ Échec"}
          </div>
        )}

        <div style={{
          fontSize: "0.7rem", marginTop: "0.375rem",
          color: isUser ? "rgba(255,255,255,0.6)" : "#9ca3af",
          textAlign: "right"
        }}>
          {msg.time}
        </div>
      </div>

      {isUser && (
        <div style={{
          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
          background: COLORS.red,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1rem", color: "#fff", fontWeight: 700
        }}>
          👤
        </div>
      )}
    </div>
  );
}

export default function AiAgent({ user }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: `Bonjour ${user?.displayName || ""} ! 👋\n\nJe suis votre assistant IA pour **Tandem Logistics**.\n\nJe peux exécuter des actions dans l'application, analyser vos données et répondre à vos questions.\n\nTapez **"Que peux-tu faire ?"** pour voir toutes mes capacités.`,
      actionType: "chat",
      success: true,
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    }
  ]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const bottomRef               = useRef(null);
  const inputRef                = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getHistory = () => messages.map((m) => ({
    role:    m.role,
    content: m.content
  }));

  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    setInput("");
    const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    setMessages((prev) => [...prev, {
      role: "user", content: msg, actionType: "chat", success: true, time
    }]);

    setLoading(true);

    try {
      const res  = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history: getHistory() }),
      });
      const data = await res.json();

      setMessages((prev) => [...prev, {
        role:       "assistant",
        content:    data.message || "Je n'ai pas pu traiter votre demande.",
        actionType: data.actionType || "chat",
        success:    data.success,
        time:       new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        role: "assistant", content: "❌ Erreur de connexion au serveur.", actionType: "chat", success: false,
        time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div style={{
      fontFamily: "'Segoe UI', sans-serif",
      height: "calc(100vh - 60px)",
      display: "flex", flexDirection: "column",
      background: "#f8f9fa"
    }}>
      {/* Header */}
      <div style={{
        background: "#fff", padding: "1rem 1.5rem",
        borderBottom: `3px solid ${COLORS.violet}`,
        display: "flex", alignItems: "center", gap: "0.75rem",
        boxShadow: "0 2px 4px rgba(0,0,0,0.06)"
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: "50%",
          background: `linear-gradient(135deg, ${COLORS.violet}, #5B3FBC)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.2rem"
        }}>🤖</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: COLORS.violet }}>
            Agent IA — Tandem Logistics
          </div>
          <div style={{ fontSize: "0.78rem", color: "#6b7280", display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }} />
            En ligne · Groq llama-3.1-8b
          </div>
        </div>
      </div>

      {/* Suggestions rapides */}
      <div style={{
        padding: "0.75rem 1.5rem", background: "#fff",
        borderBottom: "1px solid #f3f4f6",
        display: "flex", gap: "0.5rem", overflowX: "auto",
        flexShrink: 0
      }}>
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => sendMessage(s)}
            style={{
              padding: "0.375rem 0.875rem", borderRadius: 20,
              background: COLORS.lightViolet, color: COLORS.violet,
              border: `1px solid ${COLORS.violet}33`,
              fontSize: "0.78rem", fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap",
              flexShrink: 0
            }}>
            {s}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
        {messages.map((msg, i) => <Message key={i} msg={msg} />)}

        {/* Indicateur de frappe */}
        {loading && (
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", marginBottom: "1rem" }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: `linear-gradient(135deg, ${COLORS.violet}, #5B3FBC)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1rem", flexShrink: 0
            }}>🤖</div>
            <div style={{
              background: "#fff", borderRadius: "16px 16px 16px 4px",
              padding: "0.875rem 1rem", border: "1px solid #e5e7eb",
              display: "flex", gap: "0.375rem", alignItems: "center"
            }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: COLORS.violet, opacity: 0.6,
                  animation: `bounce 1s ease ${i * 0.2}s infinite`
                }} />
              ))}
              <style>{`
                @keyframes bounce {
                  0%, 100% { transform: translateY(0); }
                  50% { transform: translateY(-6px); }
                }
              `}</style>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Zone de saisie */}
      <div style={{
        background: "#fff", padding: "1rem 1.5rem",
        borderTop: "1px solid #e5e7eb",
        display: "flex", gap: "0.75rem", alignItems: "center"
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
          placeholder="Posez une question ou demandez une action..."
          disabled={loading}
          style={{
            flex: 1, padding: "0.75rem 1rem",
            border: `1.5px solid ${COLORS.violet}44`,
            borderRadius: 24, fontSize: "0.875rem",
            outline: "none", background: loading ? "#f9fafb" : "#fff",
            fontFamily: "'Segoe UI', sans-serif"
          }}
        />
        <button
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
          style={{
            width: 44, height: 44, borderRadius: "50%",
            background: loading || !input.trim() ? "#e5e7eb" : COLORS.violet,
            color: "#fff", border: "none", cursor: loading || !input.trim() ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.1rem", flexShrink: 0,
            transition: "background 0.2s ease"
          }}>
          {loading ? "⏳" : "➤"}
        </button>
      </div>
    </div>
  );
}
