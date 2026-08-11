"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts"
import { useLanguage } from "@/components/providers/language-provider"

interface BookingsChartProps {
   data?: { status: string; count: number; color?: string }[]
}

const defaultData = [
  { status: "Confirmed", count: 320 },
  { status: "Pending Payment", count: 140 },
  { status: "Completed", count: 480 },
  { status: "Cancelled", count: 60 },
]

export function BookingsChart({ data = defaultData }: BookingsChartProps) {
  const { language } = useLanguage()

  const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"]

  const chartData = data || []

  if (chartData.length === 0) {
    return (
      <div className="h-[300px] w-full flex items-center justify-center">
        <p className="text-muted-foreground">No data available</p>
      </div>
    )
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={4}
            dataKey="count"
            nameKey="status"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
            formatter={(value, name) => [
              typeof value === "number" ? value.toLocaleString() : String(value ?? ""),
              String(name ?? ""),
            ]}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => <span className="text-sm text-muted-foreground">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

