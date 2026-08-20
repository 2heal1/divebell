# Module performance fields

## Scope the performance request

Use this workflow only when the user explicitly asks about MF, Module
Federation, or the current command alias's loading performance, runtime
performance, bottlenecks, or module resource cost. An ordinary question about
MF state, configuration, Remotes, Shared dependencies, or errors does not
become a performance task merely because it mentions MF.

Start with `module-perf`. With no target it returns every producer/expose load
already observed on the page. Use `status` only when the result cannot select
an exact instance or consumer. Do not add a generic CLI `vitals` command unless
the user separately asks about whole-page performance.

## What the command measures

`module-perf [remote/expose]` analyzes module loads already observed in the
current page. With no target it returns every observed producer/expose group.
It never calls `loadRemote`, never renders a module, and never turns one load
into several benchmark runs. Two entries in `operations` mean the page really
performed two matching module-load operations.

The target application does not install Slardar or add consumer code for this
command. `open --mf` installs the bounded page collector before navigation. MF
loading boundaries come from one official MF Observability trace, not a second
runtime plugin or timestamp matching; paint and resource facts come from the
browser.

## Report the MF performance relationship

Organize the answer around the selected MF operation instead of producing a
generic page-performance report. Preserve this complete identity for every
module:

```text
consumer name/instanceRef
  -> remote name/alias/entry
  -> producer name/version
  -> expose
```

Keep each operation and its Manifest assets under that identity. For an
operation, report `traceId`, `outcome`, `loadRemote.duration`, measured
`remoteEntry.blockingDuration`, `get.duration`, `factory.duration`, the
deterministic `bottleneck`, and applicable findings. Omit unavailable phases
instead of turning them into zero.

Use page timing only to explain when the selected MF operation happened. Do
not list TTFB, CLS, INP, or a standalone Core Web Vitals table for an MF
performance request. FP, FCP, and LCP are relevant only as timeline anchors for
MF evidence. Prefer explicit relationships such as:

- FCP occurred at `page.fcp` milliseconds after navigation;
- `loadRemote` began `loadRemote.start - page.fcp` milliseconds before or
  after FCP;
- `remoteEntry` began `remoteEntry.start - page.fcp` milliseconds before or
  after FCP;
- `remoteEntry` began `remoteEntry.start - loadRemote.start` milliseconds
  after the module was requested; and
- the MF operation completed `loadRemote.end - page.fcp` milliseconds before
  or after FCP.

All of these values use the same navigation-relative clock. State only the
observed relationship. Do not claim that MF caused FP, FCP, LCP, rendering,
readiness, or interactivity.

Report related JavaScript only inside its producer/expose group. A Manifest
with `status: available` establishes the declared asset ownership. Browser
request duration, size, and cache evidence additionally require
`match: matched`. Describe `not-loaded` only as Manifest-declared but not
observed loading, and never flatten assets from several modules into one chunk
table.

For matched synchronous expose assets, report available resource duration,
transfer size, encoded body size, and decoded body size. Preserve the exact
cache classification. `cache-or-service-worker` does not identify which path
served the response, and `decodedBodySize` is uncompressed response size rather
than runtime memory.

## Page timing

`page.fp`, `page.fcp`, and `page.lcp` are milliseconds elapsed from navigation
start, not durations of the paint operation itself and not wall-clock
timestamps.

When available, `page.clock` identifies `navigationStart` as the shared origin,
and `page.document` gives the main HTML response interval from browser
Navigation Timing. `page.scripts` contains external script resources that were
still declared by `script[src]` when the snapshot was read. Their position on
the same clock is observed browser evidence; it does not prove that one of
those scripts initialized MF or triggered a particular `loadRemote` call.

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
- `manifest.start`, `end`, `duration`: the Manifest or deployment snapshot
  resolution observed inside the selected MF trace.
- `remoteEntry.start`, `end`, `duration`: the complete observed remoteEntry
  request lifecycle. It can include redirects, browser scheduling, connection,
  server wait, and transfer; it is not a download-only duration.
- `remoteEntry.blockingDuration`: the part of that lifecycle that overlaps the
  module's wait after `loadRemote.start` and before both `get.start` and
  `loadRemote.end` where those boundaries are available. This is `0` when a
  preload or another non-blocking request completed outside that wait.
- `containerInit.start`, `end`, `duration`: initialization of the selected
  provider container, from the official `beforeInitRemote`/`afterInitRemote`
  lifecycle. This is not consumer-runtime initialization.
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
the expose. `sharedDependencies[].assets` uses the same resource fields for
JavaScript declared by the producer's `moduleInfo.shared[].assets.js`. Each
asset has:

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

`preloadJs` contains only JavaScript that can be attributed to this MF target:

- official `preloadRemote` JavaScript from the same consumer, Remote, and
  compatible expose; or
- a browser `preload`/`modulepreload` resource that matches the target's
  Manifest remoteEntry or expose asset.

`initiators` says which of these mechanisms was observed. `role` distinguishes
`remoteEntry`, synchronous expose assets, asynchronous expose assets, and
Remote JavaScript observed through official MF preload evidence without a
matching Manifest asset. Ordinary page preload resources are omitted. When no
attributed MF preload JavaScript exists, `preloadJs` is empty and the report
does not create an MF preload lane.

