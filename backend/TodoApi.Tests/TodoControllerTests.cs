using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Controllers;
using TodoApi.Data;
using TodoApi.Models;

namespace TodoApi.Tests;

public class TodoControllerTests
{
    [Fact]
    public async Task GetTodos_ReturnsAllTodos()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        context.Todos.AddRange(
            new Todo { Title = "First", CreatedAt = DateTime.UtcNow },
            new Todo { Title = "Second", CreatedAt = DateTime.UtcNow });
        await context.SaveChangesAsync();

        var controller = new TodoController(context);

        var result = await controller.GetTodos();

        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var todos = Assert.IsAssignableFrom<IEnumerable<Todo>>(okResult.Value);
        Assert.Equal(2, todos.Count());
    }

    [Fact]
    public async Task GetTodo_ReturnsTodoWhenFound()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { Title = "Find me", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();

        var controller = new TodoController(context);

        var result = await controller.GetTodo(todo.Id);

        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var fetched = Assert.IsType<Todo>(okResult.Value);
        Assert.Equal(todo.Id, fetched.Id);
        Assert.Equal(todo.Title, fetched.Title);
    }

    [Fact]
    public async Task GetTodo_ReturnsNotFoundWhenMissing()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var controller = new TodoController(context);

        var result = await controller.GetTodo(999);

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task CreateTodo_CreatesTodo()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var controller = new TodoController(context);
        var request = new TodoController.CreateTodoRequest { Title = "New item" };

        var result = await controller.CreateTodo(request);

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var todo = Assert.IsType<Todo>(created.Value);
        Assert.Equal("New item", todo.Title);
        Assert.False(todo.IsCompleted);

        var saved = await context.Todos.FindAsync(todo.Id);
        Assert.NotNull(saved);
    }

    [Fact]
    public async Task UpdateTodo_UpdatesTodo()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { Title = "Old", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();

        var controller = new TodoController(context);
        var request = new TodoController.UpdateTodoRequest
        {
            Title = "Updated",
            IsCompleted = true
        };

        var result = await controller.UpdateTodo(todo.Id, request);

        Assert.IsType<NoContentResult>(result);

        var updated = await context.Todos.FindAsync(todo.Id);
        Assert.NotNull(updated);
        Assert.Equal("Updated", updated!.Title);
        Assert.True(updated.IsCompleted);
    }

    [Fact]
    public async Task UpdateTodo_ReturnsNotFoundWhenMissing()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var controller = new TodoController(context);
        var request = new TodoController.UpdateTodoRequest
        {
            Title = "Updated",
            IsCompleted = true
        };

        var result = await controller.UpdateTodo(999, request);

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task DeleteTodo_RemovesTodo()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { Title = "Delete", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();

        var controller = new TodoController(context);

        var result = await controller.DeleteTodo(todo.Id);

        Assert.IsType<NoContentResult>(result);
        Assert.Empty(context.Todos);
    }

    [Fact]
    public async Task DeleteTodo_ReturnsNotFoundWhenMissing()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var controller = new TodoController(context);

        var result = await controller.DeleteTodo(999);

        Assert.IsType<NotFoundResult>(result);
    }

    private static TodoDbContext CreateContext(string databaseName)
    {
        var options = new DbContextOptionsBuilder<TodoDbContext>()
            .UseInMemoryDatabase(databaseName)
            .Options;

        return new TodoDbContext(options);
    }
}
