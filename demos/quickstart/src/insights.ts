export interface InsightOrder {
  id: string;
  customer: string;
  region: string;
  total: number;
  items: number;
  status: string;
  priority: string;
}

export interface OrderInsights {
  revenue: number;
  averageOrder: number;
  readyShare: number;
  priorityRevenue: number;
  regions: Array<{
    name: string;
    orders: number;
    revenue: number;
    share: number;
  }>;
  recommendations: string[];
}

export function calculateOrderInsights(orders: InsightOrder[]): OrderInsights {
  const revenue = sum(orders.map((order) => order.total));
  const readyOrders = orders.filter((order) => order.status === "ready");
  const priorityOrders = orders.filter((order) => order.priority === "high");
  const grouped = groupBy(orders, (order) => order.region);
  const regions = [...grouped.entries()]
    .map(([name, regionOrders]) => {
      const regionRevenue = sum(regionOrders.map((order) => order.total));
      return {
        name,
        orders: regionOrders.length,
        revenue: regionRevenue,
        share: ratio(regionRevenue, revenue)
      };
    })
    .sort((left, right) => right.revenue - left.revenue);

  return {
    revenue,
    averageOrder: ratio(revenue, orders.length),
    readyShare: ratio(readyOrders.length, orders.length),
    priorityRevenue: sum(priorityOrders.map((order) => order.total)),
    regions,
    recommendations: createRecommendations({
      orders,
      readyOrders,
      priorityOrders,
      regions,
      revenue
    })
  };
}

function createRecommendations(input: {
  orders: InsightOrder[];
  readyOrders: InsightOrder[];
  priorityOrders: InsightOrder[];
  regions: OrderInsights["regions"];
  revenue: number;
}): string[] {
  const output: string[] = [];
  const queued = input.orders.filter((order) => order.status === "queued");
  const review = input.orders.filter((order) => order.status === "review");
  const leadingRegion = input.regions[0];

  if (queued.length > 0) {
    output.push(`${queued.length} queued orders are ready for the next fulfillment batch.`);
  }
  if (review.length > 0) {
    output.push(`${review.length} order needs a manual inventory review.`);
  }
  if (leadingRegion !== undefined) {
    output.push(`${leadingRegion.name} leads revenue at ${formatPercent(leadingRegion.share)}.`);
  }
  if (sum(input.priorityOrders.map((order) => order.total)) > input.revenue * 0.5) {
    output.push("High-priority orders account for more than half of current revenue.");
  }
  if (output.length === 0) {
    output.push("The current order mix is balanced and ready for fulfillment.");
  }
  return output;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    const existing = grouped.get(value);
    if (existing === undefined) {
      grouped.set(value, [item]);
    } else {
      existing.push(item);
    }
  }
  return grouped;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function ratio(value: number, total: number): number {
  return total === 0 ? 0 : value / total;
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("en", {
    style: "percent",
    maximumFractionDigits: 0
  }).format(value);
}
