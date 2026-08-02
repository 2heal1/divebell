# Module performance fields

## What the command measures

`module-perf [remote/expose]` analyzes module loads already observed in the
current page. With no target it returns every observed producer/expose group.
It never calls `loadRemote`, never repeats a render, and never turns one load
into several benchmark runs. Two entries in `operations` mean the page really
performed two matching module-load operations.

The target application does not install Slardar or add consumer code for this
command. `open --mf` installs the bounded page collector before navigation. MF
loading boundaries come from the official MF observability hooks; paint,
resource, interaction, and first-visible-content facts come from browser and
Bridge observation.

## Page timing

`page.fp`, `page.fcp`, and `page.lcp` are milliseconds elapsed from navigation
start, not durations of the paint operation itself and not wall-clock
timestamps.

- `fp`: first paint.
- `fcp`: first contentful paint.
- `lcp`: latest observed largest contentful paint.
- `lcpStatus`: `provisional` while a visible page can still produce a later
  LCP, `final` after the page is hidden, or `not-observed`.

Do not compare these values across different navigations as if they belong to
one timeline.

## Modules and operations

Each `modules` entry identifies one consumer, producer, Remote, and optional
expose. `operations` contains actual matching `loadRemote` histories in start
order.

For one operation, `timing` uses the same navigation-relative millisecond
clock as page paint:

- `requested`: when the module request entered MF.
- `remoteEntry.start`, `end`, `duration`: remoteEntry loading boundary.
- `get.start`, `end`, `duration`: from immediately before the container expose
  `get` call until it returns. This includes synchronous expose chunks that the
  generated container waits for.
- `factory.start`, `end`, `duration`: execution of the returned module factory.
- `render.start`, `end`, `duration`: producer-side Bridge render when observed.
- `firstContent`: first visible content observed inside that render root.
- `getToRender`: elapsed time from `get.start` through render return.
- `getToFirstContent`: elapsed time from `get.start` to the first visible
  content inside the producer root.

When the module does not use MF Bridge, `render`, `firstContent`,
`getToRender`, and `getToFirstContent` can be absent. Keep the valid get and
any observed factory timing; do not call rendering zero milliseconds. Some
bundler integrations request a factory without asking Runtime to execute it,
so factory timing can also be absent while get timing remains valid.

## Manifest assets and browser resource timing

`manifest.status` is:

- `available`: one Manifest snapshot matched the producer and expose.
- `ambiguous`: several snapshots matched and the command refused to guess.
- `unavailable`: no matching Manifest expose information was present.

An unavailable Manifest does not invalidate MF get or factory timing. Ask the
user to publish or use an MF Manifest when exact expose-resource attribution is
needed.

When present, `manifest.remoteEntryResource` is the Manifest remoteEntry file
matched to browser Resource Timing. It uses the same `match`, URL, start/end,
duration, size, cache, and `loadedBeforeGet` meanings as expose assets. This
resource supplies `timing.remoteEntry` when an older MF report did not preserve
its own remoteEntry phase. The match is still based on file identity, not only
on when the request happened.

`manifest.assets` lists `js.sync` and optional `js.async` assets declared for
the expose. Each asset has:

- `kind`: `sync` is required by the expose get path; `async` is related to the
  expose but is not automatically treated as blocking get.
- `match`: `matched`, `not-loaded`, or `ambiguous`. Attribution requires the
  Manifest asset identity to match browser Resource Timing; a time window alone
  is never enough.
- `start`, `end`, `duration`: actual browser resource timing, in milliseconds
  from navigation start.
- `loadedBeforeGet`: whether the resource completed before `get.start`.
- transfer/body sizes and `cache`: best-effort browser facts.
  `cache-or-service-worker` deliberately does not claim which of those paths
  supplied a zero-transfer response. Missing sizes can be caused by
  cross-origin timing restrictions and must not be read as zero.

Use delayed synchronous expose assets for preload decisions. Do not recommend
preloading an async asset merely because it belongs to the same expose.

## Page impact

`pageImpact` connects the module timeline to the page without claiming that MF
runtime success proves business readiness:

- `trigger`: `initial` when requested no later than FCP, `interaction` when a
  captured user input immediately preceded the request, `automatic` when it
  started later without a recent input, or `unknown` when evidence is missing.
- `rendering`: whether a producer Bridge render was observed.
- `visibleBeforeLcp`: whether the first visible module content appeared no
  later than the current LCP.
- `containsLcpElement`: whether the module render root contains the recorded
  LCP element.
- `confidence`: evidence strength for this association.

For an interaction-triggered or below-fold module, avoid promoting resources
to initial page priority without a demonstrated user-visible benefit. A module
containing the LCP element is stronger evidence that earlier loading can help.

## Bottleneck and findings

`bottleneck` is a deterministic comparison of measured stages, not a generated
guess:

- `remoteEntry`: remoteEntry is the longest phase.
- `expose-resource`: matched synchronous expose-resource time occupies at
  least half of get and at least 20 ms.
- `get`: get is longest but matched resource loading does not explain it.
- `factory`: module initialization is longest.
- `render`: producer render is longest.
- `mixed`: the two longest phases are within 15 percent.
- `unknown`: complete phase boundaries are missing.

`duration`, `percentage`, `confidence`, and `evidence` expose why that label was
chosen. `findings` apply fixed evidence rules and include their evidence and a
concrete suggestion:

- Slow remoteEntry: preload remoteEntry. Do not use Code Usage to split it.
- Delayed synchronous expose assets on an initial/LCP path: preload the exact
  listed assets.
- Slow get after all sync assets were already ready: inspect shared resolution
  and profile runtime work; more preload will not fix the measured delay.
- Slow factory: profile and reduce top-level module initialization.
- Slow render: profile the producer component and reduce synchronous render
  work.

`recommendedActions` only promotes warning-level findings. Read each finding's
evidence before changing resource priority.

## Code Usage follow-up

`codeUsage.status: recommended` provides exact expose JavaScript URLs in
`assets`. Run Code Usage separately against those files, then use its executed
and unused-code evidence to guide code splitting. The performance command does
not automatically enable coverage because coverage changes engine behavior and
would contaminate the measurement.

Code Usage is useful for the expose JavaScript, not for `remoteEntry.js`.
Without an unambiguous Manifest asset match, `codeUsage` remains `unavailable`
instead of guessing a chunk from timing alone.
