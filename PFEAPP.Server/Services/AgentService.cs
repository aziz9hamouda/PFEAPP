using System.Text;
using System.Text.Json;
using System.Diagnostics;
using Microsoft.Data.SqlClient;

namespace PFEAPP.Server.Services
{
    public class AgentMessage
    {
        public string Role { get; set; } = "user";
        public string Content { get; set; } = "";
    }

    public class AgentResponse
    {
        public string Message { get; set; } = "";
        public string ActionType { get; set; } = "chat";
        public object? Data { get; set; }
        public bool Success { get; set; } = true;
    }

    public class AgentService
    {
        private readonly string _groqApiKey;
        private readonly string _pythonExe;
        private readonly string _mlScriptPath;
        private readonly string _segScriptPath;
        private readonly string _dtexecPath;
        private readonly string _ssisProjectPath;
        private readonly string _connectionString;
        private readonly HttpClient _httpClient;

        public AgentService(IConfiguration configuration, IHttpClientFactory httpClientFactory)
        {
            _groqApiKey = configuration["Groq:ApiKey"] ?? "";
            _pythonExe = configuration["Ml:PythonExe"] ?? "python";
            _mlScriptPath = @"C:\Users\hp\source\repos\PFEAPP\PFEAPP.Server\ml\predict.py";
            _segScriptPath = @"C:\Users\hp\source\repos\PFEAPP\PFEAPP.Server\ml\predict_segment.py";
            _dtexecPath = configuration["Ssis:DtexecPath"] ?? "dtexec";
            _ssisProjectPath = configuration["Ssis:ProjectPath"] ?? "";
            _connectionString = configuration.GetConnectionString("DWH") ?? "";
            _httpClient = httpClientFactory.CreateClient();
        }

        public async Task<AgentResponse> ProcessMessageAsync(string userMessage, List<AgentMessage> history, string activeDashboard = "")
        {
            var intention = await DetectIntentionAsync(userMessage, activeDashboard);

            return intention switch
            {
                "run_etl_dimensions" => await RunEtlAsync("dimensions.dtsx", "Dimensions"),
                "run_etl_faits" => await RunEtlAsync("FactFinance.dtsx", "Faits"),
                "run_etl_master" => await RunEtlMasterAsync(),
                "predict_marge" => await HandlePredictMargeAsync(userMessage),
                "segment_client" => await HandleSegmentAsync(userMessage),
                "analyse_dashboard" => await AnalyseDashboardAsync(activeDashboard, userMessage),
                "list_actions" => ListActions(),
                "hors_scope" => HorsScope(),
                _ => await ChatAsync(userMessage, history, activeDashboard)
            };
        }

        // ─── Détection intention ─────────────────────────────────────────────

        private async Task<string> DetectIntentionAsync(string message, string activeDashboard)
        {
            var systemPrompt = $@"Tu es un assistant IA UNIQUEMENT pour Tandem Logistics.
Dashboard actif : {activeDashboard}

Retourne UNIQUEMENT l'un de ces codes :
- run_etl_dimensions  → lancer/exécuter/alimenter les dimensions SSIS
- run_etl_faits       → lancer/exécuter/alimenter les faits SSIS
- run_etl_master      → lancer master/alimentation complète SSIS
- predict_marge       → prédire/calculer/estimer la marge d'un dossier
- segment_client      → segmenter/classer un client RFM
- analyse_dashboard   → analyser/résumer dashboard, questions sur CA/marge/coûts/KPIs/chiffres/données/statistiques
- list_actions        → demander les capacités de l'agent
- hors_scope          → météo, sport, politique, blagues, tout hors Tandem Logistics
- chat                → questions générales sur logistique ou Tandem

IMPORTANT :
- Toute question sur chiffres/KPIs/données → analyse_dashboard
- Prédire/segmenter sans chiffres → predict_marge ou segment_client
- Hors Tandem Logistics → hors_scope

Retourne UNIQUEMENT le code.";

            var msgs = new List<object>
            {
                new { role = "system", content = systemPrompt },
                new { role = "user",   content = message }
            };

            var r = await CallGroqAsync(msgs, maxTokens: 20);
            return r.Trim().ToLower().Replace(".", "").Replace(" ", "_");
        }

        // ─── ETL ─────────────────────────────────────────────────────────────

