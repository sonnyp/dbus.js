import dbus from "../index.js";

var bus = dbus.sessionBus();
var panel = bus.getService("com.canonical.Unity.Panel.Service");
const nm = await panel.getInterface(
  "/com/canonical/Unity/Panel/Service",
  "com.canonical.Unity.Panel.Service",
);
nm.addListener("EntryActivated", function (entry) {
  console.log(entry);
});
