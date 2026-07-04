using System.Text;
using System.Text.Json;
using System.Diagnostics;

namespace PFEAPP.Server.Services
{
    public class AgentMessage
    {
        public string Role    { get; set; } = "user";
        public string Content { get; set; } = "";
    }

    public class AgentResponse
    {
        public string Message    { get; set; } = "";
        public string ActionType { get; set; } = "chat";
        public object? Data      { get; set; }
        public bool    Success   { get; set; } = true;
    }

    public class AgentService
    {
        private readonly string _groqApiKey;
        private readonly string _pythonExe;
        private readonly string _mlScriptPath;
        private readonly string _segScriptPath;
        private readonly string _dtexecPath;
        private readonly string _ssisProjectPath;
        private readonly HttpClient _httpClient;

        public AgentService(IConfiguration configuration, IHttpClientFactory httpClientFactory)
        {
            _groqApiKey       = configuration["Groq:ApiKey"] ?? "";
            _pythonExe        = configuration["Ml:PythonExe"] ?? "python";
            _mlScriptPath     = @"C:\Users\hp\source\repos\PFEAPP\PFEAPP.Server\ml\predict.py";
            _segScriptPath    = @"C:\Users\hp\source\repos\PFEAPP\PFEAPP.Server\ml\predict_segment.py";
            _dtexecPath       = configuration["Ssis:DtexecPath"] ?? "dtexec";
            _ssisProjectPath  = configuration["Ssis:ProjectPath"] ?? "";
            _httpClient       = httpClientFactory.CreateClient();
        }

        public async Task<AgentResponse> ProcessMessageAsync(string userMessage, List<AgentMessage> history)
        {
            // Étape 1 — Détecter l'intention via Groq
            var intention = await DetectIntentionAsync(userMessage, history);

            // Étape 2 — Exécuter l'action selon l'intention
            return intention switch
            {
                "run_etl_dimensions"  => await RunEtlAsync("dimensions.dtsx", "Dimensions"),
                "run_etl_faits"       => await RunEtlAsync("FactFinance.dtsx", "Faits"),
                "run_etl_master"      => await RunEtlMasterAsync(),
                "predict_marge"       => await PredictMargeFromMessageAsync(userMessage),
                "segment_client"      => await SegmentClientFromMessageAsync(userMessage),
                "resume_dashboard"    => await ResumeDashboardAsync(userMessage),
                "list_actions"        => ListActions(),
                _                     => await ChatAsync(userMessage, history)
            };
        }

        private async Task<string> DetectIntentionAsync(string message, List<AgentMessage> history)
        {
            var systemPrompt = @"Tu es un assistant IA pour Tandem Logistics.
Analyse le message de l'utilisateur et retourne UNIQUEMENT l'un de ces codes d'intention (rien d'autre) :

- run_etl_dimensions  → si l'utilisateur veut lancer/exécuter/alimenter les dimensions/tables de dimensions
- run_etl_faits       → si l'utilisateur veut lancer/exécuter/alimenter les faits/tables de faits
- run_etl_master      → si l'utilisateur veut lancer le master/tout/alimentation complète
- predict_marge       → si l'utilisateur veut prédire/calculer/estimer la marge d'un dossier
- segment_client      → si l'utilisateur veut segmenter/classer/analyser un client
- resume_dashboard    → si l'utilisateur veut un résumé/analyse d'un dashboard Power BI
- list_actions        → si l'utilisateur demande ce que tu peux faire/tes capacités
- chat                → pour toute autre question générale

Retourne UNIQUEMENT le code, sans explication.";

            var messages = new List<object>
            {
                new { role = "system", content = systemPrompt },
                new { role = "user",   content = message }
            };

            var response = await CallGroqAsync(messages, maxTokens: 20);
            return response.Trim().ToLower().Replace(".", "").Replace(" ", "_");
        }

