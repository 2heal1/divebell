import type {
  ModulePerformanceReport,
  ModulePerformanceTimeline,
  ModulePerformanceTimelineItem,
  ModulePerformanceTimelineMarker,
  ModulePerformanceTimelineSpan
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
  const lines = [
    `${timeline.clock.origin} = 0 ${timeline.clock.unit}`,
    "",
    renderLine("time (ms)", renderAxis(domain, layout.chartWidth), "", layout)
  ];

  lines.push(...renderMarkers(timeline.markers, domain, layout));
  for (const lane of timeline.lanes) {
    if (lane.items.length === 0) {
      lines.push(renderLine(lane.label, " ".repeat(layout.chartWidth), "not observed", layout));
      continue;
    }
    lane.items.forEach((item, index) => {
      const details = formatItemDetails(item);
      const timingFits = details.timing.length + 2 <= layout.detailWidth;
      const itemLabelWidth = timingFits
        ? layout.detailWidth - details.timing.length - 1
        : layout.detailWidth;
      lines.push(renderLine(
        index === 0 ? lane.label : "",
        renderItemGraph(item, timeline.markers, domain, layout.chartWidth),
        timingFits
          ? fitItemDescription(item.label, details.timing, layout.detailWidth)
          : fitText(item.label, layout.detailWidth),
        layout
      ));
      if (index === 0 && lane.label.length > layout.laneWidth) {
        lines.push(...renderContinuation(`lane: ${lane.label}`, layout));
      }
      if (item.label.length > itemLabelWidth) {
        lines.push(...renderContinuation(`label: ${item.label}`, layout));
      }
      if (!timingFits) {
        lines.push(...renderContinuation(`time: ${details.timing}`, layout));
      }
      for (const detail of details.resource) {
        lines.push(...renderContinuation(detail, layout));
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
    ...timeline.lanes.map((lane) => lane.label.length)
  );
  const laneWidth = clamp(longestLane, 10, 20);
  const available = columns - laneWidth - 3;
  const detailWidth = clamp(Math.floor(available * 0.6), 24, 44);
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

function renderMarkers(
  markers: ModulePerformanceTimelineMarker[],
  domain: TimelineDomain,
  layout: TimelineLayout
): string[] {
  const graph = renderMarkerGraph(markers, domain, layout.chartWidth);
  if (markers.length === 0) {
    return [renderLine("Paint", graph, "not observed", layout)];
  }
  return markers.map((marker, index) => renderLine(
    index === 0 ? "Paint" : "",
    index === 0 ? graph : " ".repeat(layout.chartWidth),
    fitText(formatMarker(marker), layout.detailWidth),
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

function formatItemDetails(item: ModulePerformanceTimelineItem): {
  timing: string;
  resource: string[];
} {
  const status = item.status === undefined || item.status === "success"
    ? ""
    : ` [${item.status}]`;
  if (item.type === "point") {
    return {
      timing: `@ ${formatObservedTime(item.at)} ms${status}`,
      resource: []
    };
  }
  const end = item.end === undefined ? "…" : formatObservedTime(item.end);
  return {
    timing: `${formatObservedTime(item.start)}–${end} ms${status}`,
    resource: formatResourceDetails(item)
  };
}

function formatResourceDetails(item: ModulePerformanceTimelineSpan): string[] {
  if (item.resource === undefined) return [];
  const sizes = [
    item.resource.transferSize === undefined
      ? undefined
      : `transfer ${formatBytes(item.resource.transferSize)}`,
    item.resource.encodedBodySize === undefined
      ? undefined
      : `encoded ${formatBytes(item.resource.encodedBodySize)}`,
    item.resource.decodedBodySize === undefined
      ? undefined
      : `decoded ${formatBytes(item.resource.decodedBodySize)}`
  ].filter((value): value is string => value !== undefined);
  return [
    ...(sizes.length === 0 ? [] : [sizes.join(" · ")]),
    ...(item.resource.cache === undefined ? [] : [`cache: ${item.resource.cache}`]),
    ...(item.resource.packageNames === undefined
      ? []
      : [`packages: ${item.resource.packageNames.join(", ")}`])
  ];
}

function renderContinuation(value: string, layout: TimelineLayout): string[] {
  return wrapText(`↳ ${value}`, layout.detailWidth).map((line) => renderLine(
    "",
    " ".repeat(layout.chartWidth),
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

function formatObservedTime(value: number): string {
  return String(value);
}

function formatAxisTime(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 100) return String(Math.round(value));
  return String(Math.round(value * 10) / 10);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${trimDecimal(value / 1024)} KiB`;
  return `${trimDecimal(value / (1024 * 1024))} MiB`;
}

function trimDecimal(value: number): string {
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
