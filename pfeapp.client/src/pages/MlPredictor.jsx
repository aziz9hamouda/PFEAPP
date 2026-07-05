import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";

const COLORS = {
    violet: "#3B1F8C",
    red: "#C8102E",
    lightViolet: "#EDE9F8",
    success: "#16a34a",
    error: "#dc2626",
    warning: "#d97706",
};

const TYPES_CONTENEUR = [
    "20'DC", "20'FR", "20'OT", "20'TK", "40'DC", "40'FR",
    "40'HC", "40'HR", "40'OT", "45'HC", "INCONNU", "MAFI", "TRAILER"
];

// Jauge circulaire
function MargeGauge({ value }) {
    const clamped = Math.max(-20, Math.min(120, value));
    const pct = (clamped + 20) / 140;
    const circumference = 2 * Math.PI * 54;
    const dashOffset = circumference * (1 - pct);
    const color = value < 0 ? COLORS.error : value < 20 ? COLORS.warning : COLORS.success;

    return (
        <div style={{ textAlign: "center" }}>
            <svg width="150" height="150" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="none" stroke="#f3f4f6" strokeWidth="10" />
                <circle cx="60" cy="60" r="54" fill="none" stroke={color} strokeWidth="10"
                    strokeDasharray={circumference} strokeDashoffset={dashOffset}
                    strokeLinecap="round" transform="rotate(-90 60 60)"
                    style={{ transition: "stroke-dashoffset 0.8s ease" }}
                />
                <text x="60" y="54" textAnchor="middle" fontSize="22" fontWeight="800" fill={color}>
                    {value.toFixed(1)}%
                </text>
                <text x="60" y="72" textAnchor="middle" fontSize="10" fill="#9ca3af">
                    Marge prédite
                </text>
            </svg>
        </div>
    );
}

let uid = 0;
function useUid() {
    const [id] = useState(() => `field-${++uid}`);
    return id;
}

// Champ texte + <datalist> : tapez pour filtrer les suggestions au lieu de dérouler une longue liste.
function SelectField({ label, value, onChange, options, disabled, required, placeholder, error }) {
    const listId = useUid();
    const normalized = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
    return (
        <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: disabled ? "#9ca3af" : "#374151", marginBottom: "0.3rem" }}>
                {label} {required && <span style={{ color: COLORS.red }}>*</span>}
            </label>
            <input
                list={listId}
                value={value}
                disabled={disabled}
                placeholder={placeholder || "Tapez pour rechercher..."}
                onChange={(e) => {
                    const typed = e.target.value;
                    const match = normalized.find((o) => o.label === typed || o.value === typed);
                    onChange(match ? match.value : typed);
                }}
                style={{
                    width: "100%", padding: "0.5rem 0.625rem",
                    border: `1.5px solid ${error ? COLORS.red : disabled ? "#e5e7eb" : "#d1d5db"}`,
                    borderRadius: 6, fontSize: "0.825rem",
                    background: disabled ? "#f9fafb" : "#fff",
                    cursor: disabled ? "not-allowed" : "text",
                    outline: "none", boxSizing: "border-box", color: disabled ? "#9ca3af" : "#1f2937"
                }} />
            <datalist id={listId}>
                {normalized.map((o) => <option key={o.value} value={o.label} />)}
            </datalist>
            {error && <div style={{ color: COLORS.red, fontSize: "0.72rem", marginTop: "0.25rem" }}>{error}</div>}
        </div>
    );
}

function NumberField({ label, value, onChange, min, step, required, error }) {
    return (
        <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#374151", marginBottom: "0.3rem" }}>
                {label} {required && <span style={{ color: COLORS.red }}>*</span>}
            </label>
            <input type="number" value={value} min={min} step={step || 1}
                onChange={(e) => onChange(e.target.value)}
                style={{ width: "100%", padding: "0.5rem 0.625rem", border: `1.5px solid ${error ? COLORS.red : "#d1d5db"}`, borderRadius: 6, fontSize: "0.825rem", outline: "none", boxSizing: "border-box" }}
            />
            {error && <div style={{ color: COLORS.red, fontSize: "0.72rem", marginTop: "0.25rem" }}>{error}</div>}
        </div>
    );
}

