using System.Text;
using System.Text.Json;
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
        private const string AntiHallucinationRules = @"RÈGLES ANTI-HALLUCINATION (obligatoires) :
- N'invente JAMAIS un chiffre, un nom de client/fournisseur/compte ou une donnée qui n'apparaît pas explicitement dans les données fournies ci-dessus.
- Si la question porte sur une donnée absente du contexte fourni, réponds explicitement ""Je n'ai pas cette donnée disponible"" au lieu de deviner ou d'estimer.
- Ne produis jamais un code d'action ou un nom de dashboard en dehors de la liste fixe autorisée.
- En cas de doute sur un chiffre, préfère dire que l'information n'est pas disponible plutôt que d'approximer.";

        private readonly string _groqApiKey;
        private readonly string _connectionString;
        private readonly HttpClient _httpClient;
        private readonly SsisService _ssisService;

        public AgentService(IConfiguration configuration, IHttpClientFactory httpClientFactory, SsisService ssisService)
        {
            _groqApiKey = configuration["Groq:ApiKey"] ?? "";
            _connectionString = configuration.GetConnectionString("DWH") ?? "";
            _httpClient = httpClientFactory.CreateClient();
            _ssisService = ssisService;
        }

        // Mots-clés obligatoires pour qu'une exécution ETL soit réellement lancée : filet de sécurité
        // déterministe car le LLM (petit modèle) classe parfois à tort un message vague ("analyse", "résume")
        // comme une intention ETL, ce qui déclencherait un vrai dtexec sur le Data Warehouse à tort.
        private static readonly string[] EtlKeywords =
            { "etl", "dimension", "fait", "master", "aliment", "lance", "lancer", "exécut", "execut", "ssis", "charge" };

        // Mots-clés désignant explicitement UN package précis. Si le message est bien une demande ETL
        // (LooksLikeEtlRequest) mais ne cite aucun de ces mots, on ne devine JAMAIS le package (le LLM
        // a tendance à choisir "dimensions" par défaut) : on demande explicitement lequel.
        private static readonly string[] DimensionsKeywords = { "dimension" };
        private static readonly string[] FaitsKeywords = { "fait" };
        private static readonly string[] MasterKeywords = { "master", "complet", "complète", "tout" };

        private static bool LooksLikeEtlRequest(string message)
        {
            var lower = message.ToLowerInvariant();
            return EtlKeywords.Any(k => lower.Contains(k));
        }

        private static bool MentionsAny(string message, string[] keywords)
        {
            var lower = message.ToLowerInvariant();
            return keywords.Any(k => lower.Contains(k));
        }

        private static AgentResponse AskWhichEtlPackage() => new()
        {
            Success = true,
            ActionType = "ask_etl_package",
            Message = "⚙️ Quel package souhaitez-vous exécuter ?\n\n- **Dimensions**\n- **Faits**\n- **Master** (alimentation complète)",
            Data = new { packages = new[] { "dimensions", "faits", "master" } }
        };

        public async Task<AgentResponse> ProcessMessageAsync(string userMessage, List<AgentMessage> history, string activeDashboard = "", string role = "")
        {
            var intention = await DetectIntentionAsync(userMessage, activeDashboard);

            if (intention is "run_etl_dimensions" or "run_etl_faits" or "run_etl_master")
            {
                if (!LooksLikeEtlRequest(userMessage))
                {
                    // Message ambigu classé à tort comme ETL par le LLM (ex: "logistique", "analyse") :
                    // on retombe sur l'analyse du dashboard plutôt que de refuser à tort une exécution
                    // qui n'a jamais été réellement demandée.
                    intention = "analyse_dashboard";
                }
                else if (role != "ADMIN")
                {
                    // Le message est bien une vraie demande ETL, mais réservée à l'Administrateur —
                    // cohérent avec la restriction serveur de SsisController.
                    return new AgentResponse
                    {
                        Success = false,
                        ActionType = "etl",
                        Message = "🚫 L'exécution ETL est réservée aux administrateurs."
                    };
                }
                else
                {
                    var mentionsDim = MentionsAny(userMessage, DimensionsKeywords);
                    var mentionsFait = MentionsAny(userMessage, FaitsKeywords);
                    var mentionsMaster = MentionsAny(userMessage, MasterKeywords);

                    if (!mentionsDim && !mentionsFait && !mentionsMaster)
                        return AskWhichEtlPackage();

                    // Le message précise explicitement le package : on ne fait pas confiance aveuglément
                    // au choix du LLM (biais observé vers "dimensions"), on l'aligne sur le mot-clé trouvé.
                    if (mentionsMaster) intention = "run_etl_master";
                    else if (mentionsDim) intention = "run_etl_dimensions";
                    else if (mentionsFait) intention = "run_etl_faits";
                }
            }

            return intention switch
            {
                "run_etl_dimensions" => await RunEtlAsync("dimensions.dtsx", "Dimensions"),
                "run_etl_faits" => await RunEtlAsync("FactFinance.dtsx", "Faits"),
                "run_etl_master" => await RunEtlMasterAsync(),
                "analyse_dashboard" => await AnalyseDashboardAsync(activeDashboard, userMessage, role),
                "list_actions" => ListActions(),
                "hors_scope" => HorsScope(),
                _ => await ChatAsync(userMessage, history, activeDashboard)
            };
        }

        private static readonly Dictionary<string, string> DashboardLabels = new()
        {
            ["home"] = "Accueil",
            ["finance"] = "KPIs Financiers",
            ["commercial"] = "Performance Commerciale",
            ["frais"] = "Analyse Frais Dossiers",
            ["logistique"] = "Suivi Logistique",
            ["balance"] = "Balance Comptable",
        };

        private AgentResponse AskWhichDashboard(string role)
        {
            // "Accueil" n'est pas proposé comme dashboard analysable par l'agent (pour tous les rôles,
            // y compris CEO) — ce n'est pas un dashboard métier avec des KPIs propres à analyser.
            var allowed = RolePages.For(role).Where(d => d != "home").ToArray();
            var options = string.Join("\n", allowed.Select(d => $"- **{DashboardLabels.GetValueOrDefault(d, d)}**"));
            return new AgentResponse
            {
                Success = true,
                ActionType = "ask_dashboard",
                Message = $"📋 Quel dashboard souhaitez-vous que j'analyse ?\n\n{options}",
                Data = new { dashboards = allowed }
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
- analyse_dashboard   → analyser/résumer dashboard, questions sur CA/marge/coûts/KPIs/chiffres/données/statistiques/comptes/solde/débit/crédit/balance/GL/écritures comptables/clients/fournisseurs/bookings/navires/ports (TOUTE question portant sur un chiffre ou une donnée métier de Tandem Logistics, quel que soit le domaine)
- list_actions        → demander les capacités de l'agent
- hors_scope          → météo, sport, politique, blagues, tout hors Tandem Logistics
- chat                → questions générales sur logistique ou Tandem

IMPORTANT :
- Toute question sur chiffres/KPIs/données → analyse_dashboard
- Hors Tandem Logistics → hors_scope
- Ne retourne JAMAIS un code en dehors de cette liste fixe.

{AntiHallucinationRules}

Retourne UNIQUEMENT le code.";

            var msgs = new List<object>
            {
                new { role = "system", content = systemPrompt },
                new { role = "user",   content = message }
            };

            var r = await CallGroqAsync(msgs, maxTokens: 20);
            return r.Trim().ToLower().Replace(".", "").Replace(" ", "_");
        }

        // ─── ETL — délègue à SsisService (même code, même journal que l'onglet ETL Runner) ──

        private async Task<AgentResponse> RunEtlAsync(string packageName, string type)
        {
            var result = await _ssisService.ExecutePackageAsync(packageName, type);
            return new AgentResponse
            {
                Success = result.Success,
                ActionType = "etl",
                Message = result.Success
                    ? $"✅ Package **{type}** exécuté avec succès en **{result.DurationSeconds} secondes**."
                    : $"❌ {result.Message}",
                Data = new { package = result.Package, duration = result.DurationSeconds, success = result.Success }
            };
        }

        private async Task<AgentResponse> RunEtlMasterAsync()
        {
            var result = await _ssisService.ExecuteMasterAsync();
            return new AgentResponse
            {
                Success = result.Success,
                ActionType = "etl",
                Message = result.Success
                    ? "✅ Alimentation complète réussie !\n\n📐 **Dimensions** chargées\n📊 **Faits** chargés\n\nLe Data Warehouse est à jour."
                    : $"❌ {result.Message}",
                Data = new { duration = result.DurationSeconds, success = result.Success }
            };
        }

        // ─── RAG — Analyse Dashboard ─────────────────────────────────────────

        private async Task<AgentResponse> AnalyseDashboardAsync(string dashboard, string question, string role)
        {
            if (string.IsNullOrEmpty(dashboard))
                return AskWhichDashboard(role);

            if (!RolePages.CanAccess(role, dashboard))
                return new AgentResponse
                {
                    Success = false,
                    ActionType = "analyse_dashboard",
                    Message = "🚫 Vous n'avez pas accès à ce dashboard avec votre rôle actuel."
                };

            try
            {
                var kpis = await GetDashboardKpisAsync(dashboard);

                var prompt = $@"Tu es un analyste BI senior pour Tandem Logistics (freight forwarding tunisien).
Dashboard actif : {dashboard}

Données réelles du Data Warehouse :
{kpis}

Question : {question}

Réponds en français, professionnel et concis. Utilise UNIQUEMENT les données ci-dessus.
Formate les montants avec séparateurs de milliers.

{AntiHallucinationRules}";

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
            if (dashboard is "finance" or "home")
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

                sb.AppendLine("Évolution Mensuelle du CA :");
                await RunQueryList(conn, sb, @"
                    SELECT d.Year, d.Month, d.MonthName, SUM(v.MontantHT) AS CA
                    FROM FACT_FACTURE_VENTE v INNER JOIN DIM_DATE d ON v.DateKey = d.DateKey
                    WHERE v.MontantHT > 0 AND v.DocumentType = 'Invoice'
                    GROUP BY d.Year, d.Month, d.MonthName
                    ORDER BY d.Year, d.Month",
                    r => sb.AppendLine($"  - {r.GetString(2)} {Convert.ToInt32(r.GetValue(0))} : {Convert.ToDouble(r.GetValue(3)):N0} TND"));
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
                        CASE LEFT(g.GLAccountNo, 1)
                            WHEN '1' THEN 'Classe 1 - Capitaux propres'
                            WHEN '2' THEN 'Classe 2 - Immobilisations'
                            WHEN '3' THEN 'Classe 3 - Stocks'
                            WHEN '4' THEN 'Classe 4 - Tiers'
                            WHEN '5' THEN 'Classe 5 - Financier'
                            WHEN '6' THEN 'Classe 6 - Charges'
                            WHEN '7' THEN 'Classe 7 - Produits'
                            ELSE 'Autre'
                        END AS NatureComptable,
                        SUM(e.MontantDebit) - SUM(e.MontantCredit) AS SoldeNet
                    FROM FACT_ECRITURE_COMPTABLE e
                    INNER JOIN DIM_COMPTE_GL g ON e.CompteKey = g.CompteKey
                    GROUP BY
                        CASE LEFT(g.GLAccountNo, 1)
                            WHEN '1' THEN 'Classe 1 - Capitaux propres'
                            WHEN '2' THEN 'Classe 2 - Immobilisations'
                            WHEN '3' THEN 'Classe 3 - Stocks'
                            WHEN '4' THEN 'Classe 4 - Tiers'
                            WHEN '5' THEN 'Classe 5 - Financier'
                            WHEN '6' THEN 'Classe 6 - Charges'
                            WHEN '7' THEN 'Classe 7 - Produits'
                            ELSE 'Autre'
                        END
                    ORDER BY ABS(SUM(e.MontantDebit) - SUM(e.MontantCredit)) DESC",
                    r => sb.AppendLine($"  - {r.GetString(0)} : {Convert.ToDouble(r.GetValue(1)):N0} TND"));

                sb.AppendLine("Top 5 Comptes GL :");
                await RunQueryList(conn, sb, @"
                    SELECT TOP 5 g.GLAccountNo, g.GLAccountName,
                           SUM(e.MontantDebit) AS Debit,
                           SUM(e.MontantCredit) AS Credit
                    FROM FACT_ECRITURE_COMPTABLE e
                    INNER JOIN DIM_COMPTE_GL g ON e.CompteKey = g.CompteKey
                    GROUP BY g.GLAccountNo, g.GLAccountName
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
                    FROM FACT_FRAIS_DOSSIER",
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

        // ─── Utilitaires ─────────────────────────────────────────────────────

        private AgentResponse HorsScope() => new()
        {
            Success = true,
            ActionType = "hors_scope",
            Message = "🚫 Je suis limité aux données **Tandem Logistics**.\n\nJe peux vous aider avec :\n- 📊 Analyse dashboards Power BI\n- ⚙️ Alimentation DWH"
        };

        private AgentResponse ListActions() => new()
        {
            Success = true,
            ActionType = "list",
            Message = "🤖 **Mes capacités :**\n\n⚙️ **ETL** : \"Lance les dimensions\" / \"Alimente les faits\" / \"Lance le master\"\n\n📊 **Analyse dashboard (RAG)** : \"Quel est le CA total ?\" / \"Top clients ?\" / \"Surestaries ?\""
        };

        private async Task<AgentResponse> ChatAsync(string message, List<AgentMessage> history, string dashboard)
        {
            var msgs = new List<object>
            {
                new { role = "system", content = $"Tu es un assistant BI pour Tandem Logistics (freight forwarding tunisien). Dashboard : {dashboard}. Réponds en français, concis. Refuse les questions hors logistique.\nTu n'as accès à AUCUNE donnée chiffrée réelle dans ce mode de conversation générale. Si la question porte sur un chiffre, un montant, un compte ou une statistique précise, ne réponds JAMAIS avec un nombre inventé : dis explicitement que tu as besoin de savoir quel dashboard analyser pour donner une réponse basée sur de vraies données.\nTu ne peux PAS effectuer de prédiction de marge ni de segmentation client via cette conversation (cette capacité a été retirée de l'agent). Si on te le demande, ne pose AUCUNE question de collecte de données et redirige simplement vers les modules dédiés « Prédiction IA » et « Segmentation Clients » de l'application.\n\n{AntiHallucinationRules}" }
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