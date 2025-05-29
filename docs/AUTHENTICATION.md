# Authentication for Portainer Webhooks

This document explains how to use Cloudflare Access authentication with Portainer webhooks in the dd-bot-js project.

## Cloudflare Access Authentication

The dd-bot project uses Cloudflare Access authentication to securely trigger Portainer webhooks. This provides an additional layer of security beyond the webhook URL itself.

### Required Environment Variables

Three environment variables are required for Portainer webhook operations:

1. `WEBHOOK_URL` - The Portainer webhook URL
2. `CF_ACCESS_CLIENT_ID` - Cloudflare Access Client ID
3. `CF_ACCESS_CLIENT_SECRET` - Cloudflare Access Client Secret

### Setting Up Authentication

You have two ways to provide these credentials:

#### Option 1: Using a .env file (Recommended)

Create a `.env` file in the project root directory with the following content:

```
WEBHOOK_URL=https://your-portainer-instance.com/api/webhooks/xxxx-xxxx-xxxx
CF_ACCESS_CLIENT_ID=your_cloudflare_access_client_id
CF_ACCESS_CLIENT_SECRET=your_cloudflare_access_client_secret
```

This file will be automatically loaded when running any of the Portainer webhook commands.

#### Option 2: Command Line Environment Variables

Export the variables before running commands:

```bash
export WEBHOOK_URL="https://your-portainer-instance.com/api/webhooks/xxxx-xxxx-xxxx"
export CF_ACCESS_CLIENT_ID="your_cloudflare_access_client_id"
export CF_ACCESS_CLIENT_SECRET="your_cloudflare_access_client_secret"

# Then run commands
make portainer-update
```

Or provide them inline with the command:

```bash
WEBHOOK_URL="https://your-portainer-instance.com/api/webhooks/xxxx-xxxx-xxxx" \
CF_ACCESS_CLIENT_ID="your_cloudflare_access_client_id" \
CF_ACCESS_CLIENT_SECRET="your_cloudflare_access_client_secret" \
make portainer-update
```

### Working with Multiline Secrets

If your Cloudflare Access Client Secret spans multiple lines, you have several options:

#### In a .env File

```
CF_ACCESS_CLIENT_SECRET="your-multi-line\
secret-that\
spans-multiple-lines"
```

#### In Bash/Zsh Environment

```bash
export CF_ACCESS_CLIENT_SECRET="your-multi-line
secret-that
spans-multiple-lines"
```

In this format, the newlines are preserved in the variable.

#### On Command Line (Not Recommended)

For multiline secrets on the command line, escape newlines:

```bash
CF_ACCESS_CLIENT_SECRET="your-multi-line\
secret-that\
spans-multiple-lines" \
make portainer-update
```

For security reasons, it's better to use a .env file or environment variables for secrets rather than passing them on the command line where they might be visible in process listings or command history.

## Getting Cloudflare Access Credentials

To obtain Cloudflare Access credentials:

1. Log in to your Cloudflare dashboard
2. Go to Access > Applications
3. Select your Portainer application
4. Go to the "Service Auth" tab
5. Create a new service token if you don't have one
6. Copy the Client ID and Client Secret

## Testing Authentication

To test your Cloudflare Access credentials without triggering the actual webhook:

```bash
make portainer-update DEBUG=true
```

This will show the curl command that would be executed but won't actually send the request.

For more advanced webhook debugging:

```bash
make webhook-debug
```

This runs a specialized script that provides detailed information about your Portainer webhook connection.