function ReadOnlyField({ label, value }) {
    return (
        <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#9ca3af", marginBottom: "0.3rem" }}>
                {label} <span style={{ fontSize: "0.7rem", fontWeight: 400 }}>(auto)</span>
            </label>
            <div style={{
                width: "100%", padding: "0.5rem 0.625rem",
                border: "1.5px solid #e5e7eb", borderRadius: 6,
                fontSize: "0.825rem", background: "#f9fafb",
                color: value ? "#374151" : "#9ca3af",
                boxSizing: "border-box", minHeight: 36
            }}>
                {value || "— rempli automatiquement —"}
            </div>
        </div>
    );
}

function PredictionHistory() {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        apiFetch("/api/ml/predictions/history")
            .then((r) => r.json())
            .then((data) => setHistory(Array.isArray(data) ? data : []))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>Chargement...</div>;

    return (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                    <tr style={{ background: COLORS.violet }}>
                        {["Date", "Client", "Marge prédite", "Demandé par"].map((h) => (
                            <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#fff", fontWeight: 700, fontSize: "0.78rem" }}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {history.map((h) => {
                        const input = JSON.parse(h.inputJson || "{}");
                        const result = JSON.parse(h.resultJson || "{}");
                        return (
                            <tr key={h.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                <td style={{ padding: "0.625rem 1rem", color: "#6b7280" }}>{new Date(h.predictedAt).toLocaleString("fr-FR")}</td>
                                <td style={{ padding: "0.625rem 1rem", color: "#374151" }}>{input.ClientName || "—"}</td>
                                <td style={{ padding: "0.625rem 1rem", fontWeight: 700, color: COLORS.violet }}>{result.pctMargePredite?.toFixed(1)}%</td>
                                <td style={{ padding: "0.625rem 1rem", color: "#9ca3af" }}>{h.predictedByEmail || "—"}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {history.length === 0 && <div style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>Aucune prédiction enregistrée.</div>}
        </div>
    );
}

function ToggleField({ label, value, onChange }) {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0" }}>
            <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#374151" }}>{label}</label>
            <div onClick={() => onChange(!value)} style={{
                width: 44, height: 24, borderRadius: 12, cursor: "pointer",
                background: value ? COLORS.violet : "#d1d5db", position: "relative", transition: "background 0.2s ease"
            }}>
                <div style={{
                    position: "absolute", top: 3, left: value ? 23 : 3,
                    width: 18, height: 18, borderRadius: "50%", background: "#fff",
                    transition: "left 0.2s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
                }} />
            </div>
        </div>
    );
}

export default function MlPredictor() {
    // Données référentiel depuis DWH
    const [clients, setClients] = useState([]);
    const [ports, setPorts] = useState([]);
    const [navires, setNavires] = useState([]);
    const [loadingRef, setLoadingRef] = useState(true);

    // Features
    const [features, setFeatures] = useState({
        MontantVenteTotalDS: "",
        NbConteneurs: "",
        PoidsBrutTotal: "",
        IsPorteConteneurs: false,
        HasDangereux: false,
        ClientName: "",
        CustomerPostingGroup: "",  // auto
        CountryCode: "",           // auto
        DesignationNavire: "",
        PortOrigine: "",
        PortDestination: "",
        TypeConteneurPrincipal: "",
    });

    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [fieldErrors, setFieldErrors] = useState({});
    const [tab, setTab] = useState("predict"); // "predict" | "history"

    // Charger les référentiels au montage
    useEffect(() => {
        Promise.all([
            fetch("/api/referentiel/clients").then((r) => r.json()),
            fetch("/api/referentiel/ports").then((r) => r.json()),
            fetch("/api/referentiel/navires").then((r) => r.json()),
        ])
            .then(([c, p, n]) => {
                setClients(c);
                setPorts(p);
                setNavires(n);
            })
            .catch((e) => setError(`Impossible de charger les référentiels : ${e.message}`))
            .finally(() => setLoadingRef(false));
    }, []);

    const set = (key, val) => setFeatures((f) => ({ ...f, [key]: val }));

    // Quand le client change → remplir automatiquement GroupeComptable et CodePays
    const handleClientChange = (clientName) => {
        const client = clients.find((c) => c.clientName === clientName);
        setFeatures((f) => ({
            ...f,
            ClientName: clientName,
            CustomerPostingGroup: client?.customerPostingGroup || "",
            CountryCode: client?.countryCode || "",
        }));
    };

    const validate = () => {
        const errs = {};
        if (!features.ClientName.trim()) errs.ClientName = "Le client est obligatoire.";
        const montant = parseFloat(features.MontantVenteTotalDS);
        if (!features.MontantVenteTotalDS || isNaN(montant) || montant <= 0)
            errs.MontantVenteTotalDS = "Montant requis, supérieur à 0.";
        if (features.NbConteneurs !== "" && parseFloat(features.NbConteneurs) < 0)
            errs.NbConteneurs = "Ne peut pas être négatif.";
        if (features.PoidsBrutTotal !== "" && parseFloat(features.PoidsBrutTotal) < 0)
            errs.PoidsBrutTotal = "Ne peut pas être négatif.";
        return errs;
    };

    const handlePredict = async () => {
        const errs = validate();
        setFieldErrors(errs);
        if (Object.keys(errs).length > 0) {
            setError("Veuillez corriger les champs en erreur.");
            return;
        }
        setLoading(true);
        setError(null);
        setResult(null);

        const payload = {
            features: {
                MontantVenteTotalDS: parseFloat(features.MontantVenteTotalDS) || 0,
                NbConteneurs: parseFloat(features.NbConteneurs) || 0,
                PoidsBrutTotal: parseFloat(features.PoidsBrutTotal) || 0,
                IsPorteConteneurs: features.IsPorteConteneurs ? 1 : 0,
                HasDangereux: features.HasDangereux ? 1 : 0,
                ClientName: features.ClientName,
                CustomerPostingGroup: features.CustomerPostingGroup,
                CountryCode: features.CountryCode,
                DesignationNavire: features.DesignationNavire,
                PortOrigine: features.PortOrigine,
                PortDestination: features.PortDestination,
                TypeConteneurPrincipal: features.TypeConteneurPrincipal,
            }
        };

        try {
            const res = await apiFetch("/api/ml/predict", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
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
        setFeatures({
            MontantVenteTotalDS: "", NbConteneurs: "", PoidsBrutTotal: "",
            IsPorteConteneurs: false, HasDangereux: false,
            ClientName: "", CustomerPostingGroup: "", CountryCode: "",
            DesignationNavire: "", PortOrigine: "", PortDestination: "",
            TypeConteneurPrincipal: "",
        });
        setResult(null);
        setError(null);
        setFieldErrors({});
    };

    const portOptions = ports.map((p) => ({
        value: p.portCode,
        label: p.portName ? `${p.portCode} — ${p.portName}` : p.portCode
    }));

    const clientOptions = clients.map((c) => c.clientName);

    if (loadingRef) return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", fontFamily: "'Segoe UI', sans-serif" }}>
            <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⏳</div>
                <div style={{ color: COLORS.violet, fontWeight: 600 }}>Chargement des référentiels...</div>
            </div>
        </div>
    );

    return (
        <div style={{ fontFamily: "'Segoe UI', sans-serif", padding: "2rem", maxWidth: 1100, margin: "0 auto" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", borderBottom: `3px solid ${COLORS.violet}`, paddingBottom: "1rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{ width: 6, height: 44, background: COLORS.red, borderRadius: 3 }} />
                    <div>
                        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: COLORS.violet }}>
                            Prédiction de Marge
                        </h1>
                        <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>
                            Tandem Logistics · Dynamix Services
                        </p>
                    </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    {[["predict", "🔮 Prédire"], ["history", "📜 Historique"]].map(([id, label]) => (
                        <button key={id} onClick={() => setTab(id)}
                            style={{ padding: "0.5rem 1rem", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem", background: tab === id ? COLORS.violet : "#f3f4f6", color: tab === id ? "#fff" : "#374151" }}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {tab === "history" && <PredictionHistory />}

            {tab === "predict" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "1.5rem" }}>

                {/* Formulaire */}
                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "1.5rem", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                    <h2 style={{ margin: "0 0 1.25rem", fontSize: "1rem", fontWeight: 700, color: COLORS.violet }}>
                        Caractéristiques du dossier
                    </h2>

                    {/* Données financières */}
                    <div style={{ marginBottom: "1.25rem" }}>
                        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem", paddingBottom: "0.375rem", borderBottom: "1px solid #f3f4f6" }}>
                            📦 Données financières & physiques
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.875rem" }}>
                            <NumberField label="Montant Vente Total (DS)" value={features.MontantVenteTotalDS} onChange={(v) => set("MontantVenteTotalDS", v)} min={0} step={100} required error={fieldErrors.MontantVenteTotalDS} />
                            <NumberField label="Nombre de Conteneurs" value={features.NbConteneurs} onChange={(v) => set("NbConteneurs", v)} min={0} error={fieldErrors.NbConteneurs} />
                            <NumberField label="Poids Brut Total (kg)" value={features.PoidsBrutTotal} onChange={(v) => set("PoidsBrutTotal", v)} min={0} step={100} error={fieldErrors.PoidsBrutTotal} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem", marginTop: "0.875rem" }}>
                            <ToggleField label="Porte-Conteneurs" value={features.IsPorteConteneurs} onChange={(v) => set("IsPorteConteneurs", v)} />
                            <ToggleField label="Marchandises Dangereuses" value={features.HasDangereux} onChange={(v) => set("HasDangereux", v)} />
                        </div>
                    </div>

                    {/* Informations client */}
                    <div style={{ marginBottom: "1.25rem" }}>
                        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem", paddingBottom: "0.375rem", borderBottom: "1px solid #f3f4f6" }}>
                            👤 Informations client
                        </div>
                        <div style={{ marginBottom: "0.875rem" }}>
                            <SelectField
                                label="Client"
                                value={features.ClientName}
                                onChange={handleClientChange}
                                options={clientOptions}
                                required
                                placeholder="Tapez pour rechercher un client..."
                                error={fieldErrors.ClientName}
                            />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
                            <ReadOnlyField label="Groupe Comptable Client" value={features.CustomerPostingGroup} />
                            <ReadOnlyField label="Code Pays" value={features.CountryCode} />
                        </div>
                        {!features.ClientName && (
                            <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#9ca3af", fontStyle: "italic" }}>
                                ℹ️ Le groupe comptable et le code pays seront remplis automatiquement après sélection du client.
                            </div>
                        )}
                    </div>

                    {/* Informations transport */}
                    <div style={{ marginBottom: "1.5rem" }}>
                        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem", paddingBottom: "0.375rem", borderBottom: "1px solid #f3f4f6" }}>
                            🚢 Informations transport
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem", marginBottom: "0.875rem" }}>
                            <SelectField label="Port Origine" value={features.PortOrigine} onChange={(v) => set("PortOrigine", v)} options={portOptions} />
                            <SelectField label="Port Destination" value={features.PortDestination} onChange={(v) => set("PortDestination", v)} options={portOptions} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
                            <SelectField label="Désignation Navire" value={features.DesignationNavire} onChange={(v) => set("DesignationNavire", v)} options={navires} />
                            <SelectField label="Type Conteneur Principal" value={features.TypeConteneurPrincipal} onChange={(v) => set("TypeConteneurPrincipal", v)} options={TYPES_CONTENEUR} />
                        </div>
                    </div>

                    {/* Boutons */}
                    <div style={{ display: "flex", gap: "0.75rem" }}>
                        <button onClick={handlePredict} disabled={loading}
                            style={{ flex: 1, padding: "0.75rem", background: loading ? "#9ca3af" : COLORS.violet, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: "0.95rem", cursor: loading ? "not-allowed" : "pointer" }}>
                            {loading ? "⏳ Calcul en cours..." : "🔮 Prédire la marge"}
                        </button>
                        <button onClick={handleReset}
                            style={{ padding: "0.75rem 1.25rem", background: "#f9fafb", color: "#374151", border: "1.5px solid #e5e7eb", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: "0.875rem" }}>
                            Réinitialiser
                        </button>
                    </div>

                    {error && (
                        <div style={{ marginTop: "1rem", padding: "0.75rem", borderRadius: 8, background: "#fee2e2", color: COLORS.error, fontSize: "0.875rem" }}>
                            ❌ {error}
                        </div>
                    )}
                </div>

                {/* Résultat */}
                <div>
                    {result ? (
                        <div style={{ background: "#fff", border: `2px solid ${COLORS.violet}`, borderRadius: 12, padding: "1.5rem", boxShadow: `0 4px 20px ${COLORS.violet}15` }}>
                            <h3 style={{ margin: "0 0 1rem", color: COLORS.violet, fontSize: "1rem", fontWeight: 700 }}>Résultat</h3>
                            <MargeGauge value={result.pctMargePredite} />
                            <div style={{ marginTop: "1rem", padding: "0.75rem", borderRadius: 8, background: COLORS.lightViolet, textAlign: "center", color: COLORS.violet, fontWeight: 600, fontSize: "0.875rem" }}>
                                {result.interpretation}
                            </div>
                            <div style={{ marginTop: "0.75rem", fontSize: "0.78rem", color: "#9ca3af", textAlign: "center" }}>
                                Calculé le {new Date(result.predictedAt).toLocaleString("fr-FR")}
                            </div>

                            {/* Récapitulatif client */}
                            {features.ClientName && (
                                <div style={{ marginTop: "1rem", padding: "0.75rem", borderRadius: 8, background: "#f9fafb", border: "1px solid #e5e7eb", fontSize: "0.78rem" }}>
                                    <div style={{ fontWeight: 700, color: "#374151", marginBottom: "0.375rem" }}>📋 Récapitulatif</div>
                                    <div style={{ color: "#6b7280" }}><b>Client :</b> {features.ClientName}</div>
                                    <div style={{ color: "#6b7280" }}><b>Groupe :</b> {features.CustomerPostingGroup}</div>
                                    <div style={{ color: "#6b7280" }}><b>Pays :</b> {features.CountryCode}</div>
                                    <div style={{ color: "#6b7280" }}><b>Montant :</b> {parseFloat(features.MontantVenteTotalDS).toLocaleString("fr-FR")} DS</div>
                                </div>
                            )}

                            {result.recommendations?.length > 0 && (
                                <div style={{ marginTop: "0.75rem", padding: "0.875rem", borderRadius: 8, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                                    <div style={{ fontWeight: 700, fontSize: "0.8rem", color: COLORS.violet, marginBottom: "0.5rem" }}>🎯 Recommandations</div>
                                    <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                                        {result.recommendations.map((r, i) => (
                                            <li key={i} style={{ fontSize: "0.78rem", color: "#374151", marginBottom: "0.25rem", lineHeight: 1.5 }}>{r}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ background: COLORS.lightViolet, borderRadius: 12, padding: "3rem 2rem", textAlign: "center", color: COLORS.violet }}>
                            <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>🤖</div>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: "0.95rem" }}>Remplissez le formulaire</p>
                            <p style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", color: "#6b7280" }}>
                                Le modèle estimera le % de marge brute du dossier logistique.
                            </p>
                        </div>
                    )}
                </div>
            </div>
            )}
        </div>
    );
}