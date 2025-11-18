"use client"

import type React from "react"

import Layout from "@/components/kokonutui/layout"
import { Calculator } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { useState, useRef } from "react"

interface Flag {
  id: string
  price: number
  type: "sell" | "buy" | "ticker"
  color: string
  count?: number // Добавлено опциональное поле для отображения количества
  label?: string // Добавлено опциональное поле для отображения произвольного текста вместо цены
}

export default function StrikeScalePage() {
  const priceScaleRef = useRef<HTMLDivElement>(null)
  const [isPriceScaleDragging, setIsPriceScaleDragging] = useState(false)
  const [priceScaleStartX, setPriceScaleStartX] = useState(0)
  const [priceScaleScrollLeft, setPriceScaleScrollLeft] = useState(0)

  const [draggingFlagId, setDraggingFlagId] = useState<string | null>(null)
  const [dragStartX, setDragStartX] = useState(0)
  const [dragStartPrice, setDragStartPrice] = useState(0)

  const [flags, setFlags] = useState<Flag[]>([
    { id: "flag-1", price: 5150, type: "sell", color: "#FF6B6B", count: 2 },
    { id: "flag-2", price: 5170, type: "sell", color: "#FF6B6B" },
    { id: "flag-ticker", price: 5183, type: "ticker", color: "#4B5563", label: "SPX" },
    { id: "flag-3", price: 5195, type: "buy", color: "#4CAF50" },
    { id: "flag-4", price: 5220, type: "buy", color: "#4CAF50", count: 5 },
  ])

  const [bottomFlags, setBottomFlags] = useState<Flag[]>([
    { id: "bottom-flag-1", price: 5160, type: "buy", color: "#4CAF50", count: 3 },
    { id: "bottom-flag-2", price: 5175, type: "buy", color: "#4CAF50" },
    { id: "bottom-flag-3", price: 5200, type: "sell", color: "#FF6B6B" },
    { id: "bottom-flag-4", price: 5230, type: "sell", color: "#FF6B6B", count: 4 },
  ])

  const handleFlagMouseDown = (e: React.MouseEvent, flag: Flag, isBottom = false) => {
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

  const [greenBarHeights] = useState(() => Array.from({ length: 211 }, () => Math.floor(Math.random() * 31)))

  const [redBarHeights] = useState(() => Array.from({ length: 211 }, () => Math.floor(Math.random() * 31)))

  const [daysRemaining, setDaysRemaining] = useState(10)
  const [volatility, setVolatility] = useState(41.8)
  const [chartDisplayMode, setChartDisplayMode] = useState("profit-loss-dollar")

  const expirationDates = [{ date: "15-10", month: "Oct", displayDate: "15" }]

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

  return (
    <Layout mainClassName="min-w-[1650px]">
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <Calculator className="h-8 w-8 text-muted-foreground" />
            <h1 className="text-3xl font-bold text-foreground">Шкала страйков</h1>
          </div>
        </div>

        <div className="flex gap-6 h-full">
          <div className="flex-[3] min-w-0 space-y-6">
            <Card className="w-full rounded-none border-0 border-l border-r" style={{ borderColor: "white" }}>
              <CardContent className="pb-0 px-0 relative">
                <div
                  ref={priceScaleRef}
                  onMouseDown={handlePriceScaleMouseDown}
                  onMouseMove={handlePriceScaleMouseMove}
                  onMouseUp={handlePriceScaleMouseUp}
                  onMouseLeave={handlePriceScaleMouseLeave}
                  className={`w-full overflow-x-auto hide-scrollbar ${isPriceScaleDragging ? "cursor-grabbing" : "cursor-grab"}`}
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  <div className="relative pt-12 pb-12">
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
                            onMouseDown={(e) => handleFlagMouseDown(e, flag, false)}
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
                          </div>
                        )
                      })}
                    </div>

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
                            onMouseDown={(e) => handleFlagMouseDown(e, flag, true)}
                          >
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
          </div>

          <div className="flex-1 space-y-6">
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
      </div>
    </Layout>
  )
}
