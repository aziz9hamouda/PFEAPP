using Microsoft.AspNetCore.Mvc;
using PFEAPP.Server.Services;
using PFEAPP.Server.Models;

namespace PFEAPP.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class MlController : ControllerBase
    {
        private readonly MlService _mlService;

        public MlController(MlService mlService)
        {
            _mlService = mlService;
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
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Erreur de prédiction : {ex.Message}" });
            }
        }
    }
}