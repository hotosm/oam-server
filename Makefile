DOCKER_IMAGE = oam/server:latest

all: server

server:
	@docker build -f ./server/Dockerfile -t $(DOCKER_IMAGE) ./server

start: server
	@docker run \
		--detach \
		--name oam-server \
		--publish 8000:8000 \
		--volume $(PWD)/server:/app \
		$(DOCKER_IMAGE) start

test: start
	@sleep 1

	@docker run \
		--rm \
		--name oam-server-test \
		--link oam-server:oam-server \
		--volume $(PWD)/server:/app \
		$(DOCKER_IMAGE) test

	@docker kill oam-server >> /dev/null
	@docker rm oam-server >> /dev/null

clean:
	@docker kill oam-server >> /dev/null 2>&1 || true
	@docker rm oam-server >> /dev/null 2>&1 || true

.PHONY: all clean server start test
