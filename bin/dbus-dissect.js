// simple script to monitor incoming/outcoming dbus messages
// needs a lot of cleanup but does the job

import net from "net";

import through2 from "through2";
import optimist from "optimist";

import message from "../lib/message.js";
import readLine from "../lib/readline.js";

var sessionBusAddress = process.env.DBUS_SESSION_BUS_ADDRESS;
var m = sessionBusAddress.match(/abstract=([^,]+)/);

var isSystemBus = optimist.boolean(["system"]).argv.system;

var address = isSystemBus ? "/var/run/dbus/system_bus_socket" : `\0${m[1]}`;

function waitHandshake(stream, prefix, cb) {
  readLine(stream, function (line) {
    console.log(prefix, line.toString());
    if (
      line.toString().slice(0, 5) === "BEGIN" ||
      line.toString().slice(0, 2) === "OK"
    ) {
      cb();
    } else {
      waitHandshake(stream, prefix, cb);
    }
  });
}

net
  .createServer(function (s) {
    var buff = "";
    var connected = false;

    var cli = net.connect(address);

    s.on("data", function (d) {
      if (connected) {
        cli.write(d);
      } else {
        buff += d.toString();
      }
    });
    connected = true;
    cli.write(buff);
    cli.pipe(s);

    var cc = through2();
    var ss = through2();

    // TODO: pipe? streams1 and streams2 here
    cli.on("data", function (b) {
      cc.write(b);
    });
    s.on("data", function (b) {
      ss.write(b);
    });

    waitHandshake(cc, "dbus>", function () {
      message.unmarshalMessages(cc, function (message) {
        console.log("dbus>\n", JSON.stringify(message, null, 2));
      });
    });

    waitHandshake(ss, " cli>", function () {
      message.unmarshalMessages(ss, function (message) {
        console.log(" cli>\n", JSON.stringify(message, null, 2));
      });
    });
  })
  .listen(3334, function () {
    console.log(
      "Server started. connect with DBUS_SESSION_BUS_ADDRESS=tcp:host=127.0.0.1,port=3334",
    );
  });
