using System.ComponentModel.DataAnnotations;

namespace TodoApi.Models;

public class Tag
{
    public int Id { get; set; }

    [Required]
    [MaxLength(50)]
    public string Name { get; set; } = string.Empty;

    public ICollection<Todo> TodoItems { get; set; } = new List<Todo>();
}
