FROM 0.10-slim

MAINTAINER Humanitarian OpenStreetMap Team

ENV HOME /app
ENV PORT 8000

RUN useradd \
  --home /app \
  --system

USER oam
WORKDIR /app

COPY package.json /app/

RUN npm install --unsafe-perm

COPY . /app/

ENTRYPOINT ["npm"]
