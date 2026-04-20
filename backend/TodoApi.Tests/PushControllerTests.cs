using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using TodoApi.Controllers;
using TodoApi.Data;
using TodoApi.Models;

namespace TodoApi.Tests;

public class PushControllerTests
{
    private const int TestUserId = 1;

    [Fact]
    public void GetVapidPublicKey_ReturnsConfiguredValue()
    {
        using var context = CreateContext(Guid.NewGuid().ToString());
        var controller = new PushController(context, CreateConfiguration());

        var result = controller.GetVapidPublicKey();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal("PUBLIC_KEY_TEST_VALUE", ok.Value);
    }

    [Fact]
    public async Task Subscribe_CreatesNewSubscriptionAndReturnsCreated()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        context.Users.Add(new User { Id = TestUserId, Username = "user1", PasswordHash = "hash" });
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context, TestUserId);

        var result = await controller.Subscribe(new PushController.SubscribeRequest
        {
            Endpoint = "https://example.com/endpoint-1",
            P256dh = "p256dh-value",
            Auth = "auth-value"
        });

        Assert.IsType<CreatedResult>(result);
        var saved = await context.PushSubscriptions.SingleAsync();
        Assert.Equal(TestUserId, saved.UserId);
        Assert.Equal("https://example.com/endpoint-1", saved.Endpoint);
        Assert.Equal("p256dh-value", saved.P256dh);
        Assert.Equal("auth-value", saved.Auth);
    }

    [Fact]
    public async Task Subscribe_UpdatesExistingSubscriptionAndReturnsOk()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        context.Users.Add(new User { Id = TestUserId, Username = "user1", PasswordHash = "hash" });
        context.PushSubscriptions.Add(new PushSubscription
        {
            UserId = TestUserId,
            Endpoint = "https://example.com/endpoint-1",
            P256dh = "old-p256dh",
            Auth = "old-auth",
            CreatedAt = DateTime.UtcNow.AddMinutes(-10)
        });
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context, TestUserId);

        var result = await controller.Subscribe(new PushController.SubscribeRequest
        {
            Endpoint = "https://example.com/endpoint-1",
            P256dh = "new-p256dh",
            Auth = "new-auth"
        });

        Assert.IsType<OkResult>(result);
        Assert.Single(context.PushSubscriptions);
        var updated = await context.PushSubscriptions.SingleAsync();
        Assert.Equal("new-p256dh", updated.P256dh);
        Assert.Equal("new-auth", updated.Auth);
    }

    [Fact]
    public async Task Unsubscribe_RemovesExistingSubscriptionAndReturnsNoContent()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        context.Users.AddRange(
            new User { Id = TestUserId, Username = "user1", PasswordHash = "hash" },
            new User { Id = 2, Username = "user2", PasswordHash = "hash" });
        context.PushSubscriptions.AddRange(
            new PushSubscription
            {
                UserId = TestUserId,
                Endpoint = "https://example.com/endpoint-1",
                P256dh = "mine",
                Auth = "mine-auth",
                CreatedAt = DateTime.UtcNow
            },
            new PushSubscription
            {
                UserId = 2,
                Endpoint = "https://example.com/endpoint-2",
                P256dh = "other",
                Auth = "other-auth",
                CreatedAt = DateTime.UtcNow
            });
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context, TestUserId);

        var result = await controller.Unsubscribe(new PushController.UnsubscribeRequest
        {
            Endpoint = "https://example.com/endpoint-1"
        });

        Assert.IsType<NoContentResult>(result);
        Assert.Single(context.PushSubscriptions);
        Assert.Equal(2, (await context.PushSubscriptions.SingleAsync()).UserId);
    }

    [Fact]
    public async Task Unsubscribe_ReturnsNotFoundWhenSubscriptionDoesNotExist()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        context.Users.Add(new User { Id = TestUserId, Username = "user1", PasswordHash = "hash" });
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context, TestUserId);

        var result = await controller.Unsubscribe(new PushController.UnsubscribeRequest
        {
            Endpoint = "https://example.com/missing"
        });

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Unsubscribe_ReturnsNotFoundWhenSubscriptionBelongsToDifferentUser()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        context.Users.AddRange(
            new User { Id = TestUserId, Username = "user1", PasswordHash = "hash" },
            new User { Id = 2, Username = "user2", PasswordHash = "hash" });
        context.PushSubscriptions.Add(new PushSubscription
        {
            UserId = 2,
            Endpoint = "https://example.com/endpoint-shared",
            P256dh = "other",
            Auth = "other-auth",
            CreatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context, TestUserId);

        var result = await controller.Unsubscribe(new PushController.UnsubscribeRequest
        {
            Endpoint = "https://example.com/endpoint-shared"
        });

        Assert.IsType<NotFoundResult>(result);
        Assert.Single(context.PushSubscriptions);
        Assert.Equal(2, (await context.PushSubscriptions.SingleAsync()).UserId);
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
                ["Vapid:Subject"] = "mailto:test@example.com",
                ["Vapid:PublicKey"] = "PUBLIC_KEY_TEST_VALUE",
                ["Vapid:PrivateKey"] = "PRIVATE_KEY_TEST_VALUE"
            })
            .Build();
    }

    private static PushController CreateAuthenticatedController(TodoDbContext context, int userId)
    {
        var controller = new PushController(context, CreateConfiguration());
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                    new[] { new Claim(ClaimTypes.NameIdentifier, userId.ToString()) },
                    authenticationType: "TestAuth"))
            }
        };

        return controller;
    }
}
