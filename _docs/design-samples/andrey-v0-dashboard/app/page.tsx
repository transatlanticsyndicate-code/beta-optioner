import Layout from "@/components/kokonutui/layout"
import Link from "next/link"
import { FileBarChart, Calculator } from "lucide-react"

export default function HomePage() {
  return (
    <Layout>
      <div className="mb-6">
        <h1 className="mb-2 text-center text-4xl font-extralight text-primary">OPTIONER.ONLINE</h1>
        <p className="text-muted-foreground text-center">Профессиональные финансовые инструменты для членов команды</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Блок Аналитика */}
        <Link href="/analytics" className="group">
          <div className="rounded-lg border p-8 hover:border-primary transition-colors cursor-pointer h-full flex flex-col items-center justify-center text-center bg-card">
            <FileBarChart className="h-16 w-16 text-primary mb-4 group-hover:scale-110 transition-transform" />
            <h2 className="text-2xl font-bold text-foreground mb-3">АНАЛИТИКА</h2>
            <p className="text-muted-foreground">
              Используйте ИИ аналитику для обработки и обобщения данных по активам
            </p>
          </div>
        </Link>

        {/* Блок Калькуляторы */}
        <Link href="/transactions" className="group">
          <div className="bg-card rounded-lg border border-border p-8 hover:border-primary transition-colors cursor-pointer h-full flex flex-col items-center justify-center text-center">
            <Calculator className="h-16 w-16 text-primary mb-4 group-hover:scale-110 transition-transform" />
            <h2 className="text-2xl font-bold text-foreground mb-3">КАЛЬКУЛЯТОРЫ</h2>
            <p className="text-muted-foreground">Используйте калькуляторы для расчета позиций и стратегий</p>
          </div>
        </Link>
      </div>
    </Layout>
  )
}
