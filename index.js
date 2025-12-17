// dbus.freedesktop.org/doc/dbus-specification.html

import { EventEmitter } from "events";
import net from "net";
import { spawn } from "child_process";

import eventStream from "event-stream";

import constants from "./lib/constants.js";
import message from "./lib/message.js";
import clientHandshake from "./lib/handshake.js";
import serverHandshake from "./lib/server-handshake.js";
import MessageBus from "./lib/bus.js";
import server from "./lib/server.js";

function createStream(opts) {
  if (opts.stream) return opts.stream;
  var host = opts.host;
  var port = opts.port;
  var socket = opts.socket;
  if (socket) return net.createConnection(socket);
  if (port) return net.createConnection(port, host);

  var busAddress = opts.busAddress || process.env.DBUS_SESSION_BUS_ADDRESS;
  if (!busAddress) throw new Error("unknown bus address");

  var addresses = busAddress.split(";");
  for (var i = 0; i < addresses.length; ++i) {
    var address = addresses[i];
    var familyParams = address.split(":");
    var family = familyParams[0];
    var params = {};
    familyParams[1].split(",").map(function (p) {
      var keyVal = p.split("=");
      params[keyVal[0]] = keyVal[1];
    });

    try {
      switch (family.toLowerCase()) {
        case "tcp":
          host = params.host || "localhost";
          port = params.port;
          return net.createConnection(port, host);
        case "unix":
          if (params.socket) return net.createConnection(params.socket);
          if (params.abstract) {
            return net.createConnection("\0" + params.abstract);
          }
          if (params.path) return net.createConnection(params.path);
          throw new Error(
            "not enough parameters for 'unix' connection - you need to specify 'socket' or 'abstract' or 'path' parameter",
          );
        case "unixexec":
          var args = [];
          for (var n = 1; params["arg" + n]; n++) args.push(params["arg" + n]);
          var child = spawn(params.path, args);

          return eventStream.duplex(child.stdin, child.stdout);
        default:
          throw new Error("unknown address type:" + family);
      }
    } catch (e) {
      if (i < addresses.length - 1) {
        console.warn(e.message);
        continue;
      } else {
        throw e;
      }
    }
  }
}

export function createConnection(opts) {
  var self = new EventEmitter();
  if (!opts) opts = {};
  var stream = (self.stream = createStream(opts));
  stream.setNoDelay();

  stream.on("error", function (err) {
    // forward network and stream errors
    self.emit("error", err);
  });

  stream.on("end", function () {
    self.emit("end");
    self.message = function () {
      console.warn("Didn't write bytes to closed stream");
    };
  });

  self.end = function () {
    stream.end();
    return self;
  };

  var handshake;
  if (opts.handshake === "none") {
    handshake = () => {};
  } else {
    handshake = opts.server ? serverHandshake : clientHandshake;
  }
  handshake(stream, opts, function (error, guid) {
    if (error) {
      return self.emit("error", error);
    }
    self.guid = guid;
    self.emit("connect");
    message.unmarshalMessages(
      stream,
      function (message) {
        self.emit("message", message);
      },
      opts,
    );
  });

  self._messages = [];

  // pre-connect version, buffers all messages. replaced after connect
  self.message = function (msg) {
    self._messages.push(msg);
  };

  self.once("connect", function () {
    self.state = "connected";
    for (var i = 0; i < self._messages.length; ++i) {
      stream.write(message.marshall(self._messages[i]));
    }
    self._messages.length = 0;

    // no need to buffer once connected
    self.message = function (msg) {
      stream.write(message.marshall(msg));
    };
  });

  return self;
}

export function createClient(params) {
  var connection = createConnection(params || {});
  return new MessageBus(connection, params || {});
}

export function systemBus() {
  return createClient({
    busAddress:
      process.env.DBUS_SYSTEM_BUS_ADDRESS ||
      "unix:path=/var/run/dbus/system_bus_socket",
  });
}

export function sessionBus(opts) {
  return createClient(opts);
}

const { messageType } = constants;
export { messageType };

const { createServer } = server;
export { createServer };

export default {
  sessionBus,
  systemBus,
  createServer,
  createClient,
  createConnection,
  messageType,
};
