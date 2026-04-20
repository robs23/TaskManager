namespace TodoApi.Models;

public enum ReminderType
{
    BeforeDeadline = 0,
    FixedTime = 1
}

public class Reminder
{
    public int Id { get; set; }
    public int TodoId { get; set; }
    public int UserId { get; set; }
    public ReminderType Type { get; set; }
    public int? OffsetMinutes { get; set; }
    public DateTime? ReminderDateTimeUtc { get; set; }
    public bool IsSent { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Todo Todo { get; set; } = null!;
    public User User { get; set; } = null!;
}
