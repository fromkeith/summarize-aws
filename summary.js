var AWS = require("aws-sdk"),
    deferred = require('deferred'),
    jade = require("jade"),
    fs   = require('fs'),
    elb = require("./elb"),
    swf = require("./swf"),
    sqs = require("./sqs"),
    cw = require("./cw");

function summarize(config) {
    var toRender = [],
        waitFor = {
            "SQS": true,
            "SWF": true,
            "ELB": true,
            "CW": true
        },
        jadeFile = config.jade || "summary.jade",
        outFile = config.out || "summary.html";

    function renderResult() {
        var html = jade.renderFile(jadeFile, {
            pretty: true,
            results: toRender
        });
        fs.writeFileSync(outFile, html);
    }



    function checkResult(what, res) {
        var i, keys;
        if (res !== undefined && res.length > 0) {
            toRender = toRender.concat(res);
        }
        waitFor[what] = false;
        keys = Object.keys(waitFor);
        for (i = 0; i < keys.length; i++) {
            if (waitFor[keys[i]]) {
                return;
            }
        }
        renderResult();
    }

    if (config.CW !== undefined) {
        cw.summarizeCloudWatch(config).done(function (data) {
            checkResult("CW", data);
        }, function (err) {
            console.log("CW-err" + err);
            checkResult("CW")
        });
    } else {
        checkResult("CW");
    }


    if (config.ELB !== undefined) {
        elb.summarizeElb(config).done(function (data) {
            checkResult("ELB", data);
        }, function (err) {
            console.log("ELB-err" + err);
            checkResult("ELB")
        });
    } else {
        checkResult("ELB");
    }

    if (config.SQS !== undefined) {
        sqs.summarizeSqs(config).done(function (data) {
            checkResult("SQS", data);
        }, function (err) {
            console.log("SQS-err" + err);
            checkResult("SQS")
        });
    } else {
        checkResult("SQS");
    }

    if (config.SWF !== undefined) {
        swf.summarizeSwf(config).done(function (data) {
            checkResult("SWF", data);
        }, function (err) {
            console.log("SWF-err" + err);
            checkResult("SWF")
        });
    } else {
        checkResult("SWF");
    }
}

module.exports.summarize = summarize;