"use client"

import { useLanguage } from "@/components/providers/language-provider"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

interface TopCourtsTableProps {
  data: { name: string; bookings: number }[]
}

export function TopCourtsTable({ data }: TopCourtsTableProps) {
  const { language, t } = useLanguage()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{language === "ar" ? "الملعب" : "Court"}</TableHead>
          <TableHead className="text-center">{t("bookings.title")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((court, index) => (
          <TableRow key={index}>
            <TableCell className="font-medium">{court.name}</TableCell>
            <TableCell className="text-center">
              <Badge variant="secondary" className="font-mono">
                {court.bookings.toLocaleString()}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

