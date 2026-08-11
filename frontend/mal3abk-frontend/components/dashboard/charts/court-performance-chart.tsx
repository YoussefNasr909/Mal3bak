"use client"

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"
import { useLanguage } from "@/components/providers/language-provider"

interface CourtPerformanceChartProps {
  data: { name: string; bookings: number; revenue: number }[]
}

export function CourtPerformanceChart({ data }: CourtPerformanceChartProps) {
  const { language, t } = useLanguage()

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <XAxis
            type="number"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            width={120}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
            formatter={(value) => [
              typeof value === "number" ? value.toLocaleString() : String(value ?? ""),
              language === "ar" ? "حجوزات" : "Bookings",
            ]}
          />
          <Bar dataKey="bookings" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

