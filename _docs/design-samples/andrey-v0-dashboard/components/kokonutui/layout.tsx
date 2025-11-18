"use client"

import type { ReactNode } from "react"
import Sidebar from "./sidebar"
import TopNav from "./top-nav"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

interface LayoutProps {
  children: ReactNode
  mainClassName?: string // добавил prop для дополнительных классов main
}

export default function Layout({ children, mainClassName }: LayoutProps) {
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <div className={`flex h-screen ${theme === "dark" ? "dark" : ""}`}>
      <Sidebar isCollapsed={isSidebarCollapsed} onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)} />
      <div className="w-full flex flex-1 flex-col">
        <header className="h-16 border-b border-border">
          <TopNav />
        </header>
        <main className={`flex-1 overflow-auto p-6 bg-background ${mainClassName || ""}`}>{children}</main>
      </div>
    </div>
  )
}
