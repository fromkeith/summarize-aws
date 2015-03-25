var jade = require("jade"),
    fs   = require('fs'),
    elb = require("./elb"),
    swf = require("./swf"),
    sqs = require("./sqs"),
    cw = require("./cw"),
    ses = require("./ses"),
    async = require("async");

(function () {
    "use strict";
    function summarize(config) {
        var jadeFile = config.jade || "summary.jade",
            outFile = config.out || "summary.html";


        async.parallel([
            function doCw(done) {
                if (!config.CW) {
                    done(null, []);
                    return;
                }
                cw.summarizeCloudWatch(config).done(function (data) {
                    done(null, data);
                }, function (err) {
                    console.log("CW-err" + err);
                    done(err);
                });
            },
            function doElb(done) {
                if (!config.ELB) {
                    done(null, []);
                    return;
                }
                elb.summarizeElb(config).done(function (data) {
                    done(null, data);
                }, function (err) {
                    console.log("ELB-err" + err);
                    done(err);
                });
            },
            function doSQs(done) {
                if (!config.SQS) {
                    done(null, []);
                    return;
                }
                sqs.summarizeSqs(config).done(function (data) {
                    done(null, data);
                }, function (err) {
                    console.log("SQS-err" + err);
                    done(err);
                });
            },
            function doSwf(done) {
                if (!config.SWF) {
                    done(null, []);
                    return;
                }
                swf.summarizeSwf(config).done(function (data) {
                    done(null, data);
                }, function (err) {
                    console.log("SWF-err" + err);
                    done(err, []);
                });
            },
            function doSes(done) {
                if (!config.SES) {
                    done(null, []);
                    return;
                }
                ses.summarizeSes(config, done);
            }
        ],
        function (err, results) {
            var toRender, i, j, html;
            if (err) {
                console.log("Error: " + err);
                return;
            }
            toRender = [];
            for (i = 0; i < results.length; i++) {
                for (j = 0; j < results[i].length; j++) {
                    toRender.push(results[i][j]);
                }
            }
            html = jade.renderFile(jadeFile, {
                pretty: true,
                results: toRender
            });
            fs.writeFileSync(outFile, html);
        });

    }

    module.exports.summarize = summarize;
}());