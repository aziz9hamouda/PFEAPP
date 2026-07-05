using System.Diagnostics;
using Microsoft.Data.SqlClient;
using PFEAPP.Server.Models;

namespace PFEAPP.Server.Services
{
    public class SsisService
    {
        private readonly string _projectPath;
        private readonly string _dtexecPath;
        private readonly string _appDbConnectionString;
        private readonly ILogger<SsisService> _logger;

        // Log en mémoire — liste statique partagée entre les requêtes (cache rapide pour la session en cours)
        private static readonly List<ExecutionLog> _logs = new();
        private static int _logCounter = 0;

        public SsisService(IConfiguration configuration, ILogger<SsisService> logger)
        {
            _projectPath = configuration["Ssis:ProjectPath"]
                ?? @"C:\Users\hp\source\repos\ETLPFE\ETLPFE";

            _dtexecPath = configuration["Ssis:DtexecPath"]
                ?? @"C:\Program Files\Microsoft SQL Server\170\DTS\Binn\DTExec.exe";

            _appDbConnectionString = configuration.GetConnectionString("AppDb") ?? "";
            _logger = logger;
        }

        public List<ExecutionLog> GetLogs() => _logs.OrderByDescending(l => l.ExecutedAt).ToList();

        public void ClearLogs() => _logs.Clear();

        public async Task<EtlResult> ExecutePackageAsync(string packageName, string type = "")
        {
            var startTime = DateTime.Now;
            var arguments = $"/File \"{_projectPath}\\{packageName}\"";

            var psi = new ProcessStartInfo
            {
                FileName = _dtexecPath,
                Arguments = arguments,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            try
            {
                using var process = new Process { StartInfo = psi };
                process.Start();

                var outputTask = process.StandardOutput.ReadToEndAsync();
                var errorTask = process.StandardError.ReadToEndAsync();

                var timeout = Task.Delay(TimeSpan.FromMinutes(10));
                var completed = await Task.WhenAny(Task.WhenAll(outputTask, errorTask), timeout);

                if (completed == timeout)
                {
                    process.Kill();
                    var timeoutResult = new EtlResult
                    {
                        Success = false,
                        Package = packageName,
                        Message = "Timeout — package dépassé 10 minutes.",
                        ExecutedAt = startTime,
                        DurationSeconds = 600
                    };
                    await AddLogAsync(timeoutResult, type);
                    return timeoutResult;
                }

                await process.WaitForExitAsync();

                var output = await outputTask;
                var error = await errorTask;
                var duration = (int)(DateTime.Now - startTime).TotalSeconds;
                var success = process.ExitCode == 0;

                var result = new EtlResult
                {
                    Success = success,
                    Package = packageName,
                    Message = success
                                        ? $"Package '{packageName}' exécuté avec succès."
                                        : $"Échec du package '{packageName}' (code {process.ExitCode}).",
                    Output = output,
                    Error = error,
                    ExecutedAt = startTime,
                    DurationSeconds = duration
                };

                await AddLogAsync(result, type);
                return result;
            }
            catch (Exception ex)
            {
                var errorResult = new EtlResult
                {
                    Success = false,
                    Package = packageName,
                    Message = $"Erreur dtexec : {ex.Message}",
                    ExecutedAt = startTime,
                    DurationSeconds = 0
                };
                await AddLogAsync(errorResult, type);
                return errorResult;
            }
        }

        public async Task<EtlResult> ExecuteMasterAsync()
        {
            var startTime = DateTime.Now;

            var dimResult = await ExecutePackageAsync("dimensions.dtsx", "Dimensions");
            if (!dimResult.Success)
            {
                dimResult.Message = $"Échec à l'étape Dimensions : {dimResult.Message}";
                return dimResult;
            }

            var faitResult = await ExecutePackageAsync("FactFinance.dtsx", "Faits");
            if (!faitResult.Success)
            {
                faitResult.Message = $"Échec à l'étape Faits : {faitResult.Message}";
                return faitResult;
            }

            var masterResult = new EtlResult
            {
                Success = true,
                Package = "Master",
                Message = "Alimentation complète réussie — Dimensions puis Faits exécutés avec succès.",
                ExecutedAt = startTime,
                DurationSeconds = (int)(DateTime.Now - startTime).TotalSeconds
            };

            await AddLogAsync(masterResult, "Master");
            return masterResult;
        }

        private async Task AddLogAsync(EtlResult result, string type)
        {
            var effectiveType = string.IsNullOrEmpty(type) ? result.Package : type;

            _logs.Add(new ExecutionLog
            {
                Id = ++_logCounter,
                Package = result.Package,
                Type = effectiveType,
                Success = result.Success,
                Message = result.Message,
                ExecutedAt = result.ExecutedAt,
                DurationSeconds = result.DurationSeconds
            });

            // Garder les 50 derniers logs maximum (cache en mémoire uniquement)
            if (_logs.Count > 50)
                _logs.RemoveAt(0);

            // Persistance durable dans PFEAPP_App (survit aux redémarrages) — une panne DB ici
            // ne doit jamais faire échouer l'exécution ETL elle-même.
            try
            {
                await using var conn = new SqlConnection(_appDbConnectionString);
                await conn.OpenAsync();
                await using var cmd = new SqlCommand(@"
                    INSERT INTO ETL_EXECUTION_LOG (Package, Type, Success, Message, Output, Error, ExecutedAt, DurationSeconds)
                    VALUES (@Package, @Type, @Success, @Message, @Output, @Error, @ExecutedAt, @DurationSeconds)", conn);
                cmd.Parameters.AddWithValue("@Package", result.Package);
                cmd.Parameters.AddWithValue("@Type", effectiveType);
                cmd.Parameters.AddWithValue("@Success", result.Success);
                cmd.Parameters.AddWithValue("@Message", result.Message);
                cmd.Parameters.AddWithValue("@Output", (object?)result.Output ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@Error", (object?)result.Error ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@ExecutedAt", result.ExecutedAt);
                cmd.Parameters.AddWithValue("@DurationSeconds", result.DurationSeconds);
                await cmd.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Impossible de persister le log ETL dans PFEAPP_App.");
            }
        }
    }
}