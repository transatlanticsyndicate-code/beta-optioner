// TradingViewWidget.jsx
import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

/**
 * TradingViewWidget - График актива с использованием TradingView iframe
 * 
 * @param {string} ticker - Тикер актива (например, "AAPL")
 * @param {boolean} isVisible - Видим ли виджет в данный момент
 */
function TradingViewWidget({ ticker, isVisible = true }) {
  const container = useRef(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!ticker || !container.current || !isVisible) {
      return
    }

    setIsLoading(true)
    
    // Очищаем контейнер перед добавлением нового виджета
    container.current.innerHTML = ''

    try {
      const script = document.createElement("script")
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js"
      script.type = "text/javascript"
      script.async = true
      script.innerHTML = JSON.stringify({
        symbol: ticker,
        chartOnly: false,
        dateRange: "3M",
        noTimeScale: false,
        colorTheme: "light",
        isTransparent: false,
        locale: "ru",
        width: "100%",
        autosize: true,
        height: "100%"
      })
      
      // Обработчик загрузки виджета
      script.onload = () => {
        // Даем виджету время на инициализацию
        setTimeout(() => {
          setIsLoading(false)
        }, 1000)
      }

      script.onerror = () => {
        console.error('Failed to load TradingView widget')
        setIsLoading(false)
      }
      
      if (container.current) {
        container.current.appendChild(script)
      }
    } catch (error) {
      console.error('Error loading TradingView widget:', error)
      setIsLoading(false)
    }

    return () => {
      // Cleanup при размонтировании
      if (container.current) {
        container.current.innerHTML = ''
      }
    }
  }, [ticker, isVisible])

  if (!ticker) {
    return (
      <div className="flex items-center justify-center h-[400px] bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-gray-500 text-sm">Выберите тикер для отображения графика</p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-[400px]">
      {/* Блюр при загрузке */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            <p className="text-sm text-gray-600">Загрузка графика {ticker}...</p>
          </div>
        </div>
      )}

      {/* TradingView виджет */}
      <div className="tradingview-widget-container h-full w-full" ref={container}>
        <div className="tradingview-widget-container__widget h-full"></div>
      </div>
    </div>
  )
}

export default TradingViewWidget
