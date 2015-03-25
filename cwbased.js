

var utils = require("./utils"),
    moment = require("moment-timezone"),
    deferred = require("deferred"),
    async = require("async");
(function () {
    "use strict";

    function alphaSort(a, b) {
        if (a < b) {
            return -1;
        }
        if (a > b) {
            return 1;
        }
        return 0;
    }
    function getListOfMetrics(cw, params, filterFunc) {
        var res = deferred();
        cw.listMetrics(params, function (err, data) {
            var i;
            if (err) {
                res.reject(err);
                return;
            }
            for (i = 0; i < data.Metrics.length; i++) {
                if (!filterFunc(data.Metrics[i])) {
                    data.Metrics.splice(i, 1);
                    i--;
                }
            }
            if (data.NextToken !== undefined) {
                params.NextToken = data.NextToken;
                getListOfMetrics(cw, params, filterFunc).done(function (nd) {
                    data.Metrics = data.Metrics.concat(nd.Metrics);
                    res.resolve(data);
                }, function (er) {
                    res.reject(er);
                });
                return;
            }
            res.resolve(data);
        });
        return res.promise;
    }

    function retrieveMetricsForRange(cw, range, metric, stats, period, tz) {
        var params = {
            EndTime: utils.timeOffsetToAbs(range.end, tz),
            StartTime: utils.timeOffsetToAbs(range.start, tz),
            MetricName: metric.MetricName,
            Namespace: metric.Namespace,
            Statistics: stats,
            Dimensions: metric.Dimensions,
            Unit: metric.Unit,
            Period: period
        }, res = deferred();

        cw.getMetricStatistics(params, function (err, data) {
            if (err) {
                res.reject(err);
                return;
            }
            res.resolve(data);
        });
        return res.promise;
    }


    function CloudWatchBased(tz) {

        function sumMetric(met) {
            var value = 0, j;
            for (j = 0; j < met.Datapoints.length; j++) {
                value += met.Datapoints[j].Sum;
            }
            return value;
        }

        function avgMetric(met) {
            var value = 0, j;
            for (j = 0; j < met.Datapoints.length; j++) {
                value += met.Datapoints[j].Average;
            }
            return value / met.Datapoints.length;
        }
        function maxMetric(met) {
            var value = undefined, j;
            for (j = 0; j < met.Datapoints.length; j++) {
                if (value !== undefined && value > met.Datapoints[j].Maximum) {
                    value = met.Datapoints[j].Maximum;
                } else {
                    value = met.Datapoints[j].Maximum;
                }
            }
            return value;
        }
        function minMetric(met) {
            var value = undefined, j;
            for (j = 0; j < met.Datapoints.length; j++) {
                if (value !== undefined && value < met.Datapoints[j].Minimum) {
                    value = met.Datapoints[j].Minimum;
                } else {
                    value = met.Datapoints[j].Minimum;
                }
            }
            return value;
        }

        function scMetric(met) {
            var value = 0, j;
            for (j = 0; j < met.Datapoints.length; j++) {
                value += met.Datapoints[j].SampleCount;
            }
            return value;
        }

        function calcMetric(met) {
            var value = 0, j, ret = [];
            if (met.Datapoints.length === 0) {
                return ret;
            }
            if (met.Datapoints[0].Average !== undefined) {
                ret.push({type: "Average", val: avgMetric(met)});
            }
            if (met.Datapoints[0].Maximum !== undefined) {
                ret.push({type: "Maximum", val: maxMetric(met)});
            }
            if (met.Datapoints[0].Minimum !== undefined) {
                ret.push({type: "Minimum", val: minMetric(met)});
            }
            if (met.Datapoints[0].Sum !== undefined) {
                ret.push({type: "Sum", val: sumMetric(met)});
            }
            if (met.Datapoints[0].SampleCount !== undefined) {
                ret.push({type: "SampleCount", val: scMetric(met)});
            }
            return ret;
        }

        // summarizes the data
        //      -type the name type
        //      -timeRange the range of time this is over
        //      -metrics the input to 'getMetrics'
        //      -data the outputed result from 'getMetrics'
        //      -grouper
        //          -getMetricCategory given a 'metric', returns the category.
        //          -createCategory inits a category, setting defaults. => can return a deferred()
        //          -nameFormatter given a metric name format it: func("myMetric") - return "asd"
        //          -formatValue given a metric value, format it: func(metric, {type: 'Sum', val: 0}) - return {type: 'Sum', val: '0.0'}
        this.summarize = function (type, timeRange, data, grouper) {
            var categories = {}, metNames = [], sumResult = deferred();

            async.each(data, function (item, done) {
                var metName, metCategory, val,
                    metric = item.metric, i;
                metName = metric.MetricName;
                if (grouper.nameFormatter !== undefined) {
                    metName = grouper.nameFormatter(metName);
                }
                metNames.push(metName);
                metCategory = grouper.getMetricCategory(metric);
                if (categories[metCategory] === undefined) {
                    categories[metCategory] = grouper.createCategory(metric);
                }
                val = calcMetric(item.data);
                if (grouper.formatValue) {
                    for (i = 0; i < val.length; i++) {
                        val[i] = grouper.formatValue(metric, val[i]);
                    }
                }
                if (categories[metCategory].done !== undefined) {
                    categories[metCategory].done(function (newCat) {
                        if (categories[metCategory].done !== undefined) {
                            categories[metCategory] = newCat;
                        }
                        categories[metCategory][metName] = val;
                        done();
                    }, function (err) {
                        done("Failed to get category" + err);
                    });
                    return;
                }
                categories[metCategory][metName] = val;
                done();
            }, function (err) {
                var uniqueNames = [], categoriesSorted;
                if (err) {
                    sumResult.reject(err);
                    return;
                }
                uniqueNames = metNames.filter(function(elem, pos) {
                    return metNames.indexOf(elem) == pos;
                });
                uniqueNames.sort(alphaSort);

                categoriesSorted = Object.keys(categories);
                categoriesSorted.sort(alphaSort);

                sumResult.resolve({
                    type: type,
                    start: moment.tz(utils.timeOffsetToAbs(timeRange.start, tz) * 1000, tz),
                    end: moment.tz(utils.timeOffsetToAbs(timeRange.end, tz) * 1000, tz),
                    data: {
                        categories: categories,
                        metricNames: uniqueNames,
                        sorted: categoriesSorted
                    }
                });
            });
            return sumResult.promise;
        };

        this.getMetrics = function (cw, timeRange, metricPeriod, metrics, reqConfig) {
            var i, result = deferred(), retMetrics = [], numWaiting = metrics.length,
                whichMetricType;

            function sumMetric() {
                return ["Sum"];
            }
            whichMetricType = reqConfig.requestStat || sumMetric;

            async.each(metrics, function (item, done) {
                retrieveMetricsForRange(cw, timeRange, {
                        MetricName: item.MetricName,
                        Namespace: item.Namespace,
                        Dimensions: item.Dimensions
                    }, whichMetricType(item), metricPeriod)
                        .done(function (data) {
                            retMetrics.push({metric: item, data: data});
                            done();
                        }, function (err) {
                            console.log("Error: " + err + " .. for " + item);
                            done(err);
                        });
            }, function (err) {
                if (err) {
                    result.reject();
                    return;
                }
                result.resolve(retMetrics);
            });
            return result.promise;
        };
        return this;
    }



    module.exports.CloudWatchBased = CloudWatchBased;
    module.exports.getListOfMetrics = getListOfMetrics;
}());