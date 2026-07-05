using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PFEAPP.Server.Services;
using PFEAPP.Server.Models;

namespace PFEAPP.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class MlController : ControllerBase
    {
        private readonly MlService _mlService;
        private readonly PredictionHistoryService _historyService;
        private static readonly JsonSerializerOptions CamelCase = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

        public MlController(MlService mlService, PredictionHistoryService historyService)
        {
            _mlService = mlService;
            _historyService = historyService;
        }

        // GET api/ml/health
        [HttpGet("health")]
        public async Task<IActionResult> Health()
        {
            var ok = await _mlService.CheckHealthAsync();
            return ok
                ? Ok(new { status = "OK", message = "Python et le modèle XGBoost sont disponibles." })
                : StatusCode(503, new { status = "KO", message = "Python ou le modèle est inaccessible." });
        }

        // POST api/ml/predict
        [HttpPost("predict")]
        public async Task<IActionResult> Predict([FromBody] PredictionRequest request)
        {
            if (request?.Features == null || request.Features.Count == 0)
                return BadRequest(new { message = "Features manquantes." });

            try
            {
                var result = await _mlService.PredictMargeAsync(request);

                await _historyService.RecordAsync(
                    "Margin",
                    JsonSerializer.Serialize(request.Features, CamelCase),
                    JsonSerializer.Serialize(result, CamelCase),
                    User.FindFirstValue(ClaimTypes.Email),
                    User.FindFirstValue(ClaimTypes.Role));

                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Erreur de prédiction : {ex.Message}" });
            }
        }

        // GET api/ml/predictions/history
        [HttpGet("predictions/history")]
        public async Task<IActionResult> GetHistory()
        {
            var history = await _historyService.GetHistoryAsync("Margin");
            return Ok(history);
        }
    }
}
