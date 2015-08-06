## OAM Server component

[![Join the chat at https://gitter.im/hotosm/oam-server](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/hotosm/oam-server?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

### Setup

In `server` directory

- `$ npm install`

or, if building the docker image,

`$ docker build -t openaerialmap/server .`

### Usage

In `server` directory

`$ npm start`

or, if running in a docker container,

`$ docker run -p 8000:8000 -it openaerialmap/server npm start`

### Test

After server is started,

`$ node test.js`
