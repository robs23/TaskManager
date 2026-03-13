using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TodoApi.Migrations
{
    /// <inheritdoc />
    public partial class AddRelatedTodos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TodoRelated",
                columns: table => new
                {
                    TodoId = table.Column<int>(type: "INTEGER", nullable: false),
                    RelatedTodoId = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TodoRelated", x => new { x.TodoId, x.RelatedTodoId });
                    table.CheckConstraint("CK_TodoRelated_NoSelf", "TodoId <> RelatedTodoId");
                    table.ForeignKey(
                        name: "FK_TodoRelated_Todos_RelatedTodoId",
                        column: x => x.RelatedTodoId,
                        principalTable: "Todos",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TodoRelated_Todos_TodoId",
                        column: x => x.TodoId,
                        principalTable: "Todos",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TodoRelated_RelatedTodoId",
                table: "TodoRelated",
                column: "RelatedTodoId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TodoRelated");
        }
    }
}
