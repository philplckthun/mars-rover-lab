//Utilize iBeacons to triangulate the position of a rover in a square or rectangular room, and also proximity to points of interest.

var events = require('events');
var bleacon = require('bleacon');

var lateration = require("lateration");
var Circle = lateration.Circle;
var Vector = lateration.Vector;
var laterate = lateration.laterate;

var RoverBeacon = function() {

    //room/area dimension in meters, with iBeacons lining the edge
    //room width from west to east edge
    this.roomW = 8.5344; //28 ft
    this.roomW = 1; //test
    //room "height" (think screen map display) from north to south edge 
    this.roomH = 7.9248; //26 ft
    this.roomH = 1; //test

    //number of proximity readings to take and average before delivering results
    this.avgReadingCount = 20;

    //iBeacons used for position lateration
    //iBeacon setup in square or rectangular room:
    //Not all beacons are required (set active to false) with a minimum of three, but more may make position more accurate (maybe, test this).
    /*
    nw---n---ne
    |         |
    w         e
    |         |
    sw---s---se
    */
    this.triBeacons = {
        'nw': {
            identifier:'onyx1',
            uuid:'20cae8a0a9cf11e3a5e20800200c9a66',
            major:213,
            minor:2617,
            active: true
        },
        'n': {
            identifier:'onyx2',
            uuid:'20cae8a0a9cf11e3a5e20800200c9a66',
            major:213,
            minor:17671,
            active: true
        },
        'ne': {
            identifier:'onyx3',
            uuid:'20cae8a0a9cf11e3a5e20800200c9a66',
            major:213,
            minor:17163,
            active: true
        },
        'e': {
            identifier:'onyx4',
            uuid:'20cae8a0a9cf11e3a5e20800200c9a66',
            major:213,
            minor:16351,
            active: true
        },
        'se': {
            identifier:'onyx5',
            uuid:'20cae8a0a9cf11e3a5e20800200c9a66',
            major:212,
            minor:64096,
            active: true
        },
        's': {
            identifier:'onyx6',
            uuid:'20cae8a0a9cf11e3a5e20800200c9a66',
            major:213,
            minor:26374,
            active: true
        },
        'sw': {
            identifier:'onyx7',
            uuid:'20cae8a0a9cf11e3a5e20800200c9a66',
            major:212,
            minor:65357,
            active: true
        },
        'w': {
            identifier:'onyx8',
            uuid:'20cae8a0a9cf11e3a5e20800200c9a66',
            major:213,
            minor:25553,
            active: true
        }
    };

    //points of interest iBeacons, great for when finding water on Mars, locating a lost probe, navigating to a flag, etc.
    //!!! should I make this object names as well?
    this.poiBeacons = [
        {
            identifier:'ib4',
            uuid:'a495ff99c5b14b44b5121370f02d74de',
            major:1,
            minor:4,
            active: true
        }
    ];

    //used to set/unset lateration funciton at a regular interval
    this.laterationInterval;
};

//inherit all the properties from EventEmitter so that this object can emit its own events to start
RoverBeacon.prototype = new events.EventEmitter;

//get range
//thank you: http://stackoverflow.com/questions/20416218/understanding-ibeacon-distancing
RoverBeacon.prototype.getRange = function(txCalibratedPower, rssi) {
    var ratio_db = txCalibratedPower - rssi;
    var ratio_linear = Math.pow(10, ratio_db / 10);

    var r = Math.sqrt(ratio_linear);
    return r;
}

RoverBeacon.prototype.onLateration = function() {
    var i, n, range, arr, total, triKeys, position, beacons, self = this;

    triKeys = Object.keys(self.triBeacons);

    //trim readings
    for(i=0; i<triKeys.length; i++) {
        if(self.triBeacons[triKeys[i]].active == true) {
            while(self.triBeacons[triKeys[i]].readings.length > self.avgReadingCount) {
                self.triBeacons[triKeys[i]].readings.shift();
                self.triBeacons[triKeys[i]].accuracy.shift();
            }
        }
    }

    //calculate averages
    for(i=0; i<triKeys.length; i++) {
        if(self.triBeacons[triKeys[i]].active == true && self.triBeacons[triKeys[i]].readings.length >= 1) {
            //average range
            arr = [];
            total = 0;
            for(n=0; n<self.triBeacons[triKeys[i]].readings.length; n++) {
                range = self.getRange(self.triBeacons[triKeys[i]].measuredPower, self.triBeacons[triKeys[i]].readings[n]);
                arr.push(range);
                total += range;
            }
            self.triBeacons[triKeys[i]].avgRange = total / arr.length;

            //average accuracy
            arr = [];
            total = 0;
            for(n=0; n<self.triBeacons[triKeys[i]].accuracy.length; n++) {
                arr.push(self.triBeacons[triKeys[i]].accuracy[n]);
                total += self.triBeacons[triKeys[i]].accuracy[n];
            }
            self.triBeacons[triKeys[i]].avgAccuracy = total / arr.length;

            //console.log("range: " + self.triBeacons[triKeys[i]].avgRange + ", accuracy: " + self.triBeacons[triKeys[i]].avgAccuracy);
        }
    }

    //lateration
    beacons = [];
    for(i=0; i<triKeys.length; i++) {
        if(self.triBeacons[triKeys[i]].active == true && self.triBeacons[triKeys[i]].readings.length >= 1) {
            if(self.triBeacons[triKeys[i]].x != undefined && self.triBeacons[triKeys[i]].y != undefined) {
                console.log('x:' + self.triBeacons[triKeys[i]].x + ', y:' + self.triBeacons[triKeys[i]].y + ', range:' + self.triBeacons[triKeys[i]].avgRange);
                beacons.push(new Circle(new Vector(Number(self.triBeacons[triKeys[i]].x), Number(self.triBeacons[triKeys[i]].y)), Number(self.triBeacons[triKeys[i]].avgRange)));
            }
        }
    }

    //oh yay the position!
    if(beacons.length >= 3) { //3 or more required for this
        position = laterate(beacons);
        console.log(position);
    }

};

