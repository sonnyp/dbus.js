import fs from "fs";
import assert from "assert";

import message from "../lib/message.js";

const dir = `${import.meta.dirname}/fixtures/messages/`;

describe("given base-64 encoded files with complete messages", function () {
  it("should be able to read them all", function () {
    var messages = fs.readdirSync(dir);
    messages.forEach(function (name) {
      var msg = fs.readFileSync(dir + name, "ascii");
      var msgBin = Buffer.from(msg, "base64");
      var unmarshalledMsg = message.unmarshall(msgBin);
      var marshalled = message.marshall(unmarshalledMsg);
      assert.deepStrictEqual(unmarshalledMsg, message.unmarshall(marshalled));
    });
  });
});