## Page impact

`pageImpact` connects the `loadRemote` interval to page paint without claiming
that the module caused a paint or that application content rendered. It can
contain `fp`, `fcp`, and `lcp`; a missing browser milestone is omitted. Each
available milestone contains:

- `startDelta`: `loadRemote.start - milestone`.
- `endDelta`: `loadRemote.end - milestone`; omitted while the operation has no
  end.

A negative delta means the load boundary happened before the milestone, a
positive delta means it happened after, and zero means the two observed times
were equal at the command's precision. For example,
`fcp.startDelta: 284.1` means `loadRemote` began 284.1 ms after FCP, while
`lcp.endDelta: -553.5` means it ended 553.5 ms before the currently observed
LCP. Read `page.lcpStatus`; a provisional LCP and its deltas can still change.

These fields only compare times and can also describe a failed operation, so
read `outcome` before interpreting them. They do not infer whether a request
was automatic or interaction-triggered and do not observe component rendering.

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
`blockingDuration`, not the full request lifecycle. `findings` preserve the
fixed diagnosis and its evidence; `--report` turns actionable findings into
report-level recommendations. The command omits `warnings` and
`recommendedActions`; unavailable or incomplete evidence is represented by the
corresponding status, match, outcome, or unobserved entry.

## `--report` return

Use `module-perf --report` when the user explicitly asks for a fixed,
consolidated performance report. It is a stable view over the normal
`module-perf` result, not another measurement: it does not load a Remote,
render a module, or create a second sample.

Use `module-perf --report --view timeline` when the user explicitly wants the
same report rendered directly in a terminal. The terminal view replaces the
structured JSON envelope for that invocation only. Omit `--view timeline` for
Agent or pipeline consumption. The view does not change the measurement,
timeline boundaries, or report diagnosis. It uses a two-column `Event` /
`Timeline` table, abbreviates long event names, and omits the generic
`page-script` lane. The Event column contains identity and hierarchy only. The
Timeline column contains every displayed marker, bar, timestamp, duration, and
transfer size. Encoded/decoded size, cache, provider/source details, and other
exact fields remain in the structured JSON report.

The stable return is timeline-first:

```text
report
  timeline
    clock
    markers[]
    lanes[]
  summary
  modules[]
    consumer
    remote
    producer
    expose
    operations[]
      status
      timing
      pageImpact
      remoteEntry
      exposeAssets[]
      sharedDependencies[]
      preloadJs[]
      bottleneck
      findings[]
  sharedOperations[]
    requester
    packageName
    action
    timing
    provider
    selectedVersion
    assets[]
  recommendations[]
  page
  selection
  unobservedRemotes[]
```

`timeline` is always the first report field. Present it before the prose
diagnosis, then explain findings and recommendations by referring back to its
lanes and boundaries. When browser Navigation Timing is available its origin
is `navigationStart`; otherwise its origin is `firstObservedModuleLoad` and
the earliest observed `loadRemote` starts at zero. Never treat that fallback as
a page-navigation measurement; an earlier observed preload can have a negative
start relative to that origin. Its lane kinds are:

- `page`: navigation start and the main HTML response interval;
- `page-script`: observed external script resources, excluding JavaScript
  attributed to the selected MF modules;
- `mf-consumer`: the official `loadRemote` interval. Do not rename this to
  consumer initialization because the current MF evidence has no consumer-init
  boundary;
- `mf-provider`: Manifest, remoteEntry, provider container initialization,
  expose get/synchronous chunks, factory execution, and the final MF result;
- `mf-shared`: observed `loadShare` operations. A provider's initial operation
  is shown as a `load` lifecycle. When its declared Shared asset matches Browser
  Resource Timing, a separate Shared JS loading span uses that request's actual
  start and end. A later consumer operation is labeled `reuse` when the selected
  provider differs from that Remote. Reuse timing is the observed `loadShare`
  lifecycle, not a fabricated JavaScript request;
- `mf-resource`: matched remoteEntry, expose, and Shared JavaScript resources,
  including request duration, transfer/body sizes, and cache evidence when the
  browser exposes them; and
- `mf-preload`: attributed MF preload JavaScript only. The lane is omitted when
  there is no such evidence.

`markers` places FP, FCP, and the latest observed LCP on the same clock. LCP
keeps its provisional/final status. The terminal view merges FP and FCP when
they have the same timestamp, uses `●` for completed milestones, and uses `◇`
for provisional LCP. Render each marker as a point on the Paint row; do not
extend it as a vertical line through unrelated MF events. Render spans in
chronological proportion on one seconds-based axis. Do not draw a causal arrow
between browser resources and MF events unless the report contains explicit
evidence for that relation.

The terminal view follows these value rules:

- the Event column contains only section, event, dependency, expose, and file
  names;
- a normal Shared or JavaScript resource bar is followed in the Timeline
  column by `{duration}` and, when observed, ` · {transferSize}`. Omit the size
  segment when transfer size was not observed. Do not repeat absolute start/end
  timestamps for these costs;
