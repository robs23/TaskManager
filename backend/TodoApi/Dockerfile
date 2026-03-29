FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base

USER $APP_UID

WORKDIR /app
EXPOSE 8080

#Build image
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

#copy csproj file
COPY backend/TodoApi/*.csproj backend/TodoApi/

#restore dependencies
RUN dotnet restore backend/TodoApi/*.csproj

#copy all source files
COPY backend/TodoApi/ backend/TodoApi/

#build the project
WORKDIR /src/backend/TodoApi
RUN dotnet build -c Release -o /app/build

#publish the project
FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false --no-restore

#final image
FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "TodoApi.dll"]

