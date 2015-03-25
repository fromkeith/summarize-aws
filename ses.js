var AWS = require("aws-sdk"),
    async = require("async"),
    utils = require("./utils"),
    moment = require("moment");

(function () {
    "use strict";

    function summarizeSesItem(tz, config, finishedCallback) {
        var ses;

        if (config.region) {
            ses = new AWS.SES({region: config.region});
        } else {
            ses = new AWS.SES();
        }

        async.waterfall([
            function (done) {
                ses.getSendStatistics(function (err, data) {
                    if (err) {
                        done(err);
                        return;
                    }
                    return done(null, data.SendDataPoints);
                });
            },
            function (points, done) {
                var start = utils.timeOffsetToAbs(config.start, tz),
                    end = utils.timeOffsetToAbs(config.end, tz),
                    i,
                    pointTime,
                    result = {
                        deliveryAttempts: 0,
                        rejects: 0,
                        bounces: 0,
                        complaints: 0,
                        type: 'ses.sendStat',
                        start: moment.tz(start * 1000, tz),
                        end: moment.tz(end * 1000, tz)
                    };
                for (i = 0; i < points.length; i++) {
                    pointTime = moment(points[i].Timestamp).format("X") * 1;
                    console.log(points[i]);
                    if (pointTime < start) {
                        continue;
                    }
                    if (pointTime > end) {
                        continue;
                    }
                    if (points[i].DeliveryAttempts) {
                        result.deliveryAttempts += points[i].DeliveryAttempts;
                    }
                    if (points[i].Rejects) {
                        result.rejects += points[i].Rejects;
                    }
                    if (points[i].Bounces) {
                        result.bounces += points[i].Bounces;
                    }
                    if (points[i].Complaints) {
                        result.complaints += points[i].Complaints;
                    }
                }
                done(null, result);
            }
        ], function (err, result) {
            finishedCallback(err, result);
        });

    }

    function summarizeSes(config, alldone) {
        var results = [];
        async.each(config.SES, function process(item, done) {
            summarizeSesItem(config.TimeZone, item, function (err, data) {
                if (err) {
                    done(err);
                    return;
                }
                results.push(data);
                done();
            });
        }, function (err) {
            alldone(err, results);
        });
    }

    module.exports.summarizeSes = summarizeSes;

}());