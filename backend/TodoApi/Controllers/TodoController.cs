using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Data;
using TodoApi.Models;

namespace TodoApi.Controllers;

[ApiController]
[Route("api/todos")]
public class TodoController : ControllerBase
{
    private readonly TodoDbContext _context;

    public TodoController(TodoDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<TodoResponse>>> GetTodos()
    {
        var todos = await _context.Todos.AsNoTracking()
            .Include(t => t.Children)
            .Include(t => t.Dependencies)
            .Include(t => t.Tags)
            .ToListAsync();
        var response = todos.Select(ToResponse).ToList();
        return Ok(response);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<TodoResponse>> GetTodo(int id)
    {
        var todo = await _context.Todos.AsNoTracking()
            .Include(t => t.Children)
            .Include(t => t.Dependencies)
            .Include(t => t.Tags)
            .FirstOrDefaultAsync(t => t.Id == id);
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
        public List<string> Tags { get; set; } = new();
    }

    public sealed class TodoDependencyResponse
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public bool IsCompleted { get; set; }
    }

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
        if (request is null || string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        var todo = new Todo
        {
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

    [HttpPut("{id:int}")]
    public async Task<ActionResult<TodoResponse>> UpdateTodo(int id, [FromBody] UpdateTodoRequest request)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        var todo = await _context.Todos
            .Include(t => t.Dependencies)
            .Include(t => t.Tags)
            .FirstOrDefaultAsync(t => t.Id == id);
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

            var parentExists = await _context.Todos.AnyAsync(t => t.Id == request.ParentId.Value);
            if (!parentExists)
            {
                return BadRequest("Parent todo does not exist.");
            }

            var createsCircularRelationship = await CreatesCircularParentRelationshipAsync(id, request.ParentId.Value);
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
        if (id == dependsOnId)
        {
            return BadRequest("A todo cannot depend on itself.");
        }

        var todo = await _context.Todos
            .Include(t => t.Dependencies)
            .FirstOrDefaultAsync(t => t.Id == id);
        if (todo is null)
        {
            return NotFound();
        }

        var dependsOnTodo = await _context.Todos
            .Include(t => t.Dependencies)
            .FirstOrDefaultAsync(t => t.Id == dependsOnId);
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
        var todo = await _context.Todos
            .Include(t => t.Dependencies)
            .FirstOrDefaultAsync(t => t.Id == id);
        if (todo is null)
        {
            return NotFound();
        }

        var dependsOnTodo = await _context.Todos.FirstOrDefaultAsync(t => t.Id == dependsOnId);
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

    [HttpPost("{id:int}/tags")]
    public async Task<ActionResult<TodoResponse>> AddTag(int id, [FromBody] AddTagRequest request)
    {
        var normalizedTagName = NormalizeTagName(request?.Name);
        if (normalizedTagName is null)
        {
            return BadRequest("Tag name is required.");
        }

        var todo = await _context.Todos
            .Include(t => t.Dependencies)
            .Include(t => t.Tags)
            .FirstOrDefaultAsync(t => t.Id == id);
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
        var normalizedTagName = NormalizeTagName(tagName);
        if (normalizedTagName is null)
        {
            return BadRequest("Tag name is required.");
        }

        var todo = await _context.Todos
            .Include(t => t.Dependencies)
            .Include(t => t.Tags)
            .FirstOrDefaultAsync(t => t.Id == id);
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
        var todo = await _context.Todos.FindAsync(id);
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
            Tags = todo.Tags
                .Select(tag => tag.Name)
                .OrderBy(tagName => tagName)
                .ToList()
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

    private async Task<bool> CreatesCircularParentRelationshipAsync(int todoId, int proposedParentId)
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
                .Where(t => t.Id == currentParentId.Value)
                .Select(t => t.ParentId)
                .SingleOrDefaultAsync();
        }

        return false;
    }
}
