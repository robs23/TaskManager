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
    public DbSet<UserSettings> UserSettings => Set<UserSettings>();
    public DbSet<FileAttachment> FileAttachments => Set<FileAttachment>();
    public DbSet<PushSubscription> PushSubscriptions => Set<PushSubscription>();
    public DbSet<Reminder> Reminders => Set<Reminder>();

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

        modelBuilder.Entity<User>()
            .HasOne(u => u.Settings)
            .WithOne(s => s.User)
            .HasForeignKey<UserSettings>(s => s.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<FileAttachment>()
            .HasOne(f => f.Todo)
            .WithMany(t => t.Attachments)
            .HasForeignKey(f => f.TodoId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Reminder>(entity =>
        {
            entity.HasOne(r => r.Todo)
                .WithMany(t => t.Reminders)
                .HasForeignKey(r => r.TodoId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(r => r.User)
                .WithMany()
                .HasForeignKey(r => r.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(r => new { r.ReminderDateTimeUtc, r.IsSent });
        });

        modelBuilder.Entity<PushSubscription>(entity =>
        {
            entity.HasOne(ps => ps.User)
                .WithMany()
                .HasForeignKey(ps => ps.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(ps => new { ps.UserId, ps.Endpoint })
                .IsUnique();
        });

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
            .HasMany(t => t.RelatedTodos)
            .WithMany(t => t.RelatedByTodos)
            .UsingEntity<Dictionary<string, object>>(
                "TodoRelated",
                right => right.HasOne<Todo>()
                    .WithMany()
                    .HasForeignKey("RelatedTodoId")
                    .OnDelete(DeleteBehavior.Cascade),
                left => left.HasOne<Todo>()
                    .WithMany()
                    .HasForeignKey("TodoId")
                    .OnDelete(DeleteBehavior.Cascade),
                join =>
                {
                    join.HasKey("TodoId", "RelatedTodoId");
                    join.ToTable(tableBuilder =>
                        tableBuilder.HasCheckConstraint("CK_TodoRelated_NoSelf", "TodoId <> RelatedTodoId"));
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

        modelBuilder.Entity<UserSettings>(entity =>
        {
            entity.Property(s => s.PreferredLanguage)
                .HasDefaultValue("en");
            entity.Property(s => s.DefaultReminderOffsetsJson)
                .HasColumnName("DefaultReminderOffsets")
                .HasDefaultValue("[]");

            entity.HasIndex(s => s.UserId)
                .IsUnique();
        });

        base.OnModelCreating(modelBuilder);
    }
}
