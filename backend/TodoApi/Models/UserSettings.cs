namespace TodoApi.Models;

public class UserSettings
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string PreferredLanguage { get; set; } = "en";
    public bool ShowCompletedOnStartup { get; set; }
    public User User { get; set; } = null!;
}
