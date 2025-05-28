# Makefile for Docker multi-platform build & version management

IMAGE_NAME=anshuljkt1/docker-discord-bot
VERSION_FILE=package.json

# Extract version from package.json. Mac version.
EXTRACTED_VERSION ?= $(shell grep -m 1 '"version"' $(VERSION_FILE) | sed -E 's/.*"version": "([0-9]+\.[0-9]+\.[0-9]+[^"]*)".*/\1/')

# Extract version from package.json. GNU/Linux version.
# EXTRACTED_VERSION ?= $(shell grep -m 1 '"version"' $(VERSION_FILE) | sed -E 's/.*"version": "\([0-9]+\.[0-9]+\.[0-9]+[^"]*\)".*/\1/')

# Extra tags can be passed as: make build EXTRA_TAGS="--tag $(IMAGE_NAME):prod"
EXTRA_TAGS ?=
TAGS=--tag $(IMAGE_NAME):latest --tag $(IMAGE_NAME):$(EXTRACTED_VERSION) $(EXTRA_TAGS)
PLATFORMS=linux/amd64,linux/arm64

.PHONY: build dev set-version release tag debug-version debug-build init-buildx init-settings clean help portainer-update test-webhook webhook-debug release-and-deploy

## Debug target to show version extraction
debug-version:
	@echo "=== Version Debug ==="
	@echo "VERSION_FILE: $(VERSION_FILE)"
	@echo "Raw grep output:"
	@grep '"version"' $(VERSION_FILE)
	@echo "Extracted version:"
	@echo $(EXTRACTED_VERSION)

## Debug build configuration
debug-build:
	@echo "=== Build Configuration ==="
	@echo "IMAGE_NAME: $(IMAGE_NAME)"
	@echo "EXTRACTED_VERSION: $(EXTRACTED_VERSION)"
	@echo "TAGS: $(TAGS)"

## Build Docker image for current platform
build: debug-build
	@echo "=== Starting Build ==="
	@echo "Building version: $(EXTRACTED_VERSION)"
	docker build -t $(IMAGE_NAME):$(EXTRACTED_VERSION) -t $(IMAGE_NAME):latest .

## Run the development version with live reloading
dev:
	@echo "=== Starting Development Server ==="
	docker-compose -f docker-local-build-compose.yaml up

## Print the current version from package.json
print-version:
	@echo "Current version in $(VERSION_FILE): $(EXTRACTED_VERSION)"
	@grep '"version"' $(VERSION_FILE)

## Update the version in package.json
update-version:
	@if [ -z "$(VER)" ]; then \
		echo "❌ Error: VER not specified. Usage: make update-version VER=1.2.3"; \
		exit 1; \
	fi
	@echo "Setting version to: $(VER)"
	@if sed --version >/dev/null 2>&1; then \
		sed -i "s/\"version\": \".*\"/\"version\": \"$(VER)\"/" $(VERSION_FILE); \
	else \
		sed -i '' "s/\"version\": \".*\"/\"version\": \"$(VER)\"/" $(VERSION_FILE); \
	fi
	@echo "✅ Updated version to $(VER) in $(VERSION_FILE)"

## Set or verify version for other operations
set-version:
	@if [ -z "$(VER)" ]; then \
		echo "No version specified. Using current version: $(EXTRACTED_VERSION)"; \
	else \
		$(MAKE) update-version VER=$(VER); \
	fi

## Initialize Docker buildx for multi-platform builds
init-buildx:
	@echo "=== Initializing Docker Buildx ==="
	docker buildx create --name ddbot-builder --use || true
	docker buildx inspect --bootstrap

## Set version, build and push multi-platform image
release: set-version init-buildx
	@echo "=== Building and Pushing Multi-Platform Image ==="
	docker buildx build --push --platform $(PLATFORMS) $(TAGS) .

	@if [ -z "$(VER)" ]; then \
		echo "🚀 Release complete for version $(EXTRACTED_VERSION)"; \
	else \
		echo "🚀 Release complete for version $(VER)"; \
	fi

