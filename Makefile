# SCIF Thesis Tracker — one entry point for the whole monorepo.
#
# Two workers (classifier/ Node, slack-bot/ Python) plus the Vite frontend.
# Each target shells into the relevant service so per-service tooling and env
# stay self-contained. Run `make help` to list targets.

CLASSIFIER_DIR := classifier
SLACK_BOT_DIR  := slack-bot
VENV           := $(SLACK_BOT_DIR)/venv

.DEFAULT_GOAL := help

.PHONY: help install install-classifier install-slack-bot install-frontend \
        classifier slack-bot frontend seed clean

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: install-classifier install-slack-bot install-frontend ## Install deps for every piece

install-classifier: ## Install Node deps for the classifier worker
	cd $(CLASSIFIER_DIR) && npm ci

install-slack-bot: ## Create venv and install Python deps for the Slack bot
	cd $(SLACK_BOT_DIR) && python -m venv venv \
		&& ./venv/bin/pip install -r requirements.txt

install-frontend: ## Install Node deps for the Vite frontend
	npm ci

classifier: ## Run the Node poller + classification agent + Slack notifier
	cd $(CLASSIFIER_DIR) && npm start

slack-bot: ## Run the Python Slack bot (Socket Mode)
	cd $(SLACK_BOT_DIR) && ./venv/bin/python main.py

frontend: ## Run the Vite dev server
	npm run dev

seed: ## Seed portfolio companies + theses into Supabase
	cd $(CLASSIFIER_DIR) && npm run seed

clean: ## Remove installed deps and the Python venv
	rm -rf $(CLASSIFIER_DIR)/node_modules node_modules $(VENV)
