/**
 * serial port
 * circular buffer with event emitter
 */

var sys = require('util'),
    serialport = require("serialport"),
    EventEmitter = require('events').EventEmitter;

var DEBUG = true;
var INFO = true;

var COMMAND = {
        ON: "ON",
        OFF: "OF",
        ALL_RELAYS: "WR",
        TIMED_ON: "TR",
        KEEP_ALIVE: "KA",
        RELAY_STATUS: "RS",           // relay status
        DIGI_STATUS: "IS",
        ANALOG_STATUS: "AI",
        SYS_STATUS: "SS",
        SET_ADDR: "SA",
        SET_BAUD: "SB",             // 9600 by default
}

/**
 * e.g. @44 ON 1 , @44 OF 1
 */
function makeCommand(addr, command, params) {
    var cmd = "@" + addr + " " + command + " " + params + "\r";
    return cmd;
}

// state of serial connection with CM11 device
var State = { 
    READY: 0,       // ready to receive. might get 0x5a (poll), 0xa5 (interface power fail, time request)
    EXPECT_SYS_STATUS: 1,
    EXPECT_STATUS: 2,
};


var Relayduino = function(options) {
    EventEmitter.call(this);
    
    // address of the relayduino on the serial bus
    this.deviceAddress = options.deviceAddress;

    this.deviceState = {
        relay1: 0,
        relay2: 0,
        relay3: 0,
        relay4: 0,
        relay5: 0,
        relay6: 0,
        relay7: 0,
        relay8: 0,
        digi1: 0,
        digi2: 0,
        digi3: 0,
        digi4: 0,
        analog1: 0,
        analog2: 0,
        analog3: 0,
    };
    // doe outgoing commands
    this.commState = State.READY;           // serial interface state
    
    // queue for incoming commands to send on the Relayduino interface     
    this.commandQueue = [];
	
	// configure the serial port that the RAVEn USB dongle is on.
    this.serialPort = new serialport.SerialPort(options.serialPath, {
        baudrate: 9600,     // TODO use options for baud
        databits: 8,
        stopbits: 1,
        parity: 'none',
        parser: serialport.parsers.readline("\r")
    });
    
    this.serialPort.on("open", function () {
        if (DEBUG) {
            console.log('relayduino serial device open');
        }
        setTimeout(function() {
            self.emit("open");
        }, 1000);
    });
    
    var self = this;
    
    this.serialPort.on("data", function(data) {
        serialDataHandler(self, data);
    });

}

sys.inherits(Relayduino, EventEmitter);


/**
 * 
 */
Relayduino.prototype.changeRelay = function(relay, value) {
    var command = value ? COMMAND.ON : COMMAND.OFF;
    
    var command = makeCommand(this.deviceAddress, command, relay);

    if (DEBUG) {
        console.log("sending command: " + command);
    }
    
	// write address
    this.commState = State.EXPECT_STATUS;
	var data = new Buffer(command);
	this.serialPort.write(data);
}


Relayduino.prototype.getStatus = function(callback) {
    if (DEBUG) {
        console.log("sending system status command.");
    }
    
    var command = makeCommand(this.deviceAddress, COMMAND.SYS_STATUS, 0);
    if (DEBUG) {
        console.log("status command: " + command);
    }
    this.commState = State.EXPECT_SYS_STATUS;
    var data = new Buffer(command);
    this.serialPort.write(data);
}


Relayduino.prototype.sendCommand = function(address, fn, callback) {
    if (DEBUG) {
        console.log("queuing command for adress: " + address.toString(16) + " and fn: " + fn.toString(16));
    }
    this.queueCommand({type: "command", address: address, fn: fn, callback: callback});
        
}

/**
 * Get status from the X10 interface
 */
// Relayduino.prototype.getStatus = function(callback) {
    // if (DEBUG) {
        // console.log("queuing status request");
    // }
    // this.queueCommand({type: "status", callback: callback});
// }


Relayduino.prototype.queueCommand = function(command) {
     self.commandQueue.push(command);
     if (this.commandQueue.length == 1) {   // if the only funcion on queu, call it
        this.executeCommand(command);
     }
     if (this.commandQueue > 5) {
         console.log("warning Relayduino queue > 5: " + this.commandQueue.length);
     }
}

Relayduino.prototype.nextCommand = function() {
     var prevCommand = this.commandQueue.shift();
     if (this.commandQueue.length > 0 ) {   // if the only funcion on queu, call it
         var command = this.commandQueue[0];
         if (DEBUG) {
             console.log("--- execute queued command");
         }
         this.executeCommand(command);
     }
}