## Tag an existing multi-arch image
tag:
	@if [ -z "$(TAG)" ]; then \
		echo "TAG not specified. Usage: make tag TAG=1.0 FROM=latest"; exit 1; \
	fi
	@if [ -z "$(FROM)" ]; then \
		echo "FROM not specified. Usage: make tag TAG=1.0 FROM=latest"; exit 1; \
	fi
	docker buildx imagetools create -t $(IMAGE_NAME):$(TAG) $(IMAGE_NAME):$(FROM)
	@echo "🏷️  Tagged $(IMAGE_NAME):$(FROM) as $(IMAGE_NAME):$(TAG)"

## Copy settings.example.json to settings/settings.json if it doesn't exist
init-settings:
	@echo "=== Initializing Settings ==="
	@if [ ! -f "settings/settings.json" ]; then \
		mkdir -p settings; \
		cp settings.example.json settings/settings.json; \
		echo "✅ Created settings/settings.json from template"; \
	else \
		echo "⚠️ settings/settings.json already exists"; \
	fi

## Clean up Docker resources
clean:
	@echo "=== Cleaning Docker Resources ==="
	docker system prune -f
	@echo "✅ Docker resources cleaned"

# Include environment variables from .env file if it exists
-include .env
export

## Trigger Portainer webhook to update a stack
portainer-update:
	@if [ ! -f ".env" ]; then \
		echo "❌ Error: .env file not found"; \
		exit 1; \
	fi
	@echo "=== Loading environment variables ==="
	@if [ -z "$$WEBHOOK_URL" ]; then \
		echo "❌ Error: WEBHOOK_URL not found in .env file"; \
		exit 1; \
	fi
	@if [ -z "$$CF_ACCESS_CLIENT_ID" ]; then \
		echo "❌ Error: CF_ACCESS_CLIENT_ID not found in .env file"; \
		exit 1; \
	fi
	@if [ -z "$$CF_ACCESS_CLIENT_SECRET" ]; then \
		echo "❌ Error: CF_ACCESS_CLIENT_SECRET not found in .env file"; \
		exit 1; \
	fi
	@echo "=== Triggering Portainer Webhook ==="
	@echo "Webhook URL: $$WEBHOOK_URL"
	
	@if [ "$(DEBUG)" = "true" ]; then \
		echo "🔍 DEBUG MODE: Not sending actual request"; \
		echo "Would execute: curl -X POST $$WEBHOOK_URL -H \"CF-Access-Client-Id: $$CF_ACCESS_CLIENT_ID\" -H \"CF-Access-Client-Secret: $$CF_ACCESS_CLIENT_SECRET\""; \
		exit 0; \
	fi
	
	@if [ "$(VERBOSE)" = "true" ]; then \
		echo "🔍 Running in verbose mode"; \
		curl -X POST "$$WEBHOOK_URL" \
			-H "Content-Type: application/json" \
			-H "CF-Access-Client-Id: $$CF_ACCESS_CLIENT_ID" \
			-H "CF-Access-Client-Secret: $$CF_ACCESS_CLIENT_SECRET" \
			-v; \
		echo ""; \
	else \
		curl -X POST "$$WEBHOOK_URL" \
			-H "Content-Type: application/json" \
			-H "CF-Access-Client-Id: $$CF_ACCESS_CLIENT_ID" \
			-H "CF-Access-Client-Secret: $$CF_ACCESS_CLIENT_SECRET" \
			--fail --show-error && \
			echo "✅ Portainer webhook triggered successfully" || \
			echo "❌ Failed to trigger Portainer webhook"; \
	fi