//handle discover event that deliveres the latest scan info for a beacon
RoverBeacon.prototype.onDiscover = function(beacon) {
    var i, triKeys, self = this;

    //console.log(beacon);

    //beacons for triangulation
    triKeys = Object.keys(self.triBeacons);
    for(i=0; i<triKeys.length; i++) {
        if(self.triBeacons[triKeys[i]].active == true && 
        self.triBeacons[triKeys[i]].uuid == beacon.uuid && 
        self.triBeacons[triKeys[i]].major == beacon.major && 
        self.triBeacons[triKeys[i]].minor == beacon.minor) {
            self.triBeacons[triKeys[i]].readings.push(beacon.rssi);
            self.triBeacons[triKeys[i]].accuracy.push(beacon.accuracy);
            self.triBeacons[triKeys[i]].measuredPower = beacon.measuredPower;
            self.triBeacons[triKeys[i]].rssi = beacon.rssi;
            self.triBeacons[triKeys[i]].proximity = beacon.proximity;
            break;
        }
    }
};

//set x y of tri beacons
RoverBeacon.prototype.setTriXY = function() {
    var i, triKeys, self = this;

    triKeys = Object.keys(self.triBeacons);

    for(i=0; i<triKeys.length; i++) {
        switch(triKeys[i]) {
            case 'nw':
                self.triBeacons[triKeys[i]].x = 0;
                self.triBeacons[triKeys[i]].y = 0;
                break;
            case 'n':
                self.triBeacons[triKeys[i]].x = self.roomW / 2;
                self.triBeacons[triKeys[i]].y = 0;
                break;
            case 'ne':
                self.triBeacons[triKeys[i]].x = self.roomW;
                self.triBeacons[triKeys[i]].y = 0;
                break;
            case 'e':
                self.triBeacons[triKeys[i]].x = self.roomW;
                self.triBeacons[triKeys[i]].y = self.roomH / 2;
                break;
            case 'se':
                self.triBeacons[triKeys[i]].x = self.roomW;
                self.triBeacons[triKeys[i]].y = self.roomH;
                break;
            case 's':
                self.triBeacons[triKeys[i]].x = self.roomW / 2;
                self.triBeacons[triKeys[i]].y = self.roomH;
                break;
            case 'sw':
                self.triBeacons[triKeys[i]].x = 0;
                self.triBeacons[triKeys[i]].y = self.roomH;
                break;
            case 'w':
                self.triBeacons[triKeys[i]].x = 0;
                self.triBeacons[triKeys[i]].y = self.roomH / 2;
                break;
        }
    }
};

//start scanning beacons
RoverBeacon.prototype.start = function() {
    var i, triKeys, self = this, uuids = [], majors = [], minors = [];

    console.log('start scanning iBeacons...');

    //set up the surrounding barrier of beacons used for lateration
    self.setTriXY();

    triKeys = Object.keys(self.triBeacons);

    //start scanning triangulation beacons
    for(i=0; i<triKeys.length; i++) {
        if(self.triBeacons[triKeys[i]].active == true) {
            //clean slate of readings for each iBeacons to average
            self.triBeacons[triKeys[i]].readings = [];
            self.triBeacons[triKeys[i]].accuracy = [];
            self.triBeacons[triKeys[i]].measuredPower = 0;
            self.triBeacons[triKeys[i]].rssi = 0;
            self.triBeacons[triKeys[i]].proximity = 'unknown';
            self.triBeacons[triKeys[i]].avgRange = 0;
            self.triBeacons[triKeys[i]].avgAccuracy = 0;
            self.triBeacons[triKeys[i]].avgPosX = 0;
            self.triBeacons[triKeys[i]].avgPosY = 0;
            
            uuids.push(self.triBeacons[triKeys[i]].uuid);
            majors.push(self.triBeacons[triKeys[i]].major);
            minors.push(self.triBeacons[triKeys[i]].minor);
        }
    }

    //scan for all iBeacons for now
    //!!! an array of specific arrays is failing in many ways, but can still compare specific arrays to everything nearby for now
    bleacon.startScanning();

    //start scanning poi beacons
    /*
    for(i=0; i<self.poiBeacons.length; i++) {
        if(self.poiBeacons[i].active == true) {
            //clean slate of readings for each iBeacons to average
            self.triBeacons[triKeys[i]].readings = [];

            bleacon.startScanning(self.poiBeacons[i].uuid, self.poiBeacons[i].major, self.poiBeacons[i].minor);
        }
    }
    */

    bleacon.on('discover', self.onDiscover.bind(self));

    //start lateration in one second intervals
    self.laterationInterval = setInterval(self.onLateration.bind(self), 1000);
};

//stop scanning beacons
RoverBeacon.prototype.stop = function() {
    var self = this;

    bleacon.stopScanning();
    bleacon.removeListener('discover', self.onDiscover);
    self.laterationInterval.clearInterval(self.onLateration);
};

module.exports = new RoverBeacon();