Relayduino.prototype.executeCommand = function(command) {
    var callback = command.callback;
    /*
    if (command.type == "command") {
        var address = command.address;
        var fn = command.fn;
        self.sendAddress(address, function(err) {
            if (err) {
                if (typeof(callback) === "function") {
                    callback(err);       // send error
               }
               self.nextCommand();          // next off queue
            }
            else {
                self.sendFunction(fn, function(err) {
                    if (typeof(callback) === "function") {
                       callback(err);
                    }
                    self.nextCommand();          // next off queue
                });
            }
        });
    }    
    else if (command.type == "status") {
        self.sendStatusRequest(function(err) {
            if (typeof(callback) === "function") {
                callback(err);
            }
            self.nextCommand();        // next off queue
        });
    }
    */
}



/**
 * handler for incoming serial data from relayduino
 * 
 * @param {Object} data Buffer of octects
 */
function serialDataHandler(self, data) {
    if (DEBUG) {
        console.log("got data from serial port: " + data);
        /*
        var str = "";
        for (var i=0; i<data.length; i++) {
            var octet = data.readUInt8(i);
            str += octet.toString(16);
            str +=","
        }
        console.log("got data from serial port: " + str);
        */
    }
    
    incomingHandler(self, data);
}


/**
 *  handler for data incoming from the local buffer
 */
function incomingHandler(self, data) {
    if (self.commState == State.EXPECT_SYS_STATUS) {
        var parts = data.split(" ");
        if (parts.length != 6) {
            console.log("sys status response not in 6 parts: " + data);
            return;
        }
        var deviceAddress = parts[0];
        
        var relayStatus = parts[1];
        var relayStatus1 = relayStatus & 0x01;
        var relayStatus2 = (relayStatus & 0x02) >> 1;
        var relayStatus3 = (relayStatus & 0x04) >> 2;
        var relayStatus4 = (relayStatus & 0x08) >> 3;
        var relayStatus5 = (relayStatus & 0x10) >> 4;
        var relayStatus6 = (relayStatus & 0x20) >> 5;
        var relayStatus7 = (relayStatus & 0x40) >> 6;
        var relayStatus8 = (relayStatus & 0x80) >> 7;
        
        var digiInputStatus = parts[2];
        var digiStatus1 = (digiInputStatus & 0x01);
        var digiStatus2 = (digiInputStatus & 0x02) >> 1;
        var digiStatus3 = (digiInputStatus & 0x04) >> 2;
        var digiStatus4 = (digiInputStatus & 0x08) >> 3;
        
        var analogInputStatus1 = parts[3];  // [0..1023]
        var analogInputStatus2 = parts[4];  // [0..1023]
        var analogInputStatus3 = parts[5];  // [0..1023]
        
        // TODO check state change and emit events if so.
        self.deviceState.relay1 = relayStatus1;
        self.deviceState.relay2 = relayStatus2;
        self.deviceState.relay3 = relayStatus3;
        self.deviceState.relay4 = relayStatus4;
        self.deviceState.relay5 = relayStatus5;
        self.deviceState.relay6 = relayStatus6;
        self.deviceState.relay7 = relayStatus7;
        self.deviceState.relay8 = relayStatus8;
        
        self.deviceState.digi1 = digiStatus1;
        self.deviceState.digi2 = digiStatus2;
        self.deviceState.digi3 = digiStatus3;
        self.deviceState.digi4 = digiStatus4;

        self.deviceState.analog1 = analogInputStatus1 / 1023;
        self.deviceState.analog2 = analogInputStatus2 / 1023;
        self.deviceState.analog3 = analogInputStatus3 / 1023;
        
        console.log("status: " + JSON.stringify(self.deviceState));
        /*
            relayStatus1 + " " +
            relayStatus2 + " " +
            relayStatus3 + " " +
            relayStatus4 + " " +
            relayStatus5 + " " +
            relayStatus6 + " " +
            relayStatus7 + " " +
            relayStatus8 + " : " +
            digiStatus1 + " " +
            digiStatus2 + " " +
            digiStatus3 + " " +
            digiStatus4 + " : " +
            analogInputStatus1/1023 + " " +
            analogInputStatus2/1023 + " " +
            analogInputStatus3/1023 + " "
        );
        */
        
        self.emit("status", data);
        self.commState = State.READY;
    }
    else if (self.commState == State.READY) {       // uninitiated data
        if (DEBUG) {
            console.log("got data event from relayduino: " + data);
        }
    }
    else {
        if (DEBUG) {
            console.log("got unknown data event from relayduino: " + data);
        }
    }

}

/**
 * Module exports
 */
exports.Relayduino = Relayduino;
