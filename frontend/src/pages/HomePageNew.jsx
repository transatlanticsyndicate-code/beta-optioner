import React from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, FileBarChart, Calculator } from 'lucide-react';

function HomePageNew() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Блок Сделки */}
        <Link to="/tools/deals-archive" className="group">
          <div className="rounded-lg border p-8 hover:border-primary transition-colors cursor-pointer h-full flex flex-col items-center justify-center text-center bg-card">
            <Briefcase className="h-16 w-16 mb-4 group-hover:scale-110 transition-transform" style={{ color: 'rgb(27, 186, 207)' }} />
            <h2 className="text-2xl font-bold text-foreground mb-3">СДЕЛКИ</h2>
            <p className="text-muted-foreground">
              Создавайте и управляйте торговыми сделками
            </p>
          </div>
        </Link>

        {/* Блок Калькуляторы */}
        <Link to="/tools/options-calculator" className="group">
          <div className="bg-card rounded-lg border border-border p-8 hover:border-primary transition-colors cursor-pointer h-full flex flex-col items-center justify-center text-center">
            <Calculator className="h-16 w-16 mb-4 group-hover:scale-110 transition-transform" style={{ color: 'rgb(27, 186, 207)' }} />
            <h2 className="text-2xl font-bold text-foreground mb-3">КАЛЬКУЛЯТОРЫ</h2>
            <p className="text-muted-foreground">Используйте калькуляторы для расчета позиций и стратегий</p>
          </div>
        </Link>

        {/* Блок Аналитика */}
        <Link to="/tools/options-analyzer" className="group">
          <div className="rounded-lg border p-8 hover:border-primary transition-colors cursor-pointer h-full flex flex-col items-center justify-center text-center bg-card">
            <FileBarChart className="h-16 w-16 mb-4 group-hover:scale-110 transition-transform" style={{ color: 'rgb(27, 186, 207)' }} />
            <h2 className="text-2xl font-bold text-foreground mb-3">АНАЛИТИКА</h2>
            <p className="text-muted-foreground">
              Используйте ИИ аналитику для обработки и обобщения данных по активам
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}

export default HomePageNew;
