import type {
  ModulePerformanceReport,
  ModulePerformanceTimeline,
  ModulePerformanceTimelineItem,
  ModulePerformanceTimelineLane,
  ModulePerformanceTimelineMarker,
  ModulePerformanceTimelineSpan
} from "./types.js";

export interface ModulePerformanceTimelineFormatOptions {
  columns?: number;
}

interface TimelineScale {
  min: number;
  max: number;
  ticks: number[];
}

interface TimelineLayout {
  eventCellWidth: number;
  timelineCellWidth: number;
  chartWidth: number;
}

type PresentationVisual =
  | "load-remote"
  | "cost"
  | "lifecycle-point"
  | "reuse";

interface PresentationEvent {
  label: string;
  item: ModulePerformanceTimelineItem;
  visual: PresentationVisual;
  at?: number;
}

interface PresentationGroup {
  title: string;
  events: PresentationEvent[];
}

interface PresentationSection {
  title: string;
  groups: PresentationGroup[];
}

interface PositionedAnnotation {
  position: number;
  text: string;
  align?: "start" | "center" | "end";
}

export function formatModulePerformanceReportTimeline(
  value: unknown,
  options: ModulePerformanceTimelineFormatOptions = {}
): string {
  if (!isModulePerformanceReport(value)) {
    throw new Error("The terminal timeline presenter requires an mf module-perf --report result.");
  }
  return formatModulePerformanceTimeline(value.report.timeline, options);
}

export function formatModulePerformanceTimeline(
  timeline: ModulePerformanceTimeline,
  options: ModulePerformanceTimelineFormatOptions = {}
): string {
  const lanes = timeline.lanes.filter((lane) => lane.kind !== "page-script");
  const sections = createPresentationSections(lanes);
  const layout = createLayout(options.columns);
  const scale = createTimelineScale(timeline, lanes, layout.chartWidth);
  const lines = [
    renderTopBorder(layout),
    renderTableRow("Event", "Timeline", layout),
    renderTableRow("", renderAxis(scale, layout.chartWidth), layout),
    renderSeparator(layout),
    renderTableRow("Page", "", layout),
    ...renderPaintRows(timeline.markers, scale, layout)
  ];

  for (const section of sections) {
    lines.push(renderSeparator(layout));
    lines.push(renderTableRow(section.title, "", layout));
    for (const [groupIndex, group] of section.groups.entries()) {
      if (groupIndex > 0) lines.push(renderTableRow("", "", layout));
      if (group.title === "loadRemote") {
        for (const [eventIndex, event] of group.events.entries()) {
          if (eventIndex > 0) lines.push(renderTableRow("", "", layout));
          const [graph = "", ...details] = renderPresentationEvent(
            event,
            scale,
            layout.chartWidth
          );
          lines.push(renderTableRow(
            eventIndex === 0 ? `  ${group.title}` : "",
            graph,
            layout
          ));
          details.forEach((line, index) => lines.push(renderTableRow(
            index === 0 ? `    ${event.label}` : "",
            line,
            layout
          )));
        }
        continue;
      }
      lines.push(renderTableRow(`  ${group.title}`, "", layout));
      for (const [eventIndex, event] of group.events.entries()) {
        if (eventIndex > 0) lines.push(renderTableRow("", "", layout));
        const timelineLines = renderPresentationEvent(
          event,
          scale,
          layout.chartWidth
        );
        timelineLines.forEach((line, index) => lines.push(renderTableRow(
          index === 0 ? `    ${event.label}` : "",
          line,
          layout
        )));
      }
    }
  }

  lines.push(renderBottomBorder(layout));
  return lines.join("\n");
}

