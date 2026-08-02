# Module performance fields

## What the command measures

`module-perf [remote/expose]` analyzes module loads already observed in the
current page. With no target it returns every observed producer/expose group.
It never calls `loadRemote`, never renders a module, and never turns one load
into several benchmark runs. Two entries in `operations` mean the page really
performed two matching module-load operations.

The target application does not install Slardar or add consumer code for this
command. `open --mf` installs the bounded page collector before navigation. MF
loading boundaries come from the official MF observability hooks; paint,
resource, and interaction facts come from the browser.

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

- `loadRemote.start`, `end`, `duration`: the complete MF module request, from
  entering `loadRemote` until its final result. Read the operation's `outcome`
  with this interval: `success` means `loadRemote` finished successfully;
  `recovered`, `error`, `pending`, and `unknown` preserve MF's observed result.
  A pending operation has no `end`; its `duration` is elapsed time at the point
  of observation rather than a completed duration.
- `remoteEntry.start`, `end`, `duration`: the complete observed remoteEntry
  request lifecycle. It can include redirects, browser scheduling, connection,
  server wait, and transfer; it is not a download-only duration.
- `remoteEntry.blockingDuration`: the part of that lifecycle that overlaps the
  module's wait after `loadRemote.start` and before both `get.start` and
  `loadRemote.end` where those boundaries are available. This is `0` when a
  preload completed before the module needed the file, or when an inconsistent
  late resource record starts after the operation already completed.
- `get.start`, `end`, `duration`: from immediately before the container expose
  `get` call until it returns. This includes synchronous expose chunks that the
  generated container waits for.
- `factory.start`, `end`, `duration`: execution of the returned module factory.

`start` and `end` are positions on the page's navigation-relative timeline.
For example, a remoteEntry with
`start: 5029.5`, `end: 86751.4`, and `duration: 81721.9` started about 5.0
seconds after navigation, finished about 86.8 seconds after navigation, and
had an observed request lifecycle of about 81.7 seconds. That number alone
does not prove that transferring the JavaScript bytes took 81.7 seconds.

The command stops at the `loadRemote` result. It does not infer component
rendering, visible content, data readiness, or interactivity. Some bundler
integrations request a factory without asking Runtime to execute it, so factory
timing can be absent while the complete `loadRemote` and get timing remain
valid.

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
on when the request happened. Cross-origin Resource Timing can expose a
complete lifecycle without exposing redirect, server-wait, and transfer
breakdown; unavailable details are omitted rather than reported as zero.

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
- transfer/body sizes and `cache`: best-effort browser facts. These fields are
  omitted when the browser exposes only zero values and no trustworthy cache
  classification, which commonly happens for cross-origin resources without
  Resource Timing access.
  `cache-or-service-worker` deliberately does not claim which of those paths
  supplied a zero-transfer response. Missing sizes can be caused by
  cross-origin timing restrictions and must not be read as zero.

Use delayed synchronous expose assets for preload decisions. Do not recommend
preloading an async asset merely because it belongs to the same expose.

## Page impact

`pageImpact` connects the module timeline to the page without claiming that MF
runtime success proves business readiness:

- `trigger`: `initial` when `loadRemote` started no later than FCP,
  `interaction` when a
  captured user input immediately preceded the request, `automatic` when it
  started later without a recent input, or `unknown` when evidence is missing.
- `completedBeforeFp`: whether `loadRemote.end` is no later than FP.
- `completedBeforeFcp`: whether `loadRemote.end` is no later than FCP.
- `completedBeforeLcp`: whether `loadRemote.end` is no later than the latest
  observed LCP. Read `page.lcpStatus`; a provisional LCP can still change.

The completion fields are omitted when either boundary is unavailable. They
only compare times and can also describe when a failed operation ended, so read
`outcome` before interpreting them. They do not claim that the module caused a
paint. For an interaction-triggered or automatic module, avoid promoting
resources to initial page priority without a demonstrated user-visible benefit.

## Bottleneck and findings

`bottleneck` is a deterministic comparison of measured stages, not a generated
guess:

- `remoteEntry`: remoteEntry has the longest measured blocking time on the
  module path. Its full request lifecycle is not used when part or all of the
  request completed before `loadRemote` needed it.
- `expose-resource`: matched synchronous expose-resource time occupies at
  least half of get and at least 20 ms.
- `get`: get is longest but matched resource loading does not explain it.
- `factory`: module initialization is longest.
- `mixed`: the two longest phases are within 15 percent.
- `unknown`: complete phase boundaries are missing.

Apply this comparison only when `outcome` is `success` or `recovered`. For an
error, pending, or unknown result, the command deliberately leaves the
bottleneck unknown. Complete or troubleshoot the Remote loading trace before
interpreting performance.

`duration`, `percentage`, `confidence`, and `evidence` expose why that label was
chosen. For a remoteEntry bottleneck, `duration` and `percentage` use
`blockingDuration`, not the full request lifecycle. `findings` apply fixed
evidence rules and retain the evidence behind their diagnosis:

- A remoteEntry requested late on the initial page path: consider preloading
  it. A request that started promptly but remained slow is reported as a
  delivery problem instead; preload is not presented as the fix.
- Delayed synchronous expose assets on an initial page path: preload the exact
  listed assets.
- Slow get after all sync assets were already ready: inspect shared resolution
  and profile runtime work; more preload will not fix the measured delay.
- Slow factory: profile and reduce top-level module initialization.

The command does not duplicate findings into `recommendedActions` and does not
return per-finding `suggestion` text. It also omits `warnings`; unavailable or
incomplete evidence is represented by the corresponding status, match, outcome,
or unobserved entry.

## Code Usage follow-up

`codeUsage.status: recommended` provides exact expose JavaScript URLs in
`assets`. Run Code Usage separately against those files, then use its executed
and unused-code evidence to guide code splitting. The performance command does
not automatically enable coverage because coverage changes engine behavior and
would contaminate the measurement.

Code Usage is useful for the expose JavaScript, not for `remoteEntry.js`.
Without an unambiguous Manifest asset match, `codeUsage` remains `unavailable`
instead of guessing a chunk from timing alone.
