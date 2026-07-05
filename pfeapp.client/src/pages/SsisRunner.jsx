import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";

const COLORS = {
    violet: "#3B1F8C",
    red: "#C8102E",
    lightViolet: "#EDE9F8",
    success: "#16a34a",
    error: "#dc2626",
};

function StatusBadge({ status }) {
    if (!status) return null;
    const config = {
        success: { bg: "#dcfce7", color: "#16a34a", label: "✅ Succès" },
        error: { bg: "#fee2e2", color: "#dc2626", label: "❌ Échec" },
        running: { bg: "#ede9fe", color: "#3B1F8C", label: "⏳ En cours..." },
    }[status];
    if (!config) return null;
    return (
        <span style={{
            padding: "3px 10px", borderRadius: 12, fontSize: "0.78rem",
            fontWeight: 600, background: config.bg, color: config.color
        }}>
            {config.label}
        </span>
    );
}

export default function SsisRunner() {
    const [tables, setTables] = useState({ dimensions: [], faits: [] });
    const [selected, setSelected] = useState(null);
    const [execStatus, setExecStatus] = useState({ dimensions: null, faits: null, master: null });
    const [lastResult, setLastResult] = useState(null);
    const [loading, setLoading] = useState({ dimensions: false, faits: false, master: false });
    const [logs, setLogs] = useState([]);
    const [showLogs, setShowLogs] = useState(false);
    const [loadingLogs, setLoadingLogs] = useState(false);

    useEffect(() => {
        const loadTables = async (retries = 5) => {
            try {
                const res = await apiFetch("/api/ssis/tables");
                if (!res.ok) throw new Error("Not ready");
                const data = await res.json();
                setTables(data);
            } catch {
                if (retries > 0) {
                    setTimeout(() => loadTables(retries - 1), 1000);
                }
            }
        };
        loadTables();
    }, []);
    const fetchLogs = async () => {
        setLoadingLogs(true);
        try {
            const res = await apiFetch("/api/ssis/logs");
            const data = await res.json();
            setLogs(data);
        } catch { }
        finally { setLoadingLogs(false); }
    };

    const clearLogs = async () => {
        await apiFetch("/api/ssis/logs", { method: "DELETE" });
        setLogs([]);
    };

    const toggleLogs = () => {
        if (!showLogs) fetchLogs();
        setShowLogs(!showLogs);
    };

    const runPackage = async (type) => {
        setLoading((l) => ({ ...l, [type]: true }));
        setExecStatus((s) => ({ ...s, [type]: "running" }));
        setLastResult(null);
        try {
            const res = await apiFetch(`/api/ssis/run/${type}`, { method: "POST" });
            const text = await res.text();
            if (!text || text.trim() === "") {
                setExecStatus((s) => ({ ...s, [type]: "error" }));
                setLastResult({ success: false, message: "Réponse vide du serveur." });
                return;
            }
            const data = JSON.parse(text);
            setExecStatus((s) => ({ ...s, [type]: data.success ? "success" : "error" }));
            setLastResult(data);
            // Rafraîchir les logs si le panel est ouvert
            if (showLogs) fetchLogs();
        } catch (e) {
            setExecStatus((s) => ({ ...s, [type]: "error" }));
            setLastResult({ success: false, message: `Erreur : ${e.message}` });
        } finally {
            setLoading((l) => ({ ...l, [type]: false }));
        }
    };

    const isAnyRunning = Object.values(loading).some(Boolean);

    const TableList = ({ items, type, accentColor }) => (
        <div style={{
            background: "#fff", border: `2px solid ${accentColor}`,
            borderRadius: 12, overflow: "hidden",
            boxShadow: "0 2px 8px rgba(0,0,0,0.07)"
        }}>
            <div style={{
                background: accentColor, padding: "0.875rem 1.25rem",
                display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.95rem" }}>
                    {type === "dimensions" ? "📐 Tables de Dimensions" : "📊 Tables de Faits"}
                </span>
                <StatusBadge status={execStatus[type]} />
            </div>
            <div style={{ padding: "0.75rem" }}>
                {items.map((table) => (
                    <div key={table} onClick={() => setSelected(selected === table ? null : table)}
                        style={{
                            padding: "0.625rem 0.875rem", borderRadius: 8, marginBottom: "0.35rem",
                            cursor: "pointer",
                            background: selected === table ? (type === "dimensions" ? COLORS.lightViolet : "#fff1f2") : "#f9fafb",
                            border: `1.5px solid ${selected === table ? accentColor : "transparent"}`,
                            display: "flex", alignItems: "center", gap: "0.625rem",
                            transition: "all 0.12s ease",
                        }}
                    >
                        <span style={{ fontSize: "0.75rem", color: accentColor }}>▸</span>
                        <span style={{ fontWeight: 500, fontSize: "0.875rem", color: "#1f2937", fontFamily: "monospace" }}>
                            dbo.{table}
                        </span>
                    </div>
                ))}
            </div>
            <div style={{ padding: "0.875rem 1rem", borderTop: "1px solid #f3f4f6" }}>
                <button onClick={() => runPackage(type)} disabled={isAnyRunning}
                    style={{
                        width: "100%", padding: "0.65rem",
                        background: loading[type] ? "#9ca3af" : accentColor,
                        color: "#fff", border: "none", borderRadius: 8,
                        fontWeight: 700, fontSize: "0.875rem",
                        cursor: isAnyRunning ? "not-allowed" : "pointer",
                    }}
                >
                    {loading[type] ? "⏳ Exécution en cours..." : `▶ Exécuter Package ${type === "dimensions" ? "Dimensions" : "Faits"}`}
                </button>
            </div>
        </div>
    );

    return (
        <div style={{ fontFamily: "'Segoe UI', sans-serif", padding: "2rem", maxWidth: 1000, margin: "0 auto" }}>

            {/* Header */}
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                borderBottom: `3px solid ${COLORS.violet}`, paddingBottom: "1rem", marginBottom: "2rem"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{ width: 6, height: 44, background: COLORS.red, borderRadius: 3 }} />
                    <div>
                        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: COLORS.violet }}>
                            ETL Runner — Alimentation du Data Warehouse
                        </h1>
                        <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>
                            Tandem Logistics · Dynamix Services · SSIS via dtexec
                        </p>
                    </div>
                </div>

                {/* Bouton Journal */}
                <button onClick={toggleLogs}
                    style={{
                        padding: "0.625rem 1.25rem",
                        background: showLogs ? COLORS.violet : "#f3f4f6",
                        color: showLogs ? "#fff" : "#374151",
                        border: `1.5px solid ${showLogs ? COLORS.violet : "#e5e7eb"}`,
                        borderRadius: 8, fontWeight: 600, fontSize: "0.875rem",
                        cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem"
                    }}
                >
                    📋 Journal d'exécution
                    {logs.length > 0 && (
                        <span style={{
                            background: COLORS.red, color: "#fff",
                            borderRadius: 10, padding: "1px 6px", fontSize: "0.72rem", fontWeight: 700
                        }}>
                            {logs.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Grille Dimensions / Faits */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1.5rem" }}>
                <TableList items={tables.dimensions} type="dimensions" accentColor={COLORS.violet} />
                <TableList items={tables.faits} type="faits" accentColor={COLORS.red} />
            </div>

            {/* Bouton Master */}
            <div style={{
                background: "#fff", border: "2px solid #1f2937",
                borderRadius: 12, padding: "1.25rem", marginBottom: "1.5rem",
                boxShadow: "0 2px 8px rgba(0,0,0,0.07)"
            }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: "1rem", color: "#1f2937" }}>
                            🚀 Package Master — Alimentation complète
                        </div>
                        <div style={{ color: "#6b7280", fontSize: "0.825rem", marginTop: "0.25rem" }}>
                            Exécute les Dimensions puis les Faits dans l'ordre correct
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        <StatusBadge status={execStatus.master} />
                        <button onClick={() => runPackage("master")} disabled={isAnyRunning}
                            style={{
                                padding: "0.75rem 2rem",
                                background: loading.master ? "#9ca3af" : "#1f2937",
                                color: "#fff", border: "none", borderRadius: 8,
                                fontWeight: 800, fontSize: "0.95rem",
                                cursor: isAnyRunning ? "not-allowed" : "pointer", whiteSpace: "nowrap"
                            }}
                        >
                            {loading.master ? "⏳ En cours..." : "▶▶ Exécuter Master"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Résultat dernière exécution */}
            {lastResult && (
                <div style={{
                    background: lastResult.success ? "#f0fdf4" : "#fef2f2",
                    border: `1.5px solid ${lastResult.success ? "#bbf7d0" : "#fecaca"}`,
                    borderRadius: 12, padding: "1.25rem", marginBottom: "1.5rem"
                }}>
                    <div style={{
                        fontWeight: 700, fontSize: "0.95rem", marginBottom: "0.5rem",
                        color: lastResult.success ? COLORS.success : COLORS.error
                    }}>
                        {lastResult.success ? "✅ Exécution réussie" : "❌ Échec de l'exécution"}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "#374151", marginBottom: "0.5rem" }}>
                        {lastResult.message}
                    </div>
                    {lastResult.durationSeconds > 0 && (
                        <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                            ⏱ Durée : {lastResult.durationSeconds}s ·{" "}
                            Exécuté à {new Date(lastResult.executedAt).toLocaleTimeString("fr-FR")}
                        </div>
                    )}
                    {!lastResult.success && lastResult.error && (
                        <pre style={{
                            marginTop: "0.75rem", padding: "0.75rem", borderRadius: 6,
                            background: "#fff", fontSize: "0.75rem", color: "#991b1b",
                            overflow: "auto", maxHeight: 150,
                            border: "1px solid #fecaca", whiteSpace: "pre-wrap"
                        }}>
                            {lastResult.error}
                        </pre>
                    )}
                </div>
            )}

            {/* Journal d'exécution */}
            {showLogs && (
                <div style={{
                    background: "#fff", border: `2px solid ${COLORS.violet}`,
                    borderRadius: 12, overflow: "hidden",
                    boxShadow: "0 2px 8px rgba(59,31,140,0.1)"
                }}>
                    {/* Header journal */}
                    <div style={{
                        background: COLORS.violet, padding: "0.875rem 1.25rem",
                        display: "flex", justifyContent: "space-between", alignItems: "center"
                    }}>
                        <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.95rem" }}>
                            📋 Journal d'exécution
                        </span>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button onClick={fetchLogs}
                                style={{
                                    padding: "0.375rem 0.875rem", borderRadius: 6,
                                    background: "rgba(255,255,255,0.2)", color: "#fff",
                                    border: "1px solid rgba(255,255,255,0.3)",
                                    fontSize: "0.8rem", fontWeight: 600, cursor: "pointer"
                                }}
                            >
                                🔄 Rafraîchir
                            </button>
                            <button onClick={clearLogs}
                                style={{
                                    padding: "0.375rem 0.875rem", borderRadius: 6,
                                    background: COLORS.red, color: "#fff",
                                    border: "none", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer"
                                }}
                            >
                                🗑 Effacer
                            </button>
                        </div>
                    </div>

                    {/* Contenu journal */}
                    <div style={{ padding: "1rem" }}>
                        {loadingLogs ? (
                            <div style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>
                                Chargement...
                            </div>
                        ) : logs.length === 0 ? (
                            <div style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>
                                Aucune exécution enregistrée pour le moment.
                            </div>
                        ) : (
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                                <thead>
                                    <tr style={{ borderBottom: "2px solid #f3f4f6" }}>
                                        {["#", "Type", "Package", "Statut", "Durée", "Date & Heure"].map((h) => (
                                            <th key={h} style={{
                                                padding: "0.625rem 0.75rem", textAlign: "left",
                                                color: "#6b7280", fontWeight: 600, fontSize: "0.8rem"
                                            }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((log) => (
                                        <tr key={log.id} style={{ borderBottom: "1px solid #f9fafb" }}>
                                            <td style={{ padding: "0.625rem 0.75rem", color: "#9ca3af", fontSize: "0.8rem" }}>
                                                #{log.id}
                                            </td>
                                            <td style={{ padding: "0.625rem 0.75rem" }}>
                                                <span style={{
                                                    padding: "2px 8px", borderRadius: 6, fontSize: "0.78rem", fontWeight: 600,
                                                    background: log.type === "Master" ? "#f3f4f6"
                                                        : log.type === "Dimensions" ? COLORS.lightViolet : "#fff1f2",
                                                    color: log.type === "Master" ? "#374151"
                                                        : log.type === "Dimensions" ? COLORS.violet : COLORS.red
                                                }}>
                                                    {log.type}
                                                </span>
                                            </td>
                                            <td style={{
                                                padding: "0.625rem 0.75rem", fontFamily: "monospace",
                                                fontSize: "0.82rem", color: "#374151"
                                            }}>
                                                {log.package}
                                            </td>
                                            <td style={{ padding: "0.625rem 0.75rem" }}>
                                                <span style={{
                                                    padding: "2px 8px", borderRadius: 12, fontSize: "0.78rem", fontWeight: 600,
                                                    background: log.success ? "#dcfce7" : "#fee2e2",
                                                    color: log.success ? COLORS.success : COLORS.error
                                                }}>
                                                    {log.success ? "✅ Succès" : "❌ Échec"}
                                                </span>
                                            </td>
                                            <td style={{ padding: "0.625rem 0.75rem", color: "#374151" }}>
                                                {log.durationSeconds}s
                                            </td>
                                            <td style={{ padding: "0.625rem 0.75rem", color: "#6b7280", fontSize: "0.82rem" }}>
                                                {new Date(log.executedAt).toLocaleString("fr-FR")}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}