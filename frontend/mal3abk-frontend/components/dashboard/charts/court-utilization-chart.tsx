"use client"

import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts"
import { useLanguage } from "@/components/providers/language-provider"

interface CourtUtilizationChartProps {
  data?: { hour: string; court1: number; court2: number; court3: number }[]
}

const defaultData = [
  { hour: "08:00", court1: 0, court2: 0, court3: 0 },
  { hour: "10:00", court1: 50, court2: 0, court3: 0 },
  { hour: "12:00", court1: 100, court2: 50, court3: 0 },
  { hour: "14:00", court1: 100, court2: 100, court3: 50 },
  { hour: "16:00", court1: 100, court2: 100, court3: 100 },
  { hour: "18:00", court1: 100, court2: 100, court3: 100 },
  { hour: "20:00", court1: 100, court2: 100, court3: 100 },
  { hour: "22:00", court1: 50, court2: 100, court3: 50 },
]

export function CourtUtilizationChart({ data = defaultData }: CourtUtilizationChartProps) {
  const { language } = useLanguage()

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="hour"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
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
              typeof value === "number" ? `${value}%` : String(value ?? ""),
              language === "ar" ? "الاستخدام" : "Utilization",
            ]}
          />
          <Legend
            wrapperStyle={{ paddingTop: "20px" }}
            formatter={(value) => (
              <span className="text-sm text-muted-foreground">
                {language === "ar" ? `ملعب ${value.replace("court", "")}` : `Court ${value.replace("court", "")}`}
              </span>
            )}
          />
          <Line
            type="monotone"
            dataKey="court1"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ fill: "hsl(var(--primary))", r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="court2"
            stroke="hsl(var(--success))"
            strokeWidth={2}
            dot={{ fill: "hsl(var(--success))", r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="court3"
            stroke="hsl(var(--info))"
            strokeWidth={2}
            dot={{ fill: "hsl(var(--info))", r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

