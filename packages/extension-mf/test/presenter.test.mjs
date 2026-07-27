import assert from "node:assert/strict";
import test from "node:test";

import { createCommandPresenter } from "../dist/cli/presenter.js";
import { instance, runtimeState } from "./fixtures.mjs";
import { selectStatusInstances } from "../dist/public.js";

test("the same public candidate can be rendered for MF and Vmok without replacement", () => {
  const duplicate = runtimeState({
    instances: [
      instance({ instanceRef: "mf-1", name: "host", role: "consumer" }),
      instance({ instanceRef: "mf-2", name: "host", role: "consumer" })
    ]
  });
  const selected = selectStatusInstances(duplicate, { name: "host" });
  assert.equal(selected.ok, false);
  const candidate = selected.issue.candidates[0];
  const mf = createCommandPresenter(["openruntime", "mf"]);
  const vmok = createCommandPresenter(["openruntime", "vmok"]);
  assert.equal(mf.status(candidate), 'openruntime mf status --instance "mf-1"');
  assert.equal(vmok.status(candidate), 'openruntime vmok status --instance "mf-1"');
});

test("Bridge candidate commands quote every reusable selector", () => {
  const mf = createCommandPresenter(["openruntime", "mf"]);
  assert.equal(
    mf.bridgeTrace({
      remote: "shop alias",
      instanceRef: "mf-1",
      bridgeId: "bridge-1",
      operationId: "op-1"
    }),
    'openruntime mf bridge trace "shop alias" --instance "mf-1" --bridge-id "bridge-1" --operation "op-1"'
  );
});

test("remote presenter creates directly copyable disambiguation commands", () => {
  const presenter = createCommandPresenter(["openruntime", "mf"]);
  assert.equal(
    presenter.remoteTrace({ target: "shop/Button", instanceRef: "mf-1", traceId: "trace-1" }),
    'openruntime mf remote trace "shop/Button" --instance "mf-1" --trace-id "trace-1"'
  );
  assert.equal(
    presenter.remoteStatus({ remote: "shop", instanceRef: "mf-1" }),
    'openruntime mf remote status "shop" --instance "mf-1"'
  );
  assert.equal(
    presenter.remoteTrace({
      target: "shop",
      instanceRef: "mf-1",
      traceId: "preload-1",
      preload: true
    }),
    'openruntime mf remote trace "shop" --preload --instance "mf-1" --trace-id "preload-1"'
  );
});
