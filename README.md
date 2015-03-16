Summarize-AWS
=============

This package is meant to provide a simple way to generate a quick summary of your AWS services.
This package is in no way affiliated with AWS or Amazon.

This is a 'Work In Progress'.




Example
=======

Get the required items, and initialize AWS sdk.
```javascript
    var AWS = require("aws-sdk"),
        summary = require("summarize-aws");

    // load your own AWS configuration however you like.
    AWS.config.loadFromPath("aws.keys.json");

```

Call the call summary, passing in your configuration. If you are not using a service, then leave it undefined in configuration.
```javascript
    summary.summarize({
        TimeZone: "America/Vancouver",
        // leave <jade> undefined for the default
        jade: "summary.jade",
        // leave <out> undefined for the default
        out: "summary.html",
        SWF: ...
        SQS: ...
        ...
    });
```

SWF Config
```javascript
    SWF: {
        // replace <swfnamepsace> with your namespace
        swfnamespace: {
            // This will perform the list closed action for each element/setting.
            // It will out a count of how each workflow closed.
            listClosed: [
                {
                    // This will search for actions that closed in the given time frame
                    //  change <close> to <start> to look for actions that started in the given time frame.
                    close: {
                        oldest: {
                            at: "00:00:00", // go to 00:00:00 today
                            offset: '-1d'   // then go back 1 day
                        },
                        latest: {
                            at: "00:00:00", // go to 00:00:00 today
                            offset: '0d'   // leave it there
                        }
                    }
                    /*
                    The follow properties are mutually exclusive
                    status: "",     // COMPLETED | FAILED | CANCELED | TERMINATED | CONTINUED_AS_NEW | TIMED_OUT
                    typeFilter: {
                        Name: "",
                        Version: "" // can be undefined
                    },
                    workflowId: "",
                    tagFilter: ""

                    */
                }
            ]
        }
    }
```

SQS Config:
```javascript
    SQS: {
        // this will provide a basic summary of the cloudwatch metrics for SQS queues.
        summary: [
            {
                // the regex to limit which queues to query
                queueNameRegex: ".*",
                // the regex to limit which metrics to produce
                metricNameRegex: "NumberOfMessages(Deleted|Received|Sent)",
                // the range which to look in
                timeRange: {
                    end: {
                        at: "00:00:00",
                        offset: "0d"
                    },
                    start: {
                        at: "00:00:00",
                        offset: "-1d"
                    }
                },
                // the period in which to grab data at
                metricPeriod: 60 * 60 // 1 hour data chunks
                /*
                nameFormatter: function (name) // see ELB
                */
            }
        ]
    }
```

ELB Config
```javascript
    ELB: {
        // this will provide a basic summary of the cloudwatch metrics for ELB queues.
        summary: [
            {
                // the regex to limit which ELBs to query
                nameRegex: ".*",
                // the regex to limit which metrics to produce
                metricNameRegex: "^((?!(HealthyHostCount|Latency|UnHealthyHostCount|SurgeQueueLength)).)*$",
                // the regex to limit which availability Zones to look at
                availabilityZoneRegex: ".*",
                // the range which to look in
                timeRange: {
                    end: {
                        at: "00:00:00",
                        offset: "0d"
                    },
                    start: {
                        at: "00:00:00",
                        offset: "-1d"
                    }
                },
                // the period in which to grab data at
                metricPeriod: 60 * 60, // 1 hour data chunks
                // a way to rename metric names. optional.
                nameFormatter: function (name) {
                    var codePrefix = "HTTPCode_Backend_";
                    if (name.length > codePrefix.length && name.substring(0, codePrefix.length) === codePrefix) {
                        return name.substring(codePrefix.length);
                    }
                    return name;
                }
            }
        ]
    }
```

Cloudwatch Config
```javascript
    CW: {
        // our custom metrics
        custom: [
            {
                // what to name the output heading
                groupName: "Web Codes",
                // what namespace to look in
                namespace: "Web",
                // the regex to limit which metrics to pull
                metricNameRegex: "^Status\\.(200|300|400|500)$",
                // the range which to look in
                timeRange: {
                    end: {
                        at: "00:00:00",
                        offset: "0d"
                    },
                    start: {
                        at: "00:00:00",
                        offset: "-1d"
                    }
                },
                // the period in which to grab data at
                metricPeriod: 60 * 60,
                // returns the name of the category for this metric.
                // metric is a single item in the list returned by http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatch.html#listMetrics-property
                getMetricCategory: function (metric) {
                    return "Web Codes";
                },
                // returns an object that will store the values for metric.
                // Name is expected.
                // Can also return a deferred().promise
                // metric is a single item in the list returned by http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatch.html#listMetrics-property
                createCategory: function (metric) {
                    return {Name: "Web Codes"};
                }
            }
        ]
    }
```










License
=======
MIT. See License File.