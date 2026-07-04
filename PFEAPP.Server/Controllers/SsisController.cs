using Microsoft.AspNetCore.Mvc;
using PFEAPP.Server.Services;

namespace PFEAPP.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SsisController : ControllerBase
    {
        private readonly SsisService _ssisService;

        public SsisController(SsisService ssisService)
        {
            _ssisService = ssisService;
        }

        // GET api/ssis/tables — liste des dimensions et faits
        [HttpGet("tables")]
        public IActionResult GetTables()
        {
            var data = new
            {
                dimensions = new[]
                {
                    "DIM_ARTICLE",
                    "DIM_CLIENT",
                    "DIM_COMPTE_GL",
                    "DIM_FOURNISSEUR",
                    "DIM_NAVIRE",
                    "DIM_FRAIS",
                    "DIM_PORT",
                    "DIM_TYPE_MOUVEMENT"
                },
                faits = new[]
                {
                    "FACT_BOOKING",
                    "FACT_ECRITURE_COMPTABLE",
                    "FACT_FACTURE_ACHAT",
                    "FACT_FACTURE_VENTE",
                    "FACT_FRAIS_DOSSIER",
                    "FACT_LIGNE_DOSSIER"
                }
            };
            return Ok(data);
        }

        // POST api/ssis/run/dimensions
        [HttpPost("run/dimensions")]
        public async Task<IActionResult> RunDimensions()
        {
            var result = await _ssisService.ExecutePackageAsync("dimensions.dtsx");
            return result.Success ? Ok(result) : StatusCode(500, result);
        }

        // POST api/ssis/run/faits
        [HttpPost("run/faits")]
        public async Task<IActionResult> RunFaits()
        {
            var result = await _ssisService.ExecutePackageAsync("FactFinance.dtsx");
            return result.Success ? Ok(result) : StatusCode(500, result);
        }

        [HttpPost("run/master")]
        public async Task<IActionResult> RunMaster()
        {
            var result = await _ssisService.ExecuteMasterAsync();
            return result.Success ? Ok(result) : StatusCode(500, result);
        }
        [HttpGet("logs")]
        public IActionResult GetLogs()
        {
            var logs = _ssisService.GetLogs();
            return Ok(logs);
        }

        [HttpDelete("logs")]
        public IActionResult ClearLogs()
        {
            _ssisService.ClearLogs();
            return Ok(new { message = "Journal effacé." });
        }
    }
}
