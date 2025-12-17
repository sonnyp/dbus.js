import net from "net";

import dbus from "../index.js";

export default function createServer(handler) {
  function Server() {
    var id = 123;
    this.server = net.createServer(function (socket) {
      socket.idd = id;
      id++;

      var dbusConn = dbus.createConnection({ stream: socket, server: true });
      if (handler) handler(dbusConn);
      // TODO: inherit from EE this.emit('connect', dbusConn);
    });
    this.listen = this.server.listen.bind(this.server);
  }
  return new Server();
}
