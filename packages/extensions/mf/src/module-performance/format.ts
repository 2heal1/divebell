import type {
  ModulePerformanceReport,
  ModulePerformanceTimeline,
  ModulePerformanceTimelineItem,
  ModulePerformanceTimelineLane,
  ModulePerformanceTimelineMarker
} from "./types.js";

export interface ModulePerformanceTimelineFormatOptions {
  columns?: number;
}

interface TimelineDomain {
  min: number;
  max: number;
}

interface TimelineLayout {
  laneWidth: number;
  chartWidth: number;
  detailWidth: number;
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
  const layout = createLayout(timeline, options.columns);
  const domain = readTimelineDomain(timeline);
  const markerGraph = renderMarkerGraph(
    timeline.markers,
    domain,
    layout.chartWidth
  );
  const lines = [
    `${timeline.clock.origin} = 0 ${timeline.clock.unit}`,
    "",
    renderLine("time (ms)", renderAxis(domain, layout.chartWidth), "", layout),
    renderLine(
      "",
      renderAxisRuler(timeline.markers, domain, layout.chartWidth),
      "",
      layout
    )
  ];

  lines.push(...renderMarkers(timeline.markers, domain, layout));
  for (const lane of timeline.lanes) {
    const laneName = formatLaneKind(lane.kind);
    const hasContext = lane.label !== laneName;
    if (hasContext) {
      lines.push(...renderWrappedLine(
        laneName,
        markerGraph,
        lane.label,
        layout
      ));
    }
    if (lane.items.length === 0) {
      lines.push(renderLine(
        hasContext ? "" : laneName,
        markerGraph,
        "not observed",
        layout
      ));
      continue;
    }
    lane.items.forEach((item, index) => {
      const timing = formatItemTiming(item);
      const timingFits = timing.length + 2 <= layout.detailWidth;
      lines.push(renderLine(
        !hasContext && index === 0 ? laneName : "",
        renderItemGraph(item, timeline.markers, domain, layout.chartWidth),
        timingFits
          ? fitItemDescription(item.label, timing, layout.detailWidth)
          : fitText(item.label, layout.detailWidth),
        layout
      ));
      if (!timingFits) {
        lines.push(...renderContinuation(
          `time: ${timing}`,
          markerGraph,
          layout
        ));
      }
    });
  }
  return lines.join("\n");
}

function createLayout(
  timeline: ModulePerformanceTimeline,
  requestedColumns: number | undefined
): TimelineLayout {
  const columns = clamp(Math.floor(requestedColumns ?? 120), 64, 180);
  const longestLane = Math.max(
    "time (ms)".length,
    "Paint".length,
    ...timeline.lanes.map((lane) => formatLaneKind(lane.kind).length)
  );
  const laneWidth = clamp(longestLane, 10, 14);
  const available = columns - laneWidth - 3;
  const detailWidth = clamp(Math.floor(available * 0.5), 24, 52);
  const chartWidth = available - detailWidth;
  return { laneWidth, chartWidth, detailWidth };
}

function readTimelineDomain(timeline: ModulePerformanceTimeline): TimelineDomain {
  const values = [
    0,
    ...timeline.markers.map((marker) => marker.at),
    ...timeline.lanes.flatMap((lane) => lane.items.flatMap((item) =>
      item.type === "point"
        ? [item.at]
        : [item.start, ...(item.end === undefined ? [] : [item.end])]
    ))
  ].filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return max === min ? { min, max: min + 1 } : { min, max };
}

function renderAxis(domain: TimelineDomain, width: number): string {
  const axis = Array.from({ length: width }, () => " ");
  const occupied = Array.from({ length: width }, () => false);
  const tickCount = clamp(Math.floor(width / 15) + 1, 3, 7);
  for (let index = 0; index < tickCount; index += 1) {
    const ratio = tickCount === 1 ? 0 : index / (tickCount - 1);
    const value = domain.min + ((domain.max - domain.min) * ratio);
    const label = fitText(formatAxisTime(value), width);
    const anchor = Math.round(ratio * (width - 1));
    const start = clamp(
      Math.round(anchor - (label.length / 2)),
      0,
      Math.max(0, width - label.length)
    );
    if (occupied.slice(start, start + label.length).some(Boolean)) continue;
    for (let offset = 0; offset < label.length; offset += 1) {
      axis[start + offset] = label[offset] ?? " ";
      occupied[start + offset] = true;
    }
  }
  return axis.join("");
}

function renderAxisRuler(
  markers: ModulePerformanceTimelineMarker[],
  domain: TimelineDomain,
  width: number
): string {
  if (width <= 1) return "│";
  const ruler = Array.from({ length: width }, () => "─");
  ruler[0] = "├";
  ruler[width - 1] = "┤";
  for (const marker of markers) {
    const position = toPosition(marker.at, domain, width);
    if (position > 0 && position < width - 1) ruler[position] = "┬";
  }
  return ruler.join("");
}

function renderMarkers(
  markers: ModulePerformanceTimelineMarker[],
  domain: TimelineDomain,
  layout: TimelineLayout
): string[] {
  const graph = renderMarkerGraph(markers, domain, layout.chartWidth);
  if (markers.length === 0) {
    return [renderLine("Paint", graph, "not observed", layout)];
  }
  return packSegments(
    markers.map(formatMarker),
    layout.detailWidth
  ).map((line, index) => renderLine(
    index === 0 ? "Paint" : "",
    graph,
    line,
    layout
  ));
}