        private async Task<AgentResponse> RunEtlAsync(string packageName, string type)
        {
            var arguments = $"/File \"{_ssisProjectPath}\\{packageName}\"";
            var psi = new ProcessStartInfo
            {
                FileName               = _dtexecPath,
                Arguments              = arguments,
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                UseShellExecute        = false,
                CreateNoWindow         = true
            };

            try
            {
                var startTime = DateTime.Now;
                using var process = new Process { StartInfo = psi };
                process.Start();

                var outputTask = process.StandardOutput.ReadToEndAsync();
                var errorTask  = process.StandardError.ReadToEndAsync();
                var timeout    = Task.Delay(TimeSpan.FromMinutes(10));
                var completed  = await Task.WhenAny(Task.WhenAll(outputTask, errorTask), timeout);

                if (completed == timeout) { process.Kill(); return new AgentResponse { Success = false, ActionType = "etl", Message = "⏱️ Timeout — le package a dépassé 10 minutes." }; }

                await process.WaitForExitAsync();
                var duration = (int)(DateTime.Now - startTime).TotalSeconds;
                var success  = process.ExitCode == 0;

                return new AgentResponse
                {
                    Success    = success,
                    ActionType = "etl",
                    Message    = success
                        ? $"✅ Package **{type}** exécuté avec succès en **{duration} secondes**. Les tables ont été alimentées."
                        : $"❌ Échec du package {type} (code {process.ExitCode}). Vérifiez la connexion SQL Server.",
                    Data = new { package = packageName, duration, success }
                };
            }
            catch (Exception ex)
            {
                return new AgentResponse { Success = false, ActionType = "etl", Message = $"❌ Erreur : {ex.Message}" };
            }
        }

        private async Task<AgentResponse> RunEtlMasterAsync()
        {
            var dimResult = await RunEtlAsync("dimensions.dtsx", "Dimensions");
            if (!dimResult.Success) return dimResult;

            var faitResult = await RunEtlAsync("FactFinance.dtsx", "Faits");
            if (!faitResult.Success) return faitResult;

            return new AgentResponse
            {
                Success    = true,
                ActionType = "etl",
                Message    = "✅ Alimentation complète réussie !\n\n📐 **Dimensions** chargées\n📊 **Faits** chargés\n\nLe Data Warehouse est à jour.",
                Data       = new { type = "master" }
            };
        }