- `loadRemote` is the exception: its line ends in `●` on success and the next
  Timeline line shows the exact start at the left boundary and exact completion
  at the right boundary. Keep total duration in structured details;
- Shared reuse is rendered as `◆ reuse` at the observed loadShare completion
  and the following Timeline line shows its timestamp. Keep `provider`,
  selected version, and the fact that no additional JavaScript was matched in
  structured details; and
- short MF lifecycle transitions can use `◆`; ordinary observed intervals use
  `━`; completed milestones use `●`.

The current report has a provider container-init boundary but no consumer
initialization boundary. Do not invent a Consumer `Initialize` marker or rename
`loadRemote` to initialization.

### Terminal timeline example

Render a result in a compact form similar to this. The horizontal positions use
one clock; values stay in the Timeline column directly below their graph.

```text
┌──────────────────────────────┬────────────────────────────────────────────────────────────────┐
│ Event                        │ Timeline · navigationStart = 0 ms                              │
│                              │ 0s              1s              2s              3s         4s │
├──────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Page                         │                                                                │
│   Paint                      │                  ●                                        ◇    │
│                              │              FP · FCP                                    LCP   │
│                              │                1.116s                                  4.008s  │
├──────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Consumer · host              │                                                                │
│   loadRemote                 │                                                                │
│     catalog/Button           │                                ━━━━━━━━━━━━━━━━━━━━━━━━━●      │
│                              │                                2.05s                     3.96s │
│   Shared                     │                                                                │
│     react@19.1.1             │                      ━━━━━                                     │
│                              │                      260ms · 45 KB                             │
├──────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ Producer · catalog           │                                                                │
│   Resources                  │                                                                │
│     remoteEntry.js           │                                             ━━━━━━━━━━━        │
│                              │                                             555ms · 18 KB      │
│     Button.js                │                                             ━━━━━━━━━━━━━━━━━━ │
│                              │                                             1.20s · 246 KB     │
│   Shared                     │                                                                │
│     react@19.1.1             │                                                       ◆ reuse │
│                              │                                                       3.293s   │
└──────────────────────────────┴────────────────────────────────────────────────────────────────┘
```

Read every boundary from `timeline`; never estimate a missing value. Paint
markers show temporal relationships, not proof that MF caused a paint. Label
the consumer interval `loadRemote`, not consumer initialization. The terminal
view omits `page-script` events; use the structured report when ordinary
external page scripts are part of the investigation. Include a Producer
`Preload` group only when an `mf-preload` lane exists; otherwise omit it.
Preserve observed overlap instead of converting it into a serial arrow chain.

`report.page`, `report.selection`, and `report.summary` preserve the normal
page anchors and selected scope. Every `report.modules` entry keeps one
complete consumer -> remote -> producer -> expose identity. Omit optional
`expose` and `remoteEntry` when that evidence is unavailable; do not replace
them with empty values.

`status` is the observed `loadRemote` result: `success`, `recovered`, `error`,
`pending`, or `unknown`. The report omits `traceId` to keep the main diagnosis
focused; use normal `module-perf` or `remote trace` when the underlying
observability trace must be selected or inspected.

`recommendations` appears after all module findings. Every item includes its
consumer/remote/producer/expose target, evidence, and an action reason. It can
contain:

- `preload-remote-entry`: remoteEntry was requested late while `loadRemote`
  began no later than FCP. Use `preloadRemote` only when the module is needed
  for the initial view or a predictable journey; an interaction-triggered lazy
  load is not an initial-page regression by itself.
- `inspect-remote-entry-delivery`: remoteEntry began promptly but its observed
  lifecycle still delayed module access. Investigate delivery, cache, CDN, and
  server timing before adding preload.
- `preload-expose-assets`: matched synchronous expose assets loaded late on an
  initial load. Preload only the exact listed synchronous assets, not async
  assets that merely belong to the expose.
- `inspect-get-runtime`: `get` remained slow after resource loading did not
  explain it. Inspect Shared resolution and runtime work; more preload will
  not fix this path.
- `inspect-reused-shared-asset`: the selected Shared provider came from another
  MF instance, but a synchronous JavaScript asset declared for that Shared by
  the producer was still requested. This proves the request, not duplicate
  Shared execution: use Rsdoctor to check whether the chunk contains other
  libraries. Do not recommend version unification from this evidence.
- `profile-factory`: factory execution is expensive. Profile and reduce
  top-level module initialization.
- `code-usage`: exact matched expose assets are eligible for a separate
  [Code Usage analysis](https://github.com/2heal1/divebell/blob/main/docs/code-usage-analysis.md).
  Use executed and unused-code evidence before changing code splitting. This is
  not proof that asset size caused the current bottleneck, and it does not
  apply to `remoteEntry.js`. Without a stated project budget, do not invent a
  universal size threshold.

The report never auto-enables coverage because it would alter the measurement.
Different `requiredVersion` ranges, multiple registrations, or singleton
declarations do not create a recommendation by themselves. A reused-Shared
asset finding requires both selected-provider evidence and a matched browser
request. Investigate any version concern with `shared trace` first.
