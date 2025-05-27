# Makefile for Docker multi-platform build & version management

IMAGE_NAME=anshuljkt1/docker-discord-bot
VERSION_FILE=package.json

# Extract version from package.json
VERSION ?= $(shell grep -m 1 '"version"' $(VERSION_FILE) | sed -E 's/.*"version": "([0-9]+\.[0-9]+\.[0-9]+)".*/\1/')

# Extra tags can be passed as: make build EXTRA_TAGS="--tag $(IMAGE_NAME):prod"
EXTRA_TAGS ?=
TAGS=--tag $(IMAGE_NAME):latest --tag $(IMAGE_NAME):$(VERSION) $(EXTRA_TAGS)
PLATFORMS=linux/amd64,linux/arm64

.PHONY: build dev set-version release tag debug-version debug-build init-buildx init-settings clean help

## Debug target to show version extraction
debug-version:
	@echo "=== Version Debug ==="
	@echo "VERSION_FILE: $(VERSION_FILE)"
	@echo "Raw grep output:"
	@grep '"version"' $(VERSION_FILE)
	@echo "Extracted version:"
	@echo $(VERSION)

## Debug build configuration
debug-build:
	@echo "=== Build Configuration ==="
	@echo "IMAGE_NAME: $(IMAGE_NAME)"
	@echo "VERSION: $(VERSION)"
	@echo "TAGS: $(TAGS)"

## Build Docker image for current platform
build: debug-build
	@echo "=== Starting Build ==="
	@echo "Building version: $(VERSION)"
	docker build -t $(IMAGE_NAME):$(VERSION) -t $(IMAGE_NAME):latest .

## Run the development version with live reloading
dev:
	@echo "=== Starting Development Server ==="
	docker-compose -f docker-local-build-compose.yaml up

## Set the version in package.json
set-version:
	@if [ -z "$(NEW_VERSION)" ]; then \
		echo "NEW_VERSION not specified. Usage: make set-version NEW_VERSION=1.2.3"; exit 1; \
	fi
	@echo "=== Setting Version ==="
	@echo "Current version in file:"
	@grep '"version"' $(VERSION_FILE)
	@echo "Setting to version: $(NEW_VERSION)"
	# macOS/BSD vs GNU sed compatibility
	@if sed --version >/dev/null 2>&1; then \
		sed -i "s/\"version\": \".*\"/\"version\": \"$(NEW_VERSION)\"/" $(VERSION_FILE); \
	else \
		sed -i '' "s/\"version\": \".*\"/\"version\": \"$(NEW_VERSION)\"/" $(VERSION_FILE); \
	fi
	@echo "New version in file:"
	@grep '"version"' $(VERSION_FILE)
	@echo "✅ Updated version to $(NEW_VERSION) in $(VERSION_FILE)"

## Initialize Docker buildx for multi-platform builds
init-buildx:
	@echo "=== Initializing Docker Buildx ==="
	docker buildx create --name ddbot-builder --use || true
	docker buildx inspect --bootstrap

## Set version, build and push multi-platform image
release: set-version init-buildx
	@echo "=== Building and Pushing Multi-Platform Image ==="
	docker buildx build --push --platform $(PLATFORMS) $(TAGS) .
	@echo "🚀 Release complete for version $(NEW_VERSION)"

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

## Show available commands
help:
	@echo "=== docker-discord-bot Makefile Commands ==="
	@echo "Available targets:"
	@grep -E '^## .*' $(MAKEFILE_LIST) | sed -E 's/## (.*)/\1/' | sort
	@echo ""
	@echo "Examples:"
	@echo "  make build                    # Build for current platform"
	@echo "  make set-version NEW_VERSION=1.2.3  # Update version in package.json"
	@echo "  make release NEW_VERSION=1.2.3      # Build and push a new release"
	@echo "  make dev                      # Start development server with docker-compose"
