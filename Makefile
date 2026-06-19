.DEFAULT_GOAL := help
COMPOSE := docker compose

help: ## list targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n",$$1,$$2}'

up: ## build + start router and the 3 mock APIs (single command)
	$(COMPOSE) up --build -d
	@echo "Router http://localhost:3000  |  mocks 18081/18082/18083"

demo: up seed ## up + seed a ready-made config wired to the mocks
	@echo "Try: curl -s localhost:3000/api/gw/all | jq"

seed: ## copy the demo router config into ./data/config.json
	cp test-apis/router-config.json data/config.json
	@echo "seeded data/config.json"

down: ## stop and remove containers
	$(COMPOSE) down

logs: ## tail container logs
	$(COMPOSE) logs -f

ps: ## container status
	$(COMPOSE) ps

test: ## run unit + integration tests (host node, no docker)
	npm test

dev: ## run the router in dev mode on the host
	npm run dev

clean: ## stop containers and remove local config
	$(COMPOSE) down -v
	rm -f data/config.json
