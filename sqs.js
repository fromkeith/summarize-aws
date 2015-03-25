var AWS = require("aws-sdk"),
    deferred = require('deferred'),
    cwbased = require("./cwbased");

(function () {
    "use strict";
    function summarizeSqsViaCloudwatch(tz, sqsConfig) {
        var cw = new AWS.CloudWatch(tz),
            params = {
                Namespace: "AWS/SQS",
                Dimensions: [
                    {
                        Name: "QueueName"
                    }
                ]
            },
            finalRes = deferred(),
            cwHelper = new cwbased.CloudWatchBased(tz);

        function metricNameFilter(metric) {
            if (metric.MetricName.match(sqsConfig.metricNameRegex) !== null) {
                return true;
            }
            return false;
        }

        function queueNameFilter(metric) {
            var i;
            if (!metricNameFilter(metric)) {
                return false;
            }
            for (i = 0; i < metric.Dimensions.length; i++) {
                if (metric.Dimensions[i].Name === "QueueName") {
                    if (metric.Dimensions[i].Value.match(sqsConfig.queueNameRegex) !== null) {
                        return true;
                    }
                }
            }
            return false;
        }

        cwbased.getListOfMetrics(cw, params, queueNameFilter, tz).done(function (metricList) {

            cwHelper.getMetrics(cw, sqsConfig.timeRange, sqsConfig.metricPeriod, metricList.Metrics, {}).done(function (data) {
                var summedResult;
                summedResult = cwHelper.summarize('sqs.summary', sqsConfig.timeRange, data,
                    {
                        getMetricCategory: function (met) {
                            return met.Dimensions[0].Value;
                        },
                        createCategory: function (met) {
                            return {Name: met.Dimensions[0].Value};
                        },
                        nameFormatter: sqsConfig.nameFormatter
                    });
                summedResult.done(function (res) {
                    finalRes.resolve([res]);
                });
            }, function (err) {
                finalRes.reject(err);
            });
        }, function (err) {
            finalRes.reject(err);
        });

        return finalRes.promise;
    }

    function summarizeSqs(config) {
        var results = [],
            i,
            j,
            finalRes = deferred(),
            finalData = [],
            numToWait = 0;

        function checkDone() {
            numToWait--;
            if (numToWait <= 0) {
                finalRes.resolve(finalData);
            }
        }
        function sqsResultHandle(data) {
            finalData = finalData.concat(data);
            checkDone();
        }
        function sqsFailHandle(err) {
            console.log("Err " + JSON.stringify(err));
            checkDone();
        }

        if (config.SQS.summary !== undefined) {
            for (j = 0; j < config.SQS.summary.length; j++) {
                results.push(summarizeSqsViaCloudwatch(config.TimeZone, config.SQS.summary[j]));
            }
        }
        numToWait = results.length;

        for (i = 0; i < results.length; i++) {
            results[i].done(sqsResultHandle, sqsFailHandle);
        }

        return finalRes.promise;
    }

    module.exports.summarizeSqs = summarizeSqs;
}());