namespace TodoApi.Services;

public class FileStorageService : IFileStorageService
{
    private readonly string _storageRoot;

    public FileStorageService(IConfiguration configuration)
    {
        var configuredPath = configuration["FileStoragePath"];
        var storagePath = string.IsNullOrWhiteSpace(configuredPath) ? "./uploads" : configuredPath;
        _storageRoot = Path.GetFullPath(storagePath);
        Directory.CreateDirectory(_storageRoot);
    }

    public async Task<string> UploadAsync(Stream fileStream, string originalFileName, CancellationToken cancellationToken = default)
    {
        var extension = Path.GetExtension(originalFileName);
        var uniqueFileName = $"{Guid.NewGuid():N}{extension}";
        var relativePath = uniqueFileName;
        var absolutePath = Path.Combine(_storageRoot, relativePath);

        await using var outputStream = new FileStream(absolutePath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        await fileStream.CopyToAsync(outputStream, cancellationToken);

        return relativePath;
    }

    public void Delete(string relativePath)
    {
        var absolutePath = GetPath(relativePath);
        if (File.Exists(absolutePath))
        {
            File.Delete(absolutePath);
        }
    }

    public string GetPath(string relativePath)
    {
        return Path.Combine(_storageRoot, relativePath);
    }
}
