import dbus from "../index.js";

/*
	This test file's purpose is to show how to query a simple, basic DBus service with this library.
	In order to do that, we connect to the session bus, request the basic service (launch with 'node basic-service.js')
	and issue method calls.

	For instance you can use `gdbus` to introspect a service and make function calls.
	- introspect: `gdbus introspect -e -d com.dbus.native.return.types -o /com/dbus/native/return/types`
	- make a method call: `gdbus introspect -e -d com.dbus.native.return.types -o /com/dbus/native/return/types -m com.dbus.native.return.types.FunctionName`
*/

const serviceName = "com.dbus.native.basic.service"; // the service we request

// The interface we request of the service
const interfaceName = serviceName;

// The object we request
const objectPath = `/${serviceName.replace(/\./g, "/")}`;

// First, connect to the session bus (works the same on the system bus, it's just less permissive)
const sessionBus = dbus.sessionBus();

// Check the connection was successful
if (!sessionBus) {
  throw new Error("Could not connect to the DBus session bus.");
}

const service = sessionBus.getService(serviceName);

const iface = await service.getInterface(objectPath, interfaceName);
const time = await iface.GiveTime();
console.log(`GiveTime returned: ${time}`);

const str = await iface.Capitalize("Hello, World!");
console.log(`Capitalize returned: ${str}`);

const nb = await iface.on("Rand");
console.log(`Received Rand: ${nb}`);
