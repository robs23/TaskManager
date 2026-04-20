using System.ComponentModel.DataAnnotations.Schema;

namespace TodoApi.Models;

public class Todo
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int SortOrder { get; set; } = 0;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime? Deadline { get; set; }
    public string? Notes { get; set; }
    public bool IsCompleted { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public int? ParentId { get; set; }
    public Todo? Parent { get; set; }
    public ICollection<Todo> Children { get; set; } = new List<Todo>();
    public ICollection<Todo> Dependencies { get; set; } = new List<Todo>();
    public ICollection<Todo> DependentTodos { get; set; } = new List<Todo>();
    public ICollection<Todo> RelatedTodos { get; set; } = new List<Todo>();
    public ICollection<Todo> RelatedByTodos { get; set; } = new List<Todo>();
    public ICollection<Tag> Tags { get; set; } = new List<Tag>();
    public ICollection<FileAttachment> Attachments { get; set; } = new List<FileAttachment>();
    public ICollection<Reminder> Reminders { get; set; } = new List<Reminder>();
    public User? User { get; set; }

    [NotMapped]
    public bool Doable => Dependencies?.All(dependency => dependency.IsCompleted) ?? true;
}
