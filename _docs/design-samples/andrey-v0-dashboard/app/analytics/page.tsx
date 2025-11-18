"use client"

import { useState } from "react"
import Layout from "@/components/kokonutui/layout"
import {
  FileBarChart,
  Loader2,
  X,
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Info,
  Save,
  Download,
  Share2,
  ChevronDown,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import Image from "next/image"

export default function AnalyticsPage() {
  const [reportType, setReportType] = useState("base")
  const [ticker, setTicker] = useState("")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [analyzeDynamics, setAnalyzeDynamics] = useState(false)
  const [period, setPeriod] = useState("month")
  const [expiration, setExpiration] = useState("all")
  const [isProcessing, setIsProcessing] = useState(false)
  const [showResults, setShowResults] = useState(false)

  const [glossary1Open, setGlossary1Open] = useState(false)
  const [glossary2Open, setGlossary2Open] = useState(false)
  const [glossary3Open, setGlossary3Open] = useState(false)

  const handleAnalyze = () => {
    setIsProcessing(true)
    setShowResults(false)
    setTimeout(() => {
      setIsProcessing(false)
      setShowResults(true)
    }, 3000)
  }

  const handleCancel = () => {
    setIsProcessing(false)
  }

  const mockResults = {
    summary: {
      currentPrice: 178.45,
      priceChange: 2.34,
      priceChangePercent: 1.33,
      volume: 52847392,
      avgVolume: 48234567,
      volatility: 24.5,
      trend: "up",
    },
    options: [
      { strike: 175, type: "CALL", bid: 5.2, ask: 5.4, volume: 1234, openInterest: 5678, iv: 28.5, delta: 0.65 },
      { strike: 180, type: "CALL", bid: 3.1, ask: 3.3, volume: 2345, openInterest: 8901, iv: 26.2, delta: 0.52 },
      { strike: 185, type: "CALL", bid: 1.8, ask: 2.0, volume: 3456, openInterest: 12345, iv: 25.8, delta: 0.38 },
      { strike: 175, type: "PUT", bid: 2.9, ask: 3.1, volume: 987, openInterest: 4321, iv: 29.1, delta: -0.35 },
      { strike: 180, type: "PUT", bid: 4.5, ask: 4.7, volume: 1876, openInterest: 6789, iv: 27.3, delta: -0.48 },
    ],
    insights: [
      { type: "positive", text: "Сильный восходящий тренд с увеличением объемов" },
      { type: "neutral", text: "Волатильность в пределах нормы для данного актива" },
      { type: "warning", text: "Высокий открытый интерес на страйке 180 может создать сопротивление" },
    ],
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <FileBarChart className="h-8 w-8 text-muted-foreground" />
            <h1 className="text-3xl font-bold text-foreground">Новый отчет</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Left column - 50% width on desktop, full width on mobile */}
          <div>
            <Card className="border-primary border">
              <CardHeader>
                <CardTitle>Параметры анализа</CardTitle>
                <CardDescription>Настройте параметры для создания отчета</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Тип отчета */}
                <div className="space-y-3">
                  <Label>Тип отчета</Label>
                  <RadioGroup value={reportType} onValueChange={setReportType}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="base" id="base" />
                      <Label htmlFor="base" className="font-normal cursor-pointer">
                        Анализ базового инструмента
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="options" id="options" />
                      <Label htmlFor="options" className="font-normal cursor-pointer">
                        Анализ опционов
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Тикер */}
                <div className="space-y-2">
                  <Label htmlFor="ticker">Тикер базового инструмента</Label>
                  <Input
                    id="ticker"
                    placeholder="Например: AAPL, TSLA, SPY"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    className="uppercase"
                  />
                </div>

                {/* Дата */}
                <div className="space-y-2">
                  <Label htmlFor="date">На дату</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                  />
                </div>

                {/* Анализ динамики */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="dynamics">Анализировать динамику</Label>
                    <Switch id="dynamics" checked={analyzeDynamics} onCheckedChange={setAnalyzeDynamics} />
                  </div>

                  {analyzeDynamics && (
                    <div className="space-y-2 pl-4 border-l-2 border-border">
                      <Label htmlFor="period">Период анализа</Label>
                      <Select value={period} onValueChange={setPeriod}>
                        <SelectTrigger id="period">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="week">Неделя</SelectItem>
                          <SelectItem value="month">Месяц</SelectItem>
                          <SelectItem value="quarter">Квартал</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Сроки экспирации (только для опционов) */}
                {reportType === "options" && (
                  <div className="space-y-2">
                    <Label htmlFor="expiration">Сроки экспирации</Label>
                    <Select value={expiration} onValueChange={setExpiration}>
                      <SelectTrigger id="expiration">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все</SelectItem>
                        <SelectItem value="1month">Ближайший месяц</SelectItem>
                        <SelectItem value="2-3months">2-3 месяца</SelectItem>
                        <SelectItem value="6months">6 месяцев</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Кнопка анализа */}
                <Button onClick={handleAnalyze} disabled={!ticker || isProcessing} className="w-full" size="lg">
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Анализируем...
                    </>
                  ) : (
                    "Анализировать"
                  )}
                </Button>

                {/* Processing indicator directly under the button */}
                {isProcessing && (
                  <Alert className="mt-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <AlertTitle>Обработка вашего запроса</AlertTitle>
                    <AlertDescription className="space-y-3">
                      <p>Пожалуйста, подождите, пока мы обрабатываем ваш запрос. Не обновляйте страницу.</p>
                      <Button variant="outline" size="sm" onClick={handleCancel} className="w-full bg-transparent">
                        <X className="mr-2 h-4 w-4" />
                        Отменить
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column - 50% width on desktop, full width on mobile */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Источники данных</CardTitle>
                <CardDescription>Hybrid (Yahoo + Polygon)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col md:flex-row gap-4 items-start">
                  <Image
                    src="/images/design-mode/Yah.png"
                    alt="Yahoo Finance"
                    width={120}
                    height={40}
                    className="object-contain"
                  />
                  <Image
                    src="/images/design-mode/pol.png"
                    alt="Polygon"
                    width={120}
                    height={40}
                    className="object-contain"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  объединяет данные из Yahoo Finance (OI, Volume) и Polygon.io (Greeks, точная IV) для максимальной
                  точности
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>ИИ модель</CardTitle>
                <CardDescription>Google Gemini 2.5 Flash</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex">
                  <Image
                    src="/images/design-mode/ge.webp"
                    alt="Gemini"
                    width={120}
                    height={40}
                    className="object-contain"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  современная языковая модель для быстрого и глубокого анализа
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Results section */}
        {showResults && (
          <div className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-foreground">Результаты анализа: {ticker}</h2>
              <div className="text-sm text-muted-foreground">
                Дата анализа:{" "}
                {new Date(date).toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" })}
              </div>
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=Иван Петров`} />
                  <AvatarFallback>ИП</AvatarFallback>
                </Avatar>
                <div className="text-sm font-medium">Иван Петров</div>
              </div>
            </div>

            {/* Key metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Текущая цена</CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold">${mockResults.summary.currentPrice}</div>
                      <div className="flex items-center gap-1 text-sm">
                        {mockResults.summary.trend === "up" ? (
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-600" />
                        )}
                        <span className={mockResults.summary.trend === "up" ? "text-green-600" : "text-red-600"}>
                          +{mockResults.summary.priceChange} ({mockResults.summary.priceChangePercent}%)
                        </span>
                      </div>
                    </div>
                    <DollarSign className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Объем торгов</CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold">{(mockResults.summary.volume / 1000000).toFixed(1)}M</div>
                      <div className="text-sm text-muted-foreground">
                        Средний: {(mockResults.summary.avgVolume / 1000000).toFixed(1)}M
                      </div>
                    </div>
                    <BarChart3 className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Волатильность</CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold">{mockResults.summary.volatility}%</div>
                      <div className="text-sm text-muted-foreground">IV 30 дней</div>
                    </div>
                    <Activity className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Риск-профиль</CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Умеренный</span>
                      <Badge variant="secondary">65%</Badge>
                    </div>
                    <Progress value={65} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tabs with detailed information */}
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Обзор</TabsTrigger>
                <TabsTrigger value="options">Опционы</TabsTrigger>
                <TabsTrigger value="insights">Выводы</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>📋 ОЦЕНКА КАЧЕСТВА ДАННЫХ</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="space-y-2">
                      <p>
                        <strong>Total OI:</strong> 145,226 контрактов
                      </p>
                      <p className="text-muted-foreground pl-4">&gt;100,000 = высокая надежность (полные данные)</p>

                      <p>
                        <strong>Дней до экспирации:</strong> 0 дней
                      </p>
                      <p className="text-muted-foreground pl-4">
                        &lt;3 дней = критическая зона (Max Pain магнит усилен, пины вероятны)
                      </p>

                      <p>
                        <strong>Объем vs OI:</strong> 1,091,287 / 145,226 = 7.51
                      </p>
                      <p className="text-muted-foreground pl-4">&gt;0.5 = высокая активность (свежие позиции)</p>

                      <p>
                        <strong>Полнота данных:</strong> Все поля заполнены.
                      </p>

                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          <strong>Вывод:</strong> Анализ выполнен с высокой надежностью, но с учетом критического
                          влияния близости экспирации.
                        </AlertDescription>
                      </Alert>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>1️⃣ ЦЕНОВЫЕ УРОВНИ И MAX PAIN</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="space-y-3">
                      <div>
                        <p className="font-semibold">Текущая цена $673.11 vs Max Pain $671.00</p>
                        <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                          <li>Разница: $2.11 (0.31%)</li>
                          <li>Max Pain ниже → уровень поддержки</li>
                          <li>Сила притяжения: высокая (менее 2%)</li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold">Топ-3 поддержки (PUT OI):</p>
                        <ul className="list-disc pl-6 space-y-1">
                          <li>$664.00 (OI 34,467) - -1.06% от текущей</li>
                          <li>$655.00 (OI 22,566) - -2.39% от текущей</li>
                          <li>$671.00 (OI 8,764) - -0.31% от текущей (Max Pain)</li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold">Топ-3 сопротивления (CALL OI):</p>
                        <ul className="list-disc pl-6 space-1">
                          <li>$675.00 (OI 12,230) - +0.28% от текущей</li>
                          <li>$678.00 (OI 5,490) - +0.73% от текущей</li>
                          <li>$682.00 (OI 4,211) - +1.32% от текущей</li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold">Структура диапазона:</p>
                        <ul className="list-disc pl-6 space-1 text-muted-foreground">
                          <li>Ближайшие границы: $664.00 - $675.00 (диапазон 1.65%)</li>
                          <li>Плотность: высокая - уровни каждые ~0.5%</li>
                          <li>Симметричность: смещен вниз (Max Pain ниже текущей цены)</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>2️⃣ РЫНОЧНЫЙ СЕНТИМЕНТ</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="space-y-3">
                      <div>
                        <p className="font-semibold">P/C Ratio: 1.47</p>
                        <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                          <li>Норма для SPY: 1.00 - 1.20</li>
                          <li>Отклонение: +22.5% от верхней границы нормы</li>
                          <li>Категория: медвежий (&gt;1.3)</li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold">Интерпретация:</p>
                        <ul className="list-disc pl-6 space-1">
                          <li>Преобладание: CALL на 41% / PUT на 59% / баланс</li>
                          <li>Сила сигнала: умеренная</li>
                          <li>Контекст: ожидание падения или хеджирование от него</li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold">Детализация позиций:</p>
                        <ul className="list-disc pl-6 space-1">
                          <li>Соотношение ATM опционов: P/C 1.47 (более точный индикатор)</li>
                          <li>Соотношение OTM опционов: P/C 1.47 (спекулятивные ставки)</li>
                        </ul>
                      </div>

                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Предупреждение</AlertTitle>
                        <AlertDescription className="space-y-1">
                          <p>• Низкий P/C НЕ гарантирует рост (может быть хедж шортов)</p>
                          <p>• Высокий P/C НЕ гарантирует падение (может быть защита лонгов)</p>
                        </AlertDescription>
                      </Alert>

                      <Collapsible open={glossary1Open} onOpenChange={setGlossary1Open}>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" className="w-full justify-between bg-transparent">
                            <span className="font-semibold">💡 Глоссарий</span>
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${glossary1Open ? "rotate-180" : ""}`}
                            />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2">
                          <div className="bg-muted p-4 rounded-lg space-y-2">
                            <div className="space-y-2 text-xs">
                              <p>
                                <strong>Put/Call Ratio (P/C)</strong> - соотношение PUT и CALL опционов. Показывает
                                настроение рынка:
                              </p>
                              <ul className="list-disc pl-6">
                                <li>P/C &lt; 0.7 = бычий настрой (ожидают рост)</li>
                                <li>P/C 0.7-1.3 = нейтральный (неопределенность)</li>
                                <li>P/C &gt; 1.3 = медвежий настрой (ожидают падение)</li>
                              </ul>
                              <p>
                                <strong>PUT опцион</strong> - "страховка" от падения цены. Много PUT = ожидают снижение
                                или хеджируются.
                              </p>
                              <p>
                                <strong>CALL опцион</strong> - "ставка" на рост цены. Много CALL = ожидают повышение.
                              </p>
                              <p>
                                <strong>Хеджирование</strong> - защита позиций от убытков. Как страховка автомобиля.
                              </p>
                              <p>
                                <strong>ATM</strong> - опционы близко к текущей цене (более точный индикатор
                                настроений).
                              </p>
                              <p>
                                <strong>OTM</strong> - опционы далеко от цены (спекулятивные позиции).
                              </p>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>3️⃣ GAMMA EXPOSURE И ВОЛАТИЛЬНОСТЬ</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="space-y-3">
                      <div>
                        <p className="font-semibold">GEX: 147,749 [положительная]</p>
                        <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                          <li>Величина: малая &lt;$1M</li>
                          <li>Сравнение со средней: данные отсутствуют для сравнения</li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold">Механика влияния:</p>
                        <ul className="list-disc pl-6 space-1">
                          <li>При росте цены: маркет-мейкеры [покупают акции (толкают вверх)]</li>
                          <li>При падении цены: маркет-мейкеры [покупают акции (тормозят падение)]</li>
                          <li>Итог: движения [стабилизируются (полож. GEX)]</li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold">Ожидаемая волатильность:</p>
                        <ul className="list-disc pl-6 space-1">
                          <li>IV Rank: -10.9% (процентиль за последние 52 недели)</li>
                          <li className="text-muted-foreground">&lt;25% = низкая волатильность (рынок спокоен)</li>
                          <li>Следствие: ожидаемый дневной диапазон ±0.31% ($671.00 - $675.22)</li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold">Критические зоны:</p>
                        <ul className="list-disc pl-6 space-1">
                          <li>Zero Gamma уровень: данные отсутствуют</li>
                          <li>
                            Зоны ускорения:
                            <ul className="list-circle pl-6">
                              <li>При пробое $675.00 вверх → усиление роста</li>
                              <li>При пробое $664.00 вниз → усиление падения</li>
                            </ul>
                          </li>
                          <li>Риск пина: низкий около $671.00 (макс. GEX)</li>
                        </ul>
                      </div>

                      <Collapsible open={glossary2Open} onOpenChange={setGlossary2Open}>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" className="w-full justify-between bg-transparent">
                            <span className="font-semibold">💡 Глоссарий</span>
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${glossary2Open ? "rotate-180" : ""}`}
                            />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2">
                          <div className="bg-muted p-4 rounded-lg space-y-2">
                            <div className="space-y-2 text-xs">
                              <p>
                                <strong>Gamma Exposure (GEX)</strong> - показывает, как маркет-мейкеры влияют на цену:
                              </p>
                              <ul className="list-disc pl-6">
                                <li>
                                  GEX &gt; 0 (положительная) = маркет-мейкеры ТОРМОЗЯТ движение цены (стабилизируют)
                                </li>
                                <li>
                                  GEX &lt; 0 (отрицательная) = маркет-мейкеры УСИЛИВАЮТ движение цены (дестабилизируют)
                                </li>
                                <li>GEX = 0 (нейтральная) = маркет-мейкеры не влияют на цену</li>
                              </ul>
                              <p>
                                <strong>Маркет-мейкеры</strong> - крупные игроки, которые обеспечивают ликвидность.
                                Вынуждены покупать/продавать акции для хеджирования опционов.
                              </p>
                              <p>
                                <strong>IV Rank</strong> - показывает текущую волатильность относительно истории. 100% =
                                максимальная за год, 0% = минимальная.
                              </p>
                              <p>
                                <strong>Zero Gamma</strong> - ценовой уровень, где влияние маркет-мейкеров меняется с
                                положительного на отрицательное.
                              </p>
                              <p>
                                <strong>Пин</strong> - "прилипание" цены к определенному уровню из-за действий
                                маркет-мейкеров.
                              </p>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>4️⃣ НЕОБЫЧНАЯ АКТИВНОСТЬ</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="space-y-3">
                      <div>
                        <p className="font-semibold">Концентрация OI:</p>
                        <ul className="list-disc pl-6 space-1">
                          <li>Топ-5 PUT страйков: суммарный OI 93,590 (64.4% от Total OI)</li>
                          <li>Топ-5 CALL страйков: суммарный OI 31,270 (21.5% от Total OI)</li>
                          <li className="text-muted-foreground">Оценка: высокая концентрация &gt;30%</li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold">Аномальные позиции:</p>
                        <ul className="list-disc pl-6 space-1">
                          <li>
                            Страйк $664.00 PUT: OI 34,467 (в 3.8х раз выше среднего соседнего)
                            <span className="text-muted-foreground block pl-4">
                              Интерпретация: защита от падения / институциональный хедж
                            </span>
                          </li>
                          <li>
                            Страйк $655.00 PUT: OI 22,566 (в 2.5х раз выше среднего соседнего)
                            <span className="text-muted-foreground block pl-4">
                              Интерпретация: защита от падения / спекуляция
                            </span>
                          </li>
                          <li>
                            Страйк $675.00 CALL: OI 12,230 (в 1.1х раз выше среднего соседнего)
                            <span className="text-muted-foreground block pl-4">
                              Интерпретация: ставка на рост / хедж шортов
                            </span>
                          </li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold">Свежесть позиций (Volume/OI):</p>
                        <ul className="list-disc pl-6 space-1">
                          <li>PUT опционы: V/OI 7.51 → активное открытие &gt;0.5</li>
                          <li>CALL опционы: V/OI 7.51 → активное открытие &gt;0.5</li>
                          <li className="font-medium">Вывод: новые позиции активно открываются</li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold">Дельта-экспозиция:</p>
                        <ul className="list-disc pl-6 space-1">
                          <li>Net Delta: 476,257 (сумма дельт всех опционов)</li>
                          <li className="text-muted-foreground">&gt;0 = преобладание бычьих позиций</li>
                          <li>Дисбаланс: 100% в сторону CALL (Put Delta = 0)</li>
                        </ul>
                      </div>

                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertTitle>Институциональные сигналы</AlertTitle>
                        <AlertDescription>
                          Обнаружены признаки крупных позиций на страйках $664.00 PUT и $655.00 PUT.
                        </AlertDescription>
                      </Alert>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>5️⃣ ОБЩАЯ КАРТИНА</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="space-y-3">
                      <div>
                        <p className="font-semibold">Синтез метрик:</p>
                        <ul className="list-disc pl-6 space-1">
                          <li>P/C 1.47 + GEX $0.15M + Max Pain $671.00 = согласованная картина</li>
                          <li>Доминирующий фактор: Max Pain магнит и высокая концентрация PUT OI</li>
                          <li>Структура рынка: диапазонная с медвежьим уклоном</li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold">Согласованность сигналов:</p>
                        <ul className="space-y-1">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                            <span>
                              Подтверждают друг друга: P/C Ratio, высокая концентрация PUT OI, Max Pain как уровень
                              поддержки.
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                            <span>
                              Противоречат: Net Delta показывает бычий перекос, что контрастирует с медвежьим P/C Ratio
                              и доминированием PUT OI.
                            </span>
                          </li>
                        </ul>
                        <p className="font-medium mt-2">Вывод: средняя предсказуемость поведения</p>
                      </div>

                      <div>
                        <p className="font-semibold">Влияние экспирации:</p>
                        <ul className="list-disc pl-6 space-1">
                          <li>До экспирации: 0 дней</li>
                          <li>Эффект: критический &lt;3д</li>
                          <li>Поведение Max Pain: сильный магнит</li>
                          <li>Ожидаемый pin: высоковероятен около $671.00</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>📊 СЦЕНАРИИ ДВИЖЕНИЯ</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6 text-sm">
                    <div className="space-y-3">
                      <div className="border-l-4 border-green-500 pl-4">
                        <p className="font-semibold text-green-600">Сценарий +2% (до $686.47):</p>
                        <ul className="list-disc pl-6 space-1 mt-2">
                          <li>Пробой уровня: $675.00 (CALL OI 12,230)</li>
                          <li>Следующее сопротивление: $678.00 (CALL OI 5,490) на расстоянии +0.52%</li>
                          <li>Поведение GEX: затормозит движение</li>
                          <li>Реакция маркет-мейкеров: покупка акций в объеме ~1.1M акций</li>
                          <li>Вероятность пина: низкая на $671.00</li>
                        </ul>
                      </div>

                      <div className="border-l-4 border-red-500 pl-4">
                        <p className="font-semibold text-red-600">Сценарий -2% (до $659.65):</p>
                        <ul className="list-disc pl-6 space-1 mt-2">
                          <li>Пробой уровня: $664.00 (PUT OI 34,467)</li>
                          <li>Следующая поддержка: $655.00 (PUT OI 22,566) на расстоянии -1.06%</li>
                          <li>Поведение GEX: затормозит движение</li>
                          <li>Реакция маркет-мейкеров: покупка акций в объеме ~0.5M акций</li>
                          <li>Критический уровень: $664.00 (аномальный PUT OI 34,467)</li>
                        </ul>
                      </div>

                      <div className="border-l-4 border-green-600 pl-4">
                        <p className="font-semibold text-green-700">Сценарий +5% (до $706.77):</p>
                        <ul className="list-disc pl-6 space-1 mt-2">
                          <li>Цепочка пробоев: $675.00 → $678.00 → $682.00</li>
                          <li>Совокупное CALL OI: 21,931 контрактов</li>
                          <li>Риск gamma squeeze: низкий</li>
                          <li>Требуемый объем для пробоя: ~0.5% от avg daily volume</li>
                        </ul>
                      </div>

                      <div className="border-l-4 border-red-600 pl-4">
                        <p className="font-semibold text-red-700">Сценарий -5% (до $639.45):</p>
                        <ul className="list-disc pl-6 space-1 mt-2">
                          <li>Цепочка пробоев: $664.00 → $655.00 → $615.00</li>
                          <li>Совокупное PUT OI: 62,059 контрактов</li>
                          <li>Риск массовой активации хеджей: средний</li>
                          <li>Каскадные стопы возможны ниже: $655.00</li>
                        </ul>
                      </div>

                      <div className="border-l-4 border-blue-500 pl-4">
                        <p className="font-semibold text-blue-600">Зона стабильности:</p>
                        <ul className="list-disc pl-6 space-1 mt-2">
                          <li>Диапазон: $671.00 - $675.00 (между Max Pain и ближайшими уровнями)</li>
                          <li>Вероятность нахождения в зоне: высокая</li>
                          <li>Факторы удержания: Max Pain, высокая GEX, высокая концентрация PUT OI</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>⚠️ ОГРАНИЧЕНИЯ АНАЛИЗА</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="space-y-3">
                      <div>
                        <p className="font-semibold">Качество данных:</p>
                        <ul className="list-disc pl-6 space-1">
                          <li>Total OI 145,226 → высокая достоверность</li>
                          <li>Полнота: все поля заполнены</li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold">Временные факторы:</p>
                        <ul className="list-disc pl-6 space-1">
                          <li>Данные актуальны на момент снимка, внутридневная динамика не учтена</li>
                          <li>До экспирации 0 дней → поведение меняющееся</li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold">Неучтенные факторы:</p>
                        <ul className="space-1">
                          <li className="flex items-start gap-2">
                            <X className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                            <span>Макроэкономические данные (FOMC, CPI, earnings)</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <X className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                            <span>Новости и события компании</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <X className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                            <span>Общерыночные настроения (VIX, SPX)</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <X className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                            <span>Dark pools и внебиржевая активность</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <X className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                            <span>Манипуляции и аномальные события</span>
                          </li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold">Риски интерпретации:</p>
                        <ul className="list-disc pl-6 space-1">
                          <li>Корреляция ≠ причинность</li>
                          <li>Исторические паттерны могут не повториться</li>
                          <li>Крупные игроки могут изменить структуру мгновенно</li>
                        </ul>
                      </div>

                      <Alert>
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertTitle>Рекомендация</AlertTitle>
                        <AlertDescription className="space-1">
                          <p>• Используй анализ как ОДИН из инструментов, не единственный</p>
                          <p>• Комбинируй с техническим анализом и фундаменталом</p>
                          <p>• Следи за обновлением данных в реальном времени</p>
                        </AlertDescription>
                      </Alert>

                      <Collapsible open={glossary3Open} onOpenChange={setGlossary3Open}>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" className="w-full justify-between bg-transparent">
                            <span className="font-semibold">💡 Глоссарий</span>
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${glossary3Open ? "rotate-180" : ""}`}
                            />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2">
                          <div className="bg-muted p-4 rounded-lg space-y-2">
                            <div className="space-y-2 text-xs">
                              <p>
                                <strong>Gamma Squeeze</strong> - резкий рост цены из-за вынужденных покупок
                                маркет-мейкеров. Эффект снежного кома.
                              </p>
                              <p>
                                <strong>Pin</strong> - "прилипание" цены к определенному страйку перед экспирацией.
                              </p>
                              <p>
                                <strong>Dark Pool</strong> - внебиржевые торги крупных блоков акций, невидимые в обычных
                                данных.
                              </p>
                              <p>
                                <strong>FOMC</strong> - комитет ФРС по монетарной политике. Их решения сильно влияют на
                                рынки.
                              </p>
                              <p>
                                <strong>VIX</strong> - "индекс страха", измеряет ожидаемую волатильность рынка.
                              </p>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="options" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Цепочка опционов</CardTitle>
                    <CardDescription>Актуальные данные по опционам на {date}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Страйк</TableHead>
                          <TableHead>Тип</TableHead>
                          <TableHead>Bid</TableHead>
                          <TableHead>Ask</TableHead>
                          <TableHead>Объем</TableHead>
                          <TableHead>OI</TableHead>
                          <TableHead>IV</TableHead>
                          <TableHead>Delta</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mockResults.options.map((option, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">${option.strike}</TableCell>
                            <TableCell>
                              <Badge variant={option.type === "CALL" ? "default" : "secondary"}>{option.type}</Badge>
                            </TableCell>
                            <TableCell>${option.bid.toFixed(2)}</TableCell>
                            <TableCell>${option.ask.toFixed(2)}</TableCell>
                            <TableCell>{option.volume.toLocaleString()}</TableCell>
                            <TableCell>{option.openInterest.toLocaleString()}</TableCell>
                            <TableCell>{option.iv}%</TableCell>
                            <TableCell>{option.delta.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="insights" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Ключевые выводы</CardTitle>
                    <CardDescription>Анализ на основе ИИ модели</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {mockResults.insights.map((insight, index) => (
                      <Alert key={index} variant={insight.type === "warning" ? "destructive" : "default"}>
                        {insight.type === "positive" && <CheckCircle2 className="h-4 w-4" />}
                        {insight.type === "neutral" && <Info className="h-4 w-4" />}
                        {insight.type === "warning" && <AlertTriangle className="h-4 w-4" />}
                        <AlertDescription>{insight.text}</AlertDescription>
                      </Alert>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Рекомендации</CardTitle>
                    <CardDescription>Стратегии на основе анализа</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <h4 className="font-medium">Для консервативных инвесторов</h4>
                      <p className="text-sm text-muted-foreground">
                        Рассмотрите продажу покрытых коллов на страйке 185 для генерации дохода при умеренном риске.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-medium">Для агрессивных трейдеров</h4>
                      <p className="text-sm text-muted-foreground">
                        Покупка коллов на страйке 180 может быть выгодна при продолжении восходящего тренда.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="flex flex-col md:flex-row gap-3">
              <Button variant="default">
                <Save className="mr-2 h-4 w-4" />
                Сохранить отчет
              </Button>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Экспортировать в PDF
              </Button>
              <Button variant="outline">
                <Share2 className="mr-2 h-4 w-4" />
                Поделиться
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
