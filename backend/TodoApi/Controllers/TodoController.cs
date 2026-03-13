using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using TodoApi.Data;
using TodoApi.Models;
using TodoApi.Services;

namespace TodoApi.Controllers;

[ApiController]
[Route("api/todos")]
[Authorize]
public class TodoController : ControllerBase
{
    private const long MaxAttachmentFileSizeBytes = 10 * 1024 * 1024;
    private static readonly HashSet<string> BlockedAttachmentExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".exe",
        ".dll",
        ".bat",
        ".sh"
    };

    private readonly TodoDbContext _context;
    private readonly IFileStorageService _fileStorageService;

    public TodoController(TodoDbContext context, IFileStorageService fileStorageService)
    {
        _context = context;
        _fileStorageService = fileStorageService;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<TodoResponse>>> GetTodos()
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var todos = await _context.Todos.AsNoTracking()
            .Where(t => t.UserId == userId)
            .Include(t => t.Children)
            .Include(t => t.Dependencies)
            .Include(t => t.RelatedTodos)
            .Include(t => t.RelatedByTodos)
            .Include(t => t.Tags)
            .Include(t => t.Attachments)
            .ToListAsync();
        var response = todos.Select(ToResponse).ToList();
        return Ok(response);
    }

    [HttpGet("search")]
    public async Task<IActionResult> SearchTodos([FromQuery] string? q)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var normalizedQuery = q?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedQuery) || normalizedQuery.Length < 2)
        {
            return Ok(Array.Empty<TodoSearchResult>());
        }

        var loweredQuery = normalizedQuery.ToLowerInvariant();
        var results = await _context.Todos.AsNoTracking()
            .Where(t => t.UserId == userId && t.Name.ToLower().Contains(loweredQuery))
            .OrderBy(t => t.Name)
            .Take(20)
            .Select(t => new TodoSearchResult(t.Id, t.Name))
            .ToListAsync();

        return Ok(results);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<TodoResponse>> GetTodo(int id)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var todo = await _context.Todos.AsNoTracking()
            .Include(t => t.Children)
            .Include(t => t.Dependencies)
            .Include(t => t.RelatedTodos)
            .Include(t => t.RelatedByTodos)
            .Include(t => t.Tags)
            .Include(t => t.Attachments)
            .FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        if (todo is null)
        {
            return NotFound();
        }

        return Ok(ToResponse(todo));
    }

    public sealed class TodoResponse
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public DateTime? Deadline { get; set; }
        public string? Notes { get; set; }
        public bool IsCompleted { get; set; }
        public DateTime CreatedAt { get; set; }
        public int? ParentId { get; set; }
        public bool Doable { get; set; }
        public List<TodoDependencyResponse> Dependencies { get; set; } = new();
        public List<TodoRelatedResponse> RelatedTodos { get; set; } = new();
        public List<string> Tags { get; set; } = new();
        public List<AttachmentResponse> Attachments { get; set; } = new();
    }

    public sealed class TodoDependencyResponse
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public bool IsCompleted { get; set; }
    }

    public sealed class TodoRelatedResponse
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public bool IsCompleted { get; set; }
    }

    public sealed class AttachmentResponse
    {
        public int Id { get; set; }
        public string FileName { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public DateTime UploadedAt { get; set; }
        public string ContentType { get; set; } = string.Empty;
    }

    public sealed class FileAttachmentResponse
    {
        public int Id { get; set; }
        public int TodoId { get; set; }
        public string FileName { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public DateTime UploadedAt { get; set; }
        public string ContentType { get; set; } = string.Empty;
    }

    public sealed record TodoSearchResult(int Id, string Name);

    public sealed class CreateTodoRequest
    {
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public DateTime? Deadline { get; set; }
        public string? Notes { get; set; }
        public int? ParentId { get; set; }
    }

    [HttpPost]
    public async Task<ActionResult<TodoResponse>> CreateTodo([FromBody] CreateTodoRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        if (request is null || string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        if (request.ParentId.HasValue)
        {
            var parentExists = await _context.Todos
                .AnyAsync(t => t.Id == request.ParentId.Value && t.UserId == userId);
            if (!parentExists)
            {
                return BadRequest("Parent todo does not exist.");
            }
        }

        var todo = new Todo
        {
            UserId = userId,
            Name = request.Name.Trim(),
            Description = NormalizeNullableText(request.Description),
            Deadline = request.Deadline,
            Notes = NormalizeNullableText(request.Notes),
            ParentId = request.ParentId,
            IsCompleted = false,
            CreatedAt = DateTime.UtcNow
        };

        _context.Todos.Add(todo);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetTodo), new { id = todo.Id }, ToResponse(todo));
    }

    public sealed class UpdateTodoRequest
    {
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public DateTime? Deadline { get; set; }
        public string? Notes { get; set; }
        public int? ParentId { get; set; }
        public bool IsCompleted { get; set; }
    }

    public sealed class AddTagRequest
    {
        public string Name { get; set; } = string.Empty;
    }

    [HttpPost("{todoId:int}/attachments")]
    public async Task<ActionResult<FileAttachmentResponse>> UploadAttachment(
        int todoId,
        [FromForm] IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var todoExists = await _context.Todos
            .AnyAsync(t => t.Id == todoId && t.UserId == userId, cancellationToken);
        if (!todoExists)
        {
            return NotFound();
        }

        if (file is null || file.Length <= 0)
        {
            return BadRequest("A file is required.");
        }

        if (file.Length > MaxAttachmentFileSizeBytes)
        {
            return BadRequest("File size must not exceed 10 MB.");
        }

        var extension = Path.GetExtension(file.FileName);
        if (!string.IsNullOrEmpty(extension) && BlockedAttachmentExtensions.Contains(extension))
        {
            return BadRequest("File type is not allowed.");
        }

        await using var fileStream = file.OpenReadStream();
        var relativePath = await _fileStorageService.UploadAsync(fileStream, file.FileName, cancellationToken);

        var attachment = new FileAttachment
        {
            TodoId = todoId,
            FileName = Path.GetFileName(file.FileName),
            StoragePath = relativePath,
            FileSize = file.Length,
            UploadedAt = DateTime.UtcNow,
            ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType
        };

        _context.FileAttachments.Add(attachment);
        await _context.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(nameof(GetTodo), new { id = todoId }, ToAttachmentResponse(attachment));
    }

    [HttpGet("{todoId:int}/attachments/{attachmentId:int}")]
    public async Task<IActionResult> DownloadAttachment(int todoId, int attachmentId, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var todoExists = await _context.Todos
            .AnyAsync(t => t.Id == todoId && t.UserId == userId, cancellationToken);
        if (!todoExists)
        {
            return NotFound();
        }

        var attachment = await _context.FileAttachments.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == attachmentId && a.TodoId == todoId, cancellationToken);
        if (attachment is null)
        {
            return NotFound();
        }

        var absolutePath = _fileStorageService.GetPath(attachment.StoragePath);
        if (!System.IO.File.Exists(absolutePath))
        {
            return NotFound();
        }

        var contentType = string.IsNullOrWhiteSpace(attachment.ContentType)
            ? "application/octet-stream"
            : attachment.ContentType;

        var stream = new FileStream(
            absolutePath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            bufferSize: 64 * 1024,
            options: FileOptions.Asynchronous | FileOptions.SequentialScan);

        return File(stream, contentType, attachment.FileName);
    }

    [HttpDelete("{todoId:int}/attachments/{attachmentId:int}")]
    public async Task<IActionResult> DeleteAttachment(int todoId, int attachmentId, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var todoExists = await _context.Todos
            .AnyAsync(t => t.Id == todoId && t.UserId == userId, cancellationToken);
        if (!todoExists)
        {
            return NotFound();
        }

        var attachment = await _context.FileAttachments
            .FirstOrDefaultAsync(a => a.Id == attachmentId && a.TodoId == todoId, cancellationToken);
        if (attachment is null)
        {
            return NotFound();
        }

        _fileStorageService.Delete(attachment.StoragePath);
        _context.FileAttachments.Remove(attachment);
        await _context.SaveChangesAsync(cancellationToken);

        return NoContent();
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<TodoResponse>> UpdateTodo(int id, [FromBody] UpdateTodoRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        if (request is null || string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        var todo = await _context.Todos
            .Include(t => t.Dependencies)
            .Include(t => t.Tags)
            .FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        if (todo is null)
        {
            return NotFound();
        }

        if (request.ParentId.HasValue)
        {
            if (request.ParentId.Value == id)
            {
                return BadRequest("A todo cannot be its own parent.");
            }

            var parentExists = await _context.Todos
                .AnyAsync(t => t.Id == request.ParentId.Value && t.UserId == userId);
            if (!parentExists)
            {
                return BadRequest("Parent todo does not exist.");
            }

            var createsCircularRelationship = await CreatesCircularParentRelationshipAsync(id, request.ParentId.Value, userId);
            if (createsCircularRelationship)
            {
                return BadRequest("Circular parent relationships are not allowed.");
            }
        }

        todo.Name = request.Name.Trim();
        todo.Description = NormalizeNullableText(request.Description);
        todo.Deadline = request.Deadline;
        todo.Notes = NormalizeNullableText(request.Notes);
        todo.ParentId = request.ParentId;
        todo.IsCompleted = request.IsCompleted;

        await _context.SaveChangesAsync();
        return Ok(ToResponse(todo));
    }

    [HttpPost("{id:int}/dependencies/{dependsOnId:int}")]
    public async Task<IActionResult> AddDependency(int id, int dependsOnId)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        if (id == dependsOnId)
        {
            return BadRequest("A todo cannot depend on itself.");
        }

        var todo = await _context.Todos
            .Include(t => t.Dependencies)
            .FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        if (todo is null)
        {
            return NotFound();
        }

        var dependsOnTodo = await _context.Todos
            .Include(t => t.Dependencies)
            .FirstOrDefaultAsync(t => t.Id == dependsOnId && t.UserId == userId);
        if (dependsOnTodo is null)
        {
            return NotFound();
        }

        if (dependsOnTodo.Dependencies.Any(dependency => dependency.Id == id))
        {
            return BadRequest("Circular dependencies are not allowed.");
        }

        if (!todo.Dependencies.Any(dependency => dependency.Id == dependsOnId))
        {
            todo.Dependencies.Add(dependsOnTodo);
            await _context.SaveChangesAsync();
        }

        return NoContent();
    }

    [HttpDelete("{id:int}/dependencies/{dependsOnId:int}")]
    public async Task<IActionResult> RemoveDependency(int id, int dependsOnId)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var todo = await _context.Todos
            .Include(t => t.Dependencies)
            .FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        if (todo is null)
        {
            return NotFound();
        }

        var dependsOnTodo = await _context.Todos
            .FirstOrDefaultAsync(t => t.Id == dependsOnId && t.UserId == userId);
        if (dependsOnTodo is null)
        {
            return NotFound();
        }

        if (todo.Dependencies.Remove(dependsOnTodo))
        {
            await _context.SaveChangesAsync();
        }

        return NoContent();
    }

    [HttpPost("{id:int}/related/{relatedId:int}")]
    public async Task<IActionResult> AddRelatedTodo(int id, int relatedId)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        if (id == relatedId)
        {
            return BadRequest("A todo cannot be related to itself.");
        }

        var todo = await _context.Todos
            .Include(t => t.RelatedTodos)
            .FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        if (todo is null)
        {
            return NotFound();
        }

        var relatedTodo = await _context.Todos
            .FirstOrDefaultAsync(t => t.Id == relatedId && t.UserId == userId);
        if (relatedTodo is null)
        {
            return NotFound();
        }

        if (!todo.RelatedTodos.Any(related => related.Id == relatedId))
        {
            todo.RelatedTodos.Add(relatedTodo);
            await _context.SaveChangesAsync();
        }

        return NoContent();
    }

    [HttpDelete("{id:int}/related/{relatedId:int}")]
    public async Task<IActionResult> RemoveRelatedTodo(int id, int relatedId)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var todo = await _context.Todos
            .Include(t => t.RelatedTodos)
            .FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        if (todo is null)
        {
            return NotFound();
        }

        var relatedTodo = await _context.Todos
            .Include(t => t.RelatedTodos)
            .FirstOrDefaultAsync(t => t.Id == relatedId && t.UserId == userId);
        if (relatedTodo is null)
        {
            return NotFound();
        }

        var changed = todo.RelatedTodos.Remove(relatedTodo);
        changed = relatedTodo.RelatedTodos.Remove(todo) || changed;
        if (changed)
        {
            await _context.SaveChangesAsync();
        }

        return NoContent();
    }

    [HttpPost("{id:int}/tags")]
    public async Task<ActionResult<TodoResponse>> AddTag(int id, [FromBody] AddTagRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var normalizedTagName = NormalizeTagName(request?.Name);
        if (normalizedTagName is null)
        {
            return BadRequest("Tag name is required.");
        }

        var todo = await _context.Todos
            .Include(t => t.Dependencies)
            .Include(t => t.Tags)
            .FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        if (todo is null)
        {
            return NotFound();
        }

        var tag = await _context.Tags.FirstOrDefaultAsync(t => t.Name == normalizedTagName);
        var createdTag = false;
        if (tag is null)
        {
            tag = new Tag { Name = normalizedTagName };
            _context.Tags.Add(tag);
            createdTag = true;
        }

        if (!todo.Tags.Any(existingTag => existingTag.Name == normalizedTagName))
        {
            todo.Tags.Add(tag);
        }

        await _context.SaveChangesAsync();
        var response = ToResponse(todo);
        if (createdTag)
        {
            return CreatedAtAction(nameof(GetTodo), new { id = todo.Id }, response);
        }

        return Ok(response);
    }

    [HttpDelete("{id:int}/tags/{tagName}")]
    public async Task<ActionResult<TodoResponse>> RemoveTag(int id, string tagName)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var normalizedTagName = NormalizeTagName(tagName);
        if (normalizedTagName is null)
        {
            return BadRequest("Tag name is required.");
        }

        var todo = await _context.Todos
            .Include(t => t.Dependencies)
            .Include(t => t.Tags)
            .FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        if (todo is null)
        {
            return NotFound();
        }

        var tag = todo.Tags.FirstOrDefault(existingTag => existingTag.Name == normalizedTagName);
        if (tag is null)
        {
            return NotFound();
        }

        todo.Tags.Remove(tag);
        await _context.SaveChangesAsync();

        return Ok(ToResponse(todo));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteTodo(int id)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var todo = await _context.Todos.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        if (todo is null)
        {
            return NotFound();
        }

        _context.Todos.Remove(todo);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    private static TodoResponse ToResponse(Todo todo)
    {
        return new TodoResponse
        {
            Id = todo.Id,
            Name = todo.Name,
            Description = todo.Description,
            Deadline = todo.Deadline,
            Notes = todo.Notes,
            IsCompleted = todo.IsCompleted,
            CreatedAt = todo.CreatedAt,
            ParentId = todo.ParentId,
            Doable = todo.Doable,
            Dependencies = todo.Dependencies
                .Select(dependency => new TodoDependencyResponse
                {
                    Id = dependency.Id,
                    Name = dependency.Name,
                    IsCompleted = dependency.IsCompleted
                })
                .ToList(),
            RelatedTodos = todo.RelatedTodos
                .Concat(todo.RelatedByTodos)
                .GroupBy(related => related.Id)
                .Select(group => group.First())
                .Select(related => new TodoRelatedResponse
                {
                    Id = related.Id,
                    Name = related.Name,
                    IsCompleted = related.IsCompleted
                })
                .OrderBy(related => related.Name)
                .ToList(),
            Tags = todo.Tags
                .Select(tag => tag.Name)
                .OrderBy(tagName => tagName)
                .ToList(),
            Attachments = todo.Attachments
                .Select(attachment => new AttachmentResponse
                {
                    Id = attachment.Id,
                    FileName = attachment.FileName,
                    FileSize = attachment.FileSize,
                    UploadedAt = attachment.UploadedAt,
                    ContentType = attachment.ContentType
                })
                .OrderBy(attachment => attachment.UploadedAt)
                .ToList()
        };
    }

    private static FileAttachmentResponse ToAttachmentResponse(FileAttachment attachment)
    {
        return new FileAttachmentResponse
        {
            Id = attachment.Id,
            TodoId = attachment.TodoId,
            FileName = attachment.FileName,
            FileSize = attachment.FileSize,
            UploadedAt = attachment.UploadedAt,
            ContentType = attachment.ContentType
        };
    }

    private static string? NormalizeNullableText(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static string? NormalizeTagName(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToLowerInvariant();
    }

    private bool TryGetCurrentUserId(out int userId)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(userIdClaim, out userId);
    }

    private async Task<bool> CreatesCircularParentRelationshipAsync(int todoId, int proposedParentId, int userId)
    {
        var visited = new HashSet<int>();
        int? currentParentId = proposedParentId;

        while (currentParentId.HasValue)
        {
            if (currentParentId.Value == todoId)
            {
                return true;
            }

            if (!visited.Add(currentParentId.Value))
            {
                return true;
            }

            currentParentId = await _context.Todos
                .Where(t => t.Id == currentParentId.Value && t.UserId == userId)
                .Select(t => t.ParentId)
                .SingleOrDefaultAsync();
        }

        return false;
    }
}

