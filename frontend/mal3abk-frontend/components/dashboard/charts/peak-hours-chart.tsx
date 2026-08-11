"use client"

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from "recharts"
import { useLanguage } from "@/components/providers/language-provider"

interface PeakHoursChartProps {
  data?: { hour: string; bookings: number }[]
}

const defaultData = [
  { hour: "06:00", bookings: 2 },
  { hour: "08:00", bookings: 5 },
  { hour: "10:00", bookings: 8 },
  { hour: "12:00", bookings: 12 },
  { hour: "14:00", bookings: 15 },
  { hour: "16:00", bookings: 22 },
  { hour: "18:00", bookings: 28 },
  { hour: "20:00", bookings: 25 },
  { hour: "22:00", bookings: 18 },
]

export function PeakHoursChart({ data = defaultData }: PeakHoursChartProps) {
  const { language } = useLanguage()
  const maxBookings = data.reduce((max, item) => Math.max(max, item.bookings), 0)

  const getColor = (bookings: number) => {
    const intensity = maxBookings > 0 ? bookings / maxBookings : 0
    if (intensity > 0.7) return "hsl(var(--destructive))"
    if (intensity > 0.5) return "hsl(var(--warning))"
    if (intensity > 0.3) return "hsl(var(--primary))"
    return "hsl(var(--muted))"
  }

  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="hour"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            width={40}
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
              `${typeof value === "number" ? value : String(value ?? "")} ${language === "ar" ? "حجز" : "booking(s)"}`,
              language === "ar" ? "الحجوزات" : "Bookings",
            ]}
          />
          <Bar dataKey="bookings" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getColor(entry.bookings)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

