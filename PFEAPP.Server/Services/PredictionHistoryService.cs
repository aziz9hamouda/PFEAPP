using Microsoft.Data.SqlClient;

namespace PFEAPP.Server.Services
{
    public class PredictionHistoryItem
    {
        public int Id { get; set; }
        public string Type { get; set; } = "";
        public string InputJson { get; set; } = "";
        public string ResultJson { get; set; } = "";
        public string? PredictedByEmail { get; set; }
        public string? PredictedByRole { get; set; }
        public DateTime PredictedAt { get; set; }
    }

    // Historique partagé des prédictions marge/segmentation, persisté dans PFEAPP_App.
    // Une panne DB ici ne doit jamais faire échouer une prédiction elle-même.
    public class PredictionHistoryService
    {
        private readonly string _connectionString;
        private readonly ILogger<PredictionHistoryService> _logger;

        public PredictionHistoryService(IConfiguration configuration, ILogger<PredictionHistoryService> logger)
        {
            _connectionString = configuration.GetConnectionString("AppDb") ?? "";
            _logger = logger;
        }

        public async Task RecordAsync(string type, string inputJson, string resultJson, string? email, string? role)
        {
            try
            {
                await using var conn = new SqlConnection(_connectionString);
                await conn.OpenAsync();
                await using var cmd = new SqlCommand(@"
                    INSERT INTO PREDICTION_HISTORY (Type, InputJson, ResultJson, PredictedByEmail, PredictedByRole)
                    VALUES (@Type, @InputJson, @ResultJson, @Email, @Role)", conn);
                cmd.Parameters.AddWithValue("@Type", type);
                cmd.Parameters.AddWithValue("@InputJson", inputJson);
                cmd.Parameters.AddWithValue("@ResultJson", resultJson);
                cmd.Parameters.AddWithValue("@Email", (object?)email ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@Role", (object?)role ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Impossible d'enregistrer l'historique de prédiction ({Type}).", type);
            }
        }

        public async Task<List<PredictionHistoryItem>> GetHistoryAsync(string type, int take = 100)
        {
            var results = new List<PredictionHistoryItem>();
            await using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            await using var cmd = new SqlCommand(@"
                SELECT TOP (@Take) Id, Type, InputJson, ResultJson, PredictedByEmail, PredictedByRole, PredictedAt
                FROM PREDICTION_HISTORY WHERE Type = @Type
                ORDER BY PredictedAt DESC", conn);
            cmd.Parameters.AddWithValue("@Take", take);
            cmd.Parameters.AddWithValue("@Type", type);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                results.Add(new PredictionHistoryItem
                {
                    Id = reader.GetInt32(0),
                    Type = reader.GetString(1),
                    InputJson = reader.GetString(2),
                    ResultJson = reader.GetString(3),
                    PredictedByEmail = reader.IsDBNull(4) ? null : reader.GetString(4),
                    PredictedByRole = reader.IsDBNull(5) ? null : reader.GetString(5),
                    PredictedAt = reader.GetDateTime(6),
                });
            }
            return results;
        }
    }
}
