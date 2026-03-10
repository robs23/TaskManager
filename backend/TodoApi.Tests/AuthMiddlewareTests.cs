using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace TodoApi.Tests;

public class AuthMiddlewareTests
{
    [Fact]
    public async Task GetTodos_WithoutToken_ReturnsUnauthorized()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"todoapi-auth-{Guid.NewGuid():N}.db");
        await using var factory = new TodoApiFactory(dbPath);
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });

        var response = await client.GetAsync("/api/todos");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetTodos_WithValidToken_ReturnsSuccess()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"todoapi-auth-{Guid.NewGuid():N}.db");
        await using var factory = new TodoApiFactory(dbPath);
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });

        var username = $"user-{Guid.NewGuid():N}";
        var registerResponse = await client.PostAsJsonAsync("/api/auth/register", new
        {
            username,
            password = "password123"
        });
        registerResponse.EnsureSuccessStatusCode();

        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username,
            password = "password123"
        });
        loginResponse.EnsureSuccessStatusCode();

        var loginPayload = await loginResponse.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.NotNull(loginPayload);
        Assert.False(string.IsNullOrWhiteSpace(loginPayload.Token));

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", loginPayload.Token);

        var todosResponse = await client.GetAsync("/api/todos");

        Assert.Equal(HttpStatusCode.OK, todosResponse.StatusCode);
    }

    private sealed class LoginResponse
    {
        public string Token { get; set; } = string.Empty;
    }

    private sealed class TodoApiFactory : WebApplicationFactory<Program>
    {
        private readonly string _dbPath;

        public TodoApiFactory(string dbPath)
        {
            _dbPath = dbPath;
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.UseSetting("ConnectionStrings:TodoDb", $"Data Source={_dbPath}");
            builder.UseSetting("Jwt:Secret", "test-secret-key-that-is-at-least-32-characters");
            builder.UseSetting("Jwt:Issuer", "TodoApi");
            builder.UseSetting("Jwt:Audience", "TodoApi");
        }

    }
}
