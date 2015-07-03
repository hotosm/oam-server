FROM node:0.10

RUN \
  useradd -d /app -m oam

USER oam
ENV HOME /app
WORKDIR /app

ADD package.json /app/

RUN \
  npm install

ADD . /app/

VOLUME ["/app"]
EXPOSE 8000
