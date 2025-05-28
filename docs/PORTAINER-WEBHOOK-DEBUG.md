# Portainer Webhook Debugging Guide

This guide will help you troubleshoot issues with Portainer webhooks in this project.

## Common Webhook Issues

1. **Invalid Webhook URL**
   - Webhook URLs have a specific format: `https://your-portainer-instance/api/webhooks/your-webhook-id`
   - Make sure you are using the complete URL including the webhook ID

2. **Network Connectivity Issues**
   - Your system needs to be able to reach the Portainer instance
   - Check firewall rules or network restrictions

3. **Authentication/Authorization Issues**
   - Webhook IDs are sensitive credentials
   - If a webhook ID is compromised, regenerate it in Portainer

## Debugging Tools

This project provides several tools to help debug webhook issues:

### 1. Basic Webhook Testing

```bash
make test-webhook WEBHOOK_URL=https://your-portainer-instance/api/webhooks/your-webhook-id
```

This performs a basic connectivity test to the Portainer instance without actually triggering the webhook.

### 2. Advanced Webhook Debugging

```bash
make webhook-debug WEBHOOK_URL=https://your-portainer-instance/api/webhooks/your-webhook-id
```

This runs a comprehensive diagnostic tool that:
- Validates the webhook URL format
- Tests connectivity to the Portainer host
- Verifies the webhook ID format
- Optionally triggers the webhook in a controlled way

For more detailed output:

```bash
make webhook-debug WEBHOOK_URL=https://your-portainer-instance/api/webhooks/your-webhook-id VERBOSE=true
```

### 3. Dry Run Mode

To simulate webhook triggering without actually sending the request:

```bash
make portainer-update WEBHOOK_URL=https://your-portainer-instance/api/webhooks/your-webhook-id DEBUG=true
```

## Troubleshooting Steps

If you experience issues with Portainer webhooks:

1. First, run the basic test to verify connectivity:
   ```
   make test-webhook WEBHOOK_URL=your-webhook-url
   ```

2. If that succeeds, run the advanced debugging tool:
   ```
   make webhook-debug WEBHOOK_URL=your-webhook-url
   ```

3. If you need more detail, add the VERBOSE flag:
   ```
   make webhook-debug WEBHOOK_URL=your-webhook-url VERBOSE=true
   ```

4. Check the Portainer logs for errors related to webhook triggers

5. Verify that your webhook URL is still valid in Portainer (they can expire or be regenerated)

## Manual Testing with curl

You can also test webhooks directly with curl:

```bash
curl -v -X POST https://your-portainer-instance/api/webhooks/your-webhook-id
```

Note: Successful webhook triggers typically return a 200 OK status code.
