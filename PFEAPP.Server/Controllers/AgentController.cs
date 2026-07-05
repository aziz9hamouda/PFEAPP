using Microsoft.AspNetCore.Mvc;
using PFEAPP.Server.Services;

namespace PFEAPP.Server.Controllers
{
    public class ChatRequest
    {
        public string Message { get; set; } = "";
        public string ActiveDashboard { get; set; } = "";
        public List<AgentMessage> History { get; set; } = new();
    }

    [ApiController]
    [Route("api/[controller]")]
    public class AgentController : ControllerBase
    {
        private readonly AgentService _agentService;

        public AgentController(AgentService agentService)
        {
            _agentService = agentService;
        }

        [HttpPost("chat")]
        public async Task<IActionResult> Chat([FromBody] ChatRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Message))
                return BadRequest(new { message = "Message vide." });

            try
            {
                var response = await _agentService.ProcessMessageAsync(
                    request.Message,
                    request.History,
                    request.ActiveDashboard
                );
                return Ok(response);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Erreur agent : {ex.Message}" });
            }
        }
    }
}