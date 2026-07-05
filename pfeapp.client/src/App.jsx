import { useState } from "react";
import Login from "./pages/Login";
import SsisRunner from "./pages/SsisRunner";
import PowerBiDash from "./pages/PowerBiDash";
import "./App.css";
import MlPredictor from "./pages/MlPredictor";
import SegmentationPredictor from "./pages/SegmentationPredictor";
import UserManagement from "./pages/admin/UserManagement";
import EtlHistory from "./pages/admin/EtlHistory";
import ResetPassword from "./pages/ResetPassword";
import AgentWidget from "./components/AgentWidget";
import { clearToken } from "./lib/api";

const COLORS = {
    violet: "#3B1F8C",
    red: "#C8102E",
    lightViolet: "#EDE9F8",
};

// Topbar + bouton retour partagés par toutes les pages internes (hors login/modules)
function PageShell({ title, user, onBack, onLogout, children }) {
    return (
        <div>
            <div style={{
                background: COLORS.violet, padding: "0 2rem",
                height: 60, display: "flex", alignItems: "center",
                justifyContent: "space-between",
                boxShadow: "0 2px 8px rgba(59,31,140,0.3)",
                fontFamily: "'Segoe UI', sans-serif"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <button onClick={onBack} style={{
                        background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
                        color: "#fff", borderRadius: 6, padding: "0.375rem 0.75rem",
                        cursor: "pointer", fontSize: "0.85rem", fontWeight: 500
                    }}>← Retour</button>
                    <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.2)" }} />
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: COLORS.red, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: "0.9rem" }}>D</div>
                    <span style={{ color: "#fff", fontWeight: 700 }}>Dynamix Services</span>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>|</span>
                    <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.875rem" }}>{title}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ color: "#fff", fontSize: "0.85rem" }}>{user?.displayName}</span>
                    <button onClick={onLogout} style={{ padding: "0.375rem 0.875rem", borderRadius: 6, background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", fontSize: "0.8rem", cursor: "pointer" }}>
                        Déconnexion
                    </button>
                </div>
            </div>
            {children}
        </div>
    );
}

// Page de sélection du module après connexion
function ModuleSelector({ user, onSelect, onLogout }) {
    const [hovering, setHovering] = useState(null);
    const isAdmin = user?.roleCode === "ADMIN";

    const modules = [
        {
            id: "etl",
            icon: "⚙️",
            title: "ETL Runner",
            desc: "Alimenter le Data Warehouse via les packages SSIS",
            color: COLORS.violet,
            available: isAdmin, // réservé à l'Administrateur
        },
        {
            id: "powerbi",
            icon: "📊",
            title: "Dashboards Power BI",
            desc: "KPIs financiers, logistique & analyse des frais dossiers",
            color: "#0078d4",
            available: true,
        },
        {
            id: "ml",
            icon: "🤖",
            title: "Prédiction IA",
            desc: "Modèle XGBoost de prédiction de marge brute",
            color: COLORS.red,
            available: true,
        },
        {
            id: "segmentation",
            icon: "🎯",
            title: "Segmentation Clients",
            desc: "Modèle RFM K-Means — 4 segments clients",
            color: "#C0392B",
            available: user?.roleCode !== "LOG",
        },
        {
            id: "admin-users",
            icon: "👥",
            title: "Gestion Utilisateurs",
            desc: "Comptes Tandem Logistics — activer/désactiver",
            color: "#0f766e",
            available: isAdmin,
        },
        {
            id: "admin-etl",
            icon: "📜",
            title: "Historique ETL",
            desc: "Exécutions passées, logs détaillés, relance de packages",
            color: "#7c3aed",
            available: isAdmin,
        },
    ].filter((m) => isAdmin || !m.id.startsWith("admin-"));

    return (
        <div style={{
            minHeight: "100vh", background: "#f8f9fa",
            fontFamily: "'Segoe UI', sans-serif",
        }}>
            {/* Topbar */}
            <div style={{
                background: COLORS.violet, padding: "0 2rem",
                height: 60, display: "flex", alignItems: "center",
                justifyContent: "space-between",
                boxShadow: "0 2px 8px rgba(59,31,140,0.3)"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: COLORS.red, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: "0.9rem" }}>D</div>
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: "1rem" }}>Dynamix Services</span>
                    <span style={{ color: "rgba(255,255,255,0.4)", margin: "0 0.5rem" }}>|</span>
                    <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.875rem" }}>Tandem Logistics Analytics Hub</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.9rem" }}>👤</div>
                        <span style={{ color: "#fff", fontSize: "0.85rem", fontWeight: 500 }}>{user?.displayName || "Utilisateur"}</span>
                    </div>
                    <button onClick={onLogout} style={{
                        padding: "0.375rem 0.875rem", borderRadius: 6,
                        background: "rgba(255,255,255,0.1)", color: "#fff",
                        border: "1px solid rgba(255,255,255,0.2)",
                        fontSize: "0.8rem", cursor: "pointer", fontWeight: 500
                    }}>
                        Déconnexion
                    </button>
                </div>
            </div>

            {/* Contenu */}
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: "4rem 2rem" }}>
                <div style={{ textAlign: "center", marginBottom: "3rem" }}>
                    <h1 style={{ margin: "0 0 0.75rem", fontSize: "2rem", fontWeight: 800, color: COLORS.violet }}>
                        Choisissez votre module
                    </h1>
                    <p style={{ margin: 0, color: "#6b7280", fontSize: "1rem" }}>
                        Sélectionnez l'outil que vous souhaitez utiliser
                    </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem" }}>
                    {modules.map((mod) => (
                        <div
                            key={mod.id}
                            onClick={() => mod.available && onSelect(mod.id)}
                            onMouseEnter={() => mod.available && setHovering(mod.id)}
                            onMouseLeave={() => setHovering(null)}
                            style={{
                                background: "#fff",
                                border: `2px solid ${hovering === mod.id ? mod.color : "#e5e7eb"}`,
                                borderRadius: 16, padding: "2rem 1.5rem",
                                cursor: mod.available ? "pointer" : "not-allowed",
                                textAlign: "center",
                                transition: "all 0.2s ease",
                                opacity: mod.available ? 1 : 0.55,
                                transform: hovering === mod.id ? "translateY(-4px)" : "none",
                                boxShadow: hovering === mod.id
                                    ? `0 12px 30px ${mod.color}22`
                                    : "0 2px 8px rgba(0,0,0,0.06)",
                            }}
                        >
                            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>{mod.icon}</div>
                            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#1f2937", marginBottom: "0.5rem" }}>
                                {mod.title}
                            </div>
                            <div style={{ fontSize: "0.825rem", color: "#6b7280", lineHeight: 1.5 }}>
                                {mod.desc}
                            </div>
                            {!mod.available && (
                                <div style={{
                                    marginTop: "1rem", display: "inline-block",
                                    padding: "3px 10px", borderRadius: 12,
                                    background: "#f3f4f6", color: "#9ca3af",
                                    fontSize: "0.72rem", fontWeight: 600
                                }}>
                                    Non disponible pour votre rôle
                                </div>
                            )}
                            {mod.available && (
                                <div style={{
                                    marginTop: "1rem", display: "inline-block",
                                    padding: "3px 10px", borderRadius: 12,
                                    background: hovering === mod.id ? mod.color : COLORS.lightViolet,
                                    color: hovering === mod.id ? "#fff" : mod.color,
                                    fontSize: "0.78rem", fontWeight: 700,
                                    transition: "all 0.2s ease"
                                }}>
                                    Accéder →
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

const PAGES = {
    etl: { title: "ETL Runner", Component: SsisRunner },
    ml: { title: "Prediction", Component: MlPredictor },
    segmentation: { title: "Segmentation", Component: SegmentationPredictor },
    "admin-users": { title: "Gestion Utilisateurs", Component: UserManagement },
    "admin-etl": { title: "Historique ETL", Component: EtlHistory },
};

export default function App() {
    const [page, setPage] = useState("login");
    const [user, setUser] = useState(null);
    const [activeDashboard, setActiveDashboard] = useState("");

    // Lien emailé (mot de passe oublié) : accessible directement, sans login préalable.
    if (window.location.pathname === "/reset-password") {
        return <ResetPassword />;
    }

    const handleLogin = (userData) => {
        setUser(userData || { displayName: "Utilisateur Tandem" });
        setPage("modules");
    };

    const handleLogout = () => {
        clearToken();
        setUser(null);
        setActiveDashboard("");
        setPage("login");
    };

    const handleSelectModule = (moduleId) => {
        setPage(moduleId);
    };

    const handleBackToModules = () => {
        setActiveDashboard("");
        setPage("modules");
    };

    const simplePage = PAGES[page];

    return (
        <>
            {page === "login" && <Login onLogin={handleLogin} />}
            {page === "modules" && <ModuleSelector user={user} onSelect={handleSelectModule} onLogout={handleLogout} />}
            {simplePage && (
                <PageShell title={simplePage.title} user={user} onBack={handleBackToModules} onLogout={handleLogout}>
                    <simplePage.Component />
                </PageShell>
            )}
            {page === "powerbi" && (
                <PageShell title="Dashboard Power BI" user={user} onBack={handleBackToModules} onLogout={handleLogout}>
                    <PowerBiDash user={user} onActiveDashboardChange={setActiveDashboard} />
                </PageShell>
            )}

            {page !== "login" && (
                <AgentWidget user={user} activeDashboard={activeDashboard} onUnauthorized={handleLogout} autoOpenGuide />
            )}
        </>
    );
}
