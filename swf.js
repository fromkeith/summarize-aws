var AWS = require("aws-sdk"),
    deferred = require('deferred'),
    utils = require("./utils.js"),
    moment = require("moment-timezone");

(function () {
    "use strict";
    // function swfClosedCount(tz, swf, domain, data) {
    //     var params = {
    //         domain: domain
    //     }, result = deferred();

    //     // Note: closeStatusFilter, executionFilter, typeFilter and tagFilter are mutually exclusive. You can specify at most one of these in a request.
    //     if (data.status !== undefined) {
    //         params.closeStatusFilter = {
    //             status: data.status
    //         };
    //     } else if (data.typeFilter !== undefined) {
    //         params.typeFilter = {
    //             name: data.typeFilter.name,
    //             version: data.typeFilter.version
    //         };
    //     } else if (data.workflowId !== undefined) {
    //         params.executionFilter = {
    //             workflowId: data.workflowId
    //         };
    //     } else if (data.tagFilter !== undefined) {
    //         params.tagFilter = {
    //             tag: data.tagFilter
    //         };
    //     }
    //     // Note: startTimeFilter and closeTimeFilter are mutually exclusive. You must specify one of these in a request but not both.
    //     if (data.close !== undefined) {
    //         params.closeTimeFilter = {
    //             oldestDate: utils.timeOffsetToAbs(data.close.oldest, tz),
    //             latestDate: utils.timeOffsetToAbs(data.close.latest, tz)
    //         };
    //     } else if (data.start !== undefined) {
    //         params.startTimeFilter = {
    //             oldestDate: utils.timeOffsetToAbs(data.start.oldest, tz),
    //             latestDate: utils.timeOffsetToAbs(data.start.latest, tz)
    //         };
    //     } else {
    //         result.reject();
    //         return result.promise;
    //     }

    //     swf.countClosedWorkflowExecutions(params, function (err, data) {
    //         if (err) {
    //             result.reject({
    //                 type: "countClosed",
    //                 err: err
    //             });
    //             return;
    //         }
    //         // {"count": number,  "truncated": false}
    //         result.resolve({
    //             type: "countClosed",
    //             data: data
    //         });
    //     });

    //     return result.promise;
    // }


    function swfClosedWorkflows(tz, swf, domain, data) {
        var result = deferred(),
            params = {};

        params.domain = domain;

        // Note: closeStatusFilter, executionFilter, typeFilter and tagFilter are mutually exclusive. You can specify at most one of these in a request.
        if (data.status !== undefined) {
            params.closeStatusFilter = {
                status: data.status
            };
        } else if (data.typeFilter !== undefined) {
            params.typeFilter = {
                name: data.typeFilter.name,
                version: data.typeFilter.version
            };
        } else if (data.workflowId !== undefined) {
            params.executionFilter = {
                workflowId: data.workflowId
            };
        } else if (data.tagFilter !== undefined) {
            params.tagFilter = {
                tag: data.tagFilter
            };
        }
        // Note: startTimeFilter and closeTimeFilter are mutually exclusive. You must specify one of these in a request but not both.
        if (data.close !== undefined) {
            params.closeTimeFilter = {
                oldestDate: utils.timeOffsetToAbs(data.close.oldest, tz),
                latestDate: utils.timeOffsetToAbs(data.close.latest, tz)
            };
        } else if (data.start !== undefined) {
            params.startTimeFilter = {
                oldestDate: utils.timeOffsetToAbs(data.start.oldest, tz),
                latestDate: utils.timeOffsetToAbs(data.start.latest, tz)
            };
        } else {
            result.reject();
            return result.promise;
        }

        if (data.maximumPageSize !== undefined) {
            params.maximumPageSize = data.maximumPageSize;
        }

        // gets set by us...
        if (data.nextToken !== undefined) {
            params.nextPageToken = data.nextToken;
        }

        swf.listClosedWorkflowExecutions(params, function(err, resData) {
            var ret;
            if (err !== null) {
                result.reject({
                    type: "listClosed",
                    err: err
                });
                return;
            }
            if (resData.nextPageToken !== undefined) {
                data.nextToken = resData.nextPageToken;
                ret = swfClosedWorkflows(swf, domain, data);
                ret.done(function (d) {
                    var ei = resData.executionInfos.concat(d.data.executionInfos);
                    resData.executionInfos = ei;
                    result.resolve({
                        type: "listClosed",
                        timeRange: data.close || data.start,
                        data: resData
                    });
                }, function (err) {
                    result.reject(err);
                });
                return;
            }
            result.resolve({
                type: "listClosed",
                timeRange: data.close || data.start,
                data: resData
            });
        });


        return result.promise;
    }


    function summarizeListClosed(tz, timeRange, data) {
        var summary = {
            completed: 0,
            canceled: 0,
            terminated: 0,
            failed: 0,
            timed_out: 0,
            continued_as_new: 0,
            workflows: {}
        }, i, cur, wfn;

        for (i = 0; i < data.executionInfos.length; i++) {
            cur = data.executionInfos[i];
            wfn = cur.workflowType.name + " v" + cur.workflowType.version;
            summary[cur.closeStatus.toLowerCase()] ++;
            if (summary.workflows[wfn] === undefined) {
                summary.workflows[wfn] = {
                    completed: 0,
                    canceled: 0,
                    terminated: 0,
                    failed: 0,
                    timed_out: 0,
                    continued_as_new: 0
                };
            }
            summary.workflows[wfn][cur.closeStatus.toLowerCase()] ++;
        }
        return {
            type: 'swf.listClosed',
            data: summary,
            start: moment.tz(utils.timeOffsetToAbs(timeRange.oldest, tz) * 1000, tz),
            end: moment.tz(utils.timeOffsetToAbs(timeRange.latest, tz) * 1000, tz)
        };
    }

    function summarizeSwf(config) {
        var swf = new AWS.SWF(),
            keys = Object.keys(config.SWF),
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

        function swfResultHandle(data) {
            if (data.type === "listClosed") {
                finalData.push(summarizeListClosed(config.TimeZone, data.timeRange, data.data));
            } else {
                console.log("Good " + JSON.stringify(data));
            }
            checkDone();
        }
        function swfFailHandle(err) {
            console.log("Err " + JSON.stringify(err));
            checkDone();
        }

        for (i = 0; i < keys.length; i++) {
            // if (config.SWF[keys[i]].countClosed !== undefined) {
            //     for (j = 0; j < config.SWF[keys[i]].countClosed.length; j++) {
            //         results.push(swfClosedCount(config.TimeZone, swf, keys[i], config.SWF[keys[i]].countClosed[j]));
            //     }
            // }
            if (config.SWF[keys[i]].listClosed !== undefined) {
                for (j = 0; j < config.SWF[keys[i]].listClosed.length; j++) {
                    results.push(swfClosedWorkflows(config.TimeZone, swf, keys[i], config.SWF[keys[i]].listClosed[j]));
                }
            }
        }
        numToWait = results.length;

        for (i = 0; i < results.length; i++) {
            results[i].done(swfResultHandle, swfFailHandle);
        }

        return finalRes.promise;
    }

    module.exports.summarizeSwf = summarizeSwf;
}());