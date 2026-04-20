using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Contracts;
using TodoApi.Data;
using TodoApi.Models;

namespace TodoApi.Controllers;

[ApiController]
[Route("api/settings")]
[Authorize]
public class SettingsController : ControllerBase
{
    private readonly TodoDbContext _context;

    public SettingsController(TodoDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<UserSettingsResponse>> GetSettings()
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var settings = await GetOrCreateSettingsAsync(userId);
        return Ok(ToResponse(settings));
    }

    [HttpPut]
    public async Task<ActionResult<UserSettingsResponse>> UpdateSettings([FromBody] UpdateUserSettingsRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var settings = await GetOrCreateSettingsAsync(userId);
        settings.PreferredLanguage = NormalizeLanguage(request?.PreferredLanguage);
        settings.ShowCompletedOnStartup = request?.ShowCompletedOnStartup ?? false;
        settings.DefaultReminderOffsets = request?.DefaultReminderOffsets ?? [];

        await _context.SaveChangesAsync();
        return Ok(ToResponse(settings));
    }

    private async Task<UserSettings> GetOrCreateSettingsAsync(int userId)
    {
        var settings = await _context.UserSettings.SingleOrDefaultAsync(s => s.UserId == userId);
        if (settings is not null)
        {
            return settings;
        }

        settings = new UserSettings
        {
            UserId = userId,
            PreferredLanguage = "en",
            ShowCompletedOnStartup = false,
            DefaultReminderOffsets = []
        };

        _context.UserSettings.Add(settings);
        await _context.SaveChangesAsync();
        return settings;
    }

    private static UserSettingsResponse ToResponse(UserSettings settings)
    {
        return new UserSettingsResponse
        {
            PreferredLanguage = settings.PreferredLanguage,
            ShowCompletedOnStartup = settings.ShowCompletedOnStartup,
            DefaultReminderOffsets = settings.DefaultReminderOffsets
        };
    }

    private static string NormalizeLanguage(string? language)
    {
        return string.IsNullOrWhiteSpace(language) ? "en" : language.Trim().ToLowerInvariant();
    }

    private bool TryGetCurrentUserId(out int userId)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(userIdClaim, out userId);
    }
}
