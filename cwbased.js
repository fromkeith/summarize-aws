var utils = require("./utils"),
    moment = require("moment-timezone"),
    deferred = require("deferred");

function getListOfMetrics(cw, params, filterFunc) {
    var res = deferred()
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
                res.reject(err);
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
        var value = 0;
        for (j = 0; j < met.Datapoints.length; j++) {
            value += met.Datapoints[j].Sum;
        }
        return value;
    }

    // summarizes the data
    //      -type the name type
    //      -timeRange the range of time this is over
    //      -metrics the input to 'getMetrics'
    //      -data the outputed result from 'getMetrics'
    //      -getMetricCateogry given a 'metric', returns the category.
    //      -createCategory inits a category, setting defaults. => can return a deferred()
    //      -nameFormatter given a metric name format it
    this.summarize = function (type, timeRange, metrics, data, getMetricCategory, createCategory, nameFormatter) {
        var i, categories = {}, ret, metNames = [], uniqueNames = [], metName, metCategory, deferredCategories = 0,
            categoriesWait = deferred(), sumResult = deferred();

        function defSet(metCategory, metName, value) {
            deferredCategories++;
            return function (newCat) {
                if (categories[metCategory].done !== undefined) {
                    categories[metCategory] = newCat;
                }
                categories[metCategory][metName] = value;
                deferredCategories--;
                if (deferredCategories <= 0) {
                    categoriesWait.resolve();
                }
            }
        }

        for (i = 0; i < data.length; i++) {
            metName = metrics[data[i].metricIndex].MetricName;
            if (nameFormatter !== undefined) {
                metName = nameFormatter(metName);
            }
            metNames.push(metName);
            metCategory = getMetricCategory(metrics[data[i].metricIndex]);
            if (categories[metCategory] === undefined) {
                categories[metCategory] = createCategory(metrics[data[i].metricIndex]);
            }
            if (categories[metCategory].done !== undefined) {
                categories[metCategory].done(defSet(metCategory, metName, sumMetric(data[i].data)));
            } else {
                categories[metCategory][metName] = sumMetric(data[i].data);
            }
        }
        if (deferredCategories === 0) {
            categoriesWait.resolve();
        }
        categoriesWait.promise.done(function () {
            uniqueNames = metNames.filter(function(elem, pos) {
                return metNames.indexOf(elem) == pos;
            });
            uniqueNames.sort(function (a, b) {
                if (a < b) {
                    return -1;
                }
                if (a > b) {
                    return 1;
                }
                return 0;
            });
            sumResult.resolve({
                type: type,
                start: moment.tz(utils.timeOffsetToAbs(timeRange.start, tz) * 1000, tz),
                end: moment.tz(utils.timeOffsetToAbs(timeRange.end, tz) * 1000, tz),
                data: {
                    categories: categories,
                    metricNames: uniqueNames
                }
            });
        });
        return sumResult.promise;
    };

    this.getMetrics = function (cw, timeRange, metricPeriod, metrics) {
        var i, result = deferred(), retMetrics = [], numWaiting = metrics.length;

        function checkDone() {
            numWaiting --;
            if (numWaiting <= 0) {
                result.resolve(retMetrics);
            }
        }
        function forResult(i) {
            return function (data) {
                retMetrics.push({metricIndex: i, data: data});
                checkDone();
            };
        }
        function forErr(i) {
            return function (err) {
                console.log("Error: " + err + " .. for " + metrics[i]);
                checkDone();
            };
        }
        for (i = 0; i < metrics.length; i++) {
            retrieveMetricsForRange(cw, timeRange, {
                MetricName: metrics[i].MetricName,
                Namespace: metrics[i].Namespace,
                Dimensions: metrics[i].Dimensions
            }, ["Sum"], metricPeriod).done(forResult(i), forErr(i));
        }
        return result.promise;
    };
    return this;
}



module.exports.CloudWatchBased = CloudWatchBased;
module.exports.getListOfMetrics = getListOfMetrics;