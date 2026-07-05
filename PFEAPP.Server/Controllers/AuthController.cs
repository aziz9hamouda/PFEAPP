using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using PFEAPP.Server.Services;

namespace PFEAPP.Server.Controllers
{
    public class UserConfig
    {
        public string TandemEmail    { get; set; } = "";
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
        public bool     Success        { get; set; }
        public string   Message        { get; set; } = "";
        public string   TandemEmail    { get; set; } = "";
        public string   MicrosoftEmail { get; set; } = "";
        public string   DisplayName    { get; set; } = "";
        public string   Role           { get; set; } = "";
        public string   RoleCode       { get; set; } = "";
        public string?  Token          { get; set; }
        public DateTime? ExpiresAt     { get; set; }
    }

    public class ForgotPasswordRequest
    {
        public string Email { get; set; } = "";
    }

    public class ResetPasswordRequest
    {
        public string Token { get; set; } = "";
        public string NewPassword { get; set; } = "";
    }

    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IUserStore _userStore;
        private readonly DbUserStore _dbUserStore;
        private readonly SmtpEmailService _emailService;
        private readonly IConfiguration _configuration;

        public AuthController(IUserStore userStore, DbUserStore dbUserStore, SmtpEmailService emailService, IConfiguration configuration)
        {
            _userStore = userStore;
            _dbUserStore = dbUserStore;
            _emailService = emailService;
            _configuration = configuration;
        }

        // POST api/auth/login
        [HttpPost("login")]
        public IActionResult Login([FromBody] LoginRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
                return BadRequest(new LoginResponse { Success = false, Message = "Email et mot de passe obligatoires." });

            var user = _userStore.FindUser(request.Email, request.Password);

            if (user == null)
                return Unauthorized(new LoginResponse
                {
                    Success = false,
                    Message = "Email ou mot de passe incorrect."
                });

            var expiryMinutes = _configuration.GetValue<int?>("Jwt:ExpiryMinutes") ?? 480;
            var expiresAt = DateTime.UtcNow.AddMinutes(expiryMinutes);
            var token = GenerateToken(user, expiresAt);

            return Ok(new LoginResponse
            {
                Success        = true,
                Message        = "Connexion réussie.",
                TandemEmail    = user.TandemEmail,
                MicrosoftEmail = user.MicrosoftEmail,
                DisplayName    = user.DisplayName,
                Role           = user.Role,
                RoleCode       = user.RoleCode,
                Token          = token,
                ExpiresAt      = expiresAt
            });
        }

        // POST api/auth/forgot-password
        [HttpPost("forgot-password")]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
        {
            // Réponse générique dans tous les cas, pour ne pas révéler si l'email existe.
            var genericResponse = new { message = "Si cet email est associé à un compte, un lien de réinitialisation a été envoyé." };

            if (string.IsNullOrWhiteSpace(request.Email))
                return Ok(genericResponse);

            var user = _dbUserStore.FindByEmail(request.Email);
            if (user != null && user.IsActive)
            {
                var token = _dbUserStore.CreatePasswordResetToken(user.Id, TimeSpan.FromMinutes(30));
                var baseUrl = _configuration["Frontend:BaseUrl"] ?? "https://localhost:54323";
                var resetLink = $"{baseUrl}/reset-password?token={token}";
                await _emailService.SendPasswordResetEmailAsync(user.MicrosoftEmail, resetLink);
            }

            return Ok(genericResponse);
        }

        // POST api/auth/reset-password
        [HttpPost("reset-password")]
        public IActionResult ResetPassword([FromBody] ResetPasswordRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.NewPassword))
                return BadRequest(new { message = "Token et nouveau mot de passe obligatoires." });

            var userId = _dbUserStore.ValidateResetToken(request.Token);
            if (userId == null)
                return BadRequest(new { message = "Lien de réinitialisation invalide ou expiré." });

            var hash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            _dbUserStore.UpdatePasswordHash(userId.Value, hash);
            _dbUserStore.MarkResetTokenUsed(request.Token);

            return Ok(new { message = "Mot de passe réinitialisé avec succès." });
        }

        private string GenerateToken(UserConfig user, DateTime expiresAt)
        {
            var key = _configuration["Jwt:Key"] ?? "";
            var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
            var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(ClaimTypes.Name, user.DisplayName),
                new Claim(ClaimTypes.Email, user.TandemEmail),
                new Claim(ClaimTypes.Role, user.RoleCode),
                new Claim("role_label", user.Role),
            };

            var jwt = new JwtSecurityToken(
                issuer: _configuration["Jwt:Issuer"],
                audience: _configuration["Jwt:Audience"],
                claims: claims,
                expires: expiresAt,
                signingCredentials: credentials);

            return new JwtSecurityTokenHandler().WriteToken(jwt);
        }
    }
}
