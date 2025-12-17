const EventEmitter = require('events').EventEmitter;
const constants = require('./constants');
const stdDbusIfaces = require('./stdifaces');
const introspect = require('./introspect').introspectBus;

module.exports = function bus(conn, opts) {
  if (!(this instanceof bus)) {
    return new bus(conn);
  }
  if (!opts) opts = {};

  var self = this;
  this.connection = conn;
  this.serial = 1;
  this.methodReturnHandlers = {};
  this.methodCallHandlers = {};
  this.signals = new EventEmitter();
  this.exportedObjects = {};

  this.invoke = function(msg) {
    if (!msg.type) msg.type = constants.messageType.methodCall;
    msg.serial = self.serial++;
    const deferred = Promise.withResolvers();
    this.methodReturnHandlers[msg.serial] = deferred;
    self.connection.message(msg);
    return deferred.promise;
  };

  this.invokeDbus = function(msg) {
    if (!msg.path) msg.path = '/org/freedesktop/DBus';
    if (!msg.destination) msg.destination = 'org.freedesktop.DBus';
    if (!msg['interface']) msg['interface'] = 'org.freedesktop.DBus';
    return self.invoke(msg);
  };

  this.mangle = function(path, iface, member) {
    var obj = {};
    if (typeof path === 'object') {
      // handle one argumant case mangle(msg)
      obj.path = path.path;
      obj['interface'] = path['interface'];
      obj.member = path.member;
    } else {
      obj.path = path;
      obj['interface'] = iface;
      obj.member = member;
    }
    return JSON.stringify(obj);
  };

  this.sendSignal = function(path, iface, name, signature, args) {
    var signalMsg = {
      type: constants.messageType.signal,
      serial: self.serial++,
      interface: iface,
      path: path,
      member: name
    };
    if (signature) {
      signalMsg.signature = signature;
      signalMsg.body = args;
    }
    self.connection.message(signalMsg);
  };

  // Warning: errorName must respect the same rules as interface names (must contain a dot)
  this.sendError = function(msg, errorName, errorText) {
    var reply = {
      type: constants.messageType.error,
      serial: self.serial++,
      replySerial: msg.serial,
      destination: msg.sender,
      errorName: errorName,
      signature: 's',
      body: [errorText]
    };
    this.connection.message(reply);
  };

  this.sendReply = function(msg, signature, body) {
    var reply = {
      type: constants.messageType.methodReturn,
      serial: self.serial++,
      replySerial: msg.serial,
      destination: msg.sender,
      signature: signature,
      body: body
    };
    this.connection.message(reply);
  };

  // route reply/error
  this.connection.on('message', function(msg) {
    function invoke(impl, func, resultSignature) {
      Promise.resolve()
        .then(function() {
          return func.apply(impl, (msg.body || []).concat(msg));
        })
        .then(
          function(methodReturnResult) {
            var methodReturnReply = {
              type: constants.messageType.methodReturn,
              serial: self.serial++,
              destination: msg.sender,
              replySerial: msg.serial
            };
            if (methodReturnResult !== null) {
              methodReturnReply.signature = resultSignature;
              methodReturnReply.body = [methodReturnResult];
            }
            self.connection.message(methodReturnReply);
          },
          function(e) {
            self.sendError(
              msg,
              e.dbusName || 'org.freedesktop.DBus.Error.Failed',
              e.message || ''
            );
          }
        );
    }

    var deferred;
    if (
      msg.type === constants.messageType.methodReturn ||
      msg.type === constants.messageType.error
    ) {
      deferred = self.methodReturnHandlers[msg.replySerial];
      if (deferred) {
        delete self.methodReturnHandlers[msg.replySerial];
        var args = msg.body || [];
        if (msg.type === constants.messageType.methodReturn) {
          deferred.resolve(...args); // body as array of arguments
        } else {
          deferred.resolve(args); // body as first argument
        }
      }
    } else if (msg.type === constants.messageType.signal) {
      self.signals.emit(self.mangle(msg), msg.body, msg.signature);
    } else {
      // methodCall

      if (stdDbusIfaces(msg, self)) return;

      // exported interfaces handlers
      var obj, iface, impl;
      if ((obj = self.exportedObjects[msg.path])) {
        if ((iface = obj[msg['interface']])) {
          // now we are ready to serve msg.member
          impl = iface[1];
          var func = impl[msg.member];
          if (!func) {
            self.sendError(
              msg,
              'org.freedesktop.DBus.Error.UnknownMethod',
              `Method "${msg.member}" on interface "${
                msg.interface
              }" doesn't exist`
            );
            return;
          }
          // TODO safety check here
          var resultSignature = iface[0].methods[msg.member][1];
          invoke(impl, func, resultSignature);
          return;
        } else {
          console.error(`Interface ${msg['interface']} is not supported`);
          // TODO: respond with standard dbus error
        }
      }
      // TODO
      // // setMethodCall handlers
      // deferred = self.methodCallHandlers[self.mangle(msg)];
      // if (deferred) {
      //   invoke(null, handler[0], handler[1]);
      // } else {
      //   self.sendError(
      //     msg,
      //     'org.freedesktop.DBus.Error.UnknownService',
      //     'Uh oh oh'
      //   );
      // }
    }
  });

  this.setMethodCallHandler = function(objectPath, iface, member, handler) {
    var key = self.mangle(objectPath, iface, member);
    self.methodCallHandlers[key] = handler;
  };

  this.exportInterface = function(obj, path, iface) {
    var entry;
    if (!self.exportedObjects[path]) {
      entry = self.exportedObjects[path] = {};
    } else {
      entry = self.exportedObjects[path];
    }
    entry[iface.name] = [iface, obj];
    // monkey-patch obj.emit()
    if (typeof obj.emit === 'function') {
      var oldEmit = obj.emit;
      obj.emit = function() {
        var args = Array.prototype.slice.apply(arguments);
        var signalName = args[0];
        if (!signalName) throw new Error('Trying to emit undefined signa');

        //send signal to bus
        var signal;
        if (iface.signals && iface.signals[signalName]) {
          signal = iface.signals[signalName];
          var signalMsg = {
            type: constants.messageType.signal,
            serial: self.serial++,
            interface: iface.name,
            path: path,
            member: signalName
          };
          if (signal[0]) {
            signalMsg.signature = signal[0];
            signalMsg.body = args.slice(1);
          }
          self.connection.message(signalMsg);
          self.serial++;
        }
        // note that local emit is likely to be called before signal arrives
        // to remote subscriber
        oldEmit.apply(obj, args);
      };
    }
    // TODO: emit ObjectManager's InterfaceAdded
  };

  // register name
  if (opts.direct !== true) {
    this.invokeDbus({ member: 'Hello' }, function(err, name) {
      if (err) throw new Error(err);
      self.name = name;
    });
  } else {
    self.name = null;
  }

  function DBusObject(name, service) {
    this.name = name;
    this.service = service;
    this.as = function(name) {
      return this.proxy[name];
    };
  }

  function DBusService(name, bus) {
    this.name = name;
    this.bus = bus;
    this.getObject = async function(name) {
      if (name === undefined)
        throw new Error('Object name is null or undefined');
      var obj = new DBusObject(name, this);
      const [ifaces, nodes] = await introspect(obj);
      obj.proxy = ifaces;
      obj.nodes = nodes;
      return obj;
    };

    this.getInterface = async function(objName, ifaceName) {
      const obj = await this.getObject(objName);
      return obj.as(ifaceName);
    };
  }

  this.getService = function(name) {
    return new DBusService(name, this);
  };

  this.getObject = function(path, name) {
    var service = this.getService(path);
    return service.getObject(name);
  };

  this.getInterface = function(path, objname, name) {
    const obj = this.getObject(path, objname);
    return obj.as(name);
  };

  // TODO: refactor

  // bus meta functions
  this.addMatch = function(match) {
    return this.invokeDbus({
      member: 'AddMatch',
      signature: 's',
      body: [match]
    });
  };

  this.removeMatch = function(match) {
    return this.invokeDbus({
      member: 'RemoveMatch',
      signature: 's',
      body: [match]
    });
  };

  this.getId = function() {
    return this.invokeDbus({ member: 'GetId' });
  };

  this.requestName = function(name, flags) {
    return this.invokeDbus({
      member: 'RequestName',
      signature: 'su',
      body: [name, flags]
    });
  };

  this.releaseName = function(name) {
    return this.invokeDbus({
      member: 'ReleaseName',
      signature: 's',
      body: [name]
    });
  };

  this.listNames = function() {
    return this.invokeDbus({ member: 'ListNames' });
  };

  this.listActivatableNames = function() {
    return this.invokeDbus({ member: 'ListActivatableNames' });
  };

  this.updateActivationEnvironment = function(env) {
    return this.invokeDbus({
      member: 'UpdateActivationEnvironment',
      signature: 'a{ss}',
      body: [env]
    });
  };

  this.startServiceByName = function(name, flags) {
    return this.invokeDbus({
      member: 'StartServiceByName',
      signature: 'su',
      body: [name, flags]
    });
  };

  this.getConnectionUnixUser = function(name) {
    return this.invokeDbus({
      member: 'GetConnectionUnixUser',
      signature: 's',
      body: [name]
    });
  };

  this.getConnectionUnixProcessId = function(name) {
    return this.invokeDbus({
      member: 'GetConnectionUnixProcessID',
      signature: 's',
      body: [name]
    });
  };

  this.getNameOwner = function(name) {
    return this.invokeDbus({
      member: 'GetNameOwner',
      signature: 's',
      body: [name]
    });
  };

  this.nameHasOwner = function(name) {
    return this.invokeDbus({
      member: 'NameHasOwner',
      signature: 's',
      body: [name]
    });
  };
};
