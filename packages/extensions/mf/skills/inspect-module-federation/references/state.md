# Current state and module information

## `status`

The result has two main fields:

- `instances`: current MF instances.
- `shared`: the current global Shared registry.

For each instance:

- `instanceRef`: exact identity in this page session.
- `name`: visible MF name.
- `role`: `consumer`, `producer`, `mixed`, or `unknown` from observed runtime
  evidence.
- `consumers`: current instances that resolve to this producer.
- `active`: whether it is present in the current active state.

The `shared` registry is grouped as scope, package name, then version. By
default it contains loaded versions only. Use `--verbose` when unloaded entries
or bounded `lib` and `get` source locations are needed. See
[Shared fields](shared.md) for those values.

If a visible name matches several instances, select the returned exact
`--instance` candidate. Do not pick the first same-name instance.

## `module-info [remote]`

Read `consumer` before `remote`; the same Remote name can belong to different
consumers.

Consumer fields:

- `instanceRef`: exact selected consumer.
- `name` and optional `version`: visible consumer identity.

Remote fields:

- `name`, `alias`: declared Remote identity.
- `status`: `declared` means configured but not proven loaded; `loaded` has
  current loading evidence.
- `producerInstanceRef`: uniquely resolved producer when known.
- `candidateProducerInstanceRefs`: possible producers when the relationship is
  ambiguous.
- `manifestUrl`, `remoteEntryUrl`: sanitized observed or declared resource
  locations.
- `snapshotSource`: where the module information came from.
- `globalName`, `type`, `publicPath`, `getPublicPath`: observed container and
  public-path metadata when available.
- `exposes`: exposes observed for this Remote.
- `shared`: share scopes declared by its module information.
- `dependencyRemotes`: Remotes it depends on.
- `cached`: `true`, `false`, or `unknown`; unknown is not a cache miss.
- `firstLoadedAt`: earliest captured matching load time.

Use `remote status` or `remote trace` when the question is whether and how a
Remote loaded. `module-info` describes resolved metadata; it does not execute
the Remote or prove application readiness.
