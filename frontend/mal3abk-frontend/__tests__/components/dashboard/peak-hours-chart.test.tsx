import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PeakHoursChart } from "@/components/dashboard/charts/peak-hours-chart";

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: vi.fn(() => ({ language: "en" })),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }: { children: ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Bar: ({ children }: { children: ReactNode }) => <div data-testid="bar-series">{children}</div>,
  Cell: ({ fill }: { fill: string }) => <div data-testid="bar-cell" data-fill={fill} />,
}));

describe("PeakHoursChart", () => {
  it("renders safely when callers provide an empty dataset", () => {
    render(<PeakHoursChart data={[]} />);

    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
    expect(screen.queryAllByTestId("bar-cell")).toHaveLength(0);
  });

  it("keeps zero-booking bars in the muted state", () => {
    render(
      <PeakHoursChart
        data={[
          { hour: "06:00", bookings: 0 },
          { hour: "08:00", bookings: 0 },
        ]}
      />,
    );

    expect(screen.getAllByTestId("bar-cell")).toHaveLength(2);
    for (const cell of screen.getAllByTestId("bar-cell")) {
      expect(cell).toHaveAttribute("data-fill", "hsl(var(--muted))");
    }
  });
});
