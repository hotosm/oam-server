var express = require('express'),
    morgan = require("morgan"),
    bodyParser = require('body-parser');

var app = express().disable("x-powered-by");

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

app.use(bodyParser.json());

app.get('/', function(req, res) {
  res.send('pong');
});

app.post('/metadata', function(req, res){
  console.log(req.body);
  res.setHeader('Content-Type', 'text/plain');
  res.write('you posted:\n');
  res.end(JSON.stringify(req.body, null, 2));
});

app.listen(8000, function() {
  console.log("Listening at http://%s:%d/", this.address().address, this.address().port);
});