function createPresentationSections(
  lanes: ModulePerformanceTimelineLane[]
): PresentationSection[] {
  const consumers = new Map<string, PresentationSection>();
  const producers = new Map<string, PresentationSection>();
  const fallbacks = new Map<string, PresentationSection>();
  const producerByPrefix = new Map<string, string>();

  for (const lane of lanes) {
    if (lane.kind === "mf-consumer") {
      ensureSection(consumers, laneContextName(lane.label));
      continue;
    }
    if (lane.kind === "mf-resource") {
      const producer = laneContextName(lane.label);
      ensureSection(producers, producer);
      producerByPrefix.set(lanePrefix(lane.id), producer);
      continue;
    }
    if (lane.kind === "mf-provider") {
      const prefix = lanePrefix(lane.id);
      const producer = producerByPrefix.get(prefix) ?? providerName(lane.label);
      ensureSection(producers, producer);
      producerByPrefix.set(prefix, producer);
      continue;
    }
    if (lane.kind === "mf-preload") {
      const producer = laneContextName(lane.label);
      ensureSection(producers, producer);
      producerByPrefix.set(lanePrefix(lane.id), producer);
    }
  }

  for (const lane of lanes) {
    if (lane.kind === "mf-consumer") {
      const section = ensureSection(consumers, laneContextName(lane.label));
      addGroupEvents(section, "loadRemote", lane.items.map((item) => ({
        label: item.label,
        item,
        visual: "load-remote"
      })));
      continue;
    }
    if (lane.kind === "mf-provider") continue;
    if (lane.kind === "mf-resource") {
      const producer = producerByPrefix.get(lanePrefix(lane.id)) ??
        laneContextName(lane.label);
      const section = ensureSection(producers, producer);
      const items = [...lane.items].sort(compareResourcePresentationOrder);
      addGroupEvents(section, "Resources", items.map((item) => ({
        label: resourceEventLabel(item),
        item,
        visual: "cost"
      })));
      continue;
    }
    if (lane.kind === "mf-preload") {
      const producer = producerByPrefix.get(lanePrefix(lane.id)) ??
        laneContextName(lane.label);
      const section = ensureSection(producers, producer);
      addGroupEvents(section, "Preload", lane.items.map((item) => ({
        label: resourceEventLabel(item),
        item,
        visual: "cost"
      })));
    }
  }

  for (const lane of lanes.filter((entry) => entry.kind === "mf-shared")) {
    const requester = laneContextName(lane.label);
    const events = createSharedPresentationEvents(lane);
    const reuse = events.some((event) => event.visual === "reuse");
    const producer = producers.get(requester);
    const consumer = consumers.get(requester);
    const section = (reuse ? producer : consumer) ?? producer ?? consumer ??
      ensureSection(fallbacks, requester);
    addGroupEvents(section, "Shared", events);
  }

  return [
    ...Array.from(consumers.entries()).map(([name, section]) => ({
      ...section,
      title: `Consumer · ${name}`
    })),
    ...Array.from(producers.entries()).map(([name, section]) => ({
      ...section,
      title: `Producer · ${name}`
    })),
    ...Array.from(fallbacks.entries()).map(([name, section]) => ({
      ...section,
      title: `Shared · ${name}`
    }))
  ].filter((section) => section.groups.some((group) => group.events.length > 0));
}

function compareResourcePresentationOrder(
  left: ModulePerformanceTimelineItem,
  right: ModulePerformanceTimelineItem
): number {
  const priority = (item: ModulePerformanceTimelineItem): number => {
    if (item.type !== "span" || item.resource === undefined) return 4;
    if (item.resource.roles.includes("remote-entry")) return 0;
    if (/default/i.test(resourceEventLabel(item))) return 1;
    if (item.resource.roles.some((role) => role.startsWith("expose-"))) return 2;
    return 3;
  };
  return priority(left) - priority(right) ||
    (left.type === "span" ? left.start : left.at) -
      (right.type === "span" ? right.start : right.at) ||
    resourceEventLabel(left).localeCompare(resourceEventLabel(right));
}

