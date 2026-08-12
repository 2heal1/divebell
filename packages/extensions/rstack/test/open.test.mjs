import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import { createRstackStackDetectionInitScript } from "../dist/index.js";

test("open init script captures a transient direct script[data-rspack] and stops", () => {
  const observers = [];
  const head = {
    querySelectorAll() {
      return [];
    }
  };
  class MutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      observers.push(this);
    }

    observe(target, options) {
      this.target = target;
      this.options = options;
    }

    disconnect() {
      this.disconnected = true;
    }
  }
  const context = vm.createContext({
    Date,
    document: { head },
    MutationObserver
  });
  vm.runInContext(createRstackStackDetectionInitScript(), context);

  assert.equal(observers.length, 2);
  const headObserver = observers.find((observer) => observer.target === head);
  assert.equal(headObserver.options.childList, true);
  assert.equal(headObserver.options.subtree, false);
  assert.equal(headObserver.options.attributes, false);

  const transientScript = {
    nodeType: 1,
    tagName: "script",
    src: "http://localhost/main.123.hot-update.js",
    getAttribute(name) {
      return name === "data-rspack" ? "campaign-list:main" : null;
    },
    querySelectorAll() {
      return [];
    }
  };
  headObserver.callback([{ addedNodes: [transientScript] }]);

  const evidence = context.__DIVEBELL_RSTACK_STACK_EVIDENCE__;
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.dataRspackScriptCount, 1);
  assert.equal(evidence.hotUpdateScriptCount, 1);
  assert.equal(typeof evidence.observedAt, "number");
  assert.equal(headObserver.disconnected, true);
});

test("open init script moves from document bootstrap to the head observer", () => {
  const observers = [];
  const document = { head: null };
  class MutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      observers.push(this);
    }

    observe(target, options) {
      this.target = target;
      this.options = options;
    }

    disconnect() {
      this.disconnected = true;
    }
  }
  const context = vm.createContext({ Date, document, MutationObserver });
  vm.runInContext(createRstackStackDetectionInitScript(), context);

  const bootstrapObserver = observers[0];
  assert.equal(bootstrapObserver.target, document);
  assert.equal(bootstrapObserver.options.childList, true);
  assert.equal(bootstrapObserver.options.subtree, true);

  const head = {
    nodeType: 1,
    tagName: "HEAD",
    querySelectorAll() {
      return [];
    }
  };
  document.head = head;
  bootstrapObserver.callback([{ addedNodes: [head] }]);

  assert.equal(bootstrapObserver.disconnected, true);
  const headObserver = observers.find((observer) => observer.target === head);
  assert.ok(headObserver);
  assert.equal(headObserver.options.subtree, false);
});

test("open init script disconnects at load when no Rspack script was seen", () => {
  const observers = [];
  const listeners = new Map();
  class MutationObserver {
    constructor() {
      observers.push(this);
    }

    observe() {}

    disconnect() {
      this.disconnected = true;
    }
  }
  const context = vm.createContext({
    Date,
    document: {
      readyState: "loading",
      head: { querySelectorAll: () => [] }
    },
    MutationObserver,
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    removeEventListener(name, listener) {
      if (listeners.get(name) === listener) listeners.delete(name);
    }
  });
  vm.runInContext(createRstackStackDetectionInitScript(), context);

  assert.equal(typeof listeners.get("load"), "function");
  listeners.get("load")();
  assert.equal(observers.every((observer) => observer.disconnected), true);
  assert.equal(listeners.has("load"), false);
  assert.equal(
    context.__DIVEBELL_RSTACK_STACK_EVIDENCE__.dataRspackScriptCount,
    0
  );
});
