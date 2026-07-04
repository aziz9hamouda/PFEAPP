import { useState, useEffect } from "react";

const COLORS = {
    violet: "#3B1F8C",
    red: "#C8102E",
    lightViolet: "#EDE9F8",
};

const REPORT_ID = "fc37e583-dd73-43f8-9514-6700689f40ad";
const TENANT_ID = "604f1a96-cbe8-43f8-abbf-f8eaf5d85730";

// Toutes les pages disponibles
const ALL_PAGES = [
    { id: "home", label: "Accueil", icon: "🏠", pageId: "b503507b87db0e55793a" },
    { id: "finance", label: "KPIs Financiers", icon: "💰", pageId: "67a4d1f4c77349ffd16b" },
    { id: "commercial", label: "Performance Commerciale", icon: "📈", pageId: "7d7432665c3a85d68660" },
    { id: "frais", label: "Analyse Frais Dossiers", icon: "🗂️", pageId: "14e72335e0b08e531189" },
    { id: "logistique", label: "Suivi Logistique", icon: "🚢", pageId: "9b5a809b7f100c6b0dc7" },
    { id: "balance", label: "Balance Comptable", icon: "⚖️", pageId: "741df08f0180ac3e5e90" },
];

// Mapping rôle → pages accessibles
const ROLE_PAGES = {
    CEO: ["home", "finance", "commercial", "frais", "logistique", "balance"], // tout
    LOG: ["frais", "logistique"], // uniquement ces deux
};

export default function PowerBiDash({ user }) {
    // Pages autorisées selon le rôle
    const allowedPageIds = ROLE_PAGES[user?.roleCode] ?? [];
    const pages = ALL_PAGES.filter(p => allowedPageIds.includes(p.id));

    const [activePage, setActivePage] = useState(pages[0]?.id ?? "frais");
    const [iframeLoading, setIframeLoading] = useState(true);

    // Mettre à jour la page active si elle change (ex: changement d'utilisateur)
    useEffect(() => {
        setActivePage(pages[0]?.id ?? "frais");
        setIframeLoading(true);
    }, [user?.roleCode]);

    const currentPage = pages.find(p => p.id === activePage) ?? pages[0];
    const embedUrl = `https://app.powerbi.com/reportEmbed?reportId=${REPORT_ID}&autoAuth=true&ctid=${TENANT_ID}&pageName=${currentPage?.pageId}&navContentPaneEnabled=false&filterPaneEnabled=false`;

    return (
        <div style={{
            fontFamily: "'Segoe UI', sans-serif",
            height: "calc(100vh - 60px)",
            display: "flex", flexDirection: "column",
            background: "#fff"
        }}>
            {/* Barre de navigation des pages */}
            <div style={{
                background: "#fff",
                borderBottom: `3px solid ${COLORS.violet}`,
                padding: "0 1.5rem",
                display: "flex", alignItems: "center",
                gap: "0.25rem", overflowX: "auto",
                boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
                minHeight: 52, flexShrink: 0,
            }}>
                {/* Badge rôle + email */}
                <div style={{
                    display: "flex", alignItems: "center", gap: "0.5rem",
                    marginRight: "1rem", paddingRight: "1rem",
                    borderRight: "1px solid #e5e7eb", whiteSpace: "nowrap"
                }}>
                    <span style={{
                        padding: "3px 10px", borderRadius: 12,
                        background: user?.roleCode === "CEO" ? COLORS.lightViolet : "#fff1f2",
                        color: user?.roleCode === "CEO" ? COLORS.violet : COLORS.red,
                        fontSize: "0.75rem", fontWeight: 700
                    }}>
                        {user?.roleCode === "CEO" ? "👑" : "📋"} {user?.role}
                    </span>
                </div>

                {/* Onglets des pages autorisées uniquement */}
                {pages.map((page) => (
                    <button
                        key={page.id}
                        onClick={() => { setActivePage(page.id); setIframeLoading(true); }}
                        style={{
                            padding: "0.625rem 1rem",
                            background: activePage === page.id ? COLORS.lightViolet : "transparent",
                            border: "none",
                            borderBottom: `3px solid ${activePage === page.id ? COLORS.violet : "transparent"}`,
                            borderRadius: "4px 4px 0 0",
                            color: activePage === page.id ? COLORS.violet : "#6b7280",
                            fontWeight: activePage === page.id ? 700 : 400,
                            fontSize: "0.85rem", cursor: "pointer",
                            display: "flex", alignItems: "center", gap: "0.375rem",
                            whiteSpace: "nowrap", marginBottom: "-3px",
                            transition: "all 0.15s ease",
                        }}
                    >
                        <span>{page.icon}</span>
                        {page.label}
                    </button>
                ))}
            </div>

            {/* Iframe Power BI — plein écran */}
            <div style={{ flex: 1, position: "relative" }}>
                {/* Spinner de chargement */}
                {iframeLoading && (
                    <div style={{
                        position: "absolute", inset: 0, zIndex: 10,
                        background: "#fff", display: "flex",
                        flexDirection: "column", alignItems: "center", justifyContent: "center",
                        gap: "1rem"
                    }}>
                        <div style={{
                            width: 48, height: 48, borderRadius: "50%",
                            border: `4px solid ${COLORS.lightViolet}`,
                            borderTop: `4px solid ${COLORS.violet}`,
                            animation: "spin 1s linear infinite"
                        }} />
                        <div style={{ color: COLORS.violet, fontWeight: 600, fontSize: "0.95rem" }}>
                            Chargement du rapport Power BI...
                        </div>
                        <div style={{ color: "#9ca3af", fontSize: "0.8rem" }}>
                            {currentPage?.label}
                        </div>
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                )}

                <iframe
                    key={activePage}
                    title={`Power BI - ${currentPage?.label}`}
                    src={embedUrl}
                    style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                    allowFullScreen
                    onLoad={() => setIframeLoading(false)}
                />
            </div>
        </div>
    );
}