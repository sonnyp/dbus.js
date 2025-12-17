import dbus from "../../index.js";

var bus = dbus.sessionBus();

var destination = "vasya.pupkin";
const res = await bus.invoke({
  path: "/0/1",
  destination: destination,
  interface: "org.vasya.pupkin.reverser",
  member: "reverse",
  signature: "s",
  body: ["does it really work?"],
});
console.log(res);
