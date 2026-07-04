using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Text.Json;

namespace PFEAPP.Server.Controllers
{
    public class SegmentationRequest
    {
        public string ClientName    { get; set; } = "";
        public double Recence       { get; set; }
        public double Frequence     { get; set; }
        public double CA_Total      { get; set; }
        public double Marge_Moyenne { get; set; }
    }

    [ApiController]
    [Route("api/[controller]")]
    public class SegmentationController : ControllerBase
    {
        private readonly string _pythonExe;
        private readonly string _scriptPath;

        public SegmentationController(IConfiguration configuration)
        {
            _pythonExe  = configuration["Ml:PythonExe"] ?? "python";
            _scriptPath = @"C:\Users\hp\source\repos\PFEAPP\PFEAPP.Server\ml\predict_segment.py";
        }

        [HttpPost("predict")]
        public async Task<IActionResult> Predict([FromBody] SegmentationRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.ClientName))
                return BadRequest(new { message = "Le nom du client est obligatoire." });

            var inputJson = JsonSerializer.Serialize(new
            {
                Recence       = request.Recence,
                Frequence     = request.Frequence,
                CA_Total      = request.CA_Total,
                Marge_Moyenne = request.Marge_Moyenne
            });

            var escaped = inputJson.Replace("\"", "\\\"");

            var psi = new ProcessStartInfo
            {
                FileName               = _pythonExe,
                Arguments              = $"\"{_scriptPath}\" \"{escaped}\"",
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                UseShellExecute        = false,
                CreateNoWindow         = true
            };

            try
            {
                using var process = new Process { StartInfo = psi };
                process.Start();

                var stdout = await process.StandardOutput.ReadToEndAsync();
                var stderr = await process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync();

                if (process.ExitCode != 0)
                    return StatusCode(500, new { message = $"Erreur Python : {stderr}" });

                var output = JsonSerializer.Deserialize<JsonElement>(stdout.Trim());

                if (output.TryGetProperty("error", out var err))
                    return StatusCode(500, new { message = err.GetString() });

                return Ok(new
                {
                    clientName     = request.ClientName,
                    cluster        = output.GetProperty("cluster").GetInt32(),
                    segment        = output.GetProperty("segment").GetString(),
                    recommendation = output.GetProperty("recommendation"),
                    predictedAt    = DateTime.Now
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Erreur : {ex.Message}" });
            }
        }
    }
}
