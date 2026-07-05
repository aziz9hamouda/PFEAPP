using System.Net;
using System.Net.Mail;

namespace PFEAPP.Server.Services
{
    // Envoi d'emails via SMTP classique (System.Net.Mail, aucun package supplémentaire).
    // Les identifiants réels (Smtp:Host/User/Password) sont à fournir par l'utilisateur —
    // laissés vides par défaut, une erreur SMTP est journalisée mais ne fait jamais planter l'appelant.
    public class SmtpEmailService
    {
        private readonly IConfiguration _configuration;
        private readonly ILogger<SmtpEmailService> _logger;

        public SmtpEmailService(IConfiguration configuration, ILogger<SmtpEmailService> logger)
        {
            _configuration = configuration;
            _logger = logger;
        }

        public async Task SendPasswordResetEmailAsync(string toEmail, string resetLink)
        {
            var host = _configuration["Smtp:Host"];
            if (string.IsNullOrWhiteSpace(host))
            {
                _logger.LogWarning("Smtp:Host non configuré — email de réinitialisation non envoyé (lien : {Link}).", resetLink);
                return;
            }

            try
            {
                using var client = new SmtpClient(host, _configuration.GetValue<int>("Smtp:Port", 587))
                {
                    Credentials = new NetworkCredential(_configuration["Smtp:User"], _configuration["Smtp:Password"]),
                    EnableSsl = _configuration.GetValue<bool>("Smtp:EnableSsl", true),
                };

                var encodedLink = WebUtility.HtmlEncode(resetLink);
                using var message = new MailMessage
                {
                    From = new MailAddress(_configuration["Smtp:FromAddress"] ?? _configuration["Smtp:User"] ?? "no-reply@tandem.tn"),
                    Subject = "Tandem Logistics — Réinitialisation de mot de passe",
                    Body = $@"<p>Bonjour,</p>
<p>Une réinitialisation de mot de passe a été demandée pour votre compte.</p>
<p><a href=""{encodedLink}"">Cliquez ici pour réinitialiser votre mot de passe</a> (lien valable 30 minutes).</p>
<p>Si le lien ci-dessus ne fonctionne pas, copiez-collez cette adresse dans votre navigateur :<br>{encodedLink}</p>
<p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>",
                    IsBodyHtml = true,
                };
                message.To.Add(toEmail);

                await client.SendMailAsync(message);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Échec de l'envoi de l'email de réinitialisation à {Email}.", toEmail);
            }
        }
    }
}
