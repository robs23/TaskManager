using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using TodoApi.Contracts;
using TodoApi.Controllers;
using TodoApi.Data;
using TodoApi.Models;

namespace TodoApi.Tests;

public class AuthControllerTests
{
    [Fact]
    public async Task Register_CreatesUserAndReturnsCreated()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var controller = new AuthController(context, CreateConfiguration());
        var request = new AuthController.RegisterRequest
        {
            Username = "  Alice  ",
            Password = "password123"
        };

        var result = await controller.Register(request);

        var created = Assert.IsType<CreatedResult>(result.Result);
        var response = Assert.IsType<AuthController.RegisterResponse>(created.Value);
        Assert.True(response.UserId > 0);

        var savedUser = await context.Users.SingleAsync();
        Assert.Equal(response.UserId, savedUser.Id);
        Assert.Equal("Alice", savedUser.Username);
        Assert.NotEqual("password123", savedUser.PasswordHash);
        Assert.StartsWith("$2", savedUser.PasswordHash, StringComparison.Ordinal);

        var settings = await context.UserSettings.SingleAsync();
        Assert.Equal(savedUser.Id, settings.UserId);
        Assert.Equal("en", settings.PreferredLanguage);
        Assert.False(settings.ShowCompletedOnStartup);
        Assert.Empty(settings.DefaultReminderOffsets);
    }

    [Fact]
    public async Task Register_ReturnsBadRequestWhenUsernameIsMissing()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var controller = new AuthController(context, CreateConfiguration());

        var result = await controller.Register(new AuthController.RegisterRequest
        {
            Username = " ",
            Password = "password123"
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("Username is required.", badRequest.Value);
    }

    [Fact]
    public async Task Register_ReturnsBadRequestWhenPasswordIsTooShort()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var controller = new AuthController(context, CreateConfiguration());

        var result = await controller.Register(new AuthController.RegisterRequest
        {
            Username = "alice",
            Password = "short"
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("Password must be at least 8 characters.", badRequest.Value);
    }

    [Fact]
    public async Task Register_ReturnsBadRequestWhenUsernameAlreadyExistsCaseInsensitive()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        context.Users.Add(new User
        {
            Username = "alice",
            PasswordHash = "existing-hash",
            CreatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var controller = new AuthController(context, CreateConfiguration());

        var result = await controller.Register(new AuthController.RegisterRequest
        {
            Username = "ALICE",
            Password = "password123"
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("Username already exists.", badRequest.Value);
        Assert.Equal(1, await context.Users.CountAsync());
    }

    [Fact]
    public async Task Login_ReturnsTokenAndUsernameWhenCredentialsAreValid()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var user = new User
        {
            Username = "alice",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("password123"),
            CreatedAt = DateTime.UtcNow
        };
        context.Users.Add(user);
        await context.SaveChangesAsync();

        context.UserSettings.Add(new UserSettings
        {
            UserId = user.Id,
            PreferredLanguage = "pl",
            ShowCompletedOnStartup = true,
            DefaultReminderOffsets = [30, 1440]
        });
        await context.SaveChangesAsync();

        var controller = new AuthController(context, CreateConfiguration());

        var result = await controller.Login(new AuthController.LoginRequest
        {
            Username = " ALICE ",
            Password = "password123"
        });

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var response = Assert.IsType<AuthController.LoginResponse>(ok.Value);
        Assert.Equal("alice", response.Username);
        Assert.False(string.IsNullOrWhiteSpace(response.Token));
        Assert.IsType<UserSettingsResponse>(response.Settings);
        Assert.Equal("pl", response.Settings.PreferredLanguage);
        Assert.True(response.Settings.ShowCompletedOnStartup);
        Assert.Equal(new[] { 30, 1440 }, response.Settings.DefaultReminderOffsets);

        var token = new JwtSecurityTokenHandler().ReadJwtToken(response.Token);
        Assert.Contains(token.Claims, c => c.Type == ClaimTypes.NameIdentifier && c.Value == user.Id.ToString());
        Assert.Contains(token.Claims, c => c.Type == ClaimTypes.Name && c.Value == "alice");
    }

    [Fact]
    public async Task Login_ReturnsUnauthorizedWhenUserDoesNotExist()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var controller = new AuthController(context, CreateConfiguration());

        var result = await controller.Login(new AuthController.LoginRequest
        {
            Username = "missing",
            Password = "password123"
        });

        var unauthorized = Assert.IsType<UnauthorizedObjectResult>(result.Result);
        Assert.Equal("Invalid username or password.", unauthorized.Value);
    }

    [Fact]
    public async Task Login_ReturnsUnauthorizedWhenPasswordIsInvalid()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        context.Users.Add(new User
        {
            Username = "alice",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("password123"),
            CreatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var controller = new AuthController(context, CreateConfiguration());

        var result = await controller.Login(new AuthController.LoginRequest
        {
            Username = "alice",
            Password = "wrongpass"
        });

        var unauthorized = Assert.IsType<UnauthorizedObjectResult>(result.Result);
        Assert.Equal("Invalid username or password.", unauthorized.Value);
    }

    private static TodoDbContext CreateContext(string databaseName)
    {
        var options = new DbContextOptionsBuilder<TodoDbContext>()
            .UseInMemoryDatabase(databaseName)
            .Options;

        return new TodoDbContext(options);
    }

    private static IConfiguration CreateConfiguration()
    {
        return new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = "super-secret-key-for-tests-only-32-bytes",
                ["Jwt:Issuer"] = "TodoApiTests"
            })
            .Build();
    }
}
