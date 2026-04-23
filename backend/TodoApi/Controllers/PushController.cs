using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Data;
using TodoApi.Models;

namespace TodoApi.Controllers;

[ApiController]
[Route("api/push")]
public class PushController : ControllerBase
{
    private readonly TodoDbContext _context;
    private readonly IConfiguration _configuration;

    public PushController(TodoDbContext context, IConfiguration configuration)
    {
        _context = context;
        _configuration = configuration;
    }

    public sealed class SubscribeRequest
    {
        public string Endpoint { get; set; } = string.Empty;
        public string P256dh { get; set; } = string.Empty;
        public string Auth { get; set; } = string.Empty;
    }

    public sealed class UnsubscribeRequest
    {
        public string Endpoint { get; set; } = string.Empty;
    }

    [AllowAnonymous]
    [HttpGet("vapid-public-key")]
    public IActionResult GetVapidPublicKey()
    {
        var vapidSection = _configuration.GetSection("Vapid");
        var publicKey = vapidSection["PublicKey"];
        if (string.IsNullOrWhiteSpace(publicKey))
        {
            return NotFound();
        }

        return Content(publicKey, "text/plain");
    }

    [Authorize]
    [HttpPost("subscribe")]
    public async Task<IActionResult> Subscribe([FromBody] SubscribeRequest? request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        if (request is null
            || string.IsNullOrWhiteSpace(request.Endpoint)
            || string.IsNullOrWhiteSpace(request.P256dh)
            || string.IsNullOrWhiteSpace(request.Auth))
        {
            return BadRequest("Endpoint, p256dh, and auth are required.");
        }

        var normalizedEndpoint = request.Endpoint.Trim();
        var normalizedP256dh = request.P256dh.Trim();
        var normalizedAuth = request.Auth.Trim();

        var existingSubscription = await _context.PushSubscriptions
            .SingleOrDefaultAsync(ps => ps.UserId == userId && ps.Endpoint == normalizedEndpoint);

        if (existingSubscription is null)
        {
            _context.PushSubscriptions.Add(new PushSubscription
            {
                UserId = userId,
                Endpoint = normalizedEndpoint,
                P256dh = normalizedP256dh,
                Auth = normalizedAuth,
                CreatedAt = DateTime.UtcNow
            });
            await _context.SaveChangesAsync();
            return Created(string.Empty, null);
        }

        existingSubscription.P256dh = normalizedP256dh;
        existingSubscription.Auth = normalizedAuth;
        await _context.SaveChangesAsync();
        return Ok();
    }

    [Authorize]
    [HttpDelete("unsubscribe")]
    public async Task<IActionResult> Unsubscribe([FromBody] UnsubscribeRequest? request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        if (request is null || string.IsNullOrWhiteSpace(request.Endpoint))
        {
            return BadRequest("Endpoint is required.");
        }

        var normalizedEndpoint = request.Endpoint.Trim();

        var existingSubscription = await _context.PushSubscriptions
            .SingleOrDefaultAsync(ps => ps.UserId == userId && ps.Endpoint == normalizedEndpoint);
        if (existingSubscription is null)
        {
            return NotFound();
        }

        _context.PushSubscriptions.Remove(existingSubscription);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    private bool TryGetCurrentUserId(out int userId)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(userIdClaim, out userId);
    }
}
