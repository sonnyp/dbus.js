import dbus from "../../index.js";

var bus = dbus.sessionBus();
var name = "some.name";
var iface = "com.example.service";

async function test() {
  try {
    const res = await bus.invoke({
      path: "/",
      destination: name,
      interface: iface,
      member: "doStuff",
      signature: "s",
      body: ["does it really work?"],
    });
    console.log(res);
  } catch (err) {
    console.error(err);
  }
}

bus.addMatch("type='signal'");
bus.connection.on("message", console.log);

setInterval(test, 2000);
test();
