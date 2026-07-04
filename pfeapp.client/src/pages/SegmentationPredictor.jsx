import { useState, useEffect } from "react";

const COLORS = {
    violet: "#3B1F8C",
    red: "#C8102E",
    lightViolet: "#EDE9F8",
};

const SEGMENT_CONFIG = {
    "VIP": { icon: "👑", bg: "#fee2e2", color: "#C0392B", border: "#C0392B" },
    "Fidèle": { icon: "⭐", bg: "#f0fdf4", color: "#2C3E50", border: "#2C3E50" },
    "À risque": { icon: "⚠️", bg: "#fff7ed", color: "#E67E22", border: "#E67E22" },
    "Faible valeur": { icon: "📉", bg: "#f9fafb", color: "#7F8C8D", border: "#7F8C8D" },
};

const PRIORITY_CONFIG = {
    "Haute": { bg: "#fee2e2", color: "#C0392B" },
    "Urgente": { bg: "#fff3cd", color: "#E67E22" },
    "Moyenne": { bg: "#e8f4fd", color: "#2980B9" },
    "Faible": { bg: "#f9fafb", color: "#7F8C8D" },
    "Indéterminée": { bg: "#f9fafb", color: "#9ca3af" },
};

function ReadOnlyField({ label, value, unit }) {
    return (
        <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#9ca3af", marginBottom: "0.3rem" }}>
                {label} <span style={{ fontSize: "0.7rem", fontWeight: 400 }}>(auto)</span>
                {unit && <span style={{ color: "#9ca3af", fontWeight: 400 }}> — {unit}</span>}
            </label>
            <div style={{
                width: "100%", padding: "0.5rem 0.75rem",
                border: "1.5px solid #e5e7eb", borderRadius: 8,
                fontSize: "0.875rem", background: "#f9fafb",
                color: value !== "" && value !== 0 ? "#1f2937" : "#9ca3af",
                boxSizing: "border-box", minHeight: 38
            }}>
                {value !== "" && value !== undefined
                    ? (unit === "TND" ? parseFloat(value).toLocaleString("fr-FR") + " TND"
                        : unit === "%" ? parseFloat(value).toFixed(1) + "%"
                            : unit === "jours" ? Math.round(value) + " jours"
                                : value)
                    : "— chargement auto après sélection client —"}
            </div>
        </div>
    );
}

