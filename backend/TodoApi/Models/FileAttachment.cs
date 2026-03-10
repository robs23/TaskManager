namespace TodoApi.Models;

public class FileAttachment
{
    public int Id { get; set; }
    public int TodoId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string StoragePath { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
    public string ContentType { get; set; } = string.Empty;
    public Todo? Todo { get; set; }
}
