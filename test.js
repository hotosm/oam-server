var request = require('request');

request.post({
    url: 'http://localhost:8000/metadata',
    method: 'POST',
    json: { test: "test" }
}, function (error, response, body) {
  if (!error && response.statusCode == 200) {
    console.log("%d %s", response.statusCode, body);
  } else {
    console.log(response.statusCode);
    console.log(error);

  }
});
