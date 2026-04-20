using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TodoApi.Data;
using TodoApi.Models;
using WebPush;

namespace TodoApi.Services;

public sealed class ReminderService : BackgroundService
{
    private const int PollIntervalSeconds = 30;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ReminderService> _logger;
    private readonly WebPushClient _webPushClient;
    private readonly VapidDetails _vapidDetails;

    public ReminderService(IServiceScopeFactory scopeFactory, IConfiguration configuration, ILogger<ReminderService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _webPushClient = new WebPushClient();

        var subject = configuration["Vapid:Subject"]
            ?? throw new InvalidOperationException("VAPID subject is not configured.");
        var publicKey = configuration["Vapid:PublicKey"]
            ?? throw new InvalidOperationException("VAPID public key is not configured.");
        var privateKey = configuration["Vapid:PrivateKey"]
            ?? throw new InvalidOperationException("VAPID private key is not configured.");

        _vapidDetails = new VapidDetails(subject, publicKey, privateKey);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(PollIntervalSeconds));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessDueReminders(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing due reminders.");
            }

            try
            {
                if (!await timer.WaitForNextTickAsync(stoppingToken))
                {
                    break;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    internal async Task ProcessDueReminders(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<TodoDbContext>();
        var now = DateTime.UtcNow;

        var dueReminders = await dbContext.Reminders
            .Include(r => r.Todo)
            .Where(r => !r.IsSent && r.ReminderDateTimeUtc.HasValue && r.ReminderDateTimeUtc.Value <= now)
            .OrderBy(r => r.ReminderDateTimeUtc)
            .ToListAsync(cancellationToken);

        foreach (var reminder in dueReminders)
        {
            var subscriptions = await dbContext.PushSubscriptions
                .Where(s => s.UserId == reminder.UserId)
                .ToListAsync(cancellationToken);

            var payload = BuildPayload(reminder);
            var sentToAllSubscriptions = true;

            foreach (var subscription in subscriptions)
            {
                try
                {
                    var pushSubscription = new WebPush.PushSubscription(
                        subscription.Endpoint,
                        subscription.P256dh,
                        subscription.Auth);

                    await _webPushClient.SendNotificationAsync(
                        pushSubscription,
                        payload,
                        _vapidDetails,
                        cancellationToken);
                }
                catch (WebPushException ex) when (ex.StatusCode == HttpStatusCode.Gone)
                {
                    dbContext.PushSubscriptions.Remove(subscription);
                    _logger.LogInformation(
                        "Removed expired push subscription for user {UserId} endpoint {Endpoint}.",
                        reminder.UserId,
                        subscription.Endpoint);
                }
                catch (WebPushException ex)
                {
                    sentToAllSubscriptions = false;
                    _logger.LogWarning(
                        ex,
                        "Push notification failed for reminder {ReminderId} and endpoint {Endpoint} with status {StatusCode}.",
                        reminder.Id,
                        subscription.Endpoint,
                        ex.StatusCode);
                }
                catch (Exception ex)
                {
                    sentToAllSubscriptions = false;
                    _logger.LogWarning(
                        ex,
                        "Unexpected push notification failure for reminder {ReminderId} and endpoint {Endpoint}.",
                        reminder.Id,
                        subscription.Endpoint);
                }
            }

            if (sentToAllSubscriptions)
            {
                reminder.IsSent = true;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static string BuildPayload(Reminder reminder)
    {
        var todoName = string.IsNullOrWhiteSpace(reminder.Todo.Name) ? "Todo" : reminder.Todo.Name.Trim();
        var body = BuildBody(reminder);

        var payload = new
        {
            title = $"Reminder: {todoName}",
            body,
            todoId = reminder.TodoId
        };

        return JsonSerializer.Serialize(payload);
    }

    private static string BuildBody(Reminder reminder)
    {
        if (reminder.Type == ReminderType.BeforeDeadline && reminder.OffsetMinutes.GetValueOrDefault() > 0)
        {
            var offset = reminder.OffsetMinutes!.Value;
            if (offset % 60 == 0)
            {
                var hours = offset / 60;
                var unit = hours == 1 ? "hour" : "hours";
                return $"Due in {hours} {unit}";
            }

            return $"Due in {offset} minutes";
        }

        if (reminder.ReminderDateTimeUtc.HasValue)
        {
            return $"Reminder at {reminder.ReminderDateTimeUtc.Value.ToLocalTime():h:mm tt}";
        }

        if (reminder.Todo.Deadline.HasValue)
        {
            return $"Reminder for todo due at {reminder.Todo.Deadline.Value.ToLocalTime():h:mm tt}";
        }

        return "Todo reminder";
    }
}
