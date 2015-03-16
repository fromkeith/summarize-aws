
var moment = require("moment-timezone");

(function () {
    "use strict";
    function timeOffsetToAbs(offset, tz) {
        if (offset === undefined) {
            return undefined;
        }
        var now = moment(),
            asStr = now.format("YYYY-MM-DD") + " " + offset.at,
            inTz = moment.tz(asStr, tz),
            relReg = /(-|)([0-9]+)(d|h|m|w)/,
            relSplit = offset.offset.match(relReg),
            v = parseInt(relSplit[2], 10),
            sign = (relSplit[1] === "-") ? -1 : 1;
        return inTz.add(sign * v, relSplit[3]).format("X") * 1;
    }

    module.exports.timeOffsetToAbs = timeOffsetToAbs;

}());