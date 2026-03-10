using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TodoApi.Data;
using TodoApi.Models;

namespace TodoApi.Controllers;

[ApiController]
[Route("api/auth")]
[AllowAnonymous]
public class AuthController : ControllerBase
{
    private readonly TodoDbContext _context;
    private readonly IConfiguration _configuration;

    public AuthController(TodoDbContext context, IConfiguration configuration)
    {
        _context = context;
        _configuration = configuration;
    }

    public sealed class RegisterRequest
    {
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public sealed class RegisterResponse
    {
        public int UserId { get; set; }
    }

    public sealed class LoginRequest
    {
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public sealed class LoginResponse
    {
        public string Token { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
    }

    [HttpPost("register")]
    public async Task<ActionResult<RegisterResponse>> Register([FromBody] RegisterRequest request)
    {
        var normalizedUsername = NormalizeUsername(request?.Username);
        if (normalizedUsername is null)
        {
            return BadRequest("Username is required.");
        }

        var password = request?.Password;
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8)
        {
            return BadRequest("Password must be at least 8 characters.");
        }

        var normalizedUsernameLower = normalizedUsername.ToLowerInvariant();
        var usernameExists = await _context.Users
            .AnyAsync(user => user.Username.ToLower() == normalizedUsernameLower);
        if (usernameExists)
        {
            return BadRequest("Username already exists.");
        }

        var user = new User
        {
            Username = normalizedUsername,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
            CreatedAt = DateTime.UtcNow
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        return Created(string.Empty, new RegisterResponse { UserId = user.Id });
    }

    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request)
    {
        var normalizedUsername = NormalizeUsername(request?.Username);
        var password = request?.Password;
        if (normalizedUsername is null || string.IsNullOrWhiteSpace(password))
        {
            return Unauthorized("Invalid username or password.");
        }

        var normalizedUsernameLower = normalizedUsername.ToLowerInvariant();
        var user = await _context.Users
            .SingleOrDefaultAsync(u => u.Username.ToLower() == normalizedUsernameLower);

        if (user is null || !BCrypt.Net.BCrypt.Verify(password, user.PasswordHash))
        {
            return Unauthorized("Invalid username or password.");
        }

        var token = GenerateToken(user);
        return Ok(new LoginResponse
        {
            Token = token,
            Username = user.Username
        });
    }

    private static string? NormalizeUsername(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private string GenerateToken(User user)
    {
        var secret = _configuration["Jwt:Secret"]
            ?? throw new InvalidOperationException("JWT secret is not configured.");
        var issuer = _configuration["Jwt:Issuer"]
            ?? throw new InvalidOperationException("JWT issuer is not configured.");

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username)
        };

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: issuer,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(24),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
