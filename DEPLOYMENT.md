# Production Deployment Guide

This guide explains how to deploy the Todo application using pre-built container images from GitHub Container Registry (GHCR).

## Overview

The application consists of two services:
- **Backend**: .NET API (ghcr.io/robs23/todo-api)
- **Frontend**: React + Vite SPA (ghcr.io/robs23/todo-app)

## Prerequisites

- Docker and Docker Compose installed (or Portainer)
- Access to pull images from ghcr.io (public images don't require authentication)

## Deployment Steps

### 1. Clone the Repository (or download docker-compose.prod.yml)

```bash
git clone <repository-url>
cd TaskManager
```

### 2. Configure Environment Variables

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

Edit `.env` and set the following variables:

```env
# Specify the image tag (commit SHA, version, or 'latest')
IMAGE_TAG=4d28220

# Set a secure JWT secret for authentication
JWT_SECRET=your-secure-random-secret-here
```

**Important**: Generate a strong random string for `JWT_SECRET`. You can use:

```bash
# PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})

# Linux/Mac
openssl rand -base64 64
```

### 3. Deploy with Docker Compose

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 4. Deploy with Portainer

1. Log into your Portainer instance
2. Navigate to **Stacks** → **Add Stack**
3. Choose **Upload** and select `docker-compose.prod.yml`
4. In the **Environment variables** section, add:
   - `IMAGE_TAG`: Your desired version (e.g., `4d28220`)
   - `JWT_SECRET`: Your secure JWT secret
5. Click **Deploy the stack**

## Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8080

## Updating to a New Version

### Using Docker Compose

1. Update the `IMAGE_TAG` in your `.env` file
2. Pull the new images and restart:

```bash
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

### Using Portainer

1. Go to your stack in Portainer
2. Click **Editor**
3. Update the `IMAGE_TAG` environment variable
4. Click **Update the stack**

## Data Persistence

Application data is stored in a Docker volume named `todoapi-data`, which includes:
- SQLite database (`todos.db`)
- Uploaded file attachments

This volume persists across container restarts and updates.

## Troubleshooting

### Cannot pull images
If you get authentication errors, you may need to log into GHCR:

```bash
docker login ghcr.io -u <github-username>
```

Use a GitHub Personal Access Token with `read:packages` permission as the password.

### Port conflicts
If ports 8080 or 5173 are already in use, modify the port mappings in `docker-compose.prod.yml`:

```yaml
ports:
  - "8081:8080"  # Map to different host port
```

## Architecture

```
┌─────────────────┐
│   Frontend      │
│   (port 5173)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Backend API   │
│   (port 8080)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  SQLite DB      │
│  (volume)       │
└─────────────────┘
```

## For Developers

For local development with live code changes, use the standard `docker-compose.yml` which builds images from source:

```bash
docker-compose up
```
