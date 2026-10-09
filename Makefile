# Makefile for Docker multi-platform build & version management

IMAGE_NAME=anshuljkt1/docker-discord-bot
VERSION_FILE=package.json

# Read the version straight from package.json via node (already a project dep).
# Override on the CLI: make release VER=1.2.3
EXTRACTED_VERSION ?= $(shell node -p "require('./$(VERSION_FILE)').version")

# Git metadata for OCI labels. Falls back to 'unknown' outside a git tree.
GIT_SHA   ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
GIT_DIRTY ?= $(shell git diff --quiet 2>/dev/null || echo -dirty)
BUILD_DATE ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)

# OCI image labels for provenance (visible in Docker Hub, Portainer, `docker inspect`).
LABELS=\
  --label org.opencontainers.image.title="docker-discord-bot" \
  --label org.opencontainers.image.version="$(EXTRACTED_VERSION)" \
  --label org.opencontainers.image.revision="$(GIT_SHA)$(GIT_DIRTY)" \
  --label org.opencontainers.image.created="$(BUILD_DATE)" \
  --label org.opencontainers.image.source="https://github.com/anshuljkt1/dd-bot-js"

# Extra tags can be passed as: make build EXTRA_TAGS="--tag $(IMAGE_NAME):prod"
EXTRA_TAGS ?=
TAGS=--tag $(IMAGE_NAME):latest --tag $(IMAGE_NAME):$(EXTRACTED_VERSION) $(EXTRA_TAGS)
PLATFORMS=linux/amd64,linux/arm64

.PHONY: build dev set-version release tag debug-version debug-build init-buildx init-settings clean help portainer-update test-webhook webhook-debug release-and-deploy deps-sync deps-outdated deps-update check-clean

## Debug target to show version extraction
debug-version:
	@echo "=== Version Debug ==="
	@echo "VERSION_FILE: $(VERSION_FILE)"
	@echo "Extracted version: $(EXTRACTED_VERSION)"
	@echo "Git SHA:           $(GIT_SHA)$(GIT_DIRTY)"
	@echo "Build date:        $(BUILD_DATE)"

## Debug build configuration
debug-build:
	@echo "=== Build Configuration ==="
	@echo "IMAGE_NAME: $(IMAGE_NAME)"
	@echo "EXTRACTED_VERSION: $(EXTRACTED_VERSION)"
	@echo "TAGS: $(TAGS)"

## Sync package-lock.json with package.json (run after editing deps).
deps-sync:
	@echo "=== Syncing package-lock.json ==="
	npm install

## Show dependencies with newer versions available (read-only).
deps-outdated:
	@echo "=== Outdated dependencies ==="
	@npm outdated || true

## Apply safe (in-range) dependency updates; list any out-of-range majors that need manual review.
deps-update:
	@echo "=== Applying in-range updates ==="
	npm update
	@echo ""
	@echo "=== Out-of-range (major) updates needing manual review ==="
	@npm outdated --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s||"{}");const k=Object.keys(o);if(!k.length){console.log("  \u2713 none");return}for(const n of k){const e=Array.isArray(o[n])?o[n][0]:o[n];console.log(`  $${n}: $${e.current} -> $${e.latest} (wanted $${e.wanted})`)}})' || true
	@echo ""
	@echo "→ Run audits/tests, then commit package.json + package-lock.json."

## Guard: fail if the git working tree has uncommitted changes.
check-clean:
	@if ! git diff --quiet || ! git diff --cached --quiet; then \
		echo "❌ Refusing to release: git working tree is dirty."; \
		echo "   Commit or stash your changes first, then re-run."; \
		git status --short; \
		exit 1; \
	fi

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

## Set version, sync lockfile, verify clean tree, then build and push multi-platform image
## Order: check-clean (fail fast on WIP) -> set-version -> deps-sync -> build.
## After release, commit + tag the version bump:
##   git add package.json package-lock.json && git commit -m "release vX.Y.Z" && git tag vX.Y.Z
release: check-clean set-version deps-sync init-buildx
	@echo "=== Building and Pushing Multi-Platform Image ==="
	@echo "Version: $(EXTRACTED_VERSION)  Commit: $(GIT_SHA)$(GIT_DIRTY)  Date: $(BUILD_DATE)"
	docker buildx build --push --platform $(PLATFORMS) $(TAGS) $(LABELS) .

	@echo ""
	@echo "🚀 Release complete for version $(EXTRACTED_VERSION)"
	@echo "→ Don't forget: git add package.json package-lock.json && git commit -m 'release v$(EXTRACTED_VERSION)' && git tag v$(EXTRACTED_VERSION)"

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

