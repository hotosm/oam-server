# OpenAerialMap Server

[![Join the chat at https://gitter.im/hotosm/oam-server](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/hotosm/oam-server?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![Docker Repository on Quay.io](https://quay.io/repository/hotosm/oam-tiler-api/status "Docker Repository on Quay.io")](https://quay.io/repository/hotosm/oam-tiler-api)

## Usage

The main avenue for developing against the OpenAerialMap (OAM) server is via Docker. To get started, ensure that you have a [working Docker environment](https://docs.docker.com/machine/), with version `>=1.7`. In addition, all interactions with Docker and NPM are wrapped within a `Makefile`.

In order to build the server image, use the `client` target:

```bash
$ make api
Sending build context to Docker daemon  7.68 kB
Sending build context to Docker daemon

...

Successfully built e2666914b094
```

From there, you can start the server using the `start` target:

```bash
$ make start-api
b1d7b15d68632883ba81c6098719036caf3c4e23dff964666a42d736bee96a33
$ docker ps
CONTAINER ID        IMAGE                   COMMAND             CREATED             STATUS              PORTS                    NAMES
b1d7b15d6863        oam/server-api:latest   "npm start"         19 seconds ago      Up 16 seconds       0.0.0.0:8000->8000/tcp   oam-server-api
```

## Testing

To execute the test suite, use the `test` target:

```bash
$ make test
7d10c9d66f7b33d0f2b6b16fe2fc94df41440cb395ab24e8be91d3b397257fe4

> oam-server@0.1.0 test /app
> node test.js

Checking http://oam-server:8000/tile
200 {"test":"test"}
```

**Note**: For the `start` and `test` targets, contents within the `server` directory gets mounted inside of the container via a volume to ensure that the latest code changes are being tested.
