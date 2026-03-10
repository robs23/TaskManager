namespace TodoApi.Services;

public interface IFileStorageService
{
    Task<string> UploadAsync(Stream fileStream, string originalFileName, CancellationToken cancellationToken = default);
    void Delete(string relativePath);
    string GetPath(string relativePath);
}
