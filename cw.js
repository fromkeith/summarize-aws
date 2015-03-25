var AWS = require("aws-sdk"),
    deferred = require('deferred'),
    async = require("async"),
    cwbased = require("./cwbased");

(function () {
    "use strict";

    function summarizeCustomCloudwatch(tz, cw, cwConfig) {
        var params = {
                Namespace: cwConfig.namespace
            },
            finalRes = deferred(),
            cwHelper = new cwbased.CloudWatchBased(tz);
        if (cwConfig.region !== undefined) {
            cw = new AWS.CloudWatch({region: cwConfig.region});
        }

        function metricNameFilter(metric) {
            if (metric.MetricName.match(cwConfig.metricNameRegex) !== null) {
                return true;
            }
            return false;
        }

        if (cwConfig.dimensions !== undefined) {
            params.Dimensions = cwConfig.dimensions;
        }

        async.waterfall([
            function getList(done) {
                cwbased.getListOfMetrics(cw, params, metricNameFilter, tz).done(function (metricList) {
                    done(null, metricList);
                }, function (err) {
                    done(err);
                });
            },
            function getMetrics(metricList, done) {
                cwHelper.getMetrics(cw, cwConfig.timeRange, cwConfig.metricPeriod, metricList.Metrics, cwConfig).done(function (data) {
                    done(null, data);
                }, function (err) {
                    done(err);
                });
            },
            function sumResults(data, done) {
                var summedResult;
                summedResult = cwHelper.summarize('cw.custom', cwConfig.timeRange, data, cwConfig);
                summedResult.done(function (res) {
                    res.groupName = cwConfig.groupName;
                    done(null, [res]);
                }, function (err) {
                    done(err);
                });
            }
        ], function (err, result) {
            if (err) {
                finalRes.reject(err);
                return;
            }
            finalRes.resolve(result);
        });

        return finalRes.promise;
    }

    function summarizeCloudWatch(config) {
        var cw = new AWS.CloudWatch(),
            results = [],
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
        function elbResultHandle(data) {
            finalData = finalData.concat(data);
            checkDone();
        }
        function elbFailHandle(err) {
            console.log("Err " + JSON.stringify(err));
            checkDone();
        }

        if (config.CW.custom !== undefined) {
            for (j = 0; j < config.CW.custom.length; j++) {
                results.push(summarizeCustomCloudwatch(config.TimeZone, cw, config.CW.custom[j]));
            }
        }
        numToWait = results.length;

        for (i = 0; i < results.length; i++) {
            results[i].done(elbResultHandle, elbFailHandle);
        }
        if (numToWait === 0) {
            finalRes.resolve();
        }

        return finalRes.promise;
    }

    module.exports.summarizeCloudWatch = summarizeCloudWatch;
}());