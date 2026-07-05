import { useState, useEffect } from "react";
import { apiFetch } from "../../lib/api";

const COLORS = {
    violet: "#3B1F8C",
    red: "#C8102E",
    lightViolet: "#EDE9F8",
    success: "#16a34a",
    error: "#dc2626",
};

const PACKAGES = [
    { type: "dimensions", label: "📐 Dimensions" },
    { type: "faits", label: "📊 Faits" },
    { type: "master", label: "🚀 Master (complet)" },
];

export default function EtlHistory() {
    const [history, setHistory] = useState([]);
    const [freshness, setFreshness] = useState(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(null);
    const [detail, setDetail] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const [histRes, freshRes] = await Promise.all([
                apiFetch("/api/admin/etl/history"),
                apiFetch("/api/admin/etl/freshness"),
            ]);
            setHistory(await histRes.json());
            setFreshness(await freshRes.json());
        } catch { /* ignore */ }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const runPackage = async (type) => {
        setRunning(type);
        try {
            await apiFetch(`/api/admin/etl/run/${type}`, { method: "POST" });
            await load();
        } finally {
            setRunning(null);
        }
    };

    const openDetail = async (id) => {
        const res = await apiFetch(`/api/admin/etl/history/${id}`);
        setDetail(await res.json());
    };

    const isStale = freshness?.lastSuccessAt &&
        (Date.now() - new Date(freshness.lastSuccessAt).getTime()) > 2 * 24 * 60 * 60 * 1000;

    return (
        <div style={{ fontFamily: "'Segoe UI', sans-serif", padding: "2rem", maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ borderBottom: `3px solid ${COLORS.violet}`, paddingBottom: "1rem", marginBottom: "1.5rem" }}>
                <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: COLORS.violet }}>⚙️ Historique ETL</h1>
                <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>Exécutions passées, relance de packages, fraîcheur des données</p>
            </div>

            {/* Fraîcheur */}
            <div style={{
                background: isStale ? "#fef2f2" : "#f0fdf4",
                border: `1.5px solid ${isStale ? "#fecaca" : "#bbf7d0"}`,
                borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "1.5rem",
                display: "flex", alignItems: "center", justifyContent: "space-between"
            }}>
                <div>
                    <div style={{ fontWeight: 700, color: isStale ? COLORS.error : COLORS.success, fontSize: "0.9rem" }}>
                        {isStale ? "⚠️ Données potentiellement obsolètes" : "✅ Données à jour"}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                        {freshness?.lastSuccessAt
                            ? `Dernière mise à jour réussie : ${new Date(freshness.lastSuccessAt).toLocaleString("fr-FR")} (${freshness.type})`
                            : "Aucune exécution réussie enregistrée."}
                    </div>
                </div>
            </div>

            {/* Boutons relance */}
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
                {PACKAGES.map((p) => (
                    <button key={p.type} onClick={() => runPackage(p.type)} disabled={running !== null}
                        style={{
                            flex: 1, padding: "0.75rem", borderRadius: 8, border: "none",
                            background: running === p.type ? "#9ca3af" : COLORS.violet, color: "#fff",
                            fontWeight: 700, cursor: running !== null ? "not-allowed" : "pointer"
                        }}>
                        {running === p.type ? "⏳ En cours..." : `▶ Relancer ${p.label}`}
                    </button>
                ))}
            </div>

            {loading ? (
                <div style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>Chargement...</div>
            ) : (
                <div style={{ background: "#fff", border: "2px solid #e5e7eb", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                        <thead>
                            <tr style={{ background: COLORS.violet }}>
                                {["#", "Package", "Type", "Statut", "Durée", "Date", ""].map((h) => (
                                    <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#fff", fontWeight: 700, fontSize: "0.8rem" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((h) => (
                                <tr key={h.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                    <td style={{ padding: "0.625rem 1rem", color: "#9ca3af" }}>#{h.id}</td>
                                    <td style={{ padding: "0.625rem 1rem", fontFamily: "monospace", color: "#374151" }}>{h.package}</td>
                                    <td style={{ padding: "0.625rem 1rem" }}>
                                        <span style={{ padding: "2px 8px", borderRadius: 8, background: COLORS.lightViolet, color: COLORS.violet, fontWeight: 600, fontSize: "0.75rem" }}>{h.type}</span>
                                    </td>
                                    <td style={{ padding: "0.625rem 1rem" }}>
                                        <span style={{
                                            padding: "2px 10px", borderRadius: 12, fontSize: "0.75rem", fontWeight: 700,
                                            background: h.success ? "#dcfce7" : "#fee2e2",
                                            color: h.success ? COLORS.success : COLORS.error
                                        }}>
                                            {h.success ? "✅ Succès" : "❌ Échec"}
                                        </span>
                                    </td>
                                    <td style={{ padding: "0.625rem 1rem", color: "#374151" }}>{h.durationSeconds}s</td>
                                    <td style={{ padding: "0.625rem 1rem", color: "#6b7280" }}>{new Date(h.executedAt).toLocaleString("fr-FR")}</td>
                                    <td style={{ padding: "0.625rem 1rem" }}>
                                        <button onClick={() => openDetail(h.id)}
                                            style={{ padding: "0.375rem 0.875rem", borderRadius: 6, border: "none", background: "#f3f4f6", color: "#374151", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}>
                                            Détail
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {history.length === 0 && (
                        <div style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>Aucune exécution enregistrée.</div>
                    )}
                </div>
            )}

            {/* Modal détail */}
            {detail && (
                <div onClick={() => setDetail(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
                    <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: "1.5rem", width: "90%", maxWidth: 700, maxHeight: "80vh", overflow: "auto" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                            <h3 style={{ margin: 0, color: COLORS.violet }}>Détail — {detail.package} (#{detail.id})</h3>
                            <button onClick={() => setDetail(null)} style={{ border: "none", background: "none", fontSize: "1.2rem", cursor: "pointer" }}>✕</button>
                        </div>
                        <div style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>{detail.message}</div>
                        <div style={{ fontWeight: 700, fontSize: "0.8rem", marginBottom: "0.25rem" }}>Sortie standard (stdout) :</div>
                        <pre style={{ background: "#f9fafb", padding: "0.75rem", borderRadius: 8, fontSize: "0.72rem", overflow: "auto", maxHeight: 200, whiteSpace: "pre-wrap" }}>{detail.output || "(vide)"}</pre>
                        <div style={{ fontWeight: 700, fontSize: "0.8rem", marginBottom: "0.25rem", marginTop: "0.75rem" }}>Erreurs (stderr) :</div>
                        <pre style={{ background: "#fef2f2", padding: "0.75rem", borderRadius: 8, fontSize: "0.72rem", overflow: "auto", maxHeight: 200, whiteSpace: "pre-wrap" }}>{detail.error || "(vide)"}</pre>
                    </div>
                </div>
            )}
        </div>
    );
}