## Trigger Portainer webhook to update a stack (local network - no Cloudflare Access)
portainer-update-local:
	@echo "=== Checking environment variables ==="
	@if [ -z "$$WEBHOOK_URL_LOCAL" ]; then \
		if [ ! -f ".env" ]; then \
			echo "❌ Error: WEBHOOK_URL_LOCAL not provided and .env file not found"; \
			echo "Either provide WEBHOOK_URL_LOCAL directly or create a .env file"; \
			echo "Usage: make portainer-update-local WEBHOOK_URL_LOCAL=http://192.168.1.100:9000/api/webhooks/xxxxxxxx"; \
			exit 1; \
		else \
			echo "❌ Error: WEBHOOK_URL_LOCAL not found in .env file"; \
			exit 1; \
		fi; \
	fi
	
	@echo "=== Triggering Local Portainer Webhook ==="
	@echo "Local Webhook URL: $$WEBHOOK_URL_LOCAL"
	
	@if [ "$(DEBUG)" = "true" ]; then \
		echo "🔍 DEBUG MODE: Not sending actual request"; \
		echo "Would execute: curl -k -X POST $$WEBHOOK_URL_LOCAL"; \
		exit 0; \
	fi
	
	@if [ "$(VERBOSE)" = "true" ]; then \
		echo "🔍 Running in verbose mode"; \
		curl -k -X POST "$$WEBHOOK_URL_LOCAL" \
			-H "Content-Type: application/json" \
			-v; \
		echo ""; \
	else \
		curl -k -X POST "$$WEBHOOK_URL_LOCAL" \
			-H "Content-Type: application/json" \
			--fail --show-error && \
			echo "✅ Local Portainer webhook triggered successfully" || \
			echo "❌ Failed to trigger local Portainer webhook"; \
	fi

## Trigger Portainer webhook to update a stack
portainer-update:
	@echo "=== Checking environment variables ==="
	@if [ -z "$$WEBHOOK_URL" ]; then \
		if [ ! -f ".env" ]; then \
			echo "❌ Error: WEBHOOK_URL not provided and .env file not found"; \
			echo "Either provide WEBHOOK_URL directly or create a .env file"; \
			exit 1; \
		else \
			echo "❌ Error: WEBHOOK_URL not found in .env file"; \
			exit 1; \
		fi; \
	fi
	
	@if [ -z "$$CF_ACCESS_CLIENT_ID" ] || [ -z "$$CF_ACCESS_CLIENT_SECRET" ]; then \
		echo "❌ Error: Cloudflare Access credentials missing"; \
		echo "Required: CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET"; \
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
	@if [ -z "$$WEBHOOK_URL" ]; then \
		echo "⚠️ Warning: WEBHOOK_URL not specified, skipping deployment"; \
		echo "To update Portainer stack: WEBHOOK_URL=https://... make release-and-deploy"; \
		echo "See docs/AUTHENTICATION.md for more details"; \
	else \
		$(MAKE) portainer-update; \
	fi

## Shorthand for release and update Portainer stack
release-port: release portainer-update

## Shorthand for release and update Portainer stack (local network)
release-port-local: release portainer-update-local


## make the local Portainer webhook connection without triggering actual update
test-webhook-local:
	@echo "=== Checking environment variables ==="
	@if [ -z "$$WEBHOOK_URL_LOCAL" ]; then \
		if [ ! -f ".env" ]; then \
			echo "❌ Error: WEBHOOK_URL_LOCAL not provided and .env file not found"; \
			echo "Usage: make test-webhook-local WEBHOOK_URL_LOCAL=http://192.168.1.100:9000/api/webhooks/xxxxxxxx"; \
			exit 1; \
		else \
			echo "❌ Error: WEBHOOK_URL_LOCAL not found in .env file"; \
			exit 1; \
		fi; \
	fi
	
	@echo "=== Testing Local Portainer Webhook Connection ==="
	@echo "Local Webhook URL: $$WEBHOOK_URL_LOCAL"
	@echo "Testing connectivity to local Portainer..."
	@webhook_host=$$(echo "$$WEBHOOK_URL_LOCAL" | sed -E 's|https?://([^/]+)/.*|\1|'); \
	echo "Webhook host: $$webhook_host"; \
	curl -s -o /dev/null -w "HTTP Status: %{http_code}\nResponse time: %{time_total}s\n" \
		"http://$$webhook_host" || echo "⚠️ Could not connect to local Portainer host"
	@echo ""
	@echo "To trigger the local webhook for real, run:"
	@echo "  make portainer-update-local"
	@echo ""
	@echo "To see full request/response details:"
	@echo "  make portainer-update-local VERBOSE=true"

