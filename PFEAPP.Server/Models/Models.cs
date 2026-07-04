namespace PFEAPP.Server.Models
{
    // ─── SSIS Models ────────────────────────────────────────────────

    public class EtlResult
    {
        public bool Success { get; set; }
        public string Package { get; set; } = "";
        public string Message { get; set; } = "";
        public string Output { get; set; } = "";
        public string Error { get; set; } = "";
        public DateTime ExecutedAt { get; set; }
        public int DurationSeconds { get; set; }
    }

    // ─── ML Models ──────────────────────────────────────────────────

    public class PredictionRequest
    {
        public Dictionary<string, object> Features { get; set; } = new();
    }

    public class PredictionResult
    {
        public double PctMargePredite { get; set; }
        public string Interpretation { get; set; } = "";
        public DateTime PredictedAt { get; set; }
    }

    // ─── Power BI Models ────────────────────────────────────────────

    public class EmbedConfig
    {
        public string EmbedUrl { get; set; } = "";
        public string EmbedToken { get; set; } = "";
        public string ReportId { get; set; } = "";
    }
    public class ExecutionLog
    {
        public int Id { get; set; }
        public string Package { get; set; } = "";
        public string Type { get; set; } = ""; // "Dimensions", "Faits", "Master"
        public bool Success { get; set; }
        public string Message { get; set; } = "";
        public DateTime ExecutedAt { get; set; }
        public int DurationSeconds { get; set; }
    }
}
