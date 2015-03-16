
var AWS = require("aws-sdk"),
    deferred = require('deferred'),
    cwbased = require("./cwbased");

(function () {
    "use strict";

    function summarizeElbViaCloudwatch(tz, elbConfig) {
        var cw = new AWS.CloudWatch(),
            params = {
                Namespace: "AWS/ELB",
                Dimensions: [
                    {
                        Name: "AvailabilityZone"
                    },
                    {
                        Name: "LoadBalancerName"
                    }
                ]
            },
            finalRes = deferred(),
            cwHelper = new cwbased.CloudWatchBased(tz);

        function metricNameFilter(metric) {
            if (metric.MetricName.match(elbConfig.metricNameRegex) !== null) {
                return true;
            }
            return false;
        }

        function availabilityFilter(metric) {
            var i;
            for (i = 0; i < metric.Dimensions.length; i++) {
                if (metric.Dimensions[i].Name === "AvailabilityZone") {
                    if (metric.Dimensions[i].Value.match(elbConfig.availabilityZoneRegex) !== null) {
                        return true;
                    }
                }
            }
            return false;
        }

        function elbNameFilter(metric) {
            var i;
            if (!metricNameFilter(metric)) {
                return false;
            }
            if (!availabilityFilter(metric)) {
                return false;
            }
            for (i = 0; i < metric.Dimensions.length; i++) {
                if (metric.Dimensions[i].Name === "LoadBalancerName") {
                    if (metric.Dimensions[i].Value.match(elbConfig.nameRegex) !== null) {
                        return true;
                    }
                }
            }
            return false;
        }

        cwbased.getListOfMetrics(cw, params, elbNameFilter, tz).done(function (metricList) {

            cwHelper.getMetrics(cw, elbConfig.timeRange, elbConfig.metricPeriod, metricList.Metrics).done(function (data) {
                var summedResult;
                function extractNameZone(met) {
                    var j, ret = {};
                    for (j = 0; j < met.Dimensions.length; j++) {
                        if (met.Dimensions[j].Name === "LoadBalancerName") {
                            ret.ElbName = met.Dimensions[j].Value;
                            continue;
                        }
                        if (met.Dimensions[j].Name === "AvailabilityZone") {
                            ret.AvailabilityZone = met.Dimensions[j].Value;
                            continue;
                        }
                    }
                    return ret;
                }
                summedResult = cwHelper.summarize('elb.summary', elbConfig.timeRange, metricList.Metrics, data,
                    function getMetricCategory(met) {
                        var ret = extractNameZone(met);
                        return ret.ElbName + "z" + ret.AvailabilityZone;
                    },
                    function createCategory(met) {
                        var ret = extractNameZone(met);
                        return {
                            ElbName: ret.ElbName,
                            AvailabilityZone: ret.AvailabilityZone
                        };
                    }, elbConfig.nameFormatter);
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

    function summarizeElb(config) {
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
        function elbResultHandle(data) {
            finalData = finalData.concat(data);
            checkDone();
        }
        function elbFailHandle(err) {
            console.log("Err " + JSON.stringify(err));
            checkDone();
        }

        if (config.ELB.summary !== undefined) {
            for (j = 0; j < config.ELB.summary.length; j++) {
                results.push(summarizeElbViaCloudwatch(config.TimeZone, config.ELB.summary[j]));
            }
        }
        numToWait = results.length;

        for (i = 0; i < results.length; i++) {
            results[i].done(elbResultHandle, elbFailHandle);
        }

        return finalRes.promise;
    }


    module.exports.summarizeElb = summarizeElb;

}());