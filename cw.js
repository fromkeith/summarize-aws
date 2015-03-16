var AWS = require("aws-sdk"),
    deferred = require('deferred'),
    cwbased = require("./cwbased");

function summarizeCustomCloudwatch(tz, cw, cwConfig) {
    var cw = new AWS.CloudWatch(),
        params = {
            Namespace: cwConfig.namespace
        },
        finalRes = deferred(),
        cwHelper = new cwbased.CloudWatchBased(tz);

    function metricNameFilter(metric) {
        if (metric.MetricName.match(cwConfig.metricNameRegex) !== null) {
            return true;
        }
        return false;
    }

    if (cwConfig.dimensions !== undefined) {
        params.Dimensions = cwConfig.dimensions;
    }

    cwbased.getListOfMetrics(cw, params, metricNameFilter, tz).done(function (metricList) {
        cwHelper.getMetrics(cw, cwConfig.timeRange, cwConfig.metricPeriod, metricList.Metrics).done(function (data) {
            var summedResult;

            summedResult = cwHelper.summarize('cw.custom', cwConfig.timeRange, metricList.Metrics, data,
                cwConfig.getMetricCategory,
                cwConfig.createCategory,
                cwConfig.nameFormatter);
            summedResult.done(function (res) {
                res.groupName = cwConfig.groupName;
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