"use client"

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
import { useLanguage } from "@/components/providers/language-provider"

interface SpendingChartProps {
  data?: { month: string; spending: number }[]
}

export function SpendingChart({ data }: SpendingChartProps) {
  const { language, t } = useLanguage()

  const chartData = data || []

  if (chartData.length === 0) {
    return (
      <div className="h-[250px] w-full flex items-center justify-center">
        <p className="text-muted-foreground">{language === "ar" ? "لا توجد بيانات" : "No data available"}</p>
      </div>
    )
  }

  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
            width={50}
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
              `${typeof value === "number" ? value.toLocaleString() : String(value ?? "")} ${t("common.egp")}`,
              language === "ar" ? "الإنفاق" : "Spending",
            ]}
          />
          <Bar dataKey="spending" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

