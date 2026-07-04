using Microsoft.AspNetCore.Mvc;

namespace PFEAPP.Server.Controllers
{
    public class UserConfig
    {
        public string TandemEmail    { get; set; } = "";
        public string Password       { get; set; } = "";
        public string MicrosoftEmail { get; set; } = "";
        public string DisplayName    { get; set; } = "";
        public string Role           { get; set; } = "";
        public string RoleCode       { get; set; } = "";
    }

    public class LoginRequest
    {
        public string Email    { get; set; } = "";
        public string Password { get; set; } = "";
    }

    public class LoginResponse
    {
        public bool   Success        { get; set; }
        public string Message        { get; set; } = "";
        public string TandemEmail    { get; set; } = "";
        public string MicrosoftEmail { get; set; } = "";
        public string DisplayName    { get; set; } = "";
        public string Role           { get; set; } = "";
        public string RoleCode       { get; set; } = "";
    }

    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly List<UserConfig> _users;

        public AuthController(IConfiguration configuration)
        {
            _users = configuration.GetSection("Users").Get<List<UserConfig>>() ?? new();
        }

        // POST api/auth/login
        [HttpPost("login")]
        public IActionResult Login([FromBody] LoginRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
                return BadRequest(new LoginResponse { Success = false, Message = "Email et mot de passe obligatoires." });

            var user = _users.FirstOrDefault(u =>
                u.TandemEmail.Equals(request.Email.Trim(), StringComparison.OrdinalIgnoreCase) &&
                u.Password == request.Password);

            if (user == null)
                return Unauthorized(new LoginResponse
                {
                    Success = false,
                    Message = "Email ou mot de passe incorrect."
                });

            return Ok(new LoginResponse
            {
                Success        = true,
                Message        = "Connexion réussie.",
                TandemEmail    = user.TandemEmail,
                MicrosoftEmail = user.MicrosoftEmail,
                DisplayName    = user.DisplayName,
                Role           = user.Role,
                RoleCode       = user.RoleCode
            });
        }

        // GET api/auth/users — liste des utilisateurs (sans mot de passe)
        [HttpGet("users")]
        public IActionResult GetUsers()
        {
            var result = _users.Select(u => new
            {
                u.TandemEmail,
                u.MicrosoftEmail,
                u.DisplayName,
                u.Role,
                u.RoleCode
            });
            return Ok(result);
        }
    }
}
