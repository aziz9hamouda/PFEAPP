namespace PFEAPP.Server.Services
{
    // Source unique de vérité pour les dashboards accessibles par rôle.
    // Reflète (et remplace comme référence serveur) la map ROLE_PAGES du frontend (PowerBiDash.jsx).
    public static class RolePages
    {
        public static readonly string[] All = { "home", "finance", "commercial", "frais", "logistique", "balance" };

        private static readonly Dictionary<string, string[]> Map = new()
        {
            ["CEO"] = All,
            ["LOG"] = new[] { "frais", "logistique" },
            ["ADMIN"] = All,
        };

        public static string[] For(string? roleCode) =>
            !string.IsNullOrEmpty(roleCode) && Map.TryGetValue(roleCode, out var pages) ? pages : Array.Empty<string>();

        public static bool CanAccess(string? roleCode, string dashboard) =>
            For(roleCode).Contains(dashboard, StringComparer.OrdinalIgnoreCase);
    }
}
