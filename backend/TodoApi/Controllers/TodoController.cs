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

    [HttpPut("{id:int}")]
    public async Task<IActionResult> UpdateTodo(int id, [FromBody] UpdateTodoRequest request)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        var todo = await _context.Todos.FindAsync(id);
        if (todo is null)
        {
            return NotFound();
        }

        todo.Name = request.Name.Trim();
        todo.Description = NormalizeNullableText(request.Description);
        todo.Deadline = request.Deadline;
        todo.Notes = NormalizeNullableText(request.Notes);
        todo.ParentId = request.ParentId;
        todo.IsCompleted = request.IsCompleted;

        await _context.SaveChangesAsync();
        return NoContent();
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
                .ToList()
        };
    }

    private static string? NormalizeNullableText(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
