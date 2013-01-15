/**
 * serial port
 * circular buffer with event emitter
 */

var sys = require('util'),
    Relayduino = require("./lib/relayduino").Relayduino;

var options = {
    serialPath : "/dev/tty.usbserial-A501993D",       // path to the serial device on the machine
    deviceAddress : "00"                            // address of the relayduino
};

var DEBUG = true;
var INFO = true;

var relayduino = new Relayduino(options);

relayduino.on("open", function() {
   relayduino.getStatus(); 
   
   setTimeout(function() {
       relayduino.changeRelay(1, true);
   }, 1000);
   setTimeout(function() {
       relayduino.changeRelay(2, true);
   }, 1000);
   setTimeout(function() {
       relayduino.changeRelay(1, false);
   }, 1100);
   setTimeout(function() {
       relayduino.changeRelay(2, false);
   }, 1100);
   
   setTimeout(function() {
       relayduino.getStatus();
   }, 5000);
});
