using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TodoApi.Migrations
{
    /// <inheritdoc />
    public partial class EnhancedTodoModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Title",
                table: "Todos",
                newName: "Name");

            migrationBuilder.AddColumn<DateTime>(
                name: "Deadline",
                table: "Todos",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Todos",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Notes",
                table: "Todos",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ParentId",
                table: "Todos",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "TodoDependencies",
                columns: table => new
                {
                    TodoId = table.Column<int>(type: "INTEGER", nullable: false),
                    DependsOnTodoId = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TodoDependencies", x => new { x.TodoId, x.DependsOnTodoId });
                    table.CheckConstraint("CK_TodoDependencies_NoSelf", "TodoId <> DependsOnTodoId");
                    table.ForeignKey(
                        name: "FK_TodoDependencies_Todos_DependsOnTodoId",
                        column: x => x.DependsOnTodoId,
                        principalTable: "Todos",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TodoDependencies_Todos_TodoId",
                        column: x => x.TodoId,
                        principalTable: "Todos",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Todos_ParentId",
                table: "Todos",
                column: "ParentId");

            migrationBuilder.CreateIndex(
                name: "IX_TodoDependencies_DependsOnTodoId",
                table: "TodoDependencies",
                column: "DependsOnTodoId");

            migrationBuilder.AddForeignKey(
                name: "FK_Todos_Todos_ParentId",
                table: "Todos",
                column: "ParentId",
                principalTable: "Todos",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Todos_Todos_ParentId",
                table: "Todos");

            migrationBuilder.DropTable(
                name: "TodoDependencies");

            migrationBuilder.DropIndex(
                name: "IX_Todos_ParentId",
                table: "Todos");

            migrationBuilder.DropColumn(
                name: "Deadline",
                table: "Todos");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "Todos");

            migrationBuilder.DropColumn(
                name: "Notes",
                table: "Todos");

            migrationBuilder.DropColumn(
                name: "ParentId",
                table: "Todos");

            migrationBuilder.RenameColumn(
                name: "Name",
                table: "Todos",
                newName: "Title");
        }
    }
}
