"use client"

import type React from "react"

import Layout from "@/components/kokonutui/layout"
import { Calculator, Search, Eye, EyeOff, ChevronDown, Trash2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useState, useRef } from "react"
import TradingViewWidget from "@/components/trading-view-widget"
import { Slider } from "@/components/ui/slider"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

// Данные для автокомплита тикеров
const tickerSuggestions = [
  { symbol: "AAPL", name: "AAPL" },
  { symbol: "AAPBGraniteShares", name: "AAPBGraniteShares 2x Long AAPL Daily ETF" },
  { symbol: "AAPDDirexion", name: "AAPDDirexion Daily AAPL Bear 1X Shares" },
  { symbol: "AAPUDirexion", name: "AAPUDirexion Daily AAPL Bull 2X Shares" },
  { symbol: "AAPWRoundhill", name: "AAPWRoundhill ETF Trust Roundhill AAPL WeeklyPay ETF" },
  { symbol: "APLYTidal", name: "APLYTidal ETF Trust II YieldMax AAPL Option" },
]

interface Flag {
  id: string
  price: number
  type: "sell" | "buy" | "ticker"
  color: string
  count?: number
  label?: string
  date?: string
  dateColor?: string
}

// Типы позиций
type Position = {
  id: string
  type: "LONG" | "SHORT"
  quantity: number
  ticker: string
  price: number
  visible: boolean
}

// Тип для опционов
type Option = {
  id: string
  action: "Buy" | "Sell"
  type: "CALL" | "PUT"
  strike: number
  date: string
  quantity: number
  premium: number
  bid: number
  ask: number
  volume: number
  oi: number
  visible: boolean
}

