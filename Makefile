.PHONY: dev test build

dev:
	cd frontend && npm run dev

test:
	cd frontend && npm run test:ci

build:
	cd frontend && npm run build
