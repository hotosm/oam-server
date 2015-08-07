FROM node:0.10-slim

MAINTAINER Humanitarian OpenStreetMap Team

ENV HOME /app
ENV PORT 8000

RUN mkdir -p /app

RUN useradd \
  --home-dir /app \
  --system \
  --user-group \
  oam \
  && chown -R oam:oam /app

USER oam
WORKDIR /app

COPY . /app/
RUN npm install

ENTRYPOINT ["npm"]
