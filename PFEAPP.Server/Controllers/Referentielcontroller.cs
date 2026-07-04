using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace PFEAPP.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ReferentielController : ControllerBase
    {
        private readonly string _connectionString;

        public ReferentielController(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DWH")
                ?? throw new InvalidOperationException("ConnectionString 'DWH' manquante.");
        }

        // GET api/referentiel/clients
        // Retourne la liste complète des clients avec GroupeComptable et CodePays
        [HttpGet("clients")]
        public async Task<IActionResult> GetClients()
        {
            const string query = @"
                SELECT 
                    ClientName,
                    CustomerPostingGroup,
                    CountryCode
                FROM dbo.DIM_CLIENT
                WHERE ClientName IS NOT NULL
                ORDER BY ClientName";

            var clients = new List<object>();

            await using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            await using var cmd = new SqlCommand(query, conn);
            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                clients.Add(new
                {
                    clientName = reader.IsDBNull(0) ? "" : reader.GetString(0),
                    customerPostingGroup = reader.IsDBNull(1) ? "" : reader.GetString(1),
                    countryCode = reader.IsDBNull(2) ? "" : reader.GetString(2),
                });
            }

            return Ok(clients);
        }

        // GET api/referentiel/ports
        // Retourne la liste complète des ports depuis DIM_PORT
        [HttpGet("ports")]
        public async Task<IActionResult> GetPorts()
        {
            const string query = @"
        SELECT 
            CodePort,
            NomPort
        FROM dbo.DIM_PORT
        WHERE CodePort IS NOT NULL
        ORDER BY CodePort";

            var ports = new List<object>();

            await using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            await using var cmd = new SqlCommand(query, conn);
            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                ports.Add(new
                {
                    portCode = reader.IsDBNull(0) ? "" : reader.GetString(0),
                    portName = reader.IsDBNull(1) ? "" : reader.GetString(1),
                });
            }

            return Ok(ports);
        }

        // GET api/referentiel/navires
        // Retourne la liste complète des navires depuis DIM_NAVIRE
        [HttpGet("navires")]
        public async Task<IActionResult> GetNavires()
        {
            const string query = @"
                SELECT 
                    DesignationNavire
                FROM dbo.DIM_NAVIRE
                WHERE DesignationNavire IS NOT NULL
                ORDER BY DesignationNavire";

            var navires = new List<string>();

            await using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            await using var cmd = new SqlCommand(query, conn);
            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                if (!reader.IsDBNull(0))
                    navires.Add(reader.GetString(0));
            }

            return Ok(navires);
        }
        // GET api/referentiel/rfm/{clientName}
        [HttpGet("rfm/{clientName}")]
        public async Task<IActionResult> GetClientRfm(string clientName)
        {
            const string query = @"
        WITH CTE_Factures AS (
            SELECT
                c.ClientName,
                COUNT(DISTINCT f.DocumentNo)                    AS Frequence,
                DATEDIFF(DAY, MAX(d.FullDate), GETDATE())       AS Recence,
                SUM(f.MontantHT)                                AS CA_Total
            FROM FACT_FACTURE_VENTE f
            INNER JOIN DIM_CLIENT c ON f.ClientKey = c.ClientKey
            INNER JOIN DIM_DATE   d ON f.DateKey   = d.DateKey
            WHERE f.MontantHT > 0
              AND c.ClientName = @ClientName
            GROUP BY c.ClientName
        ),
        CTE_Marge AS (
            SELECT
                c.ClientName,
                AVG(fd.PctMarge) AS Marge_Moyenne
            FROM FACT_FRAIS_DOSSIER fd
            INNER JOIN DIM_CLIENT c ON fd.ClientKey = c.ClientKey
            WHERE fd.MontantAchatTotal > 0
              AND fd.PctMarge < 200
              AND fd.PctMarge > -50
              AND c.ClientName = @ClientName
            GROUP BY c.ClientName
        )
        SELECT
            ISNULL(f.Frequence,     0)  AS Frequence,
            ISNULL(f.Recence,     365)  AS Recence,
            ISNULL(f.CA_Total,      0)  AS CA_Total,
            ISNULL(m.Marge_Moyenne, 0)  AS Marge_Moyenne,
            CASE WHEN f.ClientName IS NOT NULL 
                 THEN 1 ELSE 0 END      AS IsExisting
        FROM CTE_Factures f
        LEFT JOIN CTE_Marge m ON f.ClientName = m.ClientName";

            await using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            await using var cmd = new SqlCommand(query, conn);
            cmd.Parameters.AddWithValue("@ClientName", clientName);
            await using var reader = await cmd.ExecuteReaderAsync();

            if (!await reader.ReadAsync())
                return Ok(new { frequence = 0, recence = 365, ca_Total = 0, marge_Moyenne = 0, isExisting = false });

            return Ok(new
            {
                frequence = reader.IsDBNull(0) ? 0.0 : Convert.ToDouble(reader.GetValue(0)),
                recence = reader.IsDBNull(1) ? 365.0 : Convert.ToDouble(reader.GetValue(1)),
                ca_Total = reader.IsDBNull(2) ? 0.0 : Convert.ToDouble(reader.GetValue(2)),
                marge_Moyenne = reader.IsDBNull(3) ? 0.0 : Convert.ToDouble(reader.GetValue(3)),
                isExisting = Convert.ToInt32(reader.GetValue(4)) == 1
            });
        }
    }
}
