using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;

namespace TodoApi.Models;

public class UserSettings
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string PreferredLanguage { get; set; } = "en";
    public bool ShowCompletedOnStartup { get; set; }
    public string DefaultReminderOffsetsJson { get; set; } = "[]";

    [NotMapped]
    public List<int> DefaultReminderOffsets
    {
        get => JsonSerializer.Deserialize<List<int>>(DefaultReminderOffsetsJson) ?? [];
        set => DefaultReminderOffsetsJson = JsonSerializer.Serialize(NormalizeReminderOffsets(value));
    }

    public User User { get; set; } = null!;

    private static List<int> NormalizeReminderOffsets(IEnumerable<int>? offsets)
    {
        if (offsets is null)
        {
            return [];
        }

        var normalized = new List<int>();
        var seen = new HashSet<int>();
        foreach (var offset in offsets)
        {
            if (offset > 0 && seen.Add(offset))
            {
                normalized.Add(offset);
            }
        }

        return normalized;
    }
}
