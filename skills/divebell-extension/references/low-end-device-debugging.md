# Low-end device and network debugging

Use an Extension `open` Hook to simulate constrained CPU and network conditions
before the page's first navigation. This lets an Extension verify first-load
behavior such as initial HTML, JavaScript and CSS loading, and the first API
requests.

```ts
import type { DivebellExtensionHooks } from "@divebell/cli";

export const open: NonNullable<DivebellExtensionHooks["open"]> = async () => ({
  throttling: {
    cpuRate: 4,
    network: {
      latencyMs: 150,
      downloadKbps: 800,
      uploadKbps: 400
    }
  }
});
```

`cpuRate` is a Chromium CPU slowdown factor. It is not a host CPU-core count
and does not start the browser daemon with a requested number of cores.

The network fields use milliseconds for `latencyMs` and decimal kilobits per
second for `downloadKbps` and `uploadKbps`. Provide at least one network field
when declaring `network`.

Divebell starts the Chromium session, applies these conditions through CDP, and
then navigates to the requested page. This pre-navigation path is used only
when an open Hook declares `throttling`; ordinary `divebell open` behavior is
unchanged.

For an already-open page, use `options.divebell.browser.throttling` to
reproduce a later interaction or to apply conditions before `reload` or
`goto`. Reset both CPU and network conditions after a measurement when the
same session will be reused.