        private async Task<AgentResponse> PredictMargeFromMessageAsync(string message)
        {
            // Extraire les paramètres du message via Groq
            var extractPrompt = $@"Extrait les paramètres suivants du message et retourne un JSON valide UNIQUEMENT (sans markdown) :
{{
  ""MontantVenteTotalDS"": nombre (défaut 0),
  ""NbConteneurs"": nombre (défaut 0),
  ""PoidsBrutTotal"": nombre (défaut 0),
  ""ClientName"": string (défaut ""INCONNU""),
  ""CountryCode"": string (défaut ""TN""),
  ""CustomerPostingGroup"": string (défaut ""LOCAL""),
  ""DesignationNavire"": string (défaut ""INCONNU""),
  ""PortOrigine"": string (défaut ""TNTUN""),
  ""PortDestination"": string (défaut ""TNTUN""),
  ""TypeConteneurPrincipal"": string (défaut ""20'DC""),
  ""IsPorteConteneurs"": 0 ou 1,
  ""HasDangereux"": 0 ou 1
}}

Message : {message}";

            var extractMessages = new List<object>
            {
                new { role = "system", content = "Tu extrais des paramètres et retournes uniquement du JSON valide sans markdown ni explication." },
                new { role = "user",   content = extractPrompt }
            };

            var jsonStr = await CallGroqAsync(extractMessages, maxTokens: 300);

            try
            {
                var clean = jsonStr.Replace("```json", "").Replace("```", "").Trim();
                var features = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(clean)
                    ?? new Dictionary<string, JsonElement>();

                var inputJson = JsonSerializer.Serialize(features);
                var escaped   = inputJson.Replace("\"", "\\\"");

                var psi = new ProcessStartInfo
                {
                    FileName               = _pythonExe,
                    Arguments              = $"\"{_mlScriptPath}\" \"{escaped}\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError  = true,
                    UseShellExecute        = false,
                    CreateNoWindow         = true
                };

                using var process = new Process { StartInfo = psi };
                process.Start();
                var stdout = await process.StandardOutput.ReadToEndAsync();
                var stderr = await process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync();

                if (process.ExitCode != 0)
                    return new AgentResponse { Success = false, ActionType = "predict_marge", Message = $"❌ Erreur Python : {stderr}" };

                var output   = JsonSerializer.Deserialize<JsonElement>(stdout.Trim());
                var pctMarge = output.GetProperty("pct_marge").GetDouble();

                var interpretation = pctMarge switch
                {
                    < 0   => "⚠️ Marge négative — dossier déficitaire",
                    < 10  => "🔴 Marge très faible (< 10%)",
                    < 20  => "🟡 Marge faible (10–20%)",
                    < 35  => "🟢 Marge correcte (20–35%)",
                    < 60  => "✅ Bonne marge (35–60%)",
                    _     => "🏆 Excellente marge (> 60%)"
                };

                return new AgentResponse
                {
                    Success    = true,
                    ActionType = "predict_marge",
                    Message    = $"🔮 **Marge prédite : {pctMarge:F1}%**\n\n{interpretation}",
                    Data       = new { pctMarge, interpretation }
                };
            }
            catch (Exception ex)
            {
                return new AgentResponse { Success = false, ActionType = "predict_marge", Message = $"❌ Erreur lors de la prédiction : {ex.Message}" };
            }
        }

        private async Task<AgentResponse> SegmentClientFromMessageAsync(string message)
        {
            var extractPrompt = $@"Extrait le nom du client et les données RFM du message et retourne un JSON valide UNIQUEMENT :
{{
  ""ClientName"": string,
  ""Recence"": nombre (jours, défaut 180),
  ""Frequence"": nombre (défaut 5),
  ""CA_Total"": nombre (défaut 50000),
  ""Marge_Moyenne"": nombre (défaut 20)
}}

Message : {message}";

            var extractMessages = new List<object>
            {
                new { role = "system", content = "Tu extrais des paramètres et retournes uniquement du JSON valide sans markdown." },
                new { role = "user",   content = extractPrompt }
            };

            var jsonStr = await CallGroqAsync(extractMessages, maxTokens: 200);

            try
            {
                var clean  = jsonStr.Replace("```json", "").Replace("```", "").Trim();
                var data   = JsonSerializer.Deserialize<JsonElement>(clean);
                var client = data.GetProperty("ClientName").GetString() ?? "Inconnu";

                var inputJson = JsonSerializer.Serialize(new
                {
                    Recence       = data.TryGetProperty("Recence",       out var r) ? r.GetDouble() : 180,
                    Frequence     = data.TryGetProperty("Frequence",     out var f) ? f.GetDouble() : 5,
                    CA_Total      = data.TryGetProperty("CA_Total",      out var c) ? c.GetDouble() : 50000,
                    Marge_Moyenne = data.TryGetProperty("Marge_Moyenne", out var m) ? m.GetDouble() : 20
                });

                var escaped = inputJson.Replace("\"", "\\\"");
                var psi = new ProcessStartInfo
                {
                    FileName               = _pythonExe,
                    Arguments              = $"\"{_segScriptPath}\" \"{escaped}\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError  = true,
                    UseShellExecute        = false,
                    CreateNoWindow         = true
                };

                using var process = new Process { StartInfo = psi };
                process.Start();
                var stdout = await process.StandardOutput.ReadToEndAsync();
                await process.WaitForExitAsync();

                var output  = JsonSerializer.Deserialize<JsonElement>(stdout.Trim());
                var segment = output.GetProperty("segment").GetString() ?? "Inconnu";
                var reco    = output.GetProperty("recommendation").GetProperty("action").GetString() ?? "";

                var segIcon = segment switch
                {
                    "VIP"           => "👑",
                    "Fidèle"        => "⭐",
                    "À risque"      => "⚠️",
                    "Faible valeur" => "📉",
                    _               => "🎯"
                };

                return new AgentResponse
                {
                    Success    = true,
                    ActionType = "segment",
                    Message    = $"{segIcon} **{client}** → Segment **{segment}**\n\n🎯 Action recommandée : {reco}",
                    Data       = new { client, segment }
                };
            }
            catch (Exception ex)
            {
                return new AgentResponse { Success = false, ActionType = "segment", Message = $"❌ Erreur : {ex.Message}" };
            }
        }

        private async Task<AgentResponse> ResumeDashboardAsync(string message)
        {
            var dashboardContext = @"
Tandem Logistics — Data Warehouse Analytics

KPIs Financiers : CA HT total, évolution mensuelle, top clients par CA, marge brute globale
Performance Commerciale : nombre de dossiers, répartition par type (Import/Export/Transit), top agents
Analyse Frais Dossiers : marge par client, coût des frais, rentabilité par dossier, PctMarge distribution
Suivi Logistique : nombre de bookings, ports actifs, navires utilisés, conteneurs par type
Balance Comptable : écritures comptables, soldes par compte GL, mouvements financiers";

            var resumeMessages = new List<object>
            {
                new { role = "system", content = $"Tu es un analyste BI pour Tandem Logistics. Génère un résumé analytique concis et professionnel en français basé sur ce contexte :\n{dashboardContext}" },
                new { role = "user",   content = message }
            };

            var resume = await CallGroqAsync(resumeMessages, maxTokens: 400);

            return new AgentResponse
            {
                Success    = true,
                ActionType = "resume",
                Message    = $"📊 **Résumé analytique**\n\n{resume}",
                Data       = null
            };
        }

        private AgentResponse ListActions()
        {
            return new AgentResponse
            {
                Success    = true,
                ActionType = "list",
                Message    = @"🤖 **Voici ce que je peux faire :**

⚙️ **ETL — Alimentation DWH**
- ""Lance les dimensions""
- ""Exécute les faits""
- ""Lance l'alimentation complète""

🔮 **Prédiction de marge**
- ""Prédit la marge pour un dossier de 50000 TND avec 3 conteneurs""

🎯 **Segmentation client**
- ""Segmente le client CRANE WORLDWIDE avec CA 500000""

📊 **Résumé dashboard**
- ""Résume le dashboard KPIs Financiers""
- ""Analyse les performances commerciales""

💬 **Questions générales**
- Pose-moi n'importe quelle question sur Tandem Logistics"
            };
        }

        private async Task<AgentResponse> ChatAsync(string message, List<AgentMessage> history)
        {
            var messages = new List<object>
            {
                new { role = "system", content = "Tu es un assistant BI intelligent pour Tandem Logistics, une société de freight forwarding tunisienne. Réponds en français de manière concise et professionnelle." }
            };

            foreach (var h in history.TakeLast(6))
                messages.Add(new { role = h.Role, content = h.Content });

            messages.Add(new { role = "user", content = message });

            var response = await CallGroqAsync(messages, maxTokens: 500);

            return new AgentResponse
            {
                Success    = true,
                ActionType = "chat",
                Message    = response
            };
        }

        private async Task<string> CallGroqAsync(List<object> messages, int maxTokens = 500)
        {
            var requestBody = new
            {
                model       = "llama-3.1-8b-instant",
                max_tokens  = maxTokens,
                messages    = messages
            };

            var request = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions");
            request.Headers.Add("Authorization", $"Bearer {_groqApiKey}");
            request.Content = new StringContent(
                JsonSerializer.Serialize(requestBody),
                Encoding.UTF8,
                "application/json"
            );

            var response = await _httpClient.SendAsync(request);
            var content  = await response.Content.ReadAsStringAsync();

            var json   = JsonSerializer.Deserialize<JsonElement>(content);
            return json.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";
        }
    }
}