## Release and update Portainer stack
release-and-deploy: release
	@if [ -z "$(WEBHOOK_URL)" ]; then \
		echo "⚠️ Warning: WEBHOOK_URL not specified, skipping deployment"; \
		echo "To update Portainer stack: make release-and-deploy WEBHOOK_URL=https://portainer.example.com/api/webhooks/xxxxxxxx"; \
	else \
		$(MAKE) portainer-update WEBHOOK_URL=$(WEBHOOK_URL); \
	fi

## Test the Portainer webhook connection without triggering actual update
test-webhook:
	@if [ -z "$(WEBHOOK_URL)" ]; then \
		echo "❌ Error: WEBHOOK_URL not specified."; \
		echo "Usage: make test-webhook WEBHOOK_URL=https://portainer.example.com/api/webhooks/xxxxxxxx"; \
		exit 1; \
	fi
	@echo "=== Testing Portainer Webhook Connection ==="
	@echo "Webhook URL: $(WEBHOOK_URL)"
	@echo "Testing connectivity to Portainer..."
	@webhook_host=$$(echo "$(WEBHOOK_URL)" | sed -E 's|https?://([^/]+)/.*|\1|'); \
	echo "Webhook host: $$webhook_host"; \
	curl -s -o /dev/null -w "HTTP Status: %{http_code}\nResponse time: %{time_total}s\n" \
		"https://$$webhook_host" || echo "⚠️ Could not connect to Portainer host"
	@echo ""
	@echo "To trigger the webhook for real, run:"
	@echo "  make portainer-update WEBHOOK_URL=$(WEBHOOK_URL)"
	@echo ""
	@echo "To see full request/response details:"
	@echo "  make portainer-update WEBHOOK_URL=$(WEBHOOK_URL) VERBOSE=true"

## Run advanced webhook debugging script
webhook-debug:
	@if [ -z "$(WEBHOOK_URL)" ]; then \
		echo "❌ Error: WEBHOOK_URL not specified."; \
		echo "Usage: make webhook-debug WEBHOOK_URL=https://portainer.example.com/api/webhooks/xxxxxxxx"; \
		exit 1; \
	fi
	@if [ ! -f "scripts/webhook-debug.sh" ]; then \
		echo "❌ Error: webhook-debug.sh script not found in scripts directory"; \
		exit 1; \
	fi
	@echo "=== Running Advanced Webhook Debugging ==="
	@chmod +x scripts/webhook-debug.sh
	@scripts/webhook-debug.sh $(if $(VERBOSE),--verbose,) $(if $(DEBUG),--debug,) "$(WEBHOOK_URL)"

## Show available commands
help:
	@echo "=== docker-discord-bot Makefile Commands ==="
	@echo "Available targets:"
	@grep -E '^## .*' $(MAKEFILE_LIST) | sed -E 's/## (.*)/\1/' | sort
	@echo ""
	@echo "Examples:"
	@echo "  make build                    # Build for current platform"
	@echo "  make set-version VER=1.2.3    # Update version in package.json"
	@echo "  make release VER=1.2.3        # Build and push a new release"
	@echo "  make dev                      # Start development server with docker-compose"
	@echo ""
	@echo "  # Portainer webhook commands:"
	@echo "  make portainer-update WEBHOOK_URL=https://...   # Trigger Portainer webhook"
	@echo "  make test-webhook WEBHOOK_URL=https://...        # Test basic webhook connectivity"
	@echo "  make webhook-debug WEBHOOK_URL=https://...       # Advanced webhook debugging"
	@echo "  make portainer-update WEBHOOK_URL=https://... VERBOSE=true   # Show detailed request/response"
	@echo "  make portainer-update WEBHOOK_URL=https://... DEBUG=true     # Dry-run without sending request"
	@echo "  make release-and-deploy VER=1.2.3 WEBHOOK_URL=https://...    # Release and update Portainer"
	@echo "  make test-webhook WEBHOOK_URL=https://...   # Test Portainer webhook connection"
	@echo "  make webhook-debug WEBHOOK_URL=https://...   # Run advanced webhook debugging script"