function createSharedPresentationEvents(
  lane: ModulePerformanceTimelineLane
): PresentationEvent[] {
  const grouped = new Map<string, ModulePerformanceTimelineItem[]>();
  for (const item of lane.items) {
    const key = item.id.replace(/-asset-\d+$/, "");
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  const events = Array.from(grouped.values()).flatMap((items): PresentationEvent[] => {
    const lifecycle = items.find((item) => !/-asset-\d+$/.test(item.id)) ??
      items[0] as ModulePerformanceTimelineItem;
    const dependency = sharedDependencyLabel(lifecycle.label);
    if (/^reuse\s/.test(lifecycle.label)) {
      return [{
        label: dependency,
        item: lifecycle,
        visual: "reuse" as const,
        at: lifecycle.type === "point"
          ? lifecycle.at
          : lifecycle.end ?? lifecycle.start
      }];
    }
    const assets = items.filter((item): item is ModulePerformanceTimelineSpan =>
      item.type === "span" && item.resource !== undefined
    );
    if (assets.length === 0) {
      return [{
        label: dependency,
        item: lifecycle,
        visual: "cost" as const
      }];
    }
    return assets.map((asset) => ({
      label: assets.length === 1
        ? dependency
        : `${dependency} · ${resourceEventLabel(asset)}`,
      item: asset,
      visual: "cost" as const
    }));
  });
  const seen = new Set<string>();
  return events.filter((event) => {
    const boundary = event.item.type === "point"
      ? String(event.item.at)
      : `${event.item.start}:${event.item.end ?? ""}`;
    const key = `${event.visual}\u0000${event.label}\u0000${boundary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ensureSection(
  sections: Map<string, PresentationSection>,
  name: string
): PresentationSection {
  const current = sections.get(name);
  if (current !== undefined) return current;
  const section = { title: name, groups: [] };
  sections.set(name, section);
  return section;
}

function addGroupEvents(
  section: PresentationSection,
  title: string,
  events: PresentationEvent[]
): void {
  if (events.length === 0) return;
  const current = section.groups.find((group) => group.title === title);
  if (current === undefined) {
    section.groups.push({ title, events: [...events] });
    return;
  }
  current.events.push(...events);
}

function createLayout(requestedColumns: number | undefined): TimelineLayout {
  const columns = clamp(Math.floor(requestedColumns ?? 120), 72, 180);
  const eventCellWidth = clamp(30, 24, columns - 45);
  const timelineCellWidth = columns - eventCellWidth - 3;
  return {
    eventCellWidth,
    timelineCellWidth,
    chartWidth: timelineCellWidth - 2
  };
}

function createTimelineScale(
  timeline: ModulePerformanceTimeline,
  lanes: ModulePerformanceTimelineLane[],
  width: number
): TimelineScale {
  const values = [
    0,
    ...timeline.markers.map((marker) => marker.at),
    ...lanes.filter((lane) => lane.kind !== "page").flatMap((lane) =>
      lane.items.flatMap((item) => item.type === "point"
        ? [item.at]
        : [item.start, ...(item.end === undefined ? [] : [item.end])]
      )
    )
  ].filter(Number.isFinite);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = Math.max(1, rawMax - rawMin);
  const desiredTickCount = clamp(Math.floor(width / 14), 3, 7);
  const step = niceStep(span / Math.max(1, desiredTickCount - 1));
  const min = rawMin >= 0 ? 0 : Math.floor(rawMin / step) * step;
  let tickMax = Math.ceil(rawMax / step) * step;
  if (tickMax <= min) tickMax = min + step;
  const ticks: number[] = [];
  for (let value = min; value <= tickMax + (step / 2); value += step) {
    ticks.push(normalizeZero(value));
  }
  const max = tickMax + (step / 2);
  return { min, max, ticks };
}

function niceStep(value: number): number {
  const power = 10 ** Math.floor(Math.log10(Math.max(value, Number.EPSILON)));
  const normalized = value / power;
  const multiplier = normalized <= 1
    ? 1
    : normalized <= 2
      ? 2
      : normalized <= 5
        ? 5
        : 10;
  return multiplier * power;
}

function renderAxis(scale: TimelineScale, width: number): string {
  const axis = Array.from({ length: width }, () => " ");
  const occupied = Array.from({ length: width }, () => false);
  for (const tick of scale.ticks) {
    const label = formatTimestamp(tick);
    const position = toPosition(tick, scale, width);
    const start = clamp(
      Math.round(position - (label.length / 2)),
      0,
      Math.max(0, width - label.length)
    );
    if (occupied.slice(start, start + label.length).some(Boolean)) continue;
    writeText(axis, start, label);
    for (let index = start; index < start + label.length; index += 1) {
      occupied[index] = true;
    }
  }
  return axis.join("");
}

function renderPaintRows(
  markers: ModulePerformanceTimelineMarker[],
  scale: TimelineScale,
  layout: TimelineLayout
): string[] {
  if (markers.length === 0) {
    return [renderTableRow("  Paint", "not observed", layout)];
  }
  const grouped = new Map<number, ModulePerformanceTimelineMarker[]>();
  for (const marker of markers) {
    grouped.set(marker.at, [...(grouped.get(marker.at) ?? []), marker]);
  }
  const groups = Array.from(grouped.entries()).map(([at, entries]) => ({
    at,
    entries,
    position: toPosition(at, scale, layout.chartWidth),
    label: entries.map((entry) => entry.label).join(" · "),
    marker: entries.every((entry) => entry.status === "provisional")
      ? "◇"
      : "●"
  }));
  const markerLines = renderInlineMarkers(groups, layout.chartWidth);
  const timingLines = renderAnnotations(groups.map((group) => ({
    position: group.position,
    text: formatTimestamp(group.at),
    align: "center" as const
  })), layout.chartWidth);
  return [
    ...markerLines.map((line, index) => renderTableRow(
      index === 0 ? "  Paint" : "",
      line,
      layout
    )),
    ...timingLines.map((line) => renderTableRow("", line, layout))
  ];
}

function renderInlineMarkers(
  groups: Array<{
    position: number;
    label: string;
    marker: string;
  }>,
  width: number
): string[] {
  const lines: Array<{ graph: string[]; occupied: boolean[] }> = [];
  for (const group of groups) {
    const after = `${group.marker} ${group.label}`;
    const before = `${group.label} ${group.marker}`;
    const useAfter = group.position + after.length <= width;
    const text = fitText(useAfter ? after : before, width);
    const start = useAfter
      ? group.position
      : clamp(group.position - text.length + 1, 0, width - text.length);
    let target = lines.find((line) =>
      !line.occupied.slice(start, start + text.length).some(Boolean)
    );
    if (target === undefined) {
      target = {
        graph: Array.from({ length: width }, () => " "),
        occupied: Array.from({ length: width }, () => false)
      };
      lines.push(target);
    }
    writeText(target.graph, start, text);
    for (let index = start; index < start + text.length; index += 1) {
      target.occupied[index] = true;
    }
  }
  return lines.map((line) => line.graph.join(""));
}

function renderPresentationEvent(
  event: PresentationEvent,
  scale: TimelineScale,
  width: number
): string[] {
  switch (event.visual) {
    case "load-remote":
      return renderLoadRemote(event.item, scale, width);
    case "cost":
      return renderCostSpan(event.item, scale, width);
    case "reuse":
      return renderPoint(event, "◆", "reuse", scale, width);
    case "lifecycle-point":
      return renderPoint(event, "◆", "", scale, width);
  }
}

function renderLoadRemote(
  item: ModulePerformanceTimelineItem,
  scale: TimelineScale,
  width: number
): string[] {
  if (item.type === "point") {
    return renderPoint({ label: item.label, item, visual: "lifecycle-point" }, "●", "", scale, width);
  }
  const start = toPosition(item.start, scale, width);
  const graph = renderSpanGraph(item, scale, width, "load-remote");
  const annotations: PositionedAnnotation[] = [{
    position: start,
    text: formatTimestamp(item.start),
    align: "start"
  }];
  if (item.end !== undefined) {
    annotations.push({
      position: toPosition(item.end, scale, width),
      text: `${formatTimestamp(item.end)}${formatStatus(item.status)}`,
      align: "end"
    });
  } else {
    annotations.push({
      position: Math.min(width - 1, start + 2),
      text: item.status ?? "pending",
      align: "start"
    });
  }
  return [graph, ...renderAnnotations(annotations, width)];
}

function renderCostSpan(
  item: ModulePerformanceTimelineItem,
  scale: TimelineScale,
  width: number
): string[] {
  if (item.type === "point") {
    return renderPoint({ label: item.label, item, visual: "lifecycle-point" }, "◆", "", scale, width);
  }
  const start = toPosition(item.start, scale, width);
  const duration = item.duration ?? (
    item.end === undefined ? undefined : item.end - item.start
  );
  const transferSize = item.resource?.transferSize;
  const metric = `${formatDuration(duration)}${
    transferSize === undefined ? "" : ` · ${formatTransferSize(transferSize)}`
  }${formatStatus(item.status)}`;
  return [
    renderSpanGraph(item, scale, width, "cost"),
    ...renderAnnotations([{
      position: start,
      text: metric,
      align: "start"
    }], width)
  ];
}

function renderPoint(
  event: PresentationEvent,
  marker: string,
  inlineLabel: string,
  scale: TimelineScale,
  width: number
): string[] {
  const at = event.at ?? (event.item.type === "point"
    ? event.item.at
    : event.item.end ?? event.item.start);
  const position = toPosition(at, scale, width);
  const graph = Array.from({ length: width }, () => " ");
  graph[position] = marker;
  if (inlineLabel.length > 0) placeInlineLabel(graph, position, inlineLabel);
  return [
    graph.join(""),
    ...renderAnnotations([{
      position,
      text: `${formatTimestamp(at)}${formatStatus(event.item.status)}`,
      align: "center"
    }], width)
  ];
}

function renderSpanGraph(
  item: ModulePerformanceTimelineSpan,
  scale: TimelineScale,
  width: number,
  visual: "load-remote" | "cost"
): string {
  const graph = Array.from({ length: width }, () => " ");
  const start = toPosition(item.start, scale, width);
  if (item.end === undefined) {
    graph[start] = "━";
    if (start + 1 < width) graph[start + 1] = "…";
    return graph.join("");
  }
  const end = Math.max(start, toPosition(item.end, scale, width));
  for (let position = start; position <= end; position += 1) {
    graph[position] = "━";
  }
  if (visual === "load-remote") {
    graph[end] = item.status === undefined || item.status === "success"
      ? "●"
      : "◆";
  }
  return graph.join("");
}

function renderAnnotations(
  annotations: PositionedAnnotation[],
  width: number
): string[] {
  const lines: Array<{ graph: string[]; occupied: boolean[] }> = [];
  for (const annotation of annotations) {
    const text = fitText(annotation.text, width);
    const start = annotationStart(
      annotation.position,
      text.length,
      width,
      annotation.align ?? "start"
    );
    let target = lines.find((line) =>
      !line.occupied.slice(start, start + text.length).some(Boolean)
    );
    if (target === undefined) {
      target = {
        graph: Array.from({ length: width }, () => " "),
        occupied: Array.from({ length: width }, () => false)
      };
      lines.push(target);
    }
    writeText(target.graph, start, text);
    for (let index = start; index < start + text.length; index += 1) {
      target.occupied[index] = true;
    }
  }
  return lines.map((line) => line.graph.join(""));
}

function annotationStart(
  position: number,
  length: number,
  width: number,
  align: "start" | "center" | "end"
): number {
  const requested = align === "start"
    ? position
    : align === "end"
      ? position - length + 1
      : position - Math.floor(length / 2);
  return clamp(requested, 0, Math.max(0, width - length));
}

function placeInlineLabel(
  graph: string[],
  position: number,
  label: string
): void {
  const fitted = fitText(label, Math.max(1, graph.length - 2));
  const after = position + 2;
  const start = after + fitted.length <= graph.length
    ? after
    : Math.max(0, position - fitted.length - 1);
  writeText(graph, start, fitted);
}

function writeText(target: string[], start: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const position = start + index;
    if (position >= 0 && position < target.length) {
      target[position] = value[index] as string;
    }
  }
}

function renderTopBorder(layout: TimelineLayout): string {
  return `┌${"─".repeat(layout.eventCellWidth)}┬${
    "─".repeat(layout.timelineCellWidth)
  }┐`;
}

function renderSeparator(layout: TimelineLayout): string {
  return `├${"─".repeat(layout.eventCellWidth)}┼${
    "─".repeat(layout.timelineCellWidth)
  }┤`;
}

function renderBottomBorder(layout: TimelineLayout): string {
  return `└${"─".repeat(layout.eventCellWidth)}┴${
    "─".repeat(layout.timelineCellWidth)
  }┘`;
}

function renderTableRow(
  event: string,
  timeline: string,
  layout: TimelineLayout
): string {
  const eventContent = fitText(event, layout.eventCellWidth - 2)
    .padEnd(layout.eventCellWidth - 2);
  const timelineContent = fitText(timeline, layout.timelineCellWidth - 2)
    .padEnd(layout.timelineCellWidth - 2);
  return `│ ${eventContent} │ ${timelineContent} │`;
}

function toPosition(value: number, scale: TimelineScale, width: number): number {
  const ratio = (value - scale.min) / (scale.max - scale.min);
  return clamp(Math.round(ratio * (width - 1)), 0, width - 1);
}

function lanePrefix(id: string): string {
  return id.replace(/-(?:consumer|provider|resources|preload)$/, "");
}

function laneContextName(label: string): string {
  const separator = label.indexOf(" · ");
  return separator === -1 ? label : label.slice(0, separator);
}

function providerName(label: string): string {
  const separator = label.indexOf("@", label.startsWith("@") ? 1 : 0);
  return separator === -1 ? label : label.slice(0, separator);
}

function resourceEventLabel(item: ModulePerformanceTimelineItem): string {
  if (item.type === "span" && item.resource !== undefined) {
    const name = fileName(item.resource.url);
    return /^__federation_expose_default_export(?:\.[cm]?js)?$/i.test(name)
      ? "expose-default.js"
      : name;
  }
  const separator = item.label.indexOf(" · ");
  return separator === -1 ? item.label : item.label.slice(0, separator);
}

function sharedDependencyLabel(label: string): string {
  const withoutAction = label.replace(/^(?:load|reuse)\s+/, "");
  const shared = withoutAction.indexOf(" Shared");
  return shared === -1 ? withoutAction : withoutAction.slice(0, shared);
}

function fileName(value: string): string {
  try {
    const pathname = new URL(value, "https://divebell.invalid").pathname;
    return pathname.split("/").filter(Boolean).at(-1) ?? value;
  } catch {
    return value.split("/").filter(Boolean).at(-1) ?? value;
  }
}

function formatDuration(value: number | undefined): string {
  if (value === undefined) return "…";
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${formatDecimal(value)}ms`;
}

function formatTimestamp(value: number): string {
  const seconds = value / 1000;
  const formatted = seconds.toFixed(3).replace(/\.?0+$/, "");
  return `${formatted === "-0" ? "0" : formatted}s`;
}

function formatTransferSize(value: number): string {
  const kibibytes = value / 1024;
  return `${kibibytes < 10 ? formatDecimal(kibibytes) : Math.round(kibibytes)} KB`;
}

function formatDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function formatStatus(
  status: ModulePerformanceTimelineItem["status"]
): string {
  return status === undefined || status === "success" ? "" : ` · ${status}`;
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function fitText(value: string, width: number): string {
  if (value.length <= width) return value;
  if (width <= 1) return "…";
  return `${value.slice(0, width - 1)}…`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isModulePerformanceReport(value: unknown): value is ModulePerformanceReport {
  if (!isRecord(value) || !isRecord(value.report)) return false;
  const timeline = value.report.timeline;
  return isRecord(timeline)
    && isRecord(timeline.clock)
    && Array.isArray(timeline.markers)
    && Array.isArray(timeline.lanes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
