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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Todo>()
            .HasOne(t => t.Parent)
            .WithMany(t => t.Children)
            .HasForeignKey(t => t.ParentId)
            .OnDelete(DeleteBehavior.Restrict);

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

        base.OnModelCreating(modelBuilder);
    }
}
