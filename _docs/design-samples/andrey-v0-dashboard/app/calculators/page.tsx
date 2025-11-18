"use client"

import Layout from "@/components/kokonutui/layout"
import { Calculator, Search, Eye, EyeOff, ChevronDown, Trash2, Copy } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useState } from "react"

// Данные для автокомплита тикеров
const tickerSuggestions = [
  { symbol: "AAPL", name: "AAPL" },
  { symbol: "AAPBGraniteShares", name: "AAPBGraniteShares 2x Long AAPL Daily ETF" },
  { symbol: "AAPDDirexion", name: "AAPDDirexion Daily AAPL Bear 1X Shares" },
  { symbol: "AAPUDirexion", name: "AAPUDirexion Daily AAPL Bull 2X Shares" },
  { symbol: "AAPWRoundhill", name: "AAPWRoundhill ETF Trust Roundhill AAPL WeeklyPay ETF" },
  { symbol: "APLYTidal", name: "APLYTidal ETF Trust II YieldMax AAPL Option" },
]

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

export default function CalculatorsPage() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")
  const [selectedTicker, setSelectedTicker] = useState("")
  const [currentPrice, setCurrentPrice] = useState(245.27)
  const [priceChange, setPriceChange] = useState({ value: 2.34, percent: 1.33 })

  // Позиции базового актива
  const [positions, setPositions] = useState<Position[]>([
    { id: "1", type: "LONG", quantity: 1000, ticker: "AAPL", price: 33450.0, visible: true },
    { id: "2", type: "LONG", quantity: 1000, ticker: "AAPL", price: 33450.0, visible: true },
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
      bid: 5.8,
      ask: 6.0,
      volume: 2164,
      oi: 34514,
      visible: true,
    },
    {
      id: "2",
      action: "Buy",
      type: "PUT",
      strike: 220,
      date: "31.10.25",
      quantity: 1,
      premium: 4.7,
      bid: 5.8,
      ask: 6.0,
      volume: 2164,
      oi: 34514,
      visible: true,
    },
    {
      id: "3",
      action: "Sell",
      type: "CALL",
      strike: 262,
      date: "31.10.25",
      quantity: -1,
      premium: 6.1,
      bid: 5.8,
      ask: 6.0,
      volume: 2164,
      oi: 34514,
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
    // Здесь будет логика применения стратегии
  }

  return (
    <Layout>
      <div className="p-6 min-w-[1920px]">
        {/* Заголовок страницы */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Calculator className="h-8 w-8 text-muted-foreground" />
            <h1 className="text-3xl font-bold text-foreground">Калькуляторы</h1>
          </div>
        </div>

        <div className="flex gap-4">
          {/* Левая колонка (примерно 3/4 от 1600px = 1200px) */}
          <div className="w-[1200px] space-y-4">
            {/* Верхний ряд: Блок 1 (400px) + Блок 2 (784px) */}
            <div className="flex gap-4">
              {/* Блок 1 - Позиции базового актива (1/3 от 1200px = 400px) */}
              <Card className="w-[400px]">
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
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => addPosition("LONG")}>
                            <span className="text-green-600 font-medium mr-2">LONG</span>
                            <span className="text-muted-foreground">100 {selectedTicker || "AAPL"}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => addPosition("SHORT")}>
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
                          className={`grid grid-cols-[30px_50px_60px_90px_100px_30px] items-center gap-2 text-sm border rounded-md p-2 ${
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
                            className={`font-medium text-left ${position.type === "LONG" ? "text-green-600" : "text-red-600"}`}
                          >
                            {position.type}
                          </span>
                          <span className="text-muted-foreground text-right">{position.quantity.toLocaleString()}</span>
                          <div className="relative w-[90px] overflow-hidden text-left">
                            <span className="font-medium block">{position.ticker}</span>
                            <div className="absolute top-0 right-0 bottom-0 w-4 bg-gradient-to-l from-background to-transparent pointer-events-none" />
                          </div>
                          <span className="font-bold text-right">
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

              {/* Блок 2 - Опционы (2/3 от 1200px = 784px с учетом gap) */}
              <Card className="flex-1">
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
                        <DropdownMenuContent align="end">
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
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem onClick={() => selectStrategy("short-call")}>
                            Короткий колл
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("long-put")}>Длинный пут</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("short-put")}>Короткий пут</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("bull-call-spread")}>
                            Спред, бычий колл
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("bear-call-spread")}>
                            Спред, медвежий колл
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => selectStrategy("bear-put-spread")}>
                            Спред, медвежий пут
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Button size="sm" className="h-8 bg-cyan-500 hover:bg-cyan-600 text-white">
                        Сохранить
                      </Button>
                    </div>
                  </div>

                  {/* Таблица опционов */}
                  <div className="space-y-2">
                    {/* Заголовки колонок */}
                    <div className="grid grid-cols-[30px_70px_70px_80px_60px_60px_60px_60px_60px_60px_30px] items-center gap-2 text-xs font-medium text-muted-foreground px-2">
                      <div></div>
                      <div className="text-left">Страйк</div>
                      <div className="text-left">Дата</div>
                      <div className="text-left">Кол-во</div>
                      <div className="text-left">Премия</div>
                      <div className="text-left">Bid</div>
                      <div className="text-left">Ask</div>
                      <div className="text-left">Объем</div>
                      <div className="text-left">OI</div>
                      <div></div>
                      <div></div>
                    </div>

                    {/* Строки данных */}
                    {options.map((option) => (
                      <div
                        key={option.id}
                        className={`grid grid-cols-[30px_70px_70px_80px_60px_60px_60px_60px_60px_60px_30px] items-center gap-2 text-sm border rounded-md p-2 ${
                          !option.visible ? "[&>*]:text-[#AAAAAA]" : ""
                        }`}
                      >
                        {/* Иконка видимости */}
                        <button
                          onClick={() => toggleOptionVisibility(option.id)}
                          className="text-muted-foreground hover:text-foreground w-[30px] flex justify-center"
                        >
                          {option.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </button>

                        {/* Страйк (Buy/Sell + CALL/PUT badge + число) */}
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
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
                          <span className="font-medium">{option.strike}</span>
                        </div>

                        {/* Дата */}
                        <span className="text-muted-foreground">{option.date}</span>

                        {/* Количество */}
                        <span className="text-muted-foreground">{option.quantity}</span>

                        {/* Премия */}
                        <span className="font-medium">${option.premium.toFixed(2)}</span>

                        {/* Bid */}
                        <span className="text-green-600">${option.bid.toFixed(2)}</span>

                        {/* Ask */}
                        <span className="text-red-600">${option.ask.toFixed(2)}</span>

                        {/* Объем */}
                        <span className="text-muted-foreground">{option.volume.toLocaleString()}</span>

                        {/* OI */}
                        <span className="text-muted-foreground">{option.oi.toLocaleString()}</span>

                        {/* Иконка копирования */}
                        <button className="text-muted-foreground hover:text-foreground w-[30px] flex justify-center">
                          <Copy className="h-4 w-4" />
                        </button>

                        {/* Кнопка удаления */}
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
            <Card>
              <CardContent className="pt-6">
                <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">
                  Блок 3 - Календарь экспирации (Oct, Nov, Dec, Jan, Feb, Mar, Jun, Sep)
                </div>
              </CardContent>
            </Card>

            {/* Блок 4 - Шкала цен */}
            <Card>
              <CardContent className="pt-6">
                <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">
                  Блок 4 - Placeholder for scale of price
                </div>
              </CardContent>
            </Card>

            {/* Блок 5 - Большой график P&L */}
            <Card>
              <CardContent className="pt-6">
                <div className="h-96 flex flex-col items-center justify-center text-muted-foreground text-sm space-y-2">
                  <div>Блок 5 - График P&L</div>
                  <div className="text-xs">Метрики: MAX убыток, MAX прибыль, Точка безубытка, и т.д.</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Правая колонка (примерно 1/4 от 1600px = 384px) */}
          <div className="w-[384px] space-y-4">
            {/* Блок 6 - TradingView виджет */}
            <Card>
              <CardContent className="pt-6">
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  Блок 6 - TradingView виджет
                </div>
              </CardContent>
            </Card>

            {/* Блок 7 - Калькулятор риска */}
            <Card>
              <CardContent className="pt-6">
                <div className="h-64 flex flex-col items-center justify-center text-muted-foreground text-sm space-y-2">
                  <div>Блок 7 - Калькулятор риска</div>
                  <div className="text-xs">Ползунки + кнопка</div>
                </div>
              </CardContent>
            </Card>

            {/* Блок 8 - Настройки */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Настройки</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 flex flex-col items-center justify-center text-muted-foreground text-sm space-y-2">
                  <div>Блок 8 - Настройки</div>
                  <div className="text-xs">Дата, волатильность, радио-кнопки</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  )
}
