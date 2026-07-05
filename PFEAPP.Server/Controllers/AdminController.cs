using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using PFEAPP.Server.Services;

namespace PFEAPP.Server.Controllers
{
    public class SetActiveRequest
    {
        public bool IsActive { get; set; }
    }

    public class CreateUserRequest
    {
        public string TandemEmail { get; set; } = "";
        public string MicrosoftEmail { get; set; } = "";
        public string DisplayName { get; set; } = "";
        public string RoleCode { get; set; } = "";
        public string Password { get; set; } = "";
    }

    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "ADMIN")]
    public class AdminController : ControllerBase
    {
        private readonly DbUserStore _userStore;
        private readonly SsisService _ssisService;
        private readonly string _appDbConnectionString;

        public AdminController(DbUserStore userStore, SsisService ssisService, IConfiguration configuration)
        {
            _userStore = userStore;
            _ssisService = ssisService;
            _appDbConnectionString = configuration.GetConnectionString("AppDb") ?? "";
        }

        // ─── Requirement 1 : gestion des utilisateurs ───────────────────────

        private static readonly Dictionary<string, string> RoleLabels = new()
        {
            ["CEO"] = "Directeur Général",
            ["LOG"] = "Directeur Logistique",
            ["ADMIN"] = "Administrateur",
        };

        [HttpGet("users")]
        public IActionResult GetUsers() => Ok(_userStore.ListUsers());

        [HttpPost("users")]
        public IActionResult CreateUser([FromBody] CreateUserRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.TandemEmail) || string.IsNullOrWhiteSpace(request.Password))
                return BadRequest(new { message = "Email et mot de passe obligatoires." });

            if (!RoleLabels.TryGetValue(request.RoleCode, out var roleLabel))
                return BadRequest(new { message = "Rôle invalide (CEO, LOG ou ADMIN)." });

            try
            {
                _userStore.CreateUser(request.TandemEmail, request.MicrosoftEmail, request.DisplayName, roleLabel, request.RoleCode, request.Password);
                return Ok(new { message = "Utilisateur créé avec succès." });
            }
            catch (Microsoft.Data.SqlClient.SqlException ex) when (ex.Number == 2627 || ex.Number == 2601)
            {
                return BadRequest(new { message = "Un utilisateur avec cet email existe déjà." });
            }
        }

        [HttpPatch("users/{id}/active")]
        public IActionResult SetUserActive(int id, [FromBody] SetActiveRequest request)
        {
            var updated = _userStore.SetActive(id, request.IsActive);
            return updated ? Ok(new { message = "Statut mis à jour." }) : NotFound();
        }

        // ─── Requirement 2 : historique des exécutions ETL ──────────────────

        [HttpGet("etl/history")]
        public async Task<IActionResult> GetEtlHistory(int take = 50, int skip = 0)
        {
            var results = new List<object>();
            await using var conn = new SqlConnection(_appDbConnectionString);
            await conn.OpenAsync();
            await using var cmd = new SqlCommand(@"
                SELECT Id, Package, Type, Success, Message, ExecutedAt, DurationSeconds
                FROM ETL_EXECUTION_LOG
                ORDER BY ExecutedAt DESC
                OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY", conn);
            cmd.Parameters.AddWithValue("@Skip", skip);
            cmd.Parameters.AddWithValue("@Take", take);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                results.Add(new
                {
                    id = reader.GetInt32(0),
                    package = reader.GetString(1),
                    type = reader.GetString(2),
                    success = reader.GetBoolean(3),
                    message = reader.GetString(4),
                    executedAt = reader.GetDateTime(5),
                    durationSeconds = reader.GetInt32(6),
                });
            }
            return Ok(results);
        }

        [HttpGet("etl/history/{id}")]
        public async Task<IActionResult> GetEtlHistoryDetail(int id)
        {
            await using var conn = new SqlConnection(_appDbConnectionString);
            await conn.OpenAsync();
            await using var cmd = new SqlCommand(@"
                SELECT Id, Package, Type, Success, Message, Output, Error, ExecutedAt, DurationSeconds
                FROM ETL_EXECUTION_LOG WHERE Id = @Id", conn);
            cmd.Parameters.AddWithValue("@Id", id);
            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync()) return NotFound();

            return Ok(new
            {
                id = reader.GetInt32(0),
                package = reader.GetString(1),
                type = reader.GetString(2),
                success = reader.GetBoolean(3),
                message = reader.GetString(4),
                output = reader.IsDBNull(5) ? "" : reader.GetString(5),
                error = reader.IsDBNull(6) ? "" : reader.GetString(6),
                executedAt = reader.GetDateTime(7),
                durationSeconds = reader.GetInt32(8),
            });
        }

        [HttpPost("etl/run/{type}")]
        public async Task<IActionResult> RunEtl(string type)
        {
            var result = type.ToLowerInvariant() switch
            {
                "dimensions" => await _ssisService.ExecutePackageAsync("dimensions.dtsx", "Dimensions"),
                "faits" => await _ssisService.ExecutePackageAsync("FactFinance.dtsx", "Faits"),
                "master" => await _ssisService.ExecuteMasterAsync(),
                _ => null
            };
            if (result == null) return BadRequest(new { message = "Type de package inconnu (dimensions|faits|master)." });
            return result.Success ? Ok(result) : StatusCode(500, result);
        }

        // ─── Requirement 3 : fraîcheur des données ──────────────────────────

        [HttpGet("etl/freshness")]
        public async Task<IActionResult> GetFreshness()
        {
            await using var conn = new SqlConnection(_appDbConnectionString);
            await conn.OpenAsync();
            await using var cmd = new SqlCommand(@"
                SELECT TOP 1 ExecutedAt, Package, Type
                FROM ETL_EXECUTION_LOG WHERE Success = 1
                ORDER BY ExecutedAt DESC", conn);
            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return Ok(new { lastSuccessAt = (DateTime?)null, package = "", type = "" });

            return Ok(new
            {
                lastSuccessAt = reader.GetDateTime(0),
                package = reader.GetString(1),
                type = reader.GetString(2),
            });
        }
    }
}
