namespace TodoApi.Contracts;

public sealed class UserSettingsResponse
{
    public string PreferredLanguage { get; set; } = "en";
    public bool ShowCompletedOnStartup { get; set; }
}

public sealed class UpdateUserSettingsRequest
{
    public string PreferredLanguage { get; set; } = "en";
    public bool ShowCompletedOnStartup { get; set; }
}
