using PFEAPP.Server.Controllers;

namespace PFEAPP.Server.Services
{
    // Abstraction du stockage des comptes utilisateurs. Implémentée par DbUserStore
    // (base PFEAPP_App) — permet de changer de stockage sans toucher AuthController
    // ni la logique d'autorisation.
    public interface IUserStore
    {
        UserConfig? FindUser(string email, string password);
    }
}
