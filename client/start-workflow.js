"use strict";

var crypto = require("crypto");

var AWS = require("aws-sdk");

module.exports = function(region, domain, workflowName, workflowVersion, taskList, input) {
  AWS.config.update({
    region: region || "us-west-2"
  });

  var swf = new AWS.SWF();

  // hash the attributes to give us predictable activity ids
  // NOTE: also prevents duplicate activities
  var hashStream = crypto.createHash("sha512"),
      attrs = {
        domain: domain,
        workflowType: {
          name: workflowName,
          version: workflowVersion
        },
        taskList: {
          name: taskList
        },
        input: JSON.stringify(input),
        executionStartToCloseTimeout: "1800", // 30 minutes
        taskStartToCloseTimeout: "120", // 2 minutes
        childPolicy: "TERMINATE"
        // TODO tagList
        // TODO taskPriority
      };

  hashStream.end(JSON.stringify(attrs));
  attrs.workflowId = hashStream.read().toString("hex");

  swf.startWorkflowExecution(attrs, function(err, data) {
    if (err) {
      throw err;
    }

    console.log("domain:", attrs.domain);
    console.log("workflowId:", attrs.workflowId);
    console.log("Response:", data);
  });
};