function renderMarkerGraph(
  markers: ModulePerformanceTimelineMarker[],
  domain: TimelineDomain,
  width: number
): string {
  const graph = Array.from({ length: width }, () => " ");
  for (const marker of markers) {
    graph[toPosition(marker.at, domain, width)] = "│";
  }
  return graph.join("");
}

function renderItemGraph(
  item: ModulePerformanceTimelineItem,
  markers: ModulePerformanceTimelineMarker[],
  domain: TimelineDomain,
  width: number
): string {
  const graph = Array.from(renderMarkerGraph(markers, domain, width));
  if (item.type === "point") {
    putGraphCharacter(graph, toPosition(item.at, domain, width), "●");
    return graph.join("");
  }
  const start = toPosition(item.start, domain, width);
  if (item.end === undefined) {
    putGraphCharacter(graph, start, "├");
    if (start + 1 < width) putGraphCharacter(graph, start + 1, "…");
    return graph.join("");
  }
  const end = Math.max(start, toPosition(item.end, domain, width));
  if (end === start) {
    putGraphCharacter(graph, start, "◆");
    return graph.join("");
  }
  putGraphCharacter(graph, start, "├");
  for (let position = start + 1; position < end; position += 1) {
    putGraphCharacter(graph, position, "─");
  }
  putGraphCharacter(graph, end, "┤");
  return graph.join("");
}

function putGraphCharacter(graph: string[], position: number, value: string): void {
  graph[position] = graph[position] === "│" ? "┼" : value;
}

function toPosition(value: number, domain: TimelineDomain, width: number): number {
  const ratio = (value - domain.min) / (domain.max - domain.min);
  return clamp(Math.round(ratio * (width - 1)), 0, width - 1);
}

function formatItemTiming(item: ModulePerformanceTimelineItem): string {
  const status = item.status === undefined || item.status === "success"
    ? ""
    : ` [${item.status}]`;
  if (item.type === "point") {
    return `@ ${formatObservedTime(item.at)} ms${status}`;
  }
  const end = item.end === undefined ? "…" : formatObservedTime(item.end);
  return `${formatObservedTime(item.start)}–${end} ms${status}`;
}

function renderContinuation(
  value: string,
  markerGraph: string,
  layout: TimelineLayout
): string[] {
  return wrapText(`↳ ${value}`, layout.detailWidth).map((line) => renderLine(
    "",
    markerGraph,
    line,
    layout
  ));
}

function renderWrappedLine(
  lane: string,
  graph: string,
  detail: string,
  layout: TimelineLayout
): string[] {
  return wrapText(detail, layout.detailWidth).map((line, index) => renderLine(
    index === 0 ? lane : "",
    graph,
    line,
    layout
  ));
}

function renderLine(
  lane: string,
  graph: string,
  detail: string,
  layout: TimelineLayout
): string {
  return `${fitText(lane, layout.laneWidth).padEnd(layout.laneWidth)} ${graph} ${detail.padEnd(layout.detailWidth)}`
    .trimEnd();
}

function fitItemDescription(label: string, timing: string, width: number): string {
  const availableLabelWidth = Math.max(1, width - timing.length - 1);
  return `${fitText(label, availableLabelWidth)} ${timing}`;
}

function formatMarker(marker: ModulePerformanceTimelineMarker): string {
  const status = marker.status === undefined ? "" : ` [${marker.status}]`;
  return `${marker.label} ${formatObservedTime(marker.at)} ms${status}`;
}

function formatLaneKind(kind: ModulePerformanceTimelineLane["kind"]): string {
  switch (kind) {
    case "page":
      return "Page";
    case "page-script":
      return "Page scripts";
    case "mf-consumer":
      return "MF consumer";
    case "mf-provider":
      return "MF provider";
    case "mf-resource":
      return "MF resources";
    case "mf-preload":
      return "MF preload";
  }
}

function formatObservedTime(value: number): string {
  return String(value);
}

function formatAxisTime(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 100) return String(Math.round(value));
  return String(Math.round(value * 10) / 10);
}

function fitText(value: string, width: number): string {
  if (value.length <= width) return value;
  if (width <= 1) return "…";
  return `${value.slice(0, width - 1)}…`;
}

function wrapText(value: string, width: number): string[] {
  const lines: string[] = [];
  let remaining = value;
  while (remaining.length > width) {
    let split = remaining.lastIndexOf(" ", width);
    if (split < Math.floor(width / 2)) split = width;
    lines.push(remaining.slice(0, split));
    remaining = remaining.slice(split).trimStart();
  }
  lines.push(remaining);
  return lines;
}

function packSegments(values: string[], width: number): string[] {
  const lines: string[] = [];
  for (const value of values) {
    const previous = lines.at(-1);
    const candidate = previous === undefined ? value : `${previous} · ${value}`;
    if (candidate.length <= width) {
      if (previous === undefined) lines.push(value);
      else lines[lines.length - 1] = candidate;
      continue;
    }
    lines.push(...wrapText(value, width));
  }
  return lines;
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
