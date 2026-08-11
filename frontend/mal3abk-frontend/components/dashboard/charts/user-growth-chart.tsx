"use client"

import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"
import { useLanguage } from "@/components/providers/language-provider"

interface UserGrowthChartProps {
  data: { month: string; users: number }[]
}

export function UserGrowthChart({ data }: UserGrowthChartProps) {
  const { language } = useLanguage()

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            dx={-10}
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
              language === "ar" ? "المستخدمين" : "Users",
            ]}
          />
          <Line
            type="monotone"
            dataKey="users"
            stroke="hsl(var(--chart-2))"
            strokeWidth={2}
            dot={{ fill: "hsl(var(--chart-2))", strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

