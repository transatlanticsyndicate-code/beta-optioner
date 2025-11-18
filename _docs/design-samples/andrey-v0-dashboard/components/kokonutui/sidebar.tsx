"use client"

import type React from "react"

import {
  LayoutDashboard,
  Calculator,
  Archive,
  FileBarChart,
  Building2,
  FolderKanban,
  FileText,
  CreditCard,
  Users2,
  Shield,
  MessagesSquare,
  Video,
  Settings,
  HelpCircle,
  Menu,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

import Link from "next/link"
import { useState } from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"

interface SidebarProps {
  isCollapsed: boolean
  onToggleCollapse: () => void
}

export default function Sidebar({ isCollapsed, onToggleCollapse }: SidebarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isDevSectionCollapsed, setIsDevSectionCollapsed] = useState(true)
  const pathname = usePathname()

  function handleNavigation() {
    setIsMobileMenuOpen(false)
  }

  function NavItem({
    href,
    icon: Icon,
    children,
  }: {
    href: string
    icon: any
    children: React.ReactNode
  }) {
    const isActive = pathname === href

    return (
      <Link
        href={href}
        onClick={handleNavigation}
        className={`flex items-center px-3 py-2 text-sm rounded-md transition-colors ${
          isActive
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
        }`}
      >
        <Icon className="h-4 w-4 mr-3 flex-shrink-0" />
        {!isCollapsed && children}
      </Link>
    )
  }

  return (
    <>
      <button
        type="button"
        className="lg:hidden fixed top-4 left-4 z-[70] p-2 rounded-lg bg-card shadow-md"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        <Menu className="h-5 w-5 text-muted-foreground" />
      </button>
      <nav
        className={`
                fixed inset-y-0 left-0 z-[70] bg-card transform transition-all duration-300 ease-in-out
                lg:translate-x-0 lg:static border-r border-border
                ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
                ${isCollapsed ? "lg:w-16" : "lg:w-64"}
                w-64
            `}
      >
        <div className="h-full flex flex-col">
          <div className="h-16 px-6 flex items-center justify-between border-b border-border">
            {!isCollapsed && (
              <Link href="https://optioner.online/" rel="noopener noreferrer" className="flex items-center gap-3">
                <Image
                  src="/images/design-mode/logoOp.png"
                  alt="OPTIONER"
                  width={32}
                  height={32}
                  className="flex-shrink-0 hidden dark:block"
                />
                <Image
                  src="/images/design-mode/logoOp.png"
                  alt="OPTIONER"
                  width={32}
                  height={32}
                  className="flex-shrink-0 block dark:hidden bg-transparent"
                />
                <span className="text-lg hover:cursor-pointer text-foreground font-bold">OPTIONER</span>
              </Link>
            )}
            <button
              type="button"
              onClick={onToggleCollapse}
              className="hidden lg:flex p-1.5 rounded-md hover:bg-accent transition-colors ml-auto"
              title={isCollapsed ? "Развернуть сайдбар" : "Свернуть сайдбар"}
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-4 px-4 bg-muted/30">
            <div className="space-y-6">
              <div>
                <div className="space-y-1">
                  <NavItem href="/" icon={LayoutDashboard}>
                    Главная
                  </NavItem>
                </div>
              </div>

              <div>
                {!isCollapsed && (
                  <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    АНАЛИТИКА
                  </div>
                )}
                <div className="space-y-1">
                  <NavItem href="/analytics" icon={FileBarChart}>
                    Новый отчет
                  </NavItem>
                  <NavItem href="/reports-archive" icon={Archive}>
                    Архив отчетов
                  </NavItem>
                </div>
              </div>

              <div>
                {!isCollapsed && (
                  <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    КАЛЬКУЛЯТОРЫ
                  </div>
                )}
                <div className="space-y-1">
                  <NavItem href="/calculators" icon={Calculator}>
                    Калькуляторы
                  </NavItem>
                  <NavItem href="/calculators-new" icon={Calculator}>
                    Калькуляторы NEW
                  </NavItem>
                  <NavItem href="/strike-scale" icon={Calculator}>
                    Шкала страйков
                  </NavItem>
                </div>
              </div>

              <div>
                {!isCollapsed && (
                  <button
                    type="button"
                    onClick={() => setIsDevSectionCollapsed(!isDevSectionCollapsed)}
                    className="w-full flex items-center justify-between px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>В РАЗРАБОТКЕ</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${
                        isDevSectionCollapsed ? "-rotate-90" : "rotate-0"
                      }`}
                    />
                  </button>
                )}
                <div
                  className={`space-y-1 overflow-hidden transition-all duration-200 ${
                    isDevSectionCollapsed || isCollapsed ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100"
                  }`}
                >
                  <NavItem href="/organization" icon={Building2}>
                    Организация
                  </NavItem>
                  <NavItem href="/projects" icon={FolderKanban}>
                    Проекты
                  </NavItem>
                  <NavItem href="/invoices" icon={FileText}>
                    Счета
                  </NavItem>
                  <NavItem href="/payments" icon={CreditCard}>
                    Платежи
                  </NavItem>
                  <NavItem href="/members" icon={Users2}>
                    Участники
                  </NavItem>
                  <NavItem href="/permissions" icon={Shield}>
                    Права доступа
                  </NavItem>
                  <NavItem href="/chat" icon={MessagesSquare}>
                    Компоненты
                  </NavItem>
                  <NavItem href="/meetings" icon={Video}>
                    Встречи
                  </NavItem>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-4 border-t border-border">
            <div className="space-y-1">
              <NavItem href="/settings" icon={Settings}>
                Настройки
              </NavItem>
              <NavItem href="/help" icon={HelpCircle}>
                Помощь
              </NavItem>
            </div>
          </div>
        </div>
      </nav>

      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-[65] lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </>
  )
}
