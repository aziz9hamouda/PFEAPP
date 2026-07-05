import { useState, useEffect } from "react";
import { apiFetch } from "../../lib/api";

const COLORS = {
    violet: "#3B1F8C",
    red: "#C8102E",
    lightViolet: "#EDE9F8",
    success: "#16a34a",
    error: "#dc2626",
};

const EMPTY_FORM = { tandemEmail: "", microsoftEmail: "", displayName: "", roleCode: "LOG", password: "" };

export default function UserManagement() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [formError, setFormError] = useState("");
    const [creating, setCreating] = useState(false);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const res = await apiFetch("/api/admin/users");
            const data = await res.json();
            setUsers(Array.isArray(data) ? data : []);
            setError("");
        } catch {
            setError("Erreur de chargement des utilisateurs.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadUsers(); }, []);

    const toggleActive = async (user) => {
        await apiFetch(`/api/admin/users/${user.id}/active`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: !user.isActive }),
        });
        loadUsers();
    };

    const handleCreate = async () => {
        if (!form.tandemEmail.trim() || !form.password.trim() || !form.displayName.trim()) {
            setFormError("Email, nom et mot de passe sont obligatoires.");
            return;
        }
        setCreating(true);
        setFormError("");
        try {
            const res = await apiFetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) {
                setFormError(data.message || "Erreur lors de la création.");
                return;
            }
            setForm(EMPTY_FORM);
            setShowForm(false);
            loadUsers();
        } catch {
            setFormError("Erreur de connexion au serveur.");
        } finally {
            setCreating(false);
        }
    };

    return (
        <div style={{ fontFamily: "'Segoe UI', sans-serif", padding: "2rem", maxWidth: 1000, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `3px solid ${COLORS.violet}`, paddingBottom: "1rem", marginBottom: "1.5rem" }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: COLORS.violet }}>👥 Gestion des Utilisateurs</h1>
                    <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>Comptes Tandem Logistics — activer/désactiver sans supprimer</p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button onClick={() => setShowForm((s) => !s)} style={{ padding: "0.5rem 1rem", borderRadius: 8, background: COLORS.violet, color: "#fff", border: "none", fontWeight: 700, cursor: "pointer" }}>
                        {showForm ? "✕ Annuler" : "➕ Ajouter un utilisateur"}
                    </button>
                    <button onClick={loadUsers} style={{ padding: "0.5rem 1rem", borderRadius: 8, background: COLORS.lightViolet, color: COLORS.violet, border: "none", fontWeight: 600, cursor: "pointer" }}>
                        🔄 Rafraîchir
                    </button>
                </div>
            </div>

            {showForm && (
                <div style={{ background: "#fff", border: `2px solid ${COLORS.violet}`, borderRadius: 12, padding: "1.25rem", marginBottom: "1.5rem" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem", marginBottom: "1rem" }}>
                        <div>
                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#374151", marginBottom: "0.3rem" }}>Email Tandem *</label>
                            <input value={form.tandemEmail} onChange={(e) => setForm((f) => ({ ...f, tandemEmail: e.target.value }))}
                                placeholder="prenom@tandem.tn"
                                style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1.5px solid #d1d5db", borderRadius: 6, fontSize: "0.85rem", boxSizing: "border-box" }} />
                        </div>
                        <div>
                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#374151", marginBottom: "0.3rem" }}>Email Microsoft</label>
                            <input value={form.microsoftEmail} onChange={(e) => setForm((f) => ({ ...f, microsoftEmail: e.target.value }))}
                                placeholder="prenom@esprit.tn"
                                style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1.5px solid #d1d5db", borderRadius: 6, fontSize: "0.85rem", boxSizing: "border-box" }} />
                        </div>
                        <div>
                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#374151", marginBottom: "0.3rem" }}>Nom complet *</label>
                            <input value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                                style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1.5px solid #d1d5db", borderRadius: 6, fontSize: "0.85rem", boxSizing: "border-box" }} />
                        </div>
                        <div>
                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#374151", marginBottom: "0.3rem" }}>Rôle *</label>
                            <select value={form.roleCode} onChange={(e) => setForm((f) => ({ ...f, roleCode: e.target.value }))}
                                style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1.5px solid #d1d5db", borderRadius: 6, fontSize: "0.85rem", boxSizing: "border-box" }}>
                                <option value="CEO">Directeur Général (CEO)</option>
                                <option value="LOG">Directeur Logistique (LOG)</option>
                                <option value="ADMIN">Administrateur (ADMIN)</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#374151", marginBottom: "0.3rem" }}>Mot de passe *</label>
                            <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                                style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1.5px solid #d1d5db", borderRadius: 6, fontSize: "0.85rem", boxSizing: "border-box" }} />
                        </div>
                    </div>
                    {formError && <div style={{ color: COLORS.error, fontSize: "0.8rem", marginBottom: "0.75rem" }}>{formError}</div>}
                    <button onClick={handleCreate} disabled={creating}
                        style={{ padding: "0.625rem 1.25rem", background: creating ? "#9ca3af" : COLORS.violet, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: creating ? "not-allowed" : "pointer" }}>
                        {creating ? "⏳ Création..." : "Créer l'utilisateur"}
                    </button>
                </div>
            )}

            {error && <div style={{ color: COLORS.error, marginBottom: "1rem" }}>{error}</div>}

            {loading ? (
                <div style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>Chargement...</div>
            ) : (
                <div style={{ background: "#fff", border: "2px solid #e5e7eb", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                        <thead>
                            <tr style={{ background: COLORS.violet }}>
                                {["Nom", "Email Tandem", "Rôle", "Créé le", "Dernière connexion", "Statut", ""].map((h) => (
                                    <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#fff", fontWeight: 700, fontSize: "0.8rem" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((u) => (
                                <tr key={u.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                    <td style={{ padding: "0.625rem 1rem", fontWeight: 600, color: "#1f2937" }}>{u.displayName}</td>
                                    <td style={{ padding: "0.625rem 1rem", color: "#374151" }}>{u.tandemEmail}</td>
                                    <td style={{ padding: "0.625rem 1rem" }}>
                                        <span style={{ padding: "2px 8px", borderRadius: 8, background: COLORS.lightViolet, color: COLORS.violet, fontWeight: 700, fontSize: "0.75rem" }}>
                                            {u.roleCode}
                                        </span>
                                    </td>
                                    <td style={{ padding: "0.625rem 1rem", color: "#6b7280" }}>{new Date(u.createdAt).toLocaleDateString("fr-FR")}</td>
                                    <td style={{ padding: "0.625rem 1rem", color: "#6b7280" }}>
                                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("fr-FR") : "Jamais"}
                                    </td>
                                    <td style={{ padding: "0.625rem 1rem" }}>
                                        <span style={{
                                            padding: "2px 10px", borderRadius: 12, fontSize: "0.75rem", fontWeight: 700,
                                            background: u.isActive ? "#dcfce7" : "#fee2e2",
                                            color: u.isActive ? COLORS.success : COLORS.error
                                        }}>
                                            {u.isActive ? "Actif" : "Désactivé"}
                                        </span>
                                    </td>
                                    <td style={{ padding: "0.625rem 1rem" }}>
                                        <button onClick={() => toggleActive(u)}
                                            style={{
                                                padding: "0.375rem 0.875rem", borderRadius: 6, border: "none",
                                                background: u.isActive ? "#fee2e2" : "#dcfce7",
                                                color: u.isActive ? COLORS.error : COLORS.success,
                                                fontWeight: 600, fontSize: "0.8rem", cursor: "pointer"
                                            }}>
                                            {u.isActive ? "Désactiver" : "Activer"}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {users.length === 0 && (
                        <div style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>Aucun utilisateur.</div>
                    )}
                </div>
            )}
        </div>
    );
}