export default function CalculatorsNewPage() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")
  const [selectedTicker, setSelectedTicker] = useState("")
  const [currentPrice, setCurrentPrice] = useState(245.27)
  const [priceChange, setPriceChange] = useState({ value: 2.34, percent: 1.33 })

  // Позиции базового актива
  const [positions, setPositions] = useState<Position[]>([
    { id: "1", type: "LONG", quantity: 1000, ticker: "AAPL", price: 3000, visible: true },
    { id: "2", type: "LONG", quantity: 1000, ticker: "AAPL", price: 3000, visible: true },
  ])

  // Опционы
  const [options, setOptions] = useState<Option[]>([
    {
      id: "1",
      action: "Buy",
      type: "CALL",
      strike: 255,
      date: "31.10.25",
      quantity: 1,
      premium: 5.9,
      bid: 225.8,
      ask: 6.0,
      volume: 2164,
      oi: 34514,
      visible: true,
    },
    {
      id: "2",
      action: "Buy",
      type: "PUT",
      strike: 1220,
      date: "31.10.25",
      quantity: 1,
      premium: 14.7,
      bid: 5.8,
      ask: 16.0,
      volume: 12164,
      oi: 134514,
      visible: true,
    },
    {
      id: "3",
      action: "Sell",
      type: "CALL",
      strike: 33262,
      date: "31.10.25",
      quantity: -1,
      premium: 556.1,
      bid: 15.8,
      ask: 236.0,
      volume: 164,
      oi: 2034514,
      visible: true,
    },
    {
      id: "4",
      action: "Sell",
      type: "PUT",
      strike: 231,
      date: "31.10.25",
      quantity: -2,
      premium: 3.6,
      bid: 5.8,
      ask: 6.0,
      volume: 2164,
      oi: 34514,
      visible: true,
    },
  ])

  // Переключение видимости позиции
  const togglePositionVisibility = (id: string) => {
    setPositions(positions.map((pos) => (pos.id === id ? { ...pos, visible: !pos.visible } : pos)))
  }

  // Удаление позиции
  const deletePosition = (id: string) => {
    setPositions(positions.filter((pos) => pos.id !== id))
  }

  // Добавление новой позиции
  const addPosition = (type: "LONG" | "SHORT") => {
    const newPosition: Position = {
      id: Date.now().toString(),
      type,
      quantity: 100,
      ticker: selectedTicker || "AAPL",
      price: 242.14,
      visible: true,
    }
    setPositions([...positions, newPosition])
  }

  // Переключение видимости опциона
  const toggleOptionVisibility = (id: string) => {
    setOptions(options.map((opt) => (opt.id === id ? { ...opt, visible: !opt.visible } : opt)))
  }

  // Удаление опциона
  const deleteOption = (id: string) => {
    setOptions(options.filter((opt) => opt.id !== id))
  }

  // Добавление нового опциона
  const addOption = (action: "Buy" | "Sell", type: "CALL" | "PUT") => {
    const newOption: Option = {
      id: Date.now().toString(),
      action,
      type,
      strike: 250,
      date: "31.10.25",
      quantity: action === "Buy" ? 1 : -1,
      premium: 5.0,
      bid: 5.8,
      ask: 6.0,
      volume: 2164,
      oi: 34514,
      visible: true,
    }
    setOptions([...options, newOption])
  }

  const selectStrategy = (strategy: string) => {
    console.log("Выбрана стратегия:", strategy)
  }

  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [strategyName, setStrategyName] = useState("")
  const [strategyComment, setStrategyComment] = useState("")

  const handleSaveStrategy = () => {
    if (strategyName.trim() && strategyComment.trim()) {
      console.log("Сохранение стратегии:", { name: strategyName, comment: strategyComment })
      // Здесь будет логика сохранения
      setSaveDialogOpen(false)
      setStrategyName("")
      setStrategyComment("")
    }
  }

  const [daysRemaining, setDaysRemaining] = useState(10) // дней до экспирации (от 0 до 30)
  const [volatility, setVolatility] = useState(41.8) // процент волатильности
  const [chartDisplayMode, setChartDisplayMode] = useState("profit-loss-dollar")

  const [selectedExpirationDate, setSelectedExpirationDate] = useState<string>("28-11")

  const expirationDates = [
    // Oct 2024
    { date: "15-10", month: "Oct", displayDate: "15" },
    { date: "16-10", month: "Oct", displayDate: "16" },
    { date: "17-10", month: "Oct", displayDate: "17" },
    { date: "20-10", month: "Oct", displayDate: "20" },
    { date: "21-10", month: "Oct", displayDate: "21" },
    { date: "22-10", month: "Oct", displayDate: "22" },
    { date: "23-10", month: "Oct", displayDate: "23" },
    { date: "24-10", month: "Oct", displayDate: "24" },
    { date: "31-10", month: "Oct", displayDate: "31" },
    // Nov 2024
    { date: "7-11", month: "Nov", displayDate: "7" },
    { date: "14-11", month: "Nov", displayDate: "14" },
    { date: "21-11", month: "Nov", displayDate: "21" },
    { date: "28-11", month: "Nov", displayDate: "28" },
    // Dec 2024
    { date: "19-12", month: "Dec", displayDate: "19" },
    { date: "31-12", month: "Dec", displayDate: "31" },
    // Jan 2025
    { date: "2-1", month: "Jan '26", displayDate: "2" },
    { date: "9-1", month: "Jan '26", displayDate: "9" },
    { date: "16-1", month: "Jan '26", displayDate: "16" },
    { date: "23-1", month: "Jan '26", displayDate: "23" },
    { date: "30-1", month: "Jan '26", displayDate: "30" },
    // Feb 2025
    { date: "20-2", month: "Feb", displayDate: "20" },
    { date: "27-2", month: "Feb", displayDate: "27" },
    // Mar 2025
    { date: "20-3", month: "Mar", displayDate: "20" },
    { date: "31-3", month: "Mar", displayDate: "31" },
    // Jun 2025
    { date: "18-6", month: "Jun", displayDate: "18" },
    { date: "30-6", month: "Jun", displayDate: "30" },
    // Sep 2025
    { date: "18-9", month: "Sep", displayDate: "18" },
    { date: "30-9", month: "Sep", displayDate: "30" },
    // Dec 2025
    { date: "18-12-2", month: "Dec", displayDate: "18" },
    // Jan 2026
    { date: "15-1-2", month: "Jan '27", displayDate: "15" },
    { date: "17-1-2", month: "Jan '27", displayDate: "17" },
    // Dec 2026
    { date: "21-12-3", month: "Dec", displayDate: "21" },
    // Jan 2027
    { date: "21-1-3", month: "Jan '28", displayDate: "21" },
  ]

  const expirationDatesMap = expirationDates.reduce(
    (acc, date) => {
      const key = date.month
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(date)
      return acc
    },
    {} as Record<string, typeof expirationDates>,
  )

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return
    setIsDragging(true)
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft)
    setScrollLeft(scrollContainerRef.current.scrollLeft)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return
    e.preventDefault()
    const x = e.pageX - scrollContainerRef.current.offsetLeft
    const walk = (x - startX) * 2 // Скорость прокрутки
    scrollContainerRef.current.scrollLeft = scrollLeft - walk
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
  }

  const priceScaleRef = useRef<HTMLDivElement>(null)
  const [isPriceScaleDragging, setIsPriceScaleDragging] = useState(false)
  const [priceScaleStartX, setPriceScaleStartX] = useState(0)
  const [priceScaleScrollLeft, setPriceScaleScrollLeft] = useState(0)

  const [draggingFlagId, setDraggingFlagId] = useState<string | null>(null)
  const [dragStartX, setDragStartX] = useState(0)
  const [dragStartPrice, setDragStartPrice] = useState(0)

  const [flags, setFlags] = useState<Flag[]>([
    { id: "flag-1", price: 5150, type: "sell", color: "#FF6B6B", count: 2, date: "30.01.20", dateColor: "#8B5CF6" },
    { id: "flag-2", price: 5170, type: "sell", color: "#FF6B6B" },
    { id: "flag-ticker", price: 5183, type: "ticker", color: "#4B5563", label: "SPX" },
    { id: "flag-3", price: 5195, type: "buy", color: "#4CAF50" },
    { id: "flag-4", price: 5220, type: "buy", color: "#4CAF50", count: 5 },
  ])

  const [bottomFlags, setBottomFlags] = useState<Flag[]>([
    { id: "bottom-flag-1", price: 5160, type: "buy", color: "#4CAF50", count: 3 },
    { id: "bottom-flag-2", price: 5175, type: "buy", color: "#4CAF50", date: "28.12.25", dateColor: "#84CC16" },
    { id: "bottom-flag-3", price: 5200, type: "sell", color: "#FF6B6B" },
    { id: "bottom-flag-4", price: 5230, type: "sell", color: "#FF6B6B", count: 4 },
  ])

  const handleFlagMouseDown = (e: React.MouseEvent, flag: Flag) => {
    if (flag.type === "ticker") return
    e.stopPropagation()
    setDraggingFlagId(flag.id)
    setDragStartX(e.clientX)
    setDragStartPrice(flag.price)
  }

  const handleFlagMouseMove = (e: React.MouseEvent) => {
    if (!draggingFlagId || !priceScaleRef.current) return

    const deltaX = e.clientX - dragStartX
    const priceChange = Math.round(deltaX / 6)
    const newPrice = Math.max(5100, Math.min(5310, dragStartPrice + priceChange))

    setFlags((prevFlags) => prevFlags.map((flag) => (flag.id === draggingFlagId ? { ...flag, price: newPrice } : flag)))
    setBottomFlags((prevFlags) =>
      prevFlags.map((flag) => (flag.id === draggingFlagId ? { ...flag, price: newPrice } : flag)),
    )
  }

  const handleFlagMouseUp = () => {
    setDraggingFlagId(null)
  }

  const handlePriceScaleMouseDown = (e: React.MouseEvent) => {
    if (draggingFlagId) return
    if (!priceScaleRef.current) return
    setIsPriceScaleDragging(true)
    setPriceScaleStartX(e.pageX - priceScaleRef.current.offsetLeft)
    setPriceScaleScrollLeft(priceScaleRef.current.scrollLeft)
  }

  const handlePriceScaleMouseMove = (e: React.MouseEvent) => {
    if (draggingFlagId) {
      handleFlagMouseMove(e)
      return
    }

    if (!isPriceScaleDragging || !priceScaleRef.current) return
    e.preventDefault()
    const x = e.pageX - priceScaleRef.current.offsetLeft
    const walk = (x - priceScaleStartX) * 2
    priceScaleRef.current.scrollLeft = priceScaleScrollLeft - walk
  }

  const handlePriceScaleMouseUp = () => {
    if (draggingFlagId) {
      handleFlagMouseUp()
      return
    }
    setIsPriceScaleDragging(false)
  }

  const handlePriceScaleMouseLeave = () => {
    if (draggingFlagId) {
      handleFlagMouseUp()
    }
    setIsPriceScaleDragging(false)
  }

  const calculateFlagYPositions = () => {
    const sortedFlags = [...flags].sort((a, b) => a.price - b.price)
    const yLevels: { [key: string]: number } = {}
    const flagWidth = 43

    sortedFlags.forEach((flag) => {
      const flagPosition = (flag.price - 5100) * 6 + 1.5
      let level = 0

      while (true) {
        let hasCollision = false

        for (const otherFlag of sortedFlags) {
          if (otherFlag.id === flag.id) continue
          if (yLevels[otherFlag.id] !== level) continue

          const otherPosition = (otherFlag.price - 5100) * 6 + 1.5
          const distance = Math.abs(flagPosition - otherPosition)

          if (distance < flagWidth) {
            hasCollision = true
            break
          }
        }

        if (!hasCollision) {
          yLevels[flag.id] = level
          break
        }

        level++
      }
    })

    return yLevels
  }

  const calculateBottomFlagYPositions = () => {
    const sortedFlags = [...bottomFlags].sort((a, b) => a.price - b.price)
    const yLevels: { [key: string]: number } = {}
    const flagWidth = 43

    sortedFlags.forEach((flag) => {
      const flagPosition = (flag.price - 5100) * 6 + 1.5
      let level = 0

      while (true) {
        let hasCollision = false

        for (const otherFlag of sortedFlags) {
          if (otherFlag.id === flag.id) continue
          if (yLevels[otherFlag.id] !== level) continue

          const otherPosition = (otherFlag.price - 5100) * 6 + 1.5
          const distance = Math.abs(flagPosition - otherPosition)

          if (distance < flagWidth) {
            hasCollision = true
            break
          }
        }

        if (!hasCollision) {
          yLevels[flag.id] = level
          break
        }

        level++
      }
    })

    return yLevels
  }

  const flagYLevels = calculateFlagYPositions()
  const bottomFlagYLevels = calculateBottomFlagYPositions()

  const [greenBarHeights] = useState(() => Array.from({ length: 211 }, () => Math.floor(Math.random() * 31)))

  const [redBarHeights] = useState(() => Array.from({ length: 211 }, () => Math.floor(Math.random() * 31)))

  // const flags = [
  //   { price: 150, type: "sell" as const, color: "#FF6B6B" },
  //   { price: 170, type: "sell" as const, color: "#FF6B6B" },
  //   { price: 195, type: "buy" as const, color: "#4CAF50" },
  //   { price: 220, type: "buy" as const, color: "#4CAF50" },
  // ]

  const [selectedTrend, setSelectedTrend] = useState<string | null>(null)
  const [targetLevel, setTargetLevel] = useState("264.68")
  const [riskLimit, setRiskLimit] = useState("1000")
  const [riskRewardSlider, setRiskRewardSlider] = useState(50)

  const [strategiesDialogOpen, setStrategiesDialogOpen] = useState(false)
  const [selectedStrategy, setSelectedStrategy] = useState<string>("")

  // Данные стратегий для отображения
  const strategies = [
    {
      id: "long-call",
      name: "Длинный колл",
      description: "Покупка опциона колл. Прибыль при росте цены актива выше страйка.",
      probability: "Средняя",
      maxProfit: "Неограничена",
      maxLoss: "Премия",
    },
    {
      id: "bull-call-spread",
      name: "Спред, бычий колл",
      description: "Покупка колла с низким страйком и продажа колла с высоким страйком.",
      probability: "Высокая",
      maxProfit: "Ограничена",
      maxLoss: "Ограничен",
    },
    {
      id: "iron-condor",
      name: "Железный кондор",
      description: "Комбинация бычьего пут-спреда и медвежьего колл-спреда.",
      probability: "Очень высокая",
      maxProfit: "Ограничена",
      maxLoss: "Ограничен",
    },
  ]

  return (
    <Layout mainClassName="min-w-[1650px]">
      <div className="p-6">
        {/* Заголовок страницы */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <Calculator className="h-8 w-8 text-muted-foreground" />
            <h1 className="text-3xl font-bold text-foreground">Калькуляторы</h1>
          </div>
        </div>

        {/* Основная сетка: левая колонка (3/4) + правая колонка (1/4) */}
        <div className="flex gap-6 h-full">
          {/* Левая колонка (3/4) */}
          <div className="flex-[3] min-w-0 space-y-6">
            {/* Первая строка: Блок 1 (1/4) + Блок 2 (2/4) */}
            <div className="flex gap-6">
              {/* Блок 1 - Позиции базового актива */}
              <Card className="w-[404px]">
                <CardContent className="pt-4 space-y-4">
                  {/* Поиск тикера с автокомплитом */}
                  <div className="flex items-start gap-4">
                    {/* Поиск тикера - занимает всю доступную ширину */}
                    <div className="flex-1 min-w-0">
                      <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                        <PopoverTrigger asChild>
                          <div
                            className="relative cursor-pointer"
                            onClick={() => !selectedTicker && setSearchOpen(true)}
                          >
                            {!selectedTicker && (
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            )}
                            <Input
                              placeholder="Введите тикер"
                              value={selectedTicker || searchValue}
                              onChange={(e) => {
                                setSearchValue(e.target.value)
                                if (selectedTicker) {
                                  setSelectedTicker("")
                                }
                                if (!searchOpen) {
                                  setSearchOpen(true)
                                }
                              }}
                              onClick={() => setSearchOpen(true)}
                              className={`${!selectedTicker ? "pl-9" : ""} ${selectedTicker ? "font-bold" : ""} cursor-pointer`}
                              readOnly={!!selectedTicker}
                            />
                          </div>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[300px] p-0"
                          align="start"
                          onOpenAutoFocus={(e) => e.preventDefault()}
                        >
                          <Command>
                            <CommandList>
                              <CommandEmpty>Тикер не найден</CommandEmpty>
                              <CommandGroup>
                                {tickerSuggestions
                                  .filter(
                                    (ticker) =>
                                      ticker.name.toLowerCase().includes(searchValue.toLowerCase()) ||
                                      ticker.symbol.toLowerCase().includes(searchValue.toLowerCase()),
                                  )
                                  .map((ticker) => (
                                    <CommandItem
                                      key={ticker.symbol}
                                      onSelect={() => {
                                        setSelectedTicker(ticker.symbol)
                                        setSearchValue("")
                                        setSearchOpen(false)
                                      }}
                                    >
                                      <div className="flex flex-col">
                                        <span className="font-medium">{ticker.symbol}</span>
                                        {ticker.name !== ticker.symbol && (
                                          <span className="text-xs text-muted-foreground">{ticker.name}</span>
                                        )}
                                      </div>
                                    </CommandItem>
                                  ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Текущая цена - занимает только необходимое место */}
                    <div className="flex flex-col items-end flex-shrink-0">
                      <span className="text-2xl font-bold whitespace-nowrap">${currentPrice.toFixed(2)}</span>
                      <span className="text-sm text-green-600 font-medium whitespace-nowrap">
                        +{priceChange.value.toFixed(2)} {priceChange.percent.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  {/* Позиции базового актива */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">Позиции базового актива</h3>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 bg-transparent">
                            Добавить
                            <ChevronDown className="ml-1 h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => addPosition("LONG")}>
                            <span className="text-green-600 font-medium mr-2">LONG</span>
                            <span className="text-muted-foreground">100 {selectedTicker || "AAPL"}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => addOption("SHORT")}>
                            <span className="text-red-600 font-medium mr-2">SHORT</span>
                            <span className="text-muted-foreground">100 {selectedTicker || "AAPL"}</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Таблица позиций */}
                    <div className="space-y-2">
                      {positions.map((position) => (
                        <div
                          key={position.id}
                          className={`grid grid-cols-[30px_50px_48px_72px_95px_30px] items-center text-sm border rounded-md p-2 ${
                            !position.visible ? "[&>*]:text-[#AAAAAA]" : ""
                          }`}
                        >
                          <button
                            onClick={() => togglePositionVisibility(position.id)}
                            className="text-muted-foreground hover:text-foreground w-[30px] flex justify-center"
                          >
                            {position.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          </button>
                          <span
                            className={`font-medium text-left ml-2 ${position.type === "LONG" ? "text-green-600" : "text-red-600"}`}
                          >
                            {position.type}
                          </span>
                          <span className="text-muted-foreground text-right ml-2">
                            {position.quantity.toLocaleString()}
                          </span>
                          <div className="relative w-[72px] overflow-hidden text-left ml-2">
                            <span className="font-medium block">{position.ticker}</span>
                            <div className="absolute top-0 right-0 bottom-0 w-4 bg-gradient-to-l from-background to-transparent pointer-events-none" />
                          </div>
                          <span className="font-bold text-right ml-2">
                            $
                            {position.price.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                          <button
                            onClick={() => deletePosition(position.id)}
                            className="text-muted-foreground hover:text-destructive w-[30px] flex justify-center"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Блок 2 - Опционы */}
              <Card className="w-[720px]">
                <CardContent className="pt-4 space-y-4">
                  {/* Заголовок и кнопки управления */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">Опционы</h3>
                    <div className="flex items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 bg-transparent">
                            Добавить опцион
                            <ChevronDown className="ml-1 h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => addOption("Buy", "CALL")}>
                            <span className="text-green-600 font-medium mr-2">Buy</span>
                            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-medium">
                              CALL
                            </span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => addOption("Buy", "PUT")}>
                            <span className="text-green-600 font-medium mr-2">Buy</span>
                            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-medium">PUT</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => addOption("Sell", "CALL")}>
                            <span className="text-red-600 font-medium mr-2">Sell</span>
                            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-medium">
                              CALL
                            </span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => addOption("Sell", "PUT")}>
                            <span className="text-red-600 font-medium mr-2">Sell</span>
                            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-medium">PUT</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 bg-transparent">
                            Выбрать стратегию
                            <ChevronDown className="ml-1 h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56 max-h-[300px] overflow-y-auto">
                          <DropdownMenuItem onClick={() => selectStrategy("short-call")}>
                            Короткий колл
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("long-put")}>Длинный пут</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("short-put")}>Короткий пут</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("long-call")}>Длинный колл</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("bull-call-spread")}>
                            Спред, бычий колл
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("bear-call-spread")}>
                            Спред, медвежий колл
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("bear-put-spread")}>
                            Спред, медвежий пут
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("bull-put-spread")}>
                            Спред, бычий пут
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("iron-condor")}>
                            Железный кондор
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("iron-butterfly")}>
                            Железная бабочка
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("straddle")}>Стрэддл</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("strangle")}>Стрэнгл</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("butterfly-spread")}>
                            Спред бабочка
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("calendar-spread")}>
                            Календарный спред
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("diagonal-spread")}>
                            Диагональный спред
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("ratio-spread")}>
                            Рацио спред
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Button
                        size="sm"
                        className="h-8 bg-cyan-500 hover:bg-cyan-600 text-white"
                        onClick={() => setSaveDialogOpen(true)}
                      >
                        Сохранить
                      </Button>
                    </div>
                  </div>

                  {/* Таблица опционов */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-[30px_67px_66px_47px_45px_80px_70px_70px_56px_83px_30px] items-center text-xs font-medium text-muted-foreground px-2">
                      <div></div>
                      <div className="text-left ml-2">Тип</div>
                      <div className="text-right ml-2">Страйк</div>
                      <div className="text-right ml-2">Дата</div>
                      <div className="text-right ml-2">КК</div>
                      <div className="text-right ml-2">Премия</div>
                      <div className="text-right ml-2">Bid</div>
                      <div className="text-right ml-2">Ask</div>
                      <div className="text-right ml-2">Объем</div>
                      <div className="text-right ml-2">OI</div>
                      <div></div>
                    </div>

                    {/* Строки данных */}
                    {options.map((option) => (
                      <div
                        key={option.id}
                        className={`grid grid-cols-[30px_67px_66px_47px_45px_80px_70px_70px_56px_83px_30px] items-center text-sm border rounded-md p-2 ${
                          !option.visible ? "[&>*]:text-[#AAAAAA]" : ""
                        }`}
                      >
                        <button
                          onClick={() => toggleOptionVisibility(option.id)}
                          className="text-muted-foreground hover:text-foreground w-[30px] flex justify-center"
                        >
                          {option.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </button>

                        {/* Тип (Buy/Sell + CALL/PUT badge) */}
                        <div className="flex items-center gap-1 ml-2">
                          <span
                            className={`text-xs font-medium ${option.action === "Buy" ? "text-green-600" : "text-red-600"}`}
                          >
                            {option.action}
                          </span>
                          <span
                            className={`${
                              option.type === "CALL" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            } px-1.5 py-0.5 rounded text-xs font-medium`}
                          >
                            {option.type}
                          </span>
                        </div>

                        {/* Страйк */}
                        <span className="font-medium text-right ml-2">{option.strike.toLocaleString()}</span>

                        {/* Дата */}
                        <span className="text-muted-foreground text-xs text-right ml-2">{option.date}</span>

                        {/* Количество */}
                        <span className="text-muted-foreground text-right ml-2">{option.quantity}</span>

                        {/* Премия */}
                        <span className="font-bold text-right ml-2">${option.premium.toFixed(2)}</span>

                        {/* Bid */}
                        <span className="text-green-600 text-right ml-2">${option.bid.toFixed(2)}</span>

                        {/* Ask */}
                        <span className="text-red-600 text-right ml-2">${option.ask.toFixed(2)}</span>

                        {/* Объем */}
                        <span className="text-muted-foreground text-right ml-2">{option.volume.toLocaleString()}</span>

                        {/* OI */}
                        <span className="text-muted-foreground text-right ml-2">{option.oi.toLocaleString()}</span>

                        <button
                          onClick={() => deleteOption(option.id)}
                          className="text-muted-foreground hover:text-destructive w-[30px] flex justify-center"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Блок 3 - Календарь экспирации */}
            <Card className="w-full">
              <CardContent className="pt-2 pb-0 px-0 relative -mb-[10px]">
                <div className="absolute left-4 top-2 z-10 flex items-center gap-2">
                  <span className="text-cyan-500 font-medium text-sm">Экспирация</span>
                  <span className="bg-cyan-500 text-white px-2 py-0.5 rounded text-xs font-medium">20 дней</span>
                </div>

                <div
                  ref={scrollContainerRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseLeave}
                  className={`w-full overflow-x-auto hide-scrollbar ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  <div className="inline-flex gap-[5px] py-2">
                    {Object.entries(expirationDatesMap).map(([monthKey, dates], index) => (
                      <div key={monthKey} className="flex items-center gap-[5px]">
                        <div className="flex flex-col items-center flex-shrink-0">
                          {/* Название месяца */}
                          <div className="text-sm text-muted-foreground mb-3 font-medium whitespace-nowrap">
                            {monthKey}
                          </div>

                          {/* Даты месяца */}
                          <div className="flex gap-[5px]">
                            {dates.map((date) => (
                              <button
                                key={date.date}
                                onClick={() => setSelectedExpirationDate(date.date)}
                                className={`w-[30px] h-[30px] rounded-lg flex items-center justify-center text-sm font-medium transition-all hover:scale-105 flex-shrink-0 cursor-pointer ${
                                  selectedExpirationDate === date.date
                                    ? "bg-[#00BCD4] text-white"
                                    : "bg-[#E9E9E9] text-foreground hover:bg-[#B6FBFF]"
                                }`}
                              >
                                {date.displayDate}
                              </button>
                            ))}
                          </div>
                        </div>

                        {index < Object.entries(expirationDatesMap).length - 1 && (
                          <div className="w-px h-16 bg-gray-300 flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Блок 4 - Шкала страйков (ЗАМЕНЕН) */}
            <Card className="w-full pb-0 border-0 shadow-none select-none">
              <CardContent className="px-0 relative pb-0">
                <div
                  ref={priceScaleRef}
                  onMouseDown={handlePriceScaleMouseDown}
                  onMouseMove={handlePriceScaleMouseMove}
                  onMouseUp={handlePriceScaleMouseUp}
                  onMouseLeave={handlePriceScaleMouseLeave}
                  className={`w-full overflow-x-auto hide-scrollbar ${isPriceScaleDragging ? "cursor-grabbing" : "cursor-grab"}`}
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  <div className="relative pt-12 pb-12 my-[-18px]">
                    {/* Верхние флажки */}
                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-50">
                      {flags.map((flag) => {
                        const index = flag.price - 5100
                        const leftPosition = index * 6 + 1.5
                        const yLevel = flagYLevels[flag.id] || 0
                        const topPosition = 48 + 8 - yLevel * 38

                        return (
                          <div
                            key={flag.id}
                            className={`absolute pointer-events-auto select-none ${flag.type === "ticker" ? "cursor-default" : "cursor-pointer"}`}
                            style={{
                              left: `${leftPosition}px`,
                              top: `${topPosition}px`,
                              transform: "translateX(-50%)",
                            }}
                            onMouseDown={(e) => handleFlagMouseDown(e, flag)}
                          >
                            <div
                              className="relative rounded-md px-2 py-1 flex items-center gap-1 shadow-md"
                              style={{ backgroundColor: flag.color }}
                            >
                              <span className="text-white font-bold text-sm whitespace-nowrap">
                                {flag.label || flag.price}
                              </span>

                              {flag.count && (
                                <div className="absolute -right-[13px] top-1/2 -translate-y-1/2 bg-black rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                                  <span className="text-white text-xs font-bold">{flag.count}</span>
                                </div>
                              )}

                              <div
                                className="absolute left-1/2 -translate-x-1/2"
                                style={{
                                  bottom: "-6px",
                                  width: 0,
                                  height: 0,
                                  borderLeft: "6px solid transparent",
                                  borderRight: "6px solid transparent",
                                  borderTop: `6px solid ${flag.color}`,
                                }}
                              />
                            </div>

                            {flag.date && flag.dateColor && (
                              <div
                                className="absolute left-1/2 -translate-x-1/2 rounded shadow-sm"
                                style={{
                                  backgroundColor: flag.dateColor,
                                  bottom: "calc(100% - 5px)",
                                  padding: "1px 3px",
                                  left: "calc(50% + 10px)",
                                }}
                              >
                                <span
                                  className="text-white font-medium text-[10px] whitespace-nowrap leading-none"
                                  style={{ margin: "2px", display: "block" }}
                                >
                                  {flag.date}
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Нижние флажки */}
                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-50">
                      {bottomFlags.map((flag) => {
                        const index = flag.price - 5100
                        const leftPosition = index * 6 + 1.5
                        const yLevel = bottomFlagYLevels[flag.id] || 0
                        const topPosition = 134 + yLevel * 38

                        return (
                          <div
                            key={flag.id}
                            className="absolute pointer-events-auto select-none cursor-pointer"
                            style={{
                              left: `${leftPosition}px`,
                              top: `${topPosition}px`,
                              transform: "translateX(-50%)",
                            }}
                            onMouseDown={(e) => handleFlagMouseDown(e, flag)}
                          >
                            {flag.date && (
                              <div
                                className="absolute left-1/2 -translate-x-1/2 rounded shadow-sm"
                                style={{
                                  backgroundColor: "#0891b2",
                                  top: "calc(100% - 5px)",
                                  padding: "1px 3px",
                                  left: "calc(50% + 10px)",
                                  zIndex: 100,
                                }}
                              >
                                <span
                                  className="text-white font-medium text-[10px] whitespace-nowrap leading-none"
                                  style={{ margin: "2px", display: "block" }}
                                >
                                  {flag.date}
                                </span>
                              </div>
                            )}

                            <div
                              className="relative rounded-md px-2 py-1 flex items-center gap-1 shadow-md pt-1"
                              style={{ backgroundColor: flag.color }}
                            >
                              <span className="text-white font-bold text-sm whitespace-nowrap">{flag.price}</span>

                              {flag.count && (
                                <div className="absolute -right-[13px] top-1/2 -translate-y-1/2 bg-black rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                                  <span className="text-white text-xs font-bold">{flag.count}</span>
                                </div>
                              )}

                              <div
                                className="absolute left-1/2 -translate-x-1/2"
                                style={{
                                  top: "-6px",
                                  width: 0,
                                  height: 0,
                                  borderLeft: "6px solid transparent",
                                  borderRight: "6px solid transparent",
                                  borderBottom: `6px solid ${flag.color}`,
                                }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="flex flex-col gap-0">
                      {/* Верхняя шкала (зелёные полосы) */}
                      <div className="inline-flex gap-[3px] py-2 pb-0">
                        {Array.from({ length: 211 }, (_, i) => i + 5100).map((price, index) => {
                          const isTenth = price % 10 === 0
                          const isFifth = price % 5 === 0
                          const isBlack = isFifth
                          const height = isTenth ? "h-[10px]" : "h-[5px]"
                          const color = isBlack ? "bg-black" : "bg-gray-400"
                          const greenBarHeight = greenBarHeights[index]

                          return (
                            <div key={price} className="flex flex-col items-center h-[43px] justify-end">
                              <div
                                className="w-[3px] bg-[#B2FFAE] mb-[3px]"
                                style={{ height: `${greenBarHeight}px` }}
                              />
                              <div className="h-[10px] flex items-start">
                                <div className={`w-px ${height} ${color}`} />
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Метки цен */}
                      <div className="relative inline-flex gap-[3px] h-[20px]">
                        {Array.from({ length: 211 }, (_, i) => i + 5100).map((price, index) => {
                          const isTenth = price % 10 === 0
                          const leftPosition = index * 6 + 1.5

                          return (
                            <div key={`label-${price}`} className="w-[3px] h-full">
                              {isTenth && (
                                <span
                                  className="absolute text-xs font-medium text-foreground whitespace-nowrap"
                                  style={{
                                    left: `${leftPosition}px`,
                                    top: "50%",
                                    transform: "translate(-50%, -50%)",
                                  }}
                                >
                                  {price}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {/* Нижняя шкала (красные полосы) */}
                      <div className="inline-flex gap-[3px] py-2 pt-0 pb-2">
                        {Array.from({ length: 211 }, (_, i) => i + 5100).map((price, index) => {
                          const isTenth = price % 10 === 0
                          const isFifth = price % 5 === 0
                          const isBlack = isFifth
                          const height = isTenth ? "h-[10px]" : "h-[5px]"
                          const color = isBlack ? "bg-black" : "bg-gray-400"
                          const redBarHeight = redBarHeights[index]

                          return (
                            <div key={`red-${price}`} className="flex flex-col items-center h-[43px] justify-start">
                              <div className="h-[10px] flex items-end">
                                <div className={`w-px ${height} ${color}`} />
                              </div>
                              <div className="w-[3px] bg-[#FFBCBC] mt-[3px]" style={{ height: `${redBarHeight}px` }} />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                {/* Градиентные плашки по бокам */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-[40px] pointer-events-none z-40"
                  style={{
                    background: "linear-gradient(to right, white, transparent)",
                  }}
                />
                <div
                  className="absolute right-0 top-0 bottom-0 w-[40px] pointer-events-none z-40"
                  style={{
                    background: "linear-gradient(to left, white, transparent)",
                  }}
                />
              </CardContent>
            </Card>

            {/* Блок 5 - Метрики опционов */}
            <Card className="w-full">
              <CardContent className="pt-4 pb-0 px-6">
                <div className="flex items-start justify-between gap-6">
                  {/* MAX убыток */}
                  <div className="flex flex-col items-start">
                    <div className="text-xs text-muted-foreground mb-1">MAX убыток</div>
                    <div className="text-xl font-bold text-red-600">$-245.27</div>
                  </div>

                  {/* MAX прибыль */}
                  <div className="flex flex-col items-start">
                    <div className="text-xs text-muted-foreground mb-1">MAX прибыль</div>
                    <div className="text-xl font-bold text-green-600">∞</div>
                  </div>

                  {/* Точка безубытка */}
                  <div className="flex flex-col items-start">
                    <div className="text-xs text-muted-foreground mb-1">Точка безубытка</div>
                    <div className="text-xl font-bold text-amber-600">$255.90</div>
                  </div>

                  {/* Всего премии */}
                  <div className="flex flex-col items-start">
                    <div className="text-xs text-muted-foreground mb-1">Всего премии</div>
                    <div className="text-xl font-bold text-foreground">$29.30</div>
                  </div>

                  {/* Риск/Прибыль */}
                  <div className="flex flex-col items-start">
                    <div className="text-xs text-muted-foreground mb-1">Риск/Прибыль</div>
                    <div className="text-xl font-bold text-cyan-500">1:5.82</div>
                  </div>

                  {/* Маржин */}
                  <div className="flex flex-col items-start">
                    <div className="text-xs text-muted-foreground mb-1">Маржин</div>
                    <div className="text-xl font-bold text-foreground">$2,000.00</div>
                  </div>

                  {/* Дельта */}
                  <div className="flex flex-col items-start">
                    <div className="text-xs text-muted-foreground mb-1">Дельта</div>
                    <div className="text-xl font-bold text-red-600">Δ 43.3</div>
                  </div>

                  {/* Гамма */}
                  <div className="flex flex-col items-start">
                    <div className="text-xs text-muted-foreground mb-1">Гамма</div>
                    <div className="text-xl font-bold text-purple-600">Γ 2.04</div>
                  </div>

                  {/* Тета */}
                  <div className="flex flex-col items-start">
                    <div className="text-xs text-muted-foreground mb-1">Тета</div>
                    <div className="text-xl font-bold text-cyan-500">Θ -19.04</div>
                  </div>

                  {/* Вега */}
                  <div className="flex flex-col items-start">
                    <div className="text-xs text-muted-foreground mb-1">Вега</div>
                    <div className="text-xl font-bold text-green-600">ν 23.1</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Блок 6 - График прибыли/убытка с табами */}
            <Tabs defaultValue="chart" className="w-full">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="chart">График</TabsTrigger>
                <TabsTrigger value="board">Доска</TabsTrigger>
              </TabsList>

              <TabsContent value="chart">
                <Card className="w-full">
                  <CardContent className="pt-4 pb-4 px-6">
                    <div className="w-full rounded-lg flex items-center justify-center h-[600px] bg-white">
                      <p className="text-lg text-muted-foreground">Здесь будет График</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="board">
                <Card className="w-full">
                  <CardContent className="pt-4 pb-4 px-6">
                    <div className="w-full rounded-lg flex items-center justify-center h-[600px] bg-white">
                      <p className="text-lg text-muted-foreground">Здесь будет доска Опционов</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Правая колонка (1/4) */}
          <div className="flex-1 space-y-6">
            {/* Блок 7 - TradingView виджет */}
            <Card className="overflow-hidden h-[330px] p-0">
              <CardContent className="p-0 h-full">
                <TradingViewWidget />
              </CardContent>
            </Card>

            {/* Блок 8 - Калькулятор риска */}
            <Card className="p-0">
              <CardContent className="p-4 flex flex-col">
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setSelectedTrend(selectedTrend === "down-left" ? null : "down-left")}
                    className="flex-1 aspect-square rounded-lg transition-all hover:scale-[1.06] overflow-hidden border-0"
                  >
                    <img
                      src={
                        selectedTrend === "down-left"
                          ? "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Group%2020-zCFEEAvnWLWJDYdBurwc8ETRwJ4iau.png"
                          : "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Group%2021-cUgIV99i0laBNsmQu7x5bz35OKK42A.png"
                      }
                      alt="Медвежий тренд вниз-влево"
                      className="w-full h-full object-cover"
                    />
                  </button>

                  <button
                    onClick={() => setSelectedTrend(selectedTrend === "down-wave" ? null : "down-wave")}
                    className="flex-1 aspect-square rounded-lg transition-all hover:scale-[1.06] overflow-hidden border-0"
                  >
                    <img
                      src={
                        selectedTrend === "down-wave"
                          ? "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Group%2019-jou5DDktgS5YRwTC2MfgEOEJHQQZv8.png"
                          : "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Group%2022-GXmjYoFAxrstBSdakPFwwMbCY1iwlN.png"
                      }
                      alt="Медвежий тренд волнистый"
                      className="w-full h-full object-cover"
                    />
                  </button>

                  <button
                    onClick={() => setSelectedTrend(selectedTrend === "neutral" ? null : "neutral")}
                    className="flex-1 aspect-square rounded-lg transition-all hover:scale-[1.06] overflow-hidden border-0"
                  >
                    <img
                      src={
                        selectedTrend === "neutral"
                          ? "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Group%2018-elWOOoukXYUCq2gw8ej48HYTzimuqi.png"
                          : "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Group%2024-LsCwpMEasFQRP6ToLf1eSgmwE855CX.png"
                      }
                      alt="Нейтральный тренд"
                      className="w-full h-full object-cover"
                    />
                  </button>
                  <button
                    onClick={() => setSelectedTrend(selectedTrend === "range" ? null : "range")}
                    className="flex-1 aspect-square rounded-lg transition-all hover:scale-[1.06] overflow-hidden border-0"
                  >
                    <img
                      src={selectedTrend === "range" ? "/images/range-selected.png" : "/images/range-unselected.png"}
                      alt="Диапазон"
                      className="w-full h-full object-cover"
                    />
                  </button>

                  <button
                    onClick={() => setSelectedTrend(selectedTrend === "up-wave" ? null : "up-wave")}
                    className="flex-1 aspect-square rounded-lg transition-all hover:scale-[1.06] overflow-hidden border-0"
                  >
                    <img
                      src={
                        selectedTrend === "up-wave" ? "/images/up-wave-selected.png" : "/images/up-wave-unselected.png"
                      }
                      alt="Бычий тренд волнистый"
                      className="w-full h-full object-cover"
                    />
                  </button>

                  <button
                    onClick={() => setSelectedTrend(selectedTrend === "up-right" ? null : "up-right")}
                    className="flex-1 aspect-square rounded-lg transition-all hover:scale-[1.06] overflow-hidden border-0"
                  >
                    <img
                      src={
                        selectedTrend === "up-right"
                          ? "/images/up-right-selected.png"
                          : "/images/up-right-unselected.png"
                      }
                      alt="Бычий тренд вверх-вправо"
                      className="w-full h-full object-cover"
                    />
                  </button>
                </div>

                <div className="flex gap-4 mb-3 items-end">
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground mb-1">
                      Целевой уровень <span className="text-green-600">+7.9%</span>
                    </div>
                    <Input
                      value={`$${targetLevel}`}
                      onChange={(e) => setTargetLevel(e.target.value.replace("$", ""))}
                      className="text-2xl font-bold h-12 text-center"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground mb-1">Ограничить риск</div>
                    <Input
                      value={`$${riskLimit}`}
                      onChange={(e) => setRiskLimit(e.target.value.replace("$", ""))}
                      className="text-2xl font-bold h-12 text-center text-muted-foreground"
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <Slider
                    value={[riskRewardSlider]}
                    onValueChange={(value) => setRiskRewardSlider(value[0])}
                    min={0}
                    max={100}
                    step={1}
                    className="[&_[role=slider]]:bg-cyan-500 [&_[role=slider]]:border-cyan-500"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>← выше вероятность</span>
                    <span>ниже вероятность →</span>
                  </div>
                </div>

                <Button
                  className="w-full bg-cyan-500 hover:bg-cyan-600 text-white h-10 font-medium mt-1.5"
                  onClick={() => setStrategiesDialogOpen(true)}
                >
                  Показать подходящие стратегии
                </Button>
              </CardContent>
            </Card>

            {/* Блок 9 - Настройки */}
            <Card className="p-6">
              <h3 className="text-base font-semibold mb-0">Настройки калькулятора </h3>

              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Дата: {expirationDates[0].displayDate}</span>
                    <span className="text-muted-foreground">{daysRemaining} д. осталось</span>
                  </div>
                  <Slider
                    value={[daysRemaining]}
                    onValueChange={(value) => setDaysRemaining(value[0])}
                    min={0}
                    max={30}
                    step={1}
                    className="[&_[role=slider]]:bg-cyan-500 [&_[role=slider]]:border-cyan-500"
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">
                    Предполагаемая волатильность: {volatility.toFixed(1)} %
                  </div>
                  <Slider
                    value={[volatility]}
                    onValueChange={(value) => setVolatility(value[0])}
                    min={0}
                    max={100}
                    step={0.1}
                    className="[&_[role=slider]]:bg-cyan-500 [&_[role=slider]]:border-cyan-500"
                  />
                </div>

                <div className="space-y-3">
                  <div className="text-sm font-medium">Отображать график как</div>
                  <RadioGroup value={chartDisplayMode} onValueChange={setChartDisplayMode}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="profit-loss-dollar"
                        id="profit-loss-dollar"
                        className="border-cyan-500 text-cyan-500"
                      />
                      <Label htmlFor="profit-loss-dollar" className="text-sm font-normal cursor-pointer">
                        Прибыль/убыток в $
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="profit-loss-percent"
                        id="profit-loss-percent"
                        className="border-cyan-500 text-cyan-500"
                      />
                      <Label htmlFor="profit-loss-percent" className="text-sm font-normal cursor-pointer">
                        Прибыль/убыток в %
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="contract-cost"
                        id="contract-cost"
                        className="border-cyan-500 text-cyan-500"
                      />
                      <Label htmlFor="contract-cost" className="text-sm font-normal cursor-pointer">
                        Стоимость контракта
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="max-risk-percent"
                        id="max-risk-percent"
                        className="border-cyan-500 text-cyan-500"
                      />
                      <Label htmlFor="max-risk-percent" className="text-sm font-normal cursor-pointer">
                        % от максимального риска
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Сохранение стратегии</DialogTitle>
              <DialogDescription>Введите оригинальное название и краткий комментарий</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="strategy-name">
                  Название <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="strategy-name"
                  placeholder="Введите название стратегии"
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="strategy-comment">
                  Комментарий <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="strategy-comment"
                  placeholder="Введите краткий комментарий"
                  value={strategyComment}
                  onChange={(e) => setStrategyComment(e.target.value)}
                  rows={4}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                Отмена
              </Button>
              <Button
                onClick={handleSaveStrategy}
                disabled={!strategyName.trim() || !strategyComment.trim()}
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                Сохранить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={strategiesDialogOpen} onOpenChange={setStrategiesDialogOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Подходящие стратегии</DialogTitle>
              <DialogDescription>Выберите стратегию на основе вашего прогноза и уровня риска</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <RadioGroup value={selectedStrategy} onValueChange={setSelectedStrategy}>
                <div className="space-y-3">
                  {strategies.map((strategy) => (
                    <label
                      key={strategy.id}
                      htmlFor={strategy.id}
                      className="flex w-full cursor-pointer rounded-md border p-4 transition-all hover:bg-accent has-[:checked]:border-cyan-500 has-[:checked]:bg-cyan-50 dark:has-[:checked]:bg-cyan-950"
                    >
                      <div className="flex w-full items-start gap-3">
                        <RadioGroupItem value={strategy.id} id={strategy.id} className="mt-1" />
                        <div className="flex-1">
                          <div className="font-semibold text-base mb-1">{strategy.name}</div>
                          <div className="text-sm text-muted-foreground mb-2">{strategy.description}</div>
                          <div className="flex gap-4 text-xs">
                            <div>
                              <span className="text-muted-foreground">Вероятность: </span>
                              <span className="font-medium">{strategy.probability}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">MAX прибыль: </span>
                              <span className="font-medium text-green-600">{strategy.maxProfit}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">MAX убыток: </span>
                              <span className="font-medium text-red-600">{strategy.maxLoss}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </RadioGroup>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStrategiesDialogOpen(false)}>
                Отмена
              </Button>
              <Button
                onClick={() => {
                  if (selectedStrategy) {
                    selectStrategy(selectedStrategy)
                    setStrategiesDialogOpen(false)
                  }
                }}
                disabled={!selectedStrategy}
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                Применить стратегию
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  )
}
