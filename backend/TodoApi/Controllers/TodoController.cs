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
    public async Task<ActionResult<IEnumerable<Todo>>> GetTodos()
    {
        var todos = await _context.Todos.AsNoTracking().ToListAsync();
        return Ok(todos);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<Todo>> GetTodo(int id)
    {
        var todo = await _context.Todos.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id);
        if (todo is null)
        {
            return NotFound();
        }

        return Ok(todo);
    }

    public sealed class CreateTodoRequest
    {
        public string Title { get; set; } = string.Empty;
    }

    [HttpPost]
    public async Task<ActionResult<Todo>> CreateTodo([FromBody] CreateTodoRequest request)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Title))
        {
            return BadRequest("Title is required.");
        }

        var todo = new Todo
        {
            Title = request.Title.Trim(),
            IsCompleted = false,
            CreatedAt = DateTime.UtcNow
        };

        _context.Todos.Add(todo);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetTodo), new { id = todo.Id }, todo);
    }

    public sealed class UpdateTodoRequest
    {
        public string Title { get; set; } = string.Empty;
        public bool IsCompleted { get; set; }
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> UpdateTodo(int id, [FromBody] UpdateTodoRequest request)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Title))
        {
            return BadRequest("Title is required.");
        }

        var todo = await _context.Todos.FindAsync(id);
        if (todo is null)
        {
            return NotFound();
        }

        todo.Title = request.Title.Trim();
        todo.IsCompleted = request.IsCompleted;

        await _context.SaveChangesAsync();
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
}
