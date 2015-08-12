//RoverLab streams photos and other sensor data from its Raspberry Pi components to a satellite server where that content can be streamed to the world.

//Special thanks to Arvind Ravulavaru with camera streaming functionality referenced from his work at:
//http://thejackalofjavascript.com/rpi-live-streaming/

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var ss = require('socket.io-stream');
var fs = require('fs');
var path = require('path');

var RoverSatellite = function() {
	//settings

	//port that rovers and mission control will connect to at this host
	this.satPort = 0;
	//password used to connect to satellite server as rover
	this.roverPassword = '';

	//active sockets by name
	this.roverSockets = {};
	this.missionControlSockets = {};

	//namespaces
	this.rovers = io.of('/rover');
	this.mcs = io.of('/mission-control');
};

//get connection stats for rover and mission control clients
RoverSatellite.prototype.connectionStats = function() {
	var self = this;

	var stats = {
		rover: Object.keys(self.roverSockets).length,
		mission: Object.keys(self.missionControlSockets).length
	};

	console.log('mission control clients: ' + stats.rover + ', rovers: ' + stats.mission);

	return stats;
};

//get things started
RoverSatellite.prototype.init = function() {
	var self = this;

	app.use('/PiCam', express.static(path.join(__dirname, 'web/PiCam')));
	app.use('/js', express.static(path.join(__dirname, 'web/js')));
	app.use('/css', express.static(path.join(__dirname, 'web/css')));
	app.use('/images', express.static(path.join(__dirname, 'web/images')));
 
	app.get('/', function(req, res) {
		res.sendFile(__dirname + '/web/index.htm');
	});

	//////////////////////////////////////////////////////////////
	//rover clients
	//////////////////////////////////////////////////////////////

	//handle socket connection(s), starting sensor activity on first connect, ending it on last disconnect to save on power
	self.rovers.on('connect', function(socket) {

		self.roverSockets[socket.id] = socket;
		self.mcs.emit('connectstats', self.connectionStats());

		//tell mission control that a specific rover has connected
		self.mcs.emit('roverconnected'); //!!! no rover ID transmitted yet

		//crude login to help keep this project moving at an early stage
		//!!! IT'S CRUDE. Make it not crude.
		//only rovers should send photos and other data to share with mission control clients
		//io.of('/rover').on('roverlogin', function(data) {
		socket.on('roverlogin', function(data) {
			//var socket = this;

			if(data.roverPassword == self.roverPassword) {
				console.log(data.roverID + ' has been confirmed as a rover');

				//good to go, listen for rover events
				socket.clientType = 'rover';
				socket.roverID = data.roverID;

				//confirm login with rover
				socket.emit('roverloginconfirmed');

				//tell mission control that a rover has logged in
				self.mcs.emit('roverconfirmed', socket.roverID);

				//receive images from rover
				ss(socket).on('roverimage', function(stream, data) {
					console.log('receiving rover image...');
					
					//stream to temporary image first
					var tmpFilename = path.join(__dirname, ('web/PiCam/tmp-' + path.basename(data.name)));
					var finalFilename = path.join(__dirname, ('web/PiCam/' + path.basename(data.name)));
					var pipe = stream.pipe(fs.createWriteStream(tmpFilename));

					//then move/overwrite cam file that will be streamed to the world
					pipe.on('close', function(){
						console.log('finished downloading rover image');
						fs.rename(tmpFilename, finalFilename, function() {
							//notify mission control clients about new image
							//they will then load via browser with normal http request to this server
							//!!! consider supporting multiple rovers e.g. what rover transmitted image sent here
							self.mcs.emit('roverimage');
						});
					});
				});

			} else {
				//nope
				console.log('A rover login has failed.');
				self.roverSockets[this.id].emit('roverloginfail');

				//let mission control know
				self.mcs.emit('roverdenied', socket.roverID);
			}
		});
		

		socket.on('disconnect', function() {
			//let mission control know
			self.mcs.emit('roverdisconnected', socket.roverID);

			delete self.roverSockets[this.id];
			self.mcs.emit('connectstats', self.connectionStats());
		 
		});

	});

	///////////////////////////////////////////////////////////////////////////
	//mission control/observer clients (!!! discuss levels of "mission control"
	///////////////////////////////////////////////////////////////////////////

	self.mcs.on('connect', function(socket) {
		self.missionControlSockets[socket.id] = socket;
		self.mcs.emit('connectstats', self.connectionStats());

		//send initial rover image to show
		self.mcs.emit('roverimage');
		

		socket.on('disconnect', function() {
			delete self.missionControlSockets[this.id];
			self.mcs.emit('connectstats', self.connectionStats());
		 
		});

	});

	http.listen(this.satPort, function() {
		console.log('listening on *:' + self.satPort);
	});
};

module.exports = new RoverSatellite();