        private async Task<AgentResponse> RunEtlAsync(string packageName, string type)
        {
            var psi = new ProcessStartInfo
            {
                FileName = _dtexecPath,
                Arguments = $"/File \"{_ssisProjectPath}\\{packageName}\"",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            try
            {
                var startTime = DateTime.Now;
                using var process = new Process { StartInfo = psi };
                process.Start();

                var outTask = process.StandardOutput.ReadToEndAsync();
                var errTask = process.StandardError.ReadToEndAsync();
                var timeout = Task.Delay(TimeSpan.FromMinutes(10));
                var done = await Task.WhenAny(Task.WhenAll(outTask, errTask), timeout);

                if (done == timeout) { process.Kill(); return new AgentResponse { Success = false, ActionType = "etl", Message = "⏱️ Timeout — package dépassé 10 minutes." }; }

                await process.WaitForExitAsync();
                var dur = (int)(DateTime.Now - startTime).TotalSeconds;
                var success = process.ExitCode == 0;

                return new AgentResponse
                {
                    Success = success,
                    ActionType = "etl",
                    Message = success
                        ? $"✅ Package **{type}** exécuté avec succès en **{dur} secondes**."
                        : $"❌ Échec du package {type} (code {process.ExitCode}).",
                    Data = new { package = packageName, duration = dur, success }
                };
            }
            catch (Exception ex)
            {
                return new AgentResponse { Success = false, ActionType = "etl", Message = $"❌ Erreur : {ex.Message}" };
            }
        }

        private async Task<AgentResponse> RunEtlMasterAsync()
        {
            var dim = await RunEtlAsync("dimensions.dtsx", "Dimensions");
            if (!dim.Success) return dim;
            var fait = await RunEtlAsync("FactFinance.dtsx", "Faits");
            if (!fait.Success) return fait;
            return new AgentResponse
            {
                Success = true,
                ActionType = "etl",
                Message = "✅ Alimentation complète réussie !\n\n📐 **Dimensions** chargées\n📊 **Faits** chargés\n\nLe Data Warehouse est à jour."
            };
        }

        // ─── ML interactif ───────────────────────────────────────────────────

        private async Task<AgentResponse> HandlePredictMargeAsync(string message)
        {
            if (!message.Any(char.IsDigit))
                return new AgentResponse
                {
                    Success = true,
                    ActionType = "predict_marge",
                    Message = "🔮 Pour prédire la marge, j'ai besoin de :\n\n" +
                              "1️⃣ **Montant Vente Total** (TND)\n2️⃣ **Nom du client**\n" +
                              "3️⃣ **Nombre de conteneurs**\n4️⃣ **Port origine** (ex: TNTUN)\n5️⃣ **Port destination**\n\n" +
                              "Exemple : *\"Prédit la marge pour CRANE WORLDWIDE, 50000 TND, 3 conteneurs, TNTUN vers FRMRS\"*"
                };
            return await PredictMargeFromMessageAsync(message);
        }

        private async Task<AgentResponse> HandleSegmentAsync(string message)
        {
            if (!message.Any(char.IsDigit))
                return new AgentResponse
                {
                    Success = true,
                    ActionType = "segment",
                    Message = "🎯 Pour segmenter un client, j'ai besoin de :\n\n" +
                              "1️⃣ **Nom du client**\n2️⃣ **Récence** (jours)\n" +
                              "3️⃣ **Fréquence** (nb factures)\n4️⃣ **CA Total** (TND)\n\n" +
                              "Exemple : *\"Segmente CRANE WORLDWIDE, récence 30 jours, 25 factures, CA 800000\"*"
                };
            return await SegmentClientFromMessageAsync(message);
        }

        // ─── RAG — Analyse Dashboard ─────────────────────────────────────────

        private async Task<AgentResponse> AnalyseDashboardAsync(string dashboard, string question)
        {
            try
            {
                var kpis = await GetDashboardKpisAsync(dashboard);

                var prompt = $@"Tu es un analyste BI senior pour Tandem Logistics (freight forwarding tunisien).
Dashboard actif : {dashboard}

Données réelles du Data Warehouse :
{kpis}

Question : {question}

Réponds en français, professionnel et concis. Utilise UNIQUEMENT les données ci-dessus.
Formate les montants avec séparateurs de milliers. Ne génère pas de données fictives.";

                var msgs = new List<object> { new { role = "system", content = prompt } };
                var response = await CallGroqAsync(msgs, maxTokens: 600);

                return new AgentResponse
                {
                    Success = true,
                    ActionType = "analyse_dashboard",
                    Message = $"📊 {response}",
                    Data = new { dashboard }
                };
            }
            catch (Exception ex)
            {
                return new AgentResponse { Success = false, ActionType = "analyse_dashboard", Message = $"❌ Erreur lors de l'analyse : {ex.Message}" };
            }
        }

        // ─── Requêtes SQL RAG par dashboard ──────────────────────────────────

        private async Task<string> GetDashboardKpisAsync(string dashboard)
        {
            var sb = new StringBuilder();
            await using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();

            // ── FINANCE ──────────────────────────────────────────────────────
            if (dashboard is "finance" or "home" || string.IsNullOrEmpty(dashboard))
            {
                sb.AppendLine("=== KPIs FINANCIERS ===");

                await RunQuery(conn, sb, @"
                    SELECT SUM(v.MontantHT) AS CA_HT,
                           (SELECT SUM(MontantHT) FROM FACT_FACTURE_ACHAT WHERE MontantHT > 0) AS Couts_Directs,
                           SUM(v.MontantTTC) AS CA_TTC
                    FROM FACT_FACTURE_VENTE v
                    WHERE v.MontantHT > 0 AND v.DocumentType = 'Invoice'",
                    r => {
                        var caHt = r.IsDBNull(0) ? 0 : Convert.ToDouble(r.GetValue(0));
                        var couts = r.IsDBNull(1) ? 0 : Convert.ToDouble(r.GetValue(1));
                        var caTtc = r.IsDBNull(2) ? 0 : Convert.ToDouble(r.GetValue(2));
                        var marge = caHt - couts;
                        var tx = caHt > 0 ? marge / caHt * 100 : 0;
                        sb.AppendLine($"CA HT : {caHt:N0} TND | CA TTC : {caTtc:N0} TND");
                        sb.AppendLine($"Coûts Directs : {couts:N0} TND | Marge Brute : {marge:N0} TND | Taux Marge : {tx:F1}%");
                    });

                await RunQueryList(conn, sb, @"
                    SELECT TOP 1 a.Description, SUM(v.MontantHT) AS CA
                    FROM FACT_FACTURE_VENTE v INNER JOIN DIM_ARTICLE a ON v.ArticleKey = a.ArticleKey
                    WHERE v.MontantHT > 0 AND v.DocumentType = 'Invoice'
                    GROUP BY a.Description ORDER BY CA DESC",
                    r => sb.AppendLine($"Top Article Vendu : {r.GetString(0)} ({Convert.ToDouble(r.GetValue(1)):N0} TND)"));

                await RunQueryList(conn, sb, @"
                    SELECT TOP 1 a.Description, SUM(f.MontantHT) AS Cout
                    FROM FACT_FACTURE_ACHAT f INNER JOIN DIM_ARTICLE a ON f.ArticleKey = a.ArticleKey
                    WHERE f.MontantHT > 0
                    GROUP BY a.Description ORDER BY Cout DESC",
                    r => sb.AppendLine($"Top Article Acheté : {r.GetString(0)} ({Convert.ToDouble(r.GetValue(1)):N0} TND)"));

                sb.AppendLine("Top Catégories :");
                await RunQueryList(conn, sb, @"
                    SELECT TOP 3 a.GenProdPostingGroup, SUM(v.MontantHT) AS CA
                    FROM FACT_FACTURE_VENTE v INNER JOIN DIM_ARTICLE a ON v.ArticleKey = a.ArticleKey
                    WHERE v.MontantHT > 0 AND v.DocumentType = 'Invoice' AND a.GenProdPostingGroup != ''
                    GROUP BY a.GenProdPostingGroup ORDER BY CA DESC",
                    r => sb.AppendLine($"  - {r.GetString(0)} : {Convert.ToDouble(r.GetValue(1)):N0} TND"));

                sb.AppendLine("Top Pays (CA HT) :");
                await RunQueryList(conn, sb, @"
                    SELECT TOP 3 c.CountryCode, SUM(v.MontantHT) AS CA
                    FROM FACT_FACTURE_VENTE v INNER JOIN DIM_CLIENT c ON v.ClientKey = c.ClientKey
                    WHERE v.MontantHT > 0 AND v.DocumentType = 'Invoice'
                      AND c.CountryCode IS NOT NULL AND c.CountryCode != ''
                    GROUP BY c.CountryCode ORDER BY CA DESC",
                    r => sb.AppendLine($"  - {r.GetString(0)} : {Convert.ToDouble(r.GetValue(1)):N0} TND"));
            }

            // ── BALANCE COMPTABLE ─────────────────────────────────────────────
            if (dashboard == "balance")
            {
                sb.AppendLine("=== BALANCE COMPTABLE ===");

                await RunQuery(conn, sb, @"
                    SELECT COUNT(*) AS NbEcritures,
                           SUM(MontantDebit) AS TotalDebit,
                           SUM(MontantCredit) AS TotalCredit,
                           SUM(MontantTVA) AS TVA
                    FROM FACT_ECRITURE_COMPTABLE",
                    r => {
                        var debit = r.IsDBNull(1) ? 0 : Convert.ToDouble(r.GetValue(1));
                        var credit = r.IsDBNull(2) ? 0 : Convert.ToDouble(r.GetValue(2));
                        sb.AppendLine($"Nb Écritures : {Convert.ToInt32(r.GetValue(0)):N0}");
                        sb.AppendLine($"Total Débit : {debit:N0} TND | Total Crédit : {credit:N0} TND");
                        sb.AppendLine($"TVA Écritures : {(r.IsDBNull(3) ? 0 : Convert.ToDouble(r.GetValue(3))):N0} TND");
                        sb.AppendLine($"Solde Net : {(debit - credit):N0} TND");
                    });

                await RunQuery(conn, sb, @"
                    SELECT 
                        (SELECT SUM(MontantHT) FROM FACT_FACTURE_VENTE WHERE MontantHT > 0 AND DocumentType = 'Invoice') AS CA_HT,
                        (SELECT SUM(MontantHT) FROM FACT_FACTURE_ACHAT WHERE MontantHT > 0) AS Couts",
                    r => {
                        var caHt = r.IsDBNull(0) ? 0 : Convert.ToDouble(r.GetValue(0));
                        var couts = r.IsDBNull(1) ? 0 : Convert.ToDouble(r.GetValue(1));
                        var marge = caHt - couts;
                        var roi = couts > 0 ? marge / couts * 100 : 0;
                        sb.AppendLine($"ROI Opérationnel : {roi:F1}%");
                    });

                sb.AppendLine("Solde Net par Nature Comptable :");
                await RunQueryList(conn, sb, @"
                    SELECT 
                        CASE 
                            WHEN LEFT(g.NumCompte, 2) = '15' THEN 'Passif - Provisions'
                            WHEN LEFT(g.NumCompte, 2) = '16' THEN 'Actif - Immobilisations'
                            WHEN LEFT(g.NumCompte, 2) IN ('10','11') THEN 'Capitaux propres'
                            WHEN LEFT(g.NumCompte, 2) = '12' THEN 'Résultat'
                            WHEN LEFT(g.NumCompte, 1) = '6' THEN 'Charges'
                            WHEN LEFT(g.NumCompte, 1) = '7' THEN 'Produits'
                            WHEN LEFT(g.NumCompte, 1) = '1' THEN 'Bilan (Autre)'
                            ELSE 'Autre'
                        END AS NatureComptable,
                        SUM(e.MontantDebit) - SUM(e.MontantCredit) AS SoldeNet
                    FROM FACT_ECRITURE_COMPTABLE e
                    INNER JOIN DIM_COMPTE_GL g ON e.CompteKey = g.CompteKey
                    GROUP BY 
                        CASE 
                            WHEN LEFT(g.NumCompte, 2) = '15' THEN 'Passif - Provisions'
                            WHEN LEFT(g.NumCompte, 2) = '16' THEN 'Actif - Immobilisations'
                            WHEN LEFT(g.NumCompte, 2) IN ('10','11') THEN 'Capitaux propres'
                            WHEN LEFT(g.NumCompte, 2) = '12' THEN 'Résultat'
                            WHEN LEFT(g.NumCompte, 1) = '6' THEN 'Charges'
                            WHEN LEFT(g.NumCompte, 1) = '7' THEN 'Produits'
                            WHEN LEFT(g.NumCompte, 1) = '1' THEN 'Bilan (Autre)'
                            ELSE 'Autre'
                        END
                    ORDER BY ABS(SUM(e.MontantDebit) - SUM(e.MontantCredit)) DESC",
                    r => sb.AppendLine($"  - {r.GetString(0)} : {Convert.ToDouble(r.GetValue(1)):N0} TND"));

                sb.AppendLine("Top 5 Comptes GL :");
                await RunQueryList(conn, sb, @"
                    SELECT TOP 5 g.NumCompte, g.LibelleCompte,
                           SUM(e.MontantDebit) AS Debit,
                           SUM(e.MontantCredit) AS Credit
                    FROM FACT_ECRITURE_COMPTABLE e
                    INNER JOIN DIM_COMPTE_GL g ON e.CompteKey = g.CompteKey
                    GROUP BY g.NumCompte, g.LibelleCompte
                    ORDER BY ABS(SUM(e.MontantDebit) - SUM(e.MontantCredit)) DESC",
                    r => {
                        var d = Convert.ToDouble(r.GetValue(2));
                        var c = Convert.ToDouble(r.GetValue(3));
                        sb.AppendLine($"  - {r.GetString(0)} {r.GetString(1)} : D={d:N0} / C={c:N0} / Solde={d - c:N0}");
                    });
            }

            // ── COMMERCIAL ────────────────────────────────────────────────────
            if (dashboard == "commercial")
            {
                sb.AppendLine("=== PERFORMANCE COMMERCIALE ===");

                await RunQuery(conn, sb, @"
                    SELECT COUNT(DISTINCT ClientKey) AS ClientsActifs,
                           SUM(MontantHT) AS CA_HT
                    FROM FACT_FACTURE_VENTE
                    WHERE MontantHT > 0 AND DocumentType = 'Invoice'",
                    r => {
                        var clients = Convert.ToInt32(r.GetValue(0));
                        var caHt = Convert.ToDouble(r.GetValue(1));
                        sb.AppendLine($"Clients Actifs : {clients:N0}");
                        sb.AppendLine($"CA par Client Moyen : {(clients > 0 ? caHt / clients : 0):N0} TND");
                    });

                await RunQuery(conn, sb, @"
                    SELECT COUNT(DISTINCT FournisseurKey) AS FournisseursActifs
                    FROM FACT_FACTURE_ACHAT WHERE MontantHT > 0",
                    r => sb.AppendLine($"Fournisseurs Actifs : {Convert.ToInt32(r.GetValue(0)):N0}"));

                await RunQuery(conn, sb, @"
                    WITH annees AS (
                        SELECT MAX(d.Year) AS MaxYear
                        FROM DIM_DATE d INNER JOIN FACT_FACTURE_VENTE v ON v.DateKey = d.DateKey
                        WHERE v.MontantHT > 0
                    ),
                    clientsN AS (
                        SELECT DISTINCT v.ClientKey
                        FROM FACT_FACTURE_VENTE v INNER JOIN DIM_DATE d ON v.DateKey = d.DateKey
                        WHERE d.Year = (SELECT MaxYear FROM annees) AND v.MontantHT > 0
                    ),
                    clientsN1 AS (
                        SELECT DISTINCT v.ClientKey
                        FROM FACT_FACTURE_VENTE v INNER JOIN DIM_DATE d ON v.DateKey = d.DateKey
                        WHERE d.Year = (SELECT MaxYear - 1 FROM annees) AND v.MontantHT > 0
                    )
                    SELECT COUNT(*) AS Communs,
                           (SELECT COUNT(*) FROM clientsN1) AS TotalN1
                    FROM clientsN WHERE ClientKey IN (SELECT ClientKey FROM clientsN1)",
                    r => {
                        var communs = Convert.ToInt32(r.GetValue(0));
                        var n1 = Convert.ToInt32(r.GetValue(1));
                        var taux = n1 > 0 ? (double)communs / n1 * 100 : 0;
                        sb.AppendLine($"Taux de Rétention Clients : {taux:F1}% ({communs} fidèles sur {n1})");
                    });

                sb.AppendLine("Top 10 Clients (CA HT) :");
                await RunQueryList(conn, sb, @"
                    SELECT TOP 10 c.ClientName, SUM(v.MontantHT) AS CA
                    FROM FACT_FACTURE_VENTE v INNER JOIN DIM_CLIENT c ON v.ClientKey = c.ClientKey
                    WHERE v.MontantHT > 0 AND v.DocumentType = 'Invoice'
                    GROUP BY c.ClientName ORDER BY CA DESC",
                    r => sb.AppendLine($"  - {r.GetString(0)} : {Convert.ToDouble(r.GetValue(1)):N0} TND"));

                await RunQuery(conn, sb, @"
                    SELECT 
                        (SELECT COUNT(DISTINCT ClientKey) FROM DIM_CLIENT) AS TotalClients,
                        (SELECT COUNT(DISTINCT ClientKey) FROM FACT_FACTURE_VENTE WHERE MontantHT > 0) AS ClientsActifs",
                    r => sb.AppendLine($"Entonnoir : Total Clients={Convert.ToInt32(r.GetValue(0)):N0} → Clients Actifs={Convert.ToInt32(r.GetValue(1)):N0}"));

                sb.AppendLine("Dossiers par Type d'Opération :");
                await RunQueryList(conn, sb, @"
                    SELECT TypeOperation, COUNT(DISTINCT NoDossier) AS NbDossiers
                    FROM FACT_LIGNE_DOSSIER
                    WHERE TypeOperation IS NOT NULL AND TypeOperation != ''
                    GROUP BY TypeOperation ORDER BY NbDossiers DESC",
                    r => sb.AppendLine($"  - {r.GetString(0)} : {Convert.ToInt32(r.GetValue(1)):N0} dossiers"));

                sb.AppendLine("Top 5 Fournisseurs (Frais Achat) :");
                await RunQueryList(conn, sb, @"
                    SELECT TOP 5 f2.VendorName, SUM(f.MontantAchatTotalDS) AS FraisAchat
                    FROM FACT_FRAIS_DOSSIER f
                    INNER JOIN DIM_FOURNISSEUR f2 ON f.FournisseurKey = f2.FournisseurKey
                    GROUP BY f2.VendorName ORDER BY FraisAchat DESC",
                    r => sb.AppendLine($"  - {r.GetString(0)} : {Convert.ToDouble(r.GetValue(1)):N0} TND"));
            }

            // ── LOGISTIQUE ────────────────────────────────────────────────────
            if (dashboard == "logistique")
            {
                sb.AppendLine("=== SUIVI LOGISTIQUE ===");

                await RunQuery(conn, sb, @"
                    SELECT 
                        (SELECT COUNT(DISTINCT NoDossier) FROM FACT_LIGNE_DOSSIER) AS NbDossiersActifs,
                        (SELECT COUNT(DISTINCT NoDossier) FROM FACT_BOOKING)        AS NbBookings,
                        (SELECT SUM(MontantPeriode1 + MontantPeriode2 + MontantPeriode3) FROM FACT_LIGNE_DOSSIER) AS Surestaries,
                        (SELECT SUM(PoidsBrutMarchandise) FROM FACT_LIGNE_DOSSIER)  AS PoidsBrut",
                    r => {
                        sb.AppendLine($"Nb Dossiers Actifs : {Convert.ToInt32(r.GetValue(0)):N0}");
                        sb.AppendLine($"Nb Bookings : {Convert.ToInt32(r.GetValue(1)):N0}");
                        sb.AppendLine($"Surestaries : {Convert.ToDouble(r.GetValue(2)):N0} TND");
                        sb.AppendLine($"Poids Brut Total : {Convert.ToDouble(r.GetValue(3)):N0} kg");
                    });

                await RunQuery(conn, sb, @"
                    SELECT AVG(CAST(DATEDIFF(DAY,
                        DATEFROMPARTS(DateEscaleKey/10000, (DateEscaleKey%10000)/100, DateEscaleKey%100),
                        DATEFROMPARTS(DateRestitutionKey/10000, (DateRestitutionKey%10000)/100, DateRestitutionKey%100)
                    ) AS FLOAT)) AS DureeEscaleMoy
                    FROM FACT_LIGNE_DOSSIER
                    WHERE DateEscaleKey > 0 AND DateRestitutionKey > 0
                      AND DateRestitutionKey > DateEscaleKey",
                    r => sb.AppendLine($"Durée Escale Moyenne : {(r.IsDBNull(0) ? 0 : Convert.ToDouble(r.GetValue(0))):F1} jours"));

                await RunQuery(conn, sb, @"
                    SELECT SUM(CASE WHEN IsDangereux = 1 THEN 1 ELSE 0 END) AS NbDangereux,
                           COUNT(*) AS NbTotal
                    FROM FACT_LIGNE_DOSSIER",
                    r => {
                        var nb = Convert.ToInt32(r.GetValue(0));
                        var total = Convert.ToInt32(r.GetValue(1));
                        sb.AppendLine($"Taux Marchandises Dangereuses : {(total > 0 ? (double)nb / total * 100 : 0):F1}% ({nb:N0}/{total:N0})");
                    });

                sb.AppendLine("Top 5 Navires (Nb Bookings) :");
                await RunQueryList(conn, sb, @"
                    SELECT TOP 5 n.DesignationNavire, COUNT(*) AS NbBookings
                    FROM FACT_BOOKING b INNER JOIN DIM_NAVIRE n ON b.NavireKey = n.NavireKey
                    WHERE n.DesignationNavire NOT IN ('INCONNU', 'Non renseigné')
                    GROUP BY n.DesignationNavire ORDER BY NbBookings DESC",
                    r => sb.AppendLine($"  - {r.GetString(0)} : {Convert.ToInt32(r.GetValue(1))} bookings"));

                sb.AppendLine("Top Incoterms :");
                await RunQueryList(conn, sb, @"
                    SELECT TOP 5 i.LibelleIncoterm, COUNT(*) AS Nb
                    FROM FACT_BOOKING b INNER JOIN DIM_INCOTERM i ON b.IncotermKey = i.IncotermKey
                    GROUP BY i.LibelleIncoterm ORDER BY Nb DESC",
                    r => sb.AppendLine($"  - {r.GetString(0)} : {Convert.ToInt32(r.GetValue(1))}"));

                sb.AppendLine("Répartition par Type Opération :");
                await RunQueryList(conn, sb, @"
                    SELECT TypeOperation, Type_Dossier, COUNT(DISTINCT NoDossier) AS Nb
                    FROM FACT_LIGNE_DOSSIER
                    WHERE TypeOperation IS NOT NULL AND TypeOperation != ''
                    GROUP BY TypeOperation, Type_Dossier ORDER BY Nb DESC",
                    r => sb.AppendLine($"  - {r.GetString(0)} / {r.GetString(1)} : {Convert.ToInt32(r.GetValue(2))} dossiers"));

                sb.AppendLine("Top 5 Ports Destination :");
                await RunQueryList(conn, sb, @"
                    SELECT TOP 5 p.NomPort, COUNT(*) AS NbBookings
                    FROM FACT_BOOKING b INNER JOIN DIM_PORT p ON b.PortDestinationKey = p.PortKey
                    GROUP BY p.NomPort ORDER BY NbBookings DESC",
                    r => sb.AppendLine($"  - {r.GetString(0)} : {Convert.ToInt32(r.GetValue(1))} bookings"));
            }

            // ── ANALYSE FRAIS DOSSIERS ────────────────────────────────────────
            if (dashboard == "frais")
            {
                sb.AppendLine("=== ANALYSE FRAIS DOSSIERS ===");

                await RunQuery(conn, sb, @"
                    SELECT COUNT(DISTINCT NoDossier)    AS NbDossiers,
                           SUM(MontantVenteTotalDS)      AS FraisVente,
                           SUM(MontantAchatTotalDS)      AS FraisAchat,
                           SUM(Marge)                   AS MargeFreis,
                           AVG(PctMarge)                AS PctMargeMoy
                    FROM FACT_FRAIS_DOSSIER
                    WHERE MontantAchatTotalDS > 0 AND PctMarge < 200 AND PctMarge > -50",
                    r => {
                        var nb = Convert.ToInt32(r.GetValue(0));
                        var vente = Convert.ToDouble(r.GetValue(1));
                        var achat = Convert.ToDouble(r.GetValue(2));
                        var marge = Convert.ToDouble(r.GetValue(3));
                        var pct = Convert.ToDouble(r.GetValue(4));
                        sb.AppendLine($"Nb Dossiers Frais : {nb:N0}");
                        sb.AppendLine($"Frais Vente Total : {vente:N0} TND | Frais Achat Total : {achat:N0} TND");
                        sb.AppendLine($"Marge Frais : {marge:N0} TND | Pct Marge Moyen : {pct:F1}%");
                        sb.AppendLine($"Frais Moyen par Dossier : {(nb > 0 ? vente / nb : 0):N0} TND");
                    });

                await RunQuery(conn, sb, @"
                    SELECT SUM(MontantVenteTotalDS) AS FraisFret
                    FROM FACT_FRAIS_DOSSIER WHERE IsFret = 1",
                    r => {
                        var fret = r.IsDBNull(0) ? 0 : Convert.ToDouble(r.GetValue(0));
                        sb.AppendLine($"Frais Fret : {fret:N0} TND (Cible 25% : {fret * 0.25:N0} TND)");
                    });

                sb.AppendLine("Top 5 Clients (Marge Frais) :");
                await RunQueryList(conn, sb, @"
                    SELECT TOP 5 c.ClientName,
                           SUM(f.MontantVenteTotalDS) AS FraisVente,
                           SUM(f.MontantAchatTotalDS) AS FraisAchat,
                           AVG(f.PctMarge)            AS PctMarge,
                           SUM(f.Marge)               AS Marge,
                           COUNT(DISTINCT f.NoDossier) AS NbDossiers
                    FROM FACT_FRAIS_DOSSIER f
                    INNER JOIN DIM_CLIENT c ON f.ClientKey = c.ClientKey
                    WHERE f.MontantAchatTotalDS > 0 AND f.PctMarge < 200 AND f.PctMarge > -50
                    GROUP BY c.ClientName ORDER BY Marge DESC",
                    r => sb.AppendLine($"  - {r.GetString(0)} : Vente={Convert.ToDouble(r.GetValue(1)):N0} | Achat={Convert.ToDouble(r.GetValue(2)):N0} | Marge={Convert.ToDouble(r.GetValue(4)):N0} TND | {Convert.ToDouble(r.GetValue(3)):F1}% | {Convert.ToInt32(r.GetValue(5))} dossiers"));

                sb.AppendLine("Top 5 Fournisseurs (Frais Achat) :");
                await RunQueryList(conn, sb, @"
                    SELECT TOP 5 f2.VendorName, SUM(f.MontantAchatTotalDS) AS FraisAchat
                    FROM FACT_FRAIS_DOSSIER f
                    INNER JOIN DIM_FOURNISSEUR f2 ON f.FournisseurKey = f2.FournisseurKey
                    GROUP BY f2.VendorName ORDER BY FraisAchat DESC",
                    r => sb.AppendLine($"  - {r.GetString(0)} : {Convert.ToDouble(r.GetValue(1)):N0} TND"));
            }

            return sb.ToString();
        }

        // ─── Helpers SQL ─────────────────────────────────────────────────────

        private async Task RunQuery(SqlConnection conn, StringBuilder sb, string sql, Action<SqlDataReader>? process)
        {
            try
            {
                await using var cmd = new SqlCommand(sql, conn);
                cmd.CommandTimeout = 60;
                await using var r = await cmd.ExecuteReaderAsync();
                if (await r.ReadAsync()) process?.Invoke(r);
            }
            catch (Exception ex) { sb.AppendLine($"[Erreur : {ex.Message}]"); }
        }

        private async Task RunQueryList(SqlConnection conn, StringBuilder sb, string sql, Action<SqlDataReader> process)
        {
            try
            {
                await using var cmd = new SqlCommand(sql, conn);
                cmd.CommandTimeout = 60;
                await using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync()) process(r);
            }
            catch (Exception ex) { sb.AppendLine($"[Erreur : {ex.Message}]"); }
        }

        // ─── ML Prédiction ───────────────────────────────────────────────────

        private async Task<AgentResponse> PredictMargeFromMessageAsync(string message)
        {
            var extractPrompt = $@"Extrait les paramètres du message et retourne JSON valide UNIQUEMENT :
{{""MontantVenteTotalDS"":0,""NbConteneurs"":0,""PoidsBrutTotal"":0,""ClientName"":""INCONNU"",""CountryCode"":""TN"",""CustomerPostingGroup"":""LOCAL"",""DesignationNavire"":""INCONNU"",""PortOrigine"":""TNTUN"",""PortDestination"":""TNTUN"",""TypeConteneurPrincipal"":""20'DC"",""IsPorteConteneurs"":0,""HasDangereux"":0}}
Message : {message}";

            var msgs = new List<object> { new { role = "system", content = "Retourne uniquement JSON valide sans markdown." }, new { role = "user", content = extractPrompt } };
            var jsonStr = await CallGroqAsync(msgs, maxTokens: 300);

            try
            {
                var clean = jsonStr.Replace("```json", "").Replace("```", "").Trim();
                var features = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(clean) ?? new();
                var escaped = JsonSerializer.Serialize(features).Replace("\"", "\\\"");

                var psi = new ProcessStartInfo { FileName = _pythonExe, Arguments = $"\"{_mlScriptPath}\" \"{escaped}\"", RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
                using var process = new Process { StartInfo = psi };
                process.Start();
                var stdout = await process.StandardOutput.ReadToEndAsync();
                await process.WaitForExitAsync();

                var output = JsonSerializer.Deserialize<JsonElement>(stdout.Trim());
                var pctMarge = output.GetProperty("pct_marge").GetDouble();
                var interp = pctMarge switch { < 0 => "⚠️ Marge négative", < 10 => "🔴 Très faible", < 20 => "🟡 Faible", < 35 => "🟢 Correcte", < 60 => "✅ Bonne", _ => "🏆 Excellente" };

                return new AgentResponse { Success = true, ActionType = "predict_marge", Message = $"🔮 **Marge prédite : {pctMarge:F1}%**\n\n{interp}", Data = new { pctMarge } };
            }
            catch (Exception ex) { return new AgentResponse { Success = false, ActionType = "predict_marge", Message = $"❌ Erreur : {ex.Message}" }; }
        }

        // ─── ML Segmentation ─────────────────────────────────────────────────

        private async Task<AgentResponse> SegmentClientFromMessageAsync(string message)
        {
            var extractPrompt = $@"Extrait RFM du message, retourne JSON valide UNIQUEMENT :
{{""ClientName"":""Inconnu"",""Recence"":180,""Frequence"":5,""CA_Total"":50000,""Marge_Moyenne"":20}}
Message : {message}";

            var msgs = new List<object> { new { role = "system", content = "JSON valide uniquement sans markdown." }, new { role = "user", content = extractPrompt } };
            var jsonStr = await CallGroqAsync(msgs, maxTokens: 200);

            try
            {
                var clean = jsonStr.Replace("```json", "").Replace("```", "").Trim();
                var data = JsonSerializer.Deserialize<JsonElement>(clean);
                var client = data.TryGetProperty("ClientName", out var cn) ? cn.GetString() ?? "Inconnu" : "Inconnu";

                var inputJson = JsonSerializer.Serialize(new
                {
                    Recence = data.TryGetProperty("Recence", out var r) ? r.GetDouble() : 180,
                    Frequence = data.TryGetProperty("Frequence", out var f) ? f.GetDouble() : 5,
                    CA_Total = data.TryGetProperty("CA_Total", out var c) ? c.GetDouble() : 50000,
                    Marge_Moyenne = data.TryGetProperty("Marge_Moyenne", out var m) ? m.GetDouble() : 20
                });

                var escaped = inputJson.Replace("\"", "\\\"");
                var psi = new ProcessStartInfo { FileName = _pythonExe, Arguments = $"\"{_segScriptPath}\" \"{escaped}\"", RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
                using var process = new Process { StartInfo = psi };
                process.Start();
                var stdout = await process.StandardOutput.ReadToEndAsync();
                await process.WaitForExitAsync();

                var output = JsonSerializer.Deserialize<JsonElement>(stdout.Trim());
                var segment = output.GetProperty("segment").GetString() ?? "Inconnu";
                var reco = output.GetProperty("recommendation").GetProperty("action").GetString() ?? "";
                var icon = segment switch { "VIP" => "👑", "Fidèle" => "⭐", "À risque" => "⚠️", _ => "📉" };

                return new AgentResponse { Success = true, ActionType = "segment", Message = $"{icon} **{client}** → Segment **{segment}**\n\n🎯 {reco}", Data = new { client, segment } };
            }
            catch (Exception ex) { return new AgentResponse { Success = false, ActionType = "segment", Message = $"❌ Erreur : {ex.Message}" }; }
        }

        // ─── Utilitaires ─────────────────────────────────────────────────────

        private AgentResponse HorsScope() => new()
        {
            Success = true,
            ActionType = "hors_scope",
            Message = "🚫 Je suis limité aux données **Tandem Logistics**.\n\nJe peux vous aider avec :\n- 📊 Analyse dashboards Power BI\n- ⚙️ Alimentation DWH\n- 🔮 Prédiction marge\n- 🎯 Segmentation clients"
        };

        private AgentResponse ListActions() => new()
        {
            Success = true,
            ActionType = "list",
            Message = "🤖 **Mes capacités :**\n\n⚙️ **ETL** : \"Lance les dimensions\" / \"Alimente les faits\" / \"Lance le master\"\n\n📊 **Analyse dashboard (RAG)** : \"Quel est le CA total ?\" / \"Top clients ?\" / \"Surestaries ?\"\n\n🔮 **Prédiction marge** : \"Prédit la marge pour CRANE, 50000 TND, 3 conteneurs\"\n\n🎯 **Segmentation** : \"Segmente HALLIBURTON, récence 45 jours, CA 800000\""
        };

        private async Task<AgentResponse> ChatAsync(string message, List<AgentMessage> history, string dashboard)
        {
            var msgs = new List<object>
            {
                new { role = "system", content = $"Tu es un assistant BI pour Tandem Logistics (freight forwarding tunisien). Dashboard : {dashboard}. Réponds en français, concis. Refuse les questions hors logistique." }
            };
            foreach (var h in history.TakeLast(6))
                msgs.Add(new { role = h.Role, content = h.Content });
            msgs.Add(new { role = "user", content = message });
            var response = await CallGroqAsync(msgs, maxTokens: 400);
            return new AgentResponse { Success = true, ActionType = "chat", Message = response };
        }

        private async Task<string> CallGroqAsync(List<object> messages, int maxTokens = 500)
        {
            var body = new { model = "llama-3.1-8b-instant", max_tokens = maxTokens, messages };
            var request = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions");
            request.Headers.Add("Authorization", $"Bearer {_groqApiKey}");
            request.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
            var response = await _httpClient.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();
            var json = JsonSerializer.Deserialize<JsonElement>(content);
            return json.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";
        }
    }
}