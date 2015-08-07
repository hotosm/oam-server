WORKER_DOCKER_IMAGE = oam/server-worker:latest
API_DOCKER_IMAGE = oam/server-api:latest
CLIENT_DOCKER_IMAGE = oam/server-client:latest

all: api worker client

worker:
	@docker build -f ./tiler-worker/Dockerfile -t $(WORKER_DOCKER_IMAGE) ./tiler-worker

api:
	@docker build -f ./api/Dockerfile -t $(API_DOCKER_IMAGE) ./api

client:
	@docker build -f ./client/Dockerfile -t $(CLIENT_DOCKER_IMAGE) ./client


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

test: start
	@sleep 1

	@docker run \
		--rm \
		--name oam-server-api-test \
		--link oam-server-api:oam-server-api \
		--volume $(PWD)/tiler-worker:/app \
		$(API_DOCKER_IMAGE) test

	@docker kill oam-server-api >> /dev/null
	@docker rm oam-server-api >> /dev/null

clean:
	@docker kill oam-server-api >> /dev/null 2>&1 || true
	@docker rm oam-server-api >> /dev/null 2>&1 || true

.PHONY: clean all start-api start-worker test
