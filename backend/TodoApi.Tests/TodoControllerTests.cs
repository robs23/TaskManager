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
            new Todo { Name = "First", CreatedAt = DateTime.UtcNow },
            new Todo { Name = "Second", CreatedAt = DateTime.UtcNow });
        await context.SaveChangesAsync();

        var controller = new TodoController(context);

        var result = await controller.GetTodos();

        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var todos = Assert.IsAssignableFrom<IEnumerable<TodoController.TodoResponse>>(okResult.Value);
        Assert.Equal(2, todos.Count());
    }

    [Fact]
    public async Task GetTodo_ReturnsTodoWhenFound()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { Name = "Find me", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();

        var controller = new TodoController(context);

        var result = await controller.GetTodo(todo.Id);

        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var fetched = Assert.IsType<TodoController.TodoResponse>(okResult.Value);
        Assert.Equal(todo.Id, fetched.Id);
        Assert.Equal(todo.Name, fetched.Name);
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
    public async Task CreateTodo_CreatesTodoWithExtendedProperties()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var parent = new Todo { Name = "Parent", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(parent);
        await context.SaveChangesAsync();
        var controller = new TodoController(context);
        var deadline = new DateTime(2030, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var request = new TodoController.CreateTodoRequest
        {
            Name = "New item",
            Description = "Description",
            Deadline = deadline,
            Notes = "Notes",
            ParentId = parent.Id
        };

        var result = await controller.CreateTodo(request);

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var todo = Assert.IsType<TodoController.TodoResponse>(created.Value);
        Assert.Equal("New item", todo.Name);
        Assert.Equal("Description", todo.Description);
        Assert.Equal(deadline, todo.Deadline);
        Assert.Equal("Notes", todo.Notes);
        Assert.Equal(parent.Id, todo.ParentId);
        Assert.True(todo.Doable);
        Assert.False(todo.IsCompleted);

        var saved = await context.Todos.FindAsync(todo.Id);
        Assert.NotNull(saved);
        var parentWithChildren = await context.Todos
            .Include(t => t.Children)
            .FirstAsync(t => t.Id == parent.Id);
        Assert.Contains(parentWithChildren.Children, child => child.Id == todo.Id);
    }

    [Fact]
    public async Task UpdateTodo_UpdatesTodoWithExtendedProperties()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var originalParent = new Todo { Name = "Original parent", CreatedAt = DateTime.UtcNow };
        var newParent = new Todo { Name = "New parent", CreatedAt = DateTime.UtcNow };
        var todo = new Todo
        {
            Name = "Old",
            Description = "Old description",
            Deadline = new DateTime(2029, 12, 31, 0, 0, 0, DateTimeKind.Utc),
            Notes = "Old notes",
            Parent = originalParent,
            CreatedAt = DateTime.UtcNow
        };
        context.Todos.AddRange(originalParent, newParent, todo);
        await context.SaveChangesAsync();

        var controller = new TodoController(context);
        var newDeadline = new DateTime(2031, 5, 10, 0, 0, 0, DateTimeKind.Utc);
        var request = new TodoController.UpdateTodoRequest
        {
            Name = "Updated",
            Description = "Updated description",
            Deadline = newDeadline,
            Notes = "Updated notes",
            ParentId = newParent.Id,
            IsCompleted = true
        };

        var result = await controller.UpdateTodo(todo.Id, request);

        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var response = Assert.IsType<TodoController.TodoResponse>(okResult.Value);
        Assert.Equal(newParent.Id, response.ParentId);

        var updated = await context.Todos.FindAsync(todo.Id);
        Assert.NotNull(updated);
        Assert.Equal("Updated", updated!.Name);
        Assert.Equal("Updated description", updated.Description);
        Assert.Equal(newDeadline, updated.Deadline);
        Assert.Equal("Updated notes", updated.Notes);
        Assert.Equal(newParent.Id, updated.ParentId);
        Assert.True(updated.IsCompleted);
    }

    [Fact]
    public async Task UpdateTodo_AllowsClearingParentBySettingNullParentId()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var parent = new Todo { Name = "Parent", CreatedAt = DateTime.UtcNow };
        var todo = new Todo
        {
            Name = "Child",
            Parent = parent,
            CreatedAt = DateTime.UtcNow
        };
        context.Todos.AddRange(parent, todo);
        await context.SaveChangesAsync();
        var controller = new TodoController(context);
        var request = new TodoController.UpdateTodoRequest
        {
            Name = "Child updated",
            ParentId = null,
            IsCompleted = false
        };

        var result = await controller.UpdateTodo(todo.Id, request);

        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var response = Assert.IsType<TodoController.TodoResponse>(okResult.Value);
        Assert.Null(response.ParentId);

        var updated = await context.Todos.FindAsync(todo.Id);
        Assert.NotNull(updated);
        Assert.Null(updated!.ParentId);
    }

    [Fact]
    public async Task UpdateTodo_ReturnsBadRequestWhenParentTodoDoesNotExist()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { Name = "Todo", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();
        var controller = new TodoController(context);
        var request = new TodoController.UpdateTodoRequest
        {
            Name = "Updated",
            ParentId = 99999,
            IsCompleted = false
        };

        var result = await controller.UpdateTodo(todo.Id, request);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("Parent todo does not exist.", badRequest.Value);

        var unchanged = await context.Todos.FindAsync(todo.Id);
        Assert.NotNull(unchanged);
        Assert.Null(unchanged!.ParentId);
    }

    [Fact]
    public async Task UpdateTodo_ReturnsBadRequestWhenParentIsDescendant()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var root = new Todo { Name = "Root", CreatedAt = DateTime.UtcNow };
        var child = new Todo { Name = "Child", Parent = root, CreatedAt = DateTime.UtcNow };
        var grandchild = new Todo { Name = "Grandchild", Parent = child, CreatedAt = DateTime.UtcNow };
        context.Todos.AddRange(root, child, grandchild);
        await context.SaveChangesAsync();
        var controller = new TodoController(context);
        var request = new TodoController.UpdateTodoRequest
        {
            Name = "Root",
            ParentId = grandchild.Id,
            IsCompleted = false
        };

        var result = await controller.UpdateTodo(root.Id, request);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("Circular parent relationships are not allowed.", badRequest.Value);

        var unchanged = await context.Todos.FindAsync(root.Id);
        Assert.NotNull(unchanged);
        Assert.Null(unchanged!.ParentId);
    }

    [Fact]
    public async Task UpdateTodo_ReturnsNotFoundWhenMissing()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var controller = new TodoController(context);
        var request = new TodoController.UpdateTodoRequest
        {
            Name = "Updated",
            IsCompleted = true
        };

        var result = await controller.UpdateTodo(999, request);

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task GetTodo_ReturnsDoableBasedOnDependencies()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var dependency = new Todo { Name = "Dependency", IsCompleted = false, CreatedAt = DateTime.UtcNow };
        var todo = new Todo { Name = "Main", CreatedAt = DateTime.UtcNow };
        context.Todos.AddRange(dependency, todo);
        await context.SaveChangesAsync();
        todo.Dependencies.Add(dependency);
        await context.SaveChangesAsync();

        var controller = new TodoController(context);

        var result = await controller.GetTodo(todo.Id);
        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var fetched = Assert.IsType<TodoController.TodoResponse>(okResult.Value);
        Assert.False(fetched.Doable);

        dependency.IsCompleted = true;
        await context.SaveChangesAsync();

        var updatedResult = await controller.GetTodo(todo.Id);
        var updatedOk = Assert.IsType<OkObjectResult>(updatedResult.Result);
        var updated = Assert.IsType<TodoController.TodoResponse>(updatedOk.Value);
        Assert.True(updated.Doable);
    }

    [Fact]
    public async Task GetTodo_IncludesTagsInResponse()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { Name = "Main", CreatedAt = DateTime.UtcNow };
        var tag = new Tag { Name = "urgent" };
        todo.Tags.Add(tag);
        context.Todos.Add(todo);
        await context.SaveChangesAsync();

        var controller = new TodoController(context);

        var result = await controller.GetTodo(todo.Id);

        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var fetched = Assert.IsType<TodoController.TodoResponse>(okResult.Value);
        Assert.Equal(new[] { "urgent" }, fetched.Tags);
    }

    [Fact]
    public async Task AddTag_CreatesTag_NormalizesName_AndReturnsCreated()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { Name = "Main", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();
        var controller = new TodoController(context);

        var result = await controller.AddTag(todo.Id, new TodoController.AddTagRequest { Name = "  UrGent  " });

        var createdResult = Assert.IsType<CreatedAtActionResult>(result.Result);
        var updatedTodo = Assert.IsType<TodoController.TodoResponse>(createdResult.Value);
        Assert.Equal(new[] { "urgent" }, updatedTodo.Tags);

        var savedTag = await context.Tags.SingleAsync();
        Assert.Equal("urgent", savedTag.Name);
    }

    [Fact]
    public async Task AddTag_UsesExistingTagAndReturnsOk()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var sharedTag = new Tag { Name = "home" };
        var existingTodo = new Todo { Name = "Existing", CreatedAt = DateTime.UtcNow };
        existingTodo.Tags.Add(sharedTag);
        var targetTodo = new Todo { Name = "Target", CreatedAt = DateTime.UtcNow };
        context.Todos.AddRange(existingTodo, targetTodo);
        await context.SaveChangesAsync();
        var controller = new TodoController(context);

        var result = await controller.AddTag(targetTodo.Id, new TodoController.AddTagRequest { Name = "HOME" });

        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var updatedTodo = Assert.IsType<TodoController.TodoResponse>(okResult.Value);
        Assert.Equal(new[] { "home" }, updatedTodo.Tags);
        Assert.Equal(1, await context.Tags.CountAsync());
    }

    [Fact]
    public async Task AddTag_ReturnsBadRequestForMissingTagName()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { Name = "Main", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();
        var controller = new TodoController(context);

        var result = await controller.AddTag(todo.Id, new TodoController.AddTagRequest { Name = " " });

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task AddTag_ReturnsNotFoundForMissingTodo()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var controller = new TodoController(context);

        var result = await controller.AddTag(999, new TodoController.AddTagRequest { Name = "home" });

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task RemoveTag_RemovesTagFromTodoAndReturnsUpdatedTodo()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { Name = "Main", CreatedAt = DateTime.UtcNow };
        var tag = new Tag { Name = "home" };
        todo.Tags.Add(tag);
        context.Todos.Add(todo);
        await context.SaveChangesAsync();
        var controller = new TodoController(context);

        var result = await controller.RemoveTag(todo.Id, "HOME");

        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var updatedTodo = Assert.IsType<TodoController.TodoResponse>(okResult.Value);
        Assert.Empty(updatedTodo.Tags);

        var reloadedTodo = await context.Todos
            .Include(item => item.Tags)
            .FirstAsync(item => item.Id == todo.Id);
        Assert.Empty(reloadedTodo.Tags);
    }

    [Fact]
    public async Task RemoveTag_ReturnsNotFoundForMissingTag()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { Name = "Main", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();
        var controller = new TodoController(context);

        var result = await controller.RemoveTag(todo.Id, "missing");

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task GetTags_ReturnsUniqueTagsOrderedByName()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var firstTodo = new Todo { Name = "First", CreatedAt = DateTime.UtcNow };
        var secondTodo = new Todo { Name = "Second", CreatedAt = DateTime.UtcNow };
        var alpha = new Tag { Name = "alpha" };
        var beta = new Tag { Name = "beta" };
        firstTodo.Tags.Add(beta);
        secondTodo.Tags.Add(alpha);
        secondTodo.Tags.Add(beta);
        context.Todos.AddRange(firstTodo, secondTodo);
        await context.SaveChangesAsync();

        var controller = new TagsController(context);

        var result = await controller.GetTags();

        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var tags = Assert.IsAssignableFrom<IEnumerable<string>>(okResult.Value).ToList();
        Assert.Equal(new[] { "alpha", "beta" }, tags);
    }

    [Fact]
    public async Task AddDependency_AddsDependency()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { Name = "Main", CreatedAt = DateTime.UtcNow };
        var dependency = new Todo { Name = "Dependency", CreatedAt = DateTime.UtcNow };
        context.Todos.AddRange(todo, dependency);
        await context.SaveChangesAsync();

        var controller = new TodoController(context);

        var result = await controller.AddDependency(todo.Id, dependency.Id);

        Assert.IsType<NoContentResult>(result);
        var updated = await context.Todos
            .Include(t => t.Dependencies)
            .FirstAsync(t => t.Id == todo.Id);
        Assert.Contains(updated.Dependencies, item => item.Id == dependency.Id);
    }

    [Fact]
    public async Task AddDependency_ReturnsBadRequestForCircularDependency()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { Name = "Main", CreatedAt = DateTime.UtcNow };
        var dependency = new Todo { Name = "Dependency", CreatedAt = DateTime.UtcNow };
        context.Todos.AddRange(todo, dependency);
        await context.SaveChangesAsync();
        dependency.Dependencies.Add(todo);
        await context.SaveChangesAsync();

        var controller = new TodoController(context);

        var result = await controller.AddDependency(todo.Id, dependency.Id);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task RemoveDependency_RemovesDependency()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { Name = "Main", CreatedAt = DateTime.UtcNow };
        var dependency = new Todo { Name = "Dependency", CreatedAt = DateTime.UtcNow };
        todo.Dependencies.Add(dependency);
        context.Todos.AddRange(todo, dependency);
        await context.SaveChangesAsync();

        var controller = new TodoController(context);

        var result = await controller.RemoveDependency(todo.Id, dependency.Id);

        Assert.IsType<NoContentResult>(result);
        var updated = await context.Todos
            .Include(t => t.Dependencies)
            .FirstAsync(t => t.Id == todo.Id);
        Assert.Empty(updated.Dependencies);
    }

    [Fact]
    public async Task DeleteTodo_RemovesTodo()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { Name = "Delete", CreatedAt = DateTime.UtcNow };
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