## Test the Portainer webhook connection without triggering actual update
test-webhook:
	@echo "=== Checking environment variables ==="
	@if [ -z "$$WEBHOOK_URL" ]; then \
		if [ ! -f ".env" ]; then \
			echo "❌ Error: WEBHOOK_URL not provided and .env file not found"; \
			echo "Usage: make test-webhook WEBHOOK_URL=https://portainer.example.com/api/webhooks/xxxxxxxx"; \
			exit 1; \
		else \
			echo "❌ Error: WEBHOOK_URL not found in .env file"; \
			exit 1; \
		fi; \
	fi
	
	@echo "=== Testing Portainer Webhook Connection ==="
	@echo "Webhook URL: $$WEBHOOK_URL"
	@echo "Testing connectivity to Portainer..."
	@webhook_host=$$(echo "$$WEBHOOK_URL" | sed -E 's|https?://([^/]+)/.*|\1|'); \
	echo "Webhook host: $$webhook_host"; \
	curl -s -o /dev/null -w "HTTP Status: %{http_code}\nResponse time: %{time_total}s\n" \
		"https://$$webhook_host" || echo "⚠️ Could not connect to Portainer host"
	@echo ""
	@echo "To trigger the webhook for real, run:"
	@echo "  make portainer-update"
	@echo ""
	@echo "To see full request/response details:"
	@echo "  make portainer-update VERBOSE=true"

## Run advanced webhook debugging script
webhook-debug:
	@echo "=== Checking environment variables ==="
	@if [ -z "$$WEBHOOK_URL" ]; then \
		if [ ! -f ".env" ]; then \
			echo "❌ Error: WEBHOOK_URL not provided and .env file not found"; \
			echo "Usage: make webhook-debug WEBHOOK_URL=https://portainer.example.com/api/webhooks/xxxxxxxx"; \
			exit 1; \
		else \
			echo "❌ Error: WEBHOOK_URL not found in .env file"; \
			exit 1; \
		fi; \
	fi
	
	@if [ ! -f "scripts/webhook-debug.sh" ]; then \
		echo "❌ Error: webhook-debug.sh script not found in scripts directory"; \
		exit 1; \
	fi
	
	@echo "=== Running Advanced Webhook Debugging ==="
	@chmod +x scripts/webhook-debug.sh
	@scripts/webhook-debug.sh $(if $(VERBOSE),--verbose,) $(if $(DEBUG),--debug,) \
		--cf-id "$$CF_ACCESS_CLIENT_ID" --cf-secret "$$CF_ACCESS_CLIENT_SECRET" \
		"$$WEBHOOK_URL"

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
	@echo "  # Portainer webhook commands (Cloudflare Access authentication):"
	@echo "  # First set environment variables (in .env file or export them):"
	@echo "  #   WEBHOOK_URL=https://portainer.example.com/api/webhooks/xxxxxxxx"
	@echo "  #   CF_ACCESS_CLIENT_ID=your_cloudflare_access_client_id"
	@echo "  #   CF_ACCESS_CLIENT_SECRET=your_cloudflare_access_client_secret"
	@echo "  # Then run the commands:"
	@echo "  make portainer-update         # Trigger Portainer webhook"
	@echo "  make test-webhook             # Test basic webhook connectivity"
	@echo "  make webhook-debug            # Advanced webhook debugging"
	@echo "  make portainer-update VERBOSE=true   # Show detailed request/response"
	@echo "  make portainer-update DEBUG=true     # Dry-run without sending request"
	@echo "  make release-and-deploy VER=1.2.3    # Release and update Portainer"
	@echo "  make release-port VER=1.2.3          # Release and update Portainer (shorthand)"
	@echo ""
	@echo "  # Local network Portainer webhook commands (no authentication required):"
	@echo "  # Set WEBHOOK_URL_LOCAL in .env file or export it:"
	@echo "  #   WEBHOOK_URL_LOCAL=http://192.168.1.100:9000/api/webhooks/xxxxxxxx"
	@echo "  # Then run the commands:"
	@echo "  make portainer-update-local   # Trigger local Portainer webhook"
	@echo "  make test-webhook-local       # Test local webhook connectivity"
	@echo "  make release-port-local VER=1.2.3    # Release and update local Portainer"
	@echo ""
	@echo "  # See docs/AUTHENTICATION.md for more information on authentication"
