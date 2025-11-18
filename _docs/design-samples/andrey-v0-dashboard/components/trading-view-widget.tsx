"use client"

// TradingViewWidget.jsx
import { useEffect, useRef, memo } from "react"

function TradingViewWidget() {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const script = document.createElement("script")
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js"
    script.type = "text/javascript"
    script.async = true
    script.innerHTML = `
        {
          "symbol": "NASDAQ:AAPL",
          "chartOnly": false,
          "dateRange": "12M",
          "noTimeScale": false,
          "colorTheme": "light",
          "isTransparent": false,
          "locale": "ru",
          "width": "100%",
          "autosize": true,
          "height": "100%"
        }`
    if (container.current) {
      container.current.appendChild(script)
    }
  }, [])

  return (
    <div className="tradingview-widget-container h-full w-full" ref={container}>
      <div className="tradingview-widget-container__widget h-full"></div>
      <div className="tradingview-widget-copyright">
        <a href="https://ru.tradingview.com/symbols/NASDAQ-AAPL/" rel="noreferrer noopener nofollow" target="_blank">
          <span className="blue-text">Track all markets on TradingView</span>
        </a>
      </div>
    </div>
  )
}

export default memo(TradingViewWidget)
