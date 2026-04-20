using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Contracts;
using TodoApi.Controllers;
using TodoApi.Data;
using TodoApi.Models;

namespace TodoApi.Tests;

public class SettingsControllerTests
{
    private const int TestUserId = 1;

    [Fact]
    public async Task GetSettings_ReturnsOnlyCurrentUsersSettings()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        context.Users.AddRange(
            new User { Id = TestUserId, Username = "user1", PasswordHash = "hash" },
            new User { Id = 2, Username = "user2", PasswordHash = "hash" });
        context.UserSettings.AddRange(
            new UserSettings { UserId = TestUserId, PreferredLanguage = "pl", ShowCompletedOnStartup = true, DefaultReminderOffsets = [60, 1440] },
            new UserSettings { UserId = 2, PreferredLanguage = "en", ShowCompletedOnStartup = false, DefaultReminderOffsets = [15] });
        await context.SaveChangesAsync();

        var controller = CreateAuthenticatedController(context, TestUserId);

        var result = await controller.GetSettings();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var response = Assert.IsType<UserSettingsResponse>(ok.Value);
        Assert.Equal("pl", response.PreferredLanguage);
        Assert.True(response.ShowCompletedOnStartup);
        Assert.Equal(new[] { 60, 1440 }, response.DefaultReminderOffsets);
    }

    [Fact]
    public async Task UpdateSettings_UpdatesOnlyCurrentUsersSettings()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        context.Users.AddRange(
            new User { Id = TestUserId, Username = "user1", PasswordHash = "hash" },
            new User { Id = 2, Username = "user2", PasswordHash = "hash" });
        context.UserSettings.AddRange(
            new UserSettings { UserId = TestUserId, PreferredLanguage = "en", ShowCompletedOnStartup = false, DefaultReminderOffsets = [30] },
            new UserSettings { UserId = 2, PreferredLanguage = "pl", ShowCompletedOnStartup = true, DefaultReminderOffsets = [5, 10] });
        await context.SaveChangesAsync();

        var controller = CreateAuthenticatedController(context, TestUserId);

        var result = await controller.UpdateSettings(new UpdateUserSettingsRequest
        {
            PreferredLanguage = "  PL-PL  ",
            ShowCompletedOnStartup = true,
            DefaultReminderOffsets = [15, 60, 15, -10]
        });

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var response = Assert.IsType<UserSettingsResponse>(ok.Value);
        Assert.Equal("pl-pl", response.PreferredLanguage);
        Assert.True(response.ShowCompletedOnStartup);
        Assert.Equal(new[] { 15, 60 }, response.DefaultReminderOffsets);

        var mySettings = await context.UserSettings.SingleAsync(s => s.UserId == TestUserId);
        var otherSettings = await context.UserSettings.SingleAsync(s => s.UserId == 2);
        Assert.Equal("pl-pl", mySettings.PreferredLanguage);
        Assert.True(mySettings.ShowCompletedOnStartup);
        Assert.Equal(new[] { 15, 60 }, mySettings.DefaultReminderOffsets);
        Assert.Equal("pl", otherSettings.PreferredLanguage);
        Assert.True(otherSettings.ShowCompletedOnStartup);
        Assert.Equal(new[] { 5, 10 }, otherSettings.DefaultReminderOffsets);
    }

    [Fact]
    public async Task GetSettings_CreatesDefaultSettingsWhenMissing()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        context.Users.Add(new User { Id = TestUserId, Username = "user1", PasswordHash = "hash" });
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context, TestUserId);

        var result = await controller.GetSettings();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var response = Assert.IsType<UserSettingsResponse>(ok.Value);
        Assert.Equal("en", response.PreferredLanguage);
        Assert.False(response.ShowCompletedOnStartup);
        Assert.Empty(response.DefaultReminderOffsets);
        var persisted = await context.UserSettings.SingleAsync(s => s.UserId == TestUserId);
        Assert.Equal("en", persisted.PreferredLanguage);
        Assert.False(persisted.ShowCompletedOnStartup);
        Assert.Empty(persisted.DefaultReminderOffsets);
    }

    private static TodoDbContext CreateContext(string databaseName)
    {
        var options = new DbContextOptionsBuilder<TodoDbContext>()
            .UseInMemoryDatabase(databaseName)
            .Options;

        return new TodoDbContext(options);
    }

    private static SettingsController CreateAuthenticatedController(TodoDbContext context, int userId)
    {
        var controller = new SettingsController(context);
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
