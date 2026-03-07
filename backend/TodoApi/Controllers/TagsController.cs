using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TodoApi.Data;

namespace TodoApi.Controllers;

[ApiController]
[Route("api/tags")]
public class TagsController : ControllerBase
{
    private readonly TodoDbContext _context;

    public TagsController(TodoDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<string>>> GetTags()
    {
        var tags = await _context.Tags.AsNoTracking()
            .Select(tag => tag.Name)
            .Distinct()
            .OrderBy(tagName => tagName)
            .ToListAsync();

        return Ok(tags);
    }
}
