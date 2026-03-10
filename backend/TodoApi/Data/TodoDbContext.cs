using Microsoft.EntityFrameworkCore;
using TodoApi.Models;

namespace TodoApi.Data;

public class TodoDbContext : DbContext
{
    public TodoDbContext(DbContextOptions<TodoDbContext> options)
        : base(options)
    {
    }

    public DbSet<Todo> Todos => Set<Todo>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<User> Users => Set<User>();
    public DbSet<FileAttachment> FileAttachments => Set<FileAttachment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Todo>()
            .HasOne(t => t.Parent)
            .WithMany(t => t.Children)
            .HasForeignKey(t => t.ParentId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Todo>()
            .HasOne(t => t.User)
            .WithMany()
            .HasForeignKey(t => t.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<FileAttachment>()
            .HasOne(f => f.Todo)
            .WithMany(t => t.Attachments)
            .HasForeignKey(f => f.TodoId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Todo>()
            .HasMany(t => t.Dependencies)
            .WithMany(t => t.DependentTodos)
            .UsingEntity<Dictionary<string, object>>(
                "TodoDependencies",
                right => right.HasOne<Todo>()
                    .WithMany()
                    .HasForeignKey("DependsOnTodoId")
                    .OnDelete(DeleteBehavior.Restrict),
                left => left.HasOne<Todo>()
                    .WithMany()
                    .HasForeignKey("TodoId")
                    .OnDelete(DeleteBehavior.Restrict),
                join =>
                {
                    join.HasKey("TodoId", "DependsOnTodoId");
                    join.ToTable(tableBuilder =>
                        tableBuilder.HasCheckConstraint("CK_TodoDependencies_NoSelf", "TodoId <> DependsOnTodoId"));
                });

        modelBuilder.Entity<Todo>()
            .HasMany(t => t.Tags)
            .WithMany(t => t.TodoItems)
            .UsingEntity<Dictionary<string, object>>(
                "TodoItemTag",
                right => right.HasOne<Tag>()
                    .WithMany()
                    .HasForeignKey("TagId")
                    .OnDelete(DeleteBehavior.Cascade),
                left => left.HasOne<Todo>()
                    .WithMany()
                    .HasForeignKey("TodoItemId")
                    .OnDelete(DeleteBehavior.Cascade),
                join =>
                {
                    join.HasKey("TodoItemId", "TagId");
                });

        modelBuilder.Entity<Tag>()
            .HasIndex(t => t.Name)
            .IsUnique();

        modelBuilder.Entity<User>(entity =>
        {
            entity.Property(u => u.Username)
                .UseCollation("NOCASE");

            entity.HasIndex(u => u.Username)
                .IsUnique();
        });

        base.OnModelCreating(modelBuilder);
    }
}
