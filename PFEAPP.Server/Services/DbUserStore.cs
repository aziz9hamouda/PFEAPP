using Microsoft.Data.SqlClient;
using PFEAPP.Server.Controllers;

namespace PFEAPP.Server.Services
{
    public class AdminUserView
    {
        public int Id { get; set; }
        public string TandemEmail { get; set; } = "";
        public string MicrosoftEmail { get; set; } = "";
        public string DisplayName { get; set; } = "";
        public string Role { get; set; } = "";
        public string RoleCode { get; set; } = "";
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? LastLoginAt { get; set; }
    }

    // Implémentation base de données de IUserStore, sur la base PFEAPP_App (séparée de
    // DataWarehouse). Remplace ConfigUserStore : mêmes 3 comptes (CEO/LOG/ADMIN) mais stockés
    // dans APP_USERS avec mot de passe hashé (BCrypt) au lieu du texte clair d'appsettings.json.
    public class DbUserStore : IUserStore
    {
        private readonly string _connectionString;

        public DbUserStore(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("AppDb") ?? "";
        }

        public UserConfig? FindUser(string email, string password)
        {
            using var conn = new SqlConnection(_connectionString);
            conn.Open();

            int id;
            string hash;
            UserConfig user;

            using (var cmd = new SqlCommand(@"
                SELECT Id, TandemEmail, MicrosoftEmail, PasswordHash, DisplayName, Role, RoleCode
                FROM APP_USERS
                WHERE LOWER(TandemEmail) = LOWER(@Email) AND IsActive = 1", conn))
            {
                cmd.Parameters.AddWithValue("@Email", email.Trim());
                using var reader = cmd.ExecuteReader();
                if (!reader.Read()) return null;

                id = reader.GetInt32(0);
                hash = reader.GetString(3);
                user = new UserConfig
                {
                    TandemEmail = reader.GetString(1),
                    MicrosoftEmail = reader.GetString(2),
                    DisplayName = reader.GetString(4),
                    Role = reader.GetString(5),
                    RoleCode = reader.GetString(6),
                };
            }

            if (!BCrypt.Net.BCrypt.Verify(password, hash))
                return null;

            using (var update = new SqlCommand("UPDATE APP_USERS SET LastLoginAt = SYSUTCDATETIME() WHERE Id = @Id", conn))
            {
                update.Parameters.AddWithValue("@Id", id);
                update.ExecuteNonQuery();
            }

            return user;
        }

        public AdminUserView? FindByEmail(string email)
        {
            using var conn = new SqlConnection(_connectionString);
            conn.Open();
            using var cmd = new SqlCommand(@"
                SELECT Id, TandemEmail, MicrosoftEmail, DisplayName, Role, RoleCode, IsActive, CreatedAt, LastLoginAt
                FROM APP_USERS WHERE LOWER(TandemEmail) = LOWER(@Email)", conn);
            cmd.Parameters.AddWithValue("@Email", email.Trim());
            using var reader = cmd.ExecuteReader();
            if (!reader.Read()) return null;
            return ReadAdminUserView(reader);
        }

        public List<AdminUserView> ListUsers()
        {
            var result = new List<AdminUserView>();
            using var conn = new SqlConnection(_connectionString);
            conn.Open();
            using var cmd = new SqlCommand(@"
                SELECT Id, TandemEmail, MicrosoftEmail, DisplayName, Role, RoleCode, IsActive, CreatedAt, LastLoginAt
                FROM APP_USERS ORDER BY CreatedAt", conn);
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
                result.Add(ReadAdminUserView(reader));
            return result;
        }

        // Lève une exception si l'email existe déjà (contrainte UNIQUE sur TandemEmail) —
        // à traiter par l'appelant (AdminController) pour renvoyer un message clair.
        public void CreateUser(string tandemEmail, string microsoftEmail, string displayName, string role, string roleCode, string password)
        {
            var hash = BCrypt.Net.BCrypt.HashPassword(password);
            using var conn = new SqlConnection(_connectionString);
            conn.Open();
            using var cmd = new SqlCommand(@"
                INSERT INTO APP_USERS (TandemEmail, MicrosoftEmail, PasswordHash, DisplayName, Role, RoleCode)
                VALUES (@Email, @MsEmail, @Hash, @DisplayName, @Role, @RoleCode)", conn);
            cmd.Parameters.AddWithValue("@Email", tandemEmail.Trim());
            cmd.Parameters.AddWithValue("@MsEmail", microsoftEmail.Trim());
            cmd.Parameters.AddWithValue("@Hash", hash);
            cmd.Parameters.AddWithValue("@DisplayName", displayName.Trim());
            cmd.Parameters.AddWithValue("@Role", role.Trim());
            cmd.Parameters.AddWithValue("@RoleCode", roleCode.Trim());
            cmd.ExecuteNonQuery();
        }

        public bool SetActive(int id, bool isActive)
        {
            using var conn = new SqlConnection(_connectionString);
            conn.Open();
            using var cmd = new SqlCommand("UPDATE APP_USERS SET IsActive = @IsActive WHERE Id = @Id", conn);
            cmd.Parameters.AddWithValue("@IsActive", isActive);
            cmd.Parameters.AddWithValue("@Id", id);
            return cmd.ExecuteNonQuery() > 0;
        }

        public void UpdatePasswordHash(int userId, string newPasswordHash)
        {
            using var conn = new SqlConnection(_connectionString);
            conn.Open();
            using var cmd = new SqlCommand("UPDATE APP_USERS SET PasswordHash = @Hash WHERE Id = @Id", conn);
            cmd.Parameters.AddWithValue("@Hash", newPasswordHash);
            cmd.Parameters.AddWithValue("@Id", userId);
            cmd.ExecuteNonQuery();
        }

        // ─── Mot de passe oublié ─────────────────────────────────────────────

        public string CreatePasswordResetToken(int userId, TimeSpan validFor)
        {
            var token = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
            using var conn = new SqlConnection(_connectionString);
            conn.Open();
            using var cmd = new SqlCommand(@"
                INSERT INTO PASSWORD_RESET_TOKENS (UserId, Token, ExpiresAt)
                VALUES (@UserId, @Token, @ExpiresAt)", conn);
            cmd.Parameters.AddWithValue("@UserId", userId);
            cmd.Parameters.AddWithValue("@Token", token);
            cmd.Parameters.AddWithValue("@ExpiresAt", DateTime.UtcNow.Add(validFor));
            cmd.ExecuteNonQuery();
            return token;
        }

        // Retourne l'Id utilisateur si le token est valide (non expiré, non déjà utilisé), sinon null.
        public int? ValidateResetToken(string token)
        {
            using var conn = new SqlConnection(_connectionString);
            conn.Open();
            using var cmd = new SqlCommand(@"
                SELECT UserId FROM PASSWORD_RESET_TOKENS
                WHERE Token = @Token AND UsedAt IS NULL AND ExpiresAt > SYSUTCDATETIME()", conn);
            cmd.Parameters.AddWithValue("@Token", token);
            var result = cmd.ExecuteScalar();
            return result == null ? null : Convert.ToInt32(result);
        }

        public void MarkResetTokenUsed(string token)
        {
            using var conn = new SqlConnection(_connectionString);
            conn.Open();
            using var cmd = new SqlCommand("UPDATE PASSWORD_RESET_TOKENS SET UsedAt = SYSUTCDATETIME() WHERE Token = @Token", conn);
            cmd.Parameters.AddWithValue("@Token", token);
            cmd.ExecuteNonQuery();
        }

        // Insère les 3 comptes connus (CEO/LOG/ADMIN) si APP_USERS est vide. Idempotent —
        // appelé une fois au démarrage de l'application (voir Program.cs).
        public void EnsureSeeded()
        {
            using var conn = new SqlConnection(_connectionString);
            conn.Open();

            using (var count = new SqlCommand("SELECT COUNT(*) FROM APP_USERS", conn))
            {
                var n = (int)count.ExecuteScalar()!;
                if (n > 0) return;
            }

            InsertSeedUser(conn, "azizhamouda@tandem.tn", "Tandem@2025", "mohamedaziz.hamouda@esprit.tn", "Mohamed Aziz Hamouda", "Directeur Général", "CEO");
            InsertSeedUser(conn, "meriemhamouda@tandem.tn", "Tandem@2025", "meriem.hamouda@esprit.tn", "Meriem Hamouda", "Directeur Logistique", "LOG");
            InsertSeedUser(conn, "admin@tandem.tn", "Admin@2025", "admin@tandem.tn", "Administrateur Système", "Administrateur", "ADMIN");
        }

        private static void InsertSeedUser(SqlConnection conn, string email, string password, string msEmail, string displayName, string role, string roleCode)
        {
            var hash = BCrypt.Net.BCrypt.HashPassword(password);
            using var cmd = new SqlCommand(@"
                INSERT INTO APP_USERS (TandemEmail, MicrosoftEmail, PasswordHash, DisplayName, Role, RoleCode)
                VALUES (@Email, @MsEmail, @Hash, @DisplayName, @Role, @RoleCode)", conn);
            cmd.Parameters.AddWithValue("@Email", email);
            cmd.Parameters.AddWithValue("@MsEmail", msEmail);
            cmd.Parameters.AddWithValue("@Hash", hash);
            cmd.Parameters.AddWithValue("@DisplayName", displayName);
            cmd.Parameters.AddWithValue("@Role", role);
            cmd.Parameters.AddWithValue("@RoleCode", roleCode);
            cmd.ExecuteNonQuery();
        }

        private static AdminUserView ReadAdminUserView(SqlDataReader reader) => new()
        {
            Id = reader.GetInt32(0),
            TandemEmail = reader.GetString(1),
            MicrosoftEmail = reader.GetString(2),
            DisplayName = reader.GetString(3),
            Role = reader.GetString(4),
            RoleCode = reader.GetString(5),
            IsActive = reader.GetBoolean(6),
            CreatedAt = reader.GetDateTime(7),
            LastLoginAt = reader.IsDBNull(8) ? null : reader.GetDateTime(8),
        };
    }
}
