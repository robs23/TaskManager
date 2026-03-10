using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using TodoApi.Controllers;
using TodoApi.Data;
using TodoApi.Models;
using TodoApi.Services;

namespace TodoApi.Tests;

public class TodoControllerTests
{
    private const int TestUserId = 1;

    [Fact]
    public async Task GetTodos_ReturnsAllTodos()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        context.Todos.AddRange(
            new Todo { UserId = TestUserId, Name = "First", CreatedAt = DateTime.UtcNow },
            new Todo { UserId = TestUserId, Name = "Second", CreatedAt = DateTime.UtcNow });
        await context.SaveChangesAsync();

        var controller = CreateAuthenticatedController(context);

        var result = await controller.GetTodos();

        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var todos = Assert.IsAssignableFrom<IEnumerable<TodoController.TodoResponse>>(okResult.Value).ToList();
        Assert.Equal(2, todos.Count());
        Assert.All(todos, todo => Assert.Empty(todo.Attachments));
    }

    [Fact]
    public async Task GetTodos_FiltersTodosByAuthenticatedUser()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        context.Todos.AddRange(
            new Todo { UserId = TestUserId, Name = "Mine", CreatedAt = DateTime.UtcNow },
            new Todo { UserId = 2, Name = "Other", CreatedAt = DateTime.UtcNow });
        await context.SaveChangesAsync();

        var controller = CreateAuthenticatedController(context);

        var result = await controller.GetTodos();

        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var todos = Assert.IsAssignableFrom<IEnumerable<TodoController.TodoResponse>>(okResult.Value).ToList();
        Assert.Single(todos);
        Assert.Equal("Mine", todos[0].Name);
    }

    [Fact]
    public async Task GetTodo_ReturnsTodoWhenFound()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = TestUserId, Name = "Find me", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();

        var controller = CreateAuthenticatedController(context);

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
        var controller = CreateAuthenticatedController(context);

        var result = await controller.GetTodo(999);

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task CreateTodo_CreatesTodoWithExtendedProperties()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var parent = new Todo { UserId = TestUserId, Name = "Parent", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(parent);
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context);
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
    public async Task CreateTodo_SetsUserIdFromAuthenticatedUser()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var controller = CreateAuthenticatedController(context, 7);

        var result = await controller.CreateTodo(new TodoController.CreateTodoRequest
        {
            Name = "Owned by user 7"
        });

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var response = Assert.IsType<TodoController.TodoResponse>(created.Value);
        var saved = await context.Todos.FindAsync(response.Id);
        Assert.NotNull(saved);
        Assert.Equal(7, saved!.UserId);
    }

    [Fact]
    public async Task CreateTodo_ReturnsBadRequestWhenParentBelongsToDifferentUser()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var otherUsersParent = new Todo { UserId = 2, Name = "Other parent", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(otherUsersParent);
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context);

        var result = await controller.CreateTodo(new TodoController.CreateTodoRequest
        {
            Name = "Child",
            ParentId = otherUsersParent.Id
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("Parent todo does not exist.", badRequest.Value);
    }

    [Fact]
    public async Task UpdateTodo_UpdatesTodoWithExtendedProperties()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var originalParent = new Todo { UserId = TestUserId, Name = "Original parent", CreatedAt = DateTime.UtcNow };
        var newParent = new Todo { UserId = TestUserId, Name = "New parent", CreatedAt = DateTime.UtcNow };
        var todo = new Todo
        {
            UserId = TestUserId,
            Name = "Old",
            Description = "Old description",
            Deadline = new DateTime(2029, 12, 31, 0, 0, 0, DateTimeKind.Utc),
            Notes = "Old notes",
            Parent = originalParent,
            CreatedAt = DateTime.UtcNow
        };
        context.Todos.AddRange(originalParent, newParent, todo);
        await context.SaveChangesAsync();

        var controller = CreateAuthenticatedController(context);
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
        var parent = new Todo { UserId = TestUserId, Name = "Parent", CreatedAt = DateTime.UtcNow };
        var todo = new Todo
        {
            UserId = TestUserId,
            Name = "Child",
            Parent = parent,
            CreatedAt = DateTime.UtcNow
        };
        context.Todos.AddRange(parent, todo);
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context);
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
        var todo = new Todo { UserId = TestUserId, Name = "Todo", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context);
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
        var root = new Todo { UserId = TestUserId, Name = "Root", CreatedAt = DateTime.UtcNow };
        var child = new Todo { UserId = TestUserId, Name = "Child", Parent = root, CreatedAt = DateTime.UtcNow };
        var grandchild = new Todo { UserId = TestUserId, Name = "Grandchild", Parent = child, CreatedAt = DateTime.UtcNow };
        context.Todos.AddRange(root, child, grandchild);
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context);
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
        var controller = CreateAuthenticatedController(context);
        var request = new TodoController.UpdateTodoRequest
        {
            Name = "Updated",
            IsCompleted = true
        };

        var result = await controller.UpdateTodo(999, request);

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task GetTodo_ReturnsNotFoundForDifferentUser()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = 2, Name = "Other user's todo", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context);

        var result = await controller.GetTodo(todo.Id);

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task GetTodo_ReturnsDoableBasedOnDependencies()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var dependency = new Todo { UserId = TestUserId, Name = "Dependency", IsCompleted = false, CreatedAt = DateTime.UtcNow };
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        context.Todos.AddRange(dependency, todo);
        await context.SaveChangesAsync();
        todo.Dependencies.Add(dependency);
        await context.SaveChangesAsync();

        var controller = CreateAuthenticatedController(context);

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
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        var tag = new Tag { Name = "urgent" };
        todo.Tags.Add(tag);
        context.Todos.Add(todo);
        await context.SaveChangesAsync();

        var controller = CreateAuthenticatedController(context);

        var result = await controller.GetTodo(todo.Id);

        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var fetched = Assert.IsType<TodoController.TodoResponse>(okResult.Value);
        Assert.Equal(new[] { "urgent" }, fetched.Tags);
    }

    [Fact]
    public async Task GetTodo_IncludesAttachmentsInResponse()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();

        context.FileAttachments.Add(new FileAttachment
        {
            TodoId = todo.Id,
            FileName = "notes.txt",
            StoragePath = "uploads/notes.txt",
            FileSize = 128,
            UploadedAt = DateTime.UtcNow,
            ContentType = "text/plain"
        });
        await context.SaveChangesAsync();

        var controller = CreateAuthenticatedController(context);

        var result = await controller.GetTodo(todo.Id);

        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var fetched = Assert.IsType<TodoController.TodoResponse>(okResult.Value);
        var attachment = Assert.Single(fetched.Attachments);
        Assert.Equal("notes.txt", attachment.FileName);
        Assert.Equal(128, attachment.FileSize);
        Assert.Equal("text/plain", attachment.ContentType);
    }

    [Fact]
    public async Task GetTodos_IncludesAttachmentsPerTodo()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var withAttachment = new Todo { UserId = TestUserId, Name = "With attachment", CreatedAt = DateTime.UtcNow };
        var withoutAttachment = new Todo { UserId = TestUserId, Name = "Without attachment", CreatedAt = DateTime.UtcNow };
        context.Todos.AddRange(withAttachment, withoutAttachment);
        await context.SaveChangesAsync();

        context.FileAttachments.Add(new FileAttachment
        {
            TodoId = withAttachment.Id,
            FileName = "doc.pdf",
            StoragePath = "uploads/doc.pdf",
            FileSize = 2048,
            UploadedAt = DateTime.UtcNow,
            ContentType = "application/pdf"
        });
        await context.SaveChangesAsync();

        var controller = CreateAuthenticatedController(context);

        var result = await controller.GetTodos();

        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var todos = Assert.IsAssignableFrom<IEnumerable<TodoController.TodoResponse>>(okResult.Value).ToList();
        var withAttachmentResponse = todos.Single(todo => todo.Id == withAttachment.Id);
        var withoutAttachmentResponse = todos.Single(todo => todo.Id == withoutAttachment.Id);

        var attachment = Assert.Single(withAttachmentResponse.Attachments);
        Assert.Equal("doc.pdf", attachment.FileName);
        Assert.Equal(2048, attachment.FileSize);
        Assert.Equal("application/pdf", attachment.ContentType);
        Assert.Empty(withoutAttachmentResponse.Attachments);
    }

    [Fact]
    public async Task AddTag_CreatesTag_NormalizesName_AndReturnsCreated()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context);

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
        var existingTodo = new Todo { UserId = TestUserId, Name = "Existing", CreatedAt = DateTime.UtcNow };
        existingTodo.Tags.Add(sharedTag);
        var targetTodo = new Todo { UserId = TestUserId, Name = "Target", CreatedAt = DateTime.UtcNow };
        context.Todos.AddRange(existingTodo, targetTodo);
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context);

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
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context);

        var result = await controller.AddTag(todo.Id, new TodoController.AddTagRequest { Name = " " });

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task AddTag_ReturnsNotFoundForMissingTodo()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var controller = CreateAuthenticatedController(context);

        var result = await controller.AddTag(999, new TodoController.AddTagRequest { Name = "home" });

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task RemoveTag_RemovesTagFromTodoAndReturnsUpdatedTodo()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        var tag = new Tag { Name = "home" };
        todo.Tags.Add(tag);
        context.Todos.Add(todo);
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context);

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
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context);

        var result = await controller.RemoveTag(todo.Id, "missing");

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task GetTags_ReturnsUniqueTagsOrderedByName()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var firstTodo = new Todo { UserId = TestUserId, Name = "First", CreatedAt = DateTime.UtcNow };
        var secondTodo = new Todo { UserId = TestUserId, Name = "Second", CreatedAt = DateTime.UtcNow };
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
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        var dependency = new Todo { UserId = TestUserId, Name = "Dependency", CreatedAt = DateTime.UtcNow };
        context.Todos.AddRange(todo, dependency);
        await context.SaveChangesAsync();

        var controller = CreateAuthenticatedController(context);

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
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        var dependency = new Todo { UserId = TestUserId, Name = "Dependency", CreatedAt = DateTime.UtcNow };
        context.Todos.AddRange(todo, dependency);
        await context.SaveChangesAsync();
        dependency.Dependencies.Add(todo);
        await context.SaveChangesAsync();

        var controller = CreateAuthenticatedController(context);

        var result = await controller.AddDependency(todo.Id, dependency.Id);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task AddDependency_ReturnsNotFoundWhenDependencyBelongsToDifferentUser()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        var dependency = new Todo { UserId = 2, Name = "Dependency", CreatedAt = DateTime.UtcNow };
        context.Todos.AddRange(todo, dependency);
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context);

        var result = await controller.AddDependency(todo.Id, dependency.Id);

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task RemoveDependency_RemovesDependency()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        var dependency = new Todo { UserId = TestUserId, Name = "Dependency", CreatedAt = DateTime.UtcNow };
        todo.Dependencies.Add(dependency);
        context.Todos.AddRange(todo, dependency);
        await context.SaveChangesAsync();

        var controller = CreateAuthenticatedController(context);

        var result = await controller.RemoveDependency(todo.Id, dependency.Id);

        Assert.IsType<NoContentResult>(result);
        var updated = await context.Todos
            .Include(t => t.Dependencies)
            .FirstAsync(t => t.Id == todo.Id);
        Assert.Empty(updated.Dependencies);
    }

    [Fact]
    public async Task UploadAttachment_CreatesAttachmentAndReturnsCreated()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();
        var fileStorage = new TestFileStorageService("uploads/stored.txt");
        var controller = CreateAuthenticatedController(context, fileStorageService: fileStorage);
        var contentBytes = new byte[] { 1, 2, 3, 4 };
        await using var contentStream = new MemoryStream(contentBytes);
        var file = new FormFile(contentStream, 0, contentBytes.Length, "file", "notes.txt")
        {
            Headers = new HeaderDictionary(),
            ContentType = "text/plain"
        };

        var result = await controller.UploadAttachment(todo.Id, file, CancellationToken.None);

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var response = Assert.IsType<TodoController.FileAttachmentResponse>(created.Value);
        Assert.Equal(todo.Id, response.TodoId);
        Assert.Equal("notes.txt", response.FileName);
        Assert.Equal("text/plain", response.ContentType);
        Assert.Equal(contentBytes.Length, response.FileSize);
        Assert.Equal(1, fileStorage.UploadCallCount);

        var saved = await context.FileAttachments.SingleAsync();
        Assert.Equal(todo.Id, saved.TodoId);
        Assert.Equal("notes.txt", saved.FileName);
        Assert.Equal("uploads/stored.txt", saved.StoragePath);
    }

    [Fact]
    public async Task UploadAttachment_ReturnsNotFoundWhenTodoBelongsToDifferentUser()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = 2, Name = "Other", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context);
        await using var contentStream = new MemoryStream(new byte[] { 1 });
        var file = new FormFile(contentStream, 0, 1, "file", "notes.txt");

        var result = await controller.UploadAttachment(todo.Id, file, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task UploadAttachment_ReturnsBadRequestForBlockedFileType()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context);
        await using var contentStream = new MemoryStream(new byte[] { 1, 2, 3 });
        var file = new FormFile(contentStream, 0, 3, "file", "malware.exe");

        var result = await controller.UploadAttachment(todo.Id, file, CancellationToken.None);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("File type is not allowed.", badRequest.Value);
    }

    [Fact]
    public async Task UploadAttachment_ReturnsBadRequestWhenFileSizeExceedsLimit()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context);
        var oversizedFileLength = 10 * 1024 * 1024L + 1;
        var file = new FormFile(Stream.Null, 0, oversizedFileLength, "file", "large.txt");

        var result = await controller.UploadAttachment(todo.Id, file, CancellationToken.None);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("File size must not exceed 10 MB.", badRequest.Value);
    }

    [Fact]
    public async Task DownloadAttachment_ReturnsFileStreamResultWhenAttachmentExists()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();

        var tempFilePath = Path.GetTempFileName();
        await System.IO.File.WriteAllBytesAsync(tempFilePath, new byte[] { 1, 2, 3, 4 });
        try
        {
            context.FileAttachments.Add(new FileAttachment
            {
                TodoId = todo.Id,
                FileName = "notes.txt",
                StoragePath = tempFilePath,
                FileSize = 4,
                ContentType = "text/plain",
                UploadedAt = DateTime.UtcNow
            });
            await context.SaveChangesAsync();

            var attachment = await context.FileAttachments.SingleAsync();
            var controller = CreateAuthenticatedController(context);

            var result = await controller.DownloadAttachment(todo.Id, attachment.Id, CancellationToken.None);

            var fileResult = Assert.IsType<FileStreamResult>(result);
            Assert.Equal("text/plain", fileResult.ContentType);
            Assert.Equal("notes.txt", fileResult.FileDownloadName);
            await using var stream = fileResult.FileStream;
            Assert.Equal(4, stream.Length);
        }
        finally
        {
            if (System.IO.File.Exists(tempFilePath))
            {
                System.IO.File.Delete(tempFilePath);
            }
        }
    }

    [Fact]
    public async Task DownloadAttachment_ReturnsNotFoundWhenTodoBelongsToDifferentUser()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = 2, Name = "Other", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();

        context.FileAttachments.Add(new FileAttachment
        {
            TodoId = todo.Id,
            FileName = "notes.txt",
            StoragePath = "missing-file.txt",
            FileSize = 1,
            ContentType = "text/plain",
            UploadedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var attachment = await context.FileAttachments.SingleAsync();
        var controller = CreateAuthenticatedController(context);

        var result = await controller.DownloadAttachment(todo.Id, attachment.Id, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task DownloadAttachment_ReturnsNotFoundWhenAttachmentMissing()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();
        var controller = CreateAuthenticatedController(context);

        var result = await controller.DownloadAttachment(todo.Id, 999, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task DownloadAttachment_ReturnsNotFoundWhenFileMissingFromStorage()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();

        context.FileAttachments.Add(new FileAttachment
        {
            TodoId = todo.Id,
            FileName = "notes.txt",
            StoragePath = Path.Combine(Path.GetTempPath(), $"missing-{Guid.NewGuid():N}.txt"),
            FileSize = 1,
            ContentType = "text/plain",
            UploadedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var attachment = await context.FileAttachments.SingleAsync();
        var controller = CreateAuthenticatedController(context);

        var result = await controller.DownloadAttachment(todo.Id, attachment.Id, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task DeleteAttachment_RemovesAttachmentAndReturnsNoContent()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();

        context.FileAttachments.Add(new FileAttachment
        {
            TodoId = todo.Id,
            FileName = "notes.txt",
            StoragePath = "uploads/notes.txt",
            FileSize = 10,
            ContentType = "text/plain",
            UploadedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var attachment = await context.FileAttachments.SingleAsync();
        var fileStorage = new TestFileStorageService("uploads/default.txt");
        var controller = CreateAuthenticatedController(context, fileStorageService: fileStorage);

        var result = await controller.DeleteAttachment(todo.Id, attachment.Id, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        Assert.Empty(context.FileAttachments);
        Assert.Single(fileStorage.DeletedPaths);
        Assert.Equal("uploads/notes.txt", fileStorage.DeletedPaths[0]);
    }

    [Fact]
    public async Task DeleteAttachment_ReturnsNotFoundWhenTodoBelongsToDifferentUser()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = 2, Name = "Other", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();

        context.FileAttachments.Add(new FileAttachment
        {
            TodoId = todo.Id,
            FileName = "notes.txt",
            StoragePath = "uploads/notes.txt",
            FileSize = 10,
            ContentType = "text/plain",
            UploadedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var attachment = await context.FileAttachments.SingleAsync();
        var fileStorage = new TestFileStorageService("uploads/default.txt");
        var controller = CreateAuthenticatedController(context, fileStorageService: fileStorage);

        var result = await controller.DeleteAttachment(todo.Id, attachment.Id, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
        Assert.Single(context.FileAttachments);
        Assert.Empty(fileStorage.DeletedPaths);
    }

    [Fact]
    public async Task DeleteAttachment_ReturnsNotFoundWhenAttachmentMissing()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();
        var fileStorage = new TestFileStorageService("uploads/default.txt");
        var controller = CreateAuthenticatedController(context, fileStorageService: fileStorage);

        var result = await controller.DeleteAttachment(todo.Id, 999, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
        Assert.Empty(fileStorage.DeletedPaths);
    }

    [Fact]
    public async Task DeleteAttachment_RemovesDatabaseRecordWhenStoredFileIsMissing()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = TestUserId, Name = "Main", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();

        context.FileAttachments.Add(new FileAttachment
        {
            TodoId = todo.Id,
            FileName = "missing.txt",
            StoragePath = "uploads/missing.txt",
            FileSize = 10,
            ContentType = "text/plain",
            UploadedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var attachment = await context.FileAttachments.SingleAsync();
        var fileStorage = new TestFileStorageService("uploads/default.txt");
        var controller = CreateAuthenticatedController(context, fileStorageService: fileStorage);

        var result = await controller.DeleteAttachment(todo.Id, attachment.Id, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        Assert.Empty(context.FileAttachments);
        Assert.Single(fileStorage.DeletedPaths);
        Assert.Equal("uploads/missing.txt", fileStorage.DeletedPaths[0]);
    }

    [Fact]
    public async Task DeleteTodo_RemovesTodo()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var todo = new Todo { UserId = TestUserId, Name = "Delete", CreatedAt = DateTime.UtcNow };
        context.Todos.Add(todo);
        await context.SaveChangesAsync();

        var controller = CreateAuthenticatedController(context);

        var result = await controller.DeleteTodo(todo.Id);

        Assert.IsType<NoContentResult>(result);
        Assert.Empty(context.Todos);
    }

    [Fact]
    public async Task DeleteTodo_ReturnsNotFoundWhenMissing()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using var context = CreateContext(databaseName);
        var controller = CreateAuthenticatedController(context);

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

    private static TodoController CreateAuthenticatedController(
        TodoDbContext context,
        int userId = TestUserId,
        IFileStorageService? fileStorageService = null)
    {
        var controller = new TodoController(context, fileStorageService ?? new TestFileStorageService("uploads/default.txt"));
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

    private sealed class TestFileStorageService : IFileStorageService
    {
        private readonly string _relativePath;

        public TestFileStorageService(string relativePath)
        {
            _relativePath = relativePath;
        }

        public int UploadCallCount { get; private set; }
        public List<string> DeletedPaths { get; } = new();

        public Task<string> UploadAsync(Stream fileStream, string originalFileName, CancellationToken cancellationToken = default)
        {
            UploadCallCount++;
            return Task.FromResult(_relativePath);
        }

        public void Delete(string relativePath)
        {
            DeletedPaths.Add(relativePath);
        }

        public string GetPath(string relativePath)
        {
            return relativePath;
        }
    }
}



