WORKER_DOCKER_IMAGE = oam/server-worker:latest
API_DOCKER_IMAGE = oam/server-api:latest

all: api worker

worker:
	@docker build -f ./worker/Dockerfile -t $(WORKER_DOCKER_IMAGE) ./worker

api:
	@docker build -f ./api/Dockerfile -t $(API_DOCKER_IMAGE) ./api


start-worker: worker
	@docker run \
		--detach \
		--name oam-server-worker \
		--publish 8000:8000 \
		--volume $(PWD)/worker:/app \
		$(WORKER_DOCKER_IMAGE) start

start-api: api
	@docker run \
		--detach \
		--name oam-server-api \
		--publish 8000:8000 \
		--volume $(PWD)/api:/app \
		$(API_DOCKER_IMAGE) start

test: start-api
	@sleep 1

	@docker run \
		--rm \
		--name oam-server-api-test \
		--link oam-server-api:oam-server-api \
		--volume $(PWD)/api:/app \
		$(API_DOCKER_IMAGE) test

	@docker kill oam-server-api >> /dev/null
	@docker rm oam-server-api >> /dev/null

clean-api:
	@docker kill oam-server-api >> /dev/null 2>&1 || true
	@docker rm oam-server-api >> /dev/null 2>&1 || true

clean-worker:
	@docker kill oam-server-worker >> /dev/null 2>&1 || true
	@docker rm oam-server-worker >> /dev/null 2>&1 || true


clean: clean-api clean-worker


.PHONY: all worker api start-api start-worker test clean-worker clean-api clean
