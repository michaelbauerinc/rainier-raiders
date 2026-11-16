COMPOSE ?= docker compose

.DEFAULT_GOAL := help
.PHONY: help website\:dev website\:down website\:logs website\:shell website\:db website\:migrate website\:check website\:build

help:
	@printf '%s\n' \
	  'make website:dev      Start Postgres, migrate, and run Next.js with hot reload' \
	  'make website:down     Stop local containers; preserve database data' \
	  'make website:logs     Follow website logs' \
	  'make website:shell    Open a shell in the website container' \
	  'make website:db       Start only local Postgres' \
	  'make website:migrate  Apply database migrations' \
	  'make website:check    Run lint, type checks, tests, and a production build' \
	  'make website:build    Build the production website image'

website\:dev:
	$(COMPOSE) up --build website

website\:down:
	$(COMPOSE) down

website\:logs:
	$(COMPOSE) logs --follow website

website\:shell:
	$(COMPOSE) exec website sh

website\:db:
	$(COMPOSE) up --detach postgres

website\:migrate:
	$(COMPOSE) run --build --rm website pnpm db:migrate

website\:check:
	$(COMPOSE) run --build --rm website pnpm check

website\:build:
	docker build -f apps/website/Dockerfile -t rainier-raiders-website:local .
