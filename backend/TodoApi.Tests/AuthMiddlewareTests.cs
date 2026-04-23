using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
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

    [Fact]
    public async Task TodoAndReminderResponses_SerializeUtcDateTimesWithZSuffix()
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
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", loginPayload.Token);

        var deadlineUtc = new DateTime(2030, 1, 1, 6, 0, 0, DateTimeKind.Utc);
        var createTodoResponse = await client.PostAsJsonAsync("/api/todos", new
        {
            name = "UTC test todo",
            deadline = deadlineUtc
        });
        createTodoResponse.EnsureSuccessStatusCode();

        var todoJson = await createTodoResponse.Content.ReadAsStringAsync();
        Assert.Contains("\"deadline\":\"2030-01-01T06:00:00Z\"", todoJson);

        using var todoDoc = JsonDocument.Parse(todoJson);
        var todoId = todoDoc.RootElement.GetProperty("id").GetInt32();

        var reminderUtc = new DateTime(2030, 1, 1, 7, 0, 0, DateTimeKind.Utc);
        var createReminderResponse = await client.PostAsJsonAsync($"/api/todos/{todoId}/reminders", new
        {
            type = 1,
            offsetMinutes = (int?)null,
            reminderDateTimeUtc = reminderUtc
        });
        createReminderResponse.EnsureSuccessStatusCode();

        var createReminderJson = await createReminderResponse.Content.ReadAsStringAsync();
        Assert.Contains("\"reminderDateTimeUtc\":\"2030-01-01T07:00:00Z\"", createReminderJson);

        var remindersResponse = await client.GetAsync($"/api/todos/{todoId}/reminders");
        remindersResponse.EnsureSuccessStatusCode();
        var remindersJson = await remindersResponse.Content.ReadAsStringAsync();
        Assert.Contains("\"reminderDateTimeUtc\":\"2030-01-01T07:00:00Z\"", remindersJson);
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
