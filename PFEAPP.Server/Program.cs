using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using PFEAPP.Server.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddScoped<PFEAPP.Server.Services.SsisService>();
builder.Services.AddScoped<PFEAPP.Server.Services.MlService>();
builder.Services.AddHttpClient();
builder.Services.AddScoped<PFEAPP.Server.Services.AgentService>();
builder.Services.AddScoped<DbUserStore>();
builder.Services.AddScoped<IUserStore>(sp => sp.GetRequiredService<DbUserStore>());
builder.Services.AddScoped<SmtpEmailService>();
builder.Services.AddScoped<PredictionHistoryService>();

var jwtKey = builder.Configuration["Jwt:Key"] ?? "";
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"],
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddCors(options =>
{
    options.AddPolicy("ReactApp", policy =>
    {
        policy.WithOrigins("https://localhost:54323", "http://localhost:54323")
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    try
    {
        scope.ServiceProvider.GetRequiredService<DbUserStore>().EnsureSeeded();
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning(ex, "Impossible d'initialiser les comptes (PFEAPP_App) — exécutez Sql/init-app-db.sql via SSMS.");
    }
}

app.UseDefaultFiles();
app.MapStaticAssets();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("ReactApp");
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapFallbackToFile("/index.html");

app.Run();