export default function SegmentationPredictor() {
    const [clients, setClients] = useState([]);
    const [selectedClient, setSelectedClient] = useState("");
    const [rfmData, setRfmData] = useState(null);
    const [loadingRfm, setLoadingRfm] = useState(false);
    const [isNewClient, setIsNewClient] = useState(false);

    // Champs manuels pour nouveau client
    const [manualRfm, setManualRfm] = useState({
        recence: "", frequence: "", ca_total: "", marge_moyenne: ""
    });

    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Charger la liste des clients
    useEffect(() => {
        fetch("/api/referentiel/clients")
            .then((r) => r.json())
            .then(setClients)
            .catch(() => { });
    }, []);

    // Quand un client est sélectionné → charger ses données RFM
    const handleClientChange = async (clientName) => {
        setSelectedClient(clientName);
        setResult(null);
        setError(null);
        setRfmData(null);

        if (!clientName) return;

        if (clientName === "__nouveau__") {
            setIsNewClient(true);
            return;
        }

        setIsNewClient(false);
        setLoadingRfm(true);

        try {
            const res = await fetch(`/api/referentiel/rfm/${encodeURIComponent(clientName)}`);
            const data = await res.json();
            setRfmData(data);
        } catch {
            setError("Impossible de charger les données RFM du client.");
        } finally {
            setLoadingRfm(false);
        }
    };

    const handlePredict = async () => {
        if (!selectedClient || selectedClient === "__nouveau__" && !manualRfm.recence) {
            setError("Veuillez sélectionner un client et remplir les données.");
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        const rfm = isNewClient ? {
            recence: parseFloat(manualRfm.recence) || 0,
            frequence: parseFloat(manualRfm.frequence) || 0,
            ca_Total: parseFloat(manualRfm.ca_total) || 0,
            marge_Moyenne: parseFloat(manualRfm.marge_moyenne) || 0,
        } : {
            recence: rfmData?.recence || 0,
            frequence: rfmData?.frequence || 0,
            ca_Total: rfmData?.ca_Total || 0,
            marge_Moyenne: rfmData?.marge_Moyenne || 0,
        };

        try {
            const res = await fetch("/api/segmentation/predict", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    clientName: selectedClient === "__nouveau__" ? "Nouveau client" : selectedClient,
                    ...rfm
                }),
            });
            const text = await res.text();
            if (!text) throw new Error("Réponse vide du serveur.");
            const data = JSON.parse(text);
            if (!res.ok) throw new Error(data.message || "Erreur serveur.");
            setResult(data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setSelectedClient("");
        setRfmData(null);
        setIsNewClient(false);
        setManualRfm({ recence: "", frequence: "", ca_total: "", marge_moyenne: "" });
        setResult(null);
        setError(null);
    };

    const segConf = result ? (SEGMENT_CONFIG[result.segment] ?? SEGMENT_CONFIG["Faible valeur"]) : null;
    const prioConf = result ? (PRIORITY_CONFIG[result.recommendation?.priority] ?? PRIORITY_CONFIG["Indéterminée"]) : null;

    return (
        <div style={{ fontFamily: "'Segoe UI', sans-serif", padding: "2rem", maxWidth: 1000, margin: "0 auto" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", borderBottom: `3px solid ${COLORS.violet}`, paddingBottom: "1rem", marginBottom: "2rem" }}>
                <div style={{ width: 6, height: 44, background: COLORS.red, borderRadius: 3 }} />
                <div>
                    <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: COLORS.violet }}>
                        Segmentation Client — Modèle RFM K-Means
                    </h1>
                    <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>
                        Tandem Logistics · Dynamix Services · 4 segments : VIP, Fidèle, À risque, Faible valeur
                    </p>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "1.5rem" }}>

                {/* Formulaire */}
                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "1.5rem", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                    <h2 style={{ margin: "0 0 1.25rem", fontSize: "1rem", fontWeight: 700, color: COLORS.violet }}>
                        Sélection du client
                    </h2>

                    {/* Sélecteur client */}
                    <div style={{ marginBottom: "1.25rem" }}>
                        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#374151", marginBottom: "0.3rem" }}>
                            Client <span style={{ color: COLORS.red }}>*</span>
                        </label>
                        <select
                            value={selectedClient}
                            onChange={(e) => handleClientChange(e.target.value)}
                            style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1.5px solid #d1d5db", borderRadius: 8, fontSize: "0.875rem", background: "#fff", cursor: "pointer", outline: "none", boxSizing: "border-box" }}
                        >
                            <option value="">-- Sélectionner un client --</option>
                           
                            {clients.map((c) => (
                                <option key={c.clientName} value={c.clientName}>{c.clientName}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ height: 1, background: "#f3f4f6", marginBottom: "1.25rem" }} />

                    {/* Données RFM */}
                    {selectedClient && selectedClient !== "__nouveau__" && (
                        <div style={{ marginBottom: "1.25rem" }}>
                            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem", paddingBottom: "0.375rem", borderBottom: "1px solid #f3f4f6" }}>
                                📊 Données RFM — chargées automatiquement
                            </div>

                            {loadingRfm ? (
                                <div style={{ textAlign: "center", padding: "1.5rem", color: COLORS.violet }}>
                                    ⏳ Chargement des données depuis le DWH...
                                </div>
                            ) : rfmData ? (
                                <>
                                    {/* Badge client existant/nouveau */}
                                    <div style={{ marginBottom: "0.875rem" }}>
                                        <span style={{
                                            padding: "3px 10px", borderRadius: 12, fontSize: "0.78rem", fontWeight: 600,
                                            background: rfmData.isExisting ? "#dcfce7" : "#fef3c7",
                                            color: rfmData.isExisting ? "#16a34a" : "#d97706"
                                        }}>
                                            {rfmData.isExisting ? "✅ Client actif dans le DWH" : "⚠️ Client sans historique de facturation"}
                                        </span>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
                                        <ReadOnlyField label="Récence" value={rfmData.recence} unit="jours" />
                                        <ReadOnlyField label="Fréquence" value={rfmData.frequence} unit="factures" />
                                        <ReadOnlyField label="CA Total" value={rfmData.ca_Total} unit="TND" />
                                        <ReadOnlyField label="Marge Moyenne" value={rfmData.marge_Moyenne} unit="%" />
                                    </div>
                                </>
                            ) : null}
                        </div>
                    )}

                    {/* Nouveau client — saisie manuelle */}
                    {selectedClient && rfmData && !loadingRfm && (
                        <div style={{ marginBottom: "1.25rem" }}>
                            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem", paddingBottom: "0.375rem", borderBottom: "1px solid #f3f4f6" }}>
                                📊 Données RFM
                                {!rfmData.isExisting && (
                                    <span style={{ marginLeft: "0.5rem", color: "#d97706", fontWeight: 600 }}>
                                        — client inactif, modifiez les valeurs si nécessaire
                                    </span>
                                )}
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
                                {[
                                    { key: "recence", label: "Récence", unit: "jours", value: rfmData.recence },
                                    { key: "frequence", label: "Fréquence", unit: "factures", value: rfmData.frequence },
                                    { key: "ca_Total", label: "CA Total", unit: "TND", value: rfmData.ca_Total },
                                    { key: "marge_Moyenne", label: "Marge Moyenne", unit: "%", value: rfmData.marge_Moyenne },
                                ].map((f) => (
                                    <div key={f.key}>
                                        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#374151", marginBottom: "0.3rem" }}>
                                            {f.label} <span style={{ color: "#9ca3af", fontWeight: 400 }}>({f.unit})</span>
                                            {rfmData.isExisting && (
                                                <span style={{ color: "#16a34a", fontSize: "0.7rem", marginLeft: "0.375rem" }}>✓ auto</span>
                                            )}
                                        </label>
                                        <input
                                            type="number"
                                            value={rfmData[f.key] ?? 0}
                                            onChange={(e) => setRfmData((d) => ({ ...d, [f.key]: parseFloat(e.target.value) || 0 }))}
                                            style={{ width: "100%", padding: "0.5rem 0.75rem", border: `1.5px solid ${rfmData.isExisting ? "#d1fae5" : "#fde68a"}`, borderRadius: 8, fontSize: "0.875rem", outline: "none", boxSizing: "border-box", background: rfmData.isExisting ? "#f0fdf4" : "#fffbeb" }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Boutons */}
                    <div style={{ display: "flex", gap: "0.75rem" }}>
                        <button
                            onClick={handlePredict}
                            disabled={loading || !selectedClient || loadingRfm}
                            style={{ flex: 1, padding: "0.75rem", background: loading || !selectedClient || loadingRfm ? "#9ca3af" : COLORS.violet, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: "0.95rem", cursor: loading || !selectedClient ? "not-allowed" : "pointer" }}>
                            {loading ? "⏳ Analyse en cours..." : "🔍 Segmenter ce client"}
                        </button>
                        <button onClick={handleReset}
                            style={{ padding: "0.75rem 1.25rem", background: "#f9fafb", color: "#374151", border: "1.5px solid #e5e7eb", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: "0.875rem" }}>
                            Réinitialiser
                        </button>
                    </div>

                    {error && (
                        <div style={{ marginTop: "1rem", padding: "0.75rem", borderRadius: 8, background: "#fee2e2", color: "#dc2626", fontSize: "0.875rem" }}>
                            ❌ {error}
                        </div>
                    )}
                </div>

                {/* Résultat */}
                <div>
                    {result && segConf ? (
                        <div style={{ background: "#fff", border: `2px solid ${segConf.border}`, borderRadius: 12, padding: "1.5rem", boxShadow: `0 4px 20px ${segConf.border}20` }}>
                            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                                <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>{segConf.icon}</div>
                                <div style={{ fontSize: "1.6rem", fontWeight: 900, color: segConf.color }}>{result.segment}</div>
                                <div style={{ fontSize: "0.82rem", color: "#6b7280", marginTop: "0.25rem" }}>
                                    Cluster #{result.cluster} · {result.clientName}
                                </div>
                            </div>

                            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
                                <span style={{ padding: "4px 14px", borderRadius: 12, background: prioConf?.bg, color: prioConf?.color, fontSize: "0.8rem", fontWeight: 700 }}>
                                    Priorité : {result.recommendation?.priority}
                                </span>
                            </div>

                            <div style={{ background: segConf.bg, borderRadius: 8, padding: "1rem", marginBottom: "1.25rem", border: `1px solid ${segConf.border}33` }}>
                                <div style={{ fontWeight: 700, fontSize: "0.875rem", color: segConf.color, marginBottom: "0.625rem" }}>
                                    🎯 {result.recommendation?.action}
                                </div>
                                <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                                    {result.recommendation?.details?.map((d, i) => (
                                        <li key={i} style={{ fontSize: "0.8rem", color: "#374151", marginBottom: "0.25rem", lineHeight: 1.5 }}>{d}</li>
                                    ))}
                                </ul>
                            </div>

                            {/* KPIs */}
                            <div style={{ background: "#f9fafb", borderRadius: 8, padding: "0.875rem", border: "1px solid #e5e7eb" }}>
                                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.625rem" }}>
                                    Données analysées
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                                    {[
                                        { label: "Récence", value: `${Math.round(isNewClient ? manualRfm.recence : rfmData?.recence || 0)} jours` },
                                        { label: "Fréquence", value: `${Math.round(isNewClient ? manualRfm.frequence : rfmData?.frequence || 0)} factures` },
                                        { label: "CA Total", value: `${parseFloat(isNewClient ? manualRfm.ca_total : rfmData?.ca_Total || 0).toLocaleString("fr-FR")} TND` },
                                        { label: "Marge moy.", value: `${parseFloat(isNewClient ? manualRfm.marge_moyenne : rfmData?.marge_Moyenne || 0).toFixed(1)}%` },
                                    ].map((kpi) => (
                                        <div key={kpi.label} style={{ textAlign: "center" }}>
                                            <div style={{ fontSize: "0.7rem", color: "#9ca3af" }}>{kpi.label}</div>
                                            <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "#1f2937" }}>{kpi.value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#9ca3af", textAlign: "center" }}>
                                Analysé le {new Date(result.predictedAt).toLocaleString("fr-FR")}
                            </div>
                        </div>
                    ) : (
                        <div style={{ background: COLORS.lightViolet, borderRadius: 12, padding: "3rem 2rem", textAlign: "center", color: COLORS.violet }}>
                            <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>🎯</div>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: "0.95rem" }}>Sélectionnez un client</p>
                            <p style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", color: "#6b7280" }}>
                                Les données RFM se rempliront automatiquement depuis le Data Warehouse.
                            </p>
                            <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                {[
                                    { icon: "👑", label: "VIP", desc: "Récent, fréquent, CA élevé" },
                                    { icon: "⭐", label: "Fidèle", desc: "Régulier, CA moyen" },
                                    { icon: "⚠️", label: "À risque", desc: "Inactif, à réactiver" },
                                    { icon: "📉", label: "Faible valeur", desc: "Peu actif, faible CA" },
                                ].map((s) => (
                                    <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: "#fff", borderRadius: 8, padding: "0.625rem 0.875rem", textAlign: "left" }}>
                                        <span style={{ fontSize: "1.1rem" }}>{s.icon}</span>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: "0.82rem", color: COLORS.violet }}>{s.label}</div>
                                            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{s.desc}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}