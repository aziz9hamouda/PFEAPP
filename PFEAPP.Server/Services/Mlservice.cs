using System.Diagnostics;
using System.Text.Json;
using PFEAPP.Server.Models;

namespace PFEAPP.Server.Services
{
    public class MlService
    {
        private readonly string _pythonExe;
        private readonly string _scriptPath;

        public MlService(IConfiguration configuration)
        {
            _pythonExe = configuration["Ml:PythonExe"] ?? "python";
            _scriptPath = configuration["Ml:ScriptPath"]
                ?? Path.Combine(AppContext.BaseDirectory, "ml", "predict.py");
        }

        public async Task<PredictionResult> PredictMargeAsync(PredictionRequest request)
        {
            var inputJson = JsonSerializer.Serialize(request.Features);
            // Échapper les guillemets pour l'argument
            var escaped = inputJson.Replace("\"", "\\\"");

            var psi = new ProcessStartInfo
            {
                FileName = _pythonExe,
                Arguments = $"\"{_scriptPath}\" \"{escaped}\"",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = new Process { StartInfo = psi };
            process.Start();

            var stdout = await process.StandardOutput.ReadToEndAsync();
            var stderr = await process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync();

            if (process.ExitCode != 0)
                throw new InvalidOperationException($"Erreur Python : {stderr}");

            var output = JsonSerializer.Deserialize<JsonElement>(stdout.Trim());
            var pctMarge = output.GetProperty("pct_marge").GetDouble();

            return new PredictionResult
            {
                PctMargePredite = pctMarge,
                Interpretation = Interpreter(pctMarge),
                PredictedAt = DateTime.Now
            };
        }

        public async Task<bool> CheckHealthAsync()
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = _pythonExe,
                    Arguments = "--version",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using var p = new Process { StartInfo = psi };
                p.Start();
                await p.WaitForExitAsync();
                return p.ExitCode == 0 && File.Exists(_scriptPath);
            }
            catch { return false; }
        }

        private static string Interpreter(double pct) => pct switch
        {
            < 0 => "⚠️ Marge négative — dossier déficitaire",
            < 10 => "🔴 Marge très faible (< 10%)",
            < 20 => "🟡 Marge faible (10–20%)",
            < 35 => "🟢 Marge correcte (20–35%)",
            < 60 => "✅ Bonne marge (35–60%)",
            _ => "🏆 Excellente marge (> 60%)"
        };
    }
}