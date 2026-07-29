# @divebell/test

`@divebell/test` is Divebell's private end-to-end acceptance harness.

Each run creates one clean environment, packs and installs every official
Extension once through the real Divebell CLI, and then reuses that installation
for isolated scenarios. Scenarios must execute the CLI as a separate process;
they must not import an Extension command or the CLI runner directly.

The first scenario covers `@divebell/extension-troubleshooting` against a real
Bridge and Runtime connection. Future Extension scenarios should be added to
the same suite so package installation remains a one-time cost.

Run the complete acceptance suite from the repository root:

```sh
pnpm test:e2e
```
