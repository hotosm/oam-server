FROM node:0.10-slim

MAINTAINER Humanitarian OpenStreetMap Team

ENV HOME /app
ENV PORT 8000

RUN mkdir -p /app /npm_modules/api
WORKDIR /npm_modules/api

COPY package.json /npm_modules/api/

RUN npm install

RUN useradd \
  --home-dir /app \
  --system \
  --user-group \
  oam \
  && chown -R oam:oam /app

USER oam
WORKDIR /app

COPY . /app/

ENTRYPOINT ["npm"]
