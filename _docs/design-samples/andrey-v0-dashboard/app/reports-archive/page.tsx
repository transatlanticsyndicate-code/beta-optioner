"use client"

import { useState, useMemo } from "react"
import Layout from "@/components/kokonutui/layout"
import {
  Archive,
  ArchiveX,
  Calendar,
  Download,
  Eye,
  Link2,
  Trash2,
  CheckSquare,
  Search,
  X,
  Filter,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export default function ReportsArchivePage() {
  const [selectedReports, setSelectedReports] = useState<number[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [searchText, setSearchText] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [selectedAuthor, setSelectedAuthor] = useState<string>("all")

  const getAuthorInitials = (name: string) => {
    const parts = name.split(" ")
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  const reports = [
    {
      id: 1,
      name: "Квартальный отчет Q4 2024",
      date: "15.12.2024",
      author: "Иван Петров",
      archived: true,
    },
    {
      id: 2,
      name: "Анализ рисков портфеля",
      date: "10.12.2024",
      author: "Мария Сидорова",
      archived: true,
    },
    {
      id: 3,
      name: "Отчет по опционным стратегиям",
      date: "05.12.2024",
      author: "Алексей Смирнов",
      archived: false,
    },
    {
      id: 4,
      name: "Месячный обзор ноябрь 2024",
      date: "30.11.2024",
      author: "Иван Петров",
      archived: true,
    },
    {
      id: 5,
      name: "Анализ волатильности активов",
      date: "25.11.2024",
      author: "Елена Кузнецова",
      archived: false,
    },
  ]

  const uniqueAuthors = useMemo(() => {
    return Array.from(new Set(reports.map((r) => r.author)))
  }, [])

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const matchesSearch = searchText === "" || report.name.toLowerCase().includes(searchText.toLowerCase())
      const matchesAuthor = selectedAuthor === "all" || report.author === selectedAuthor
      const reportDate = new Date(report.date.split(".").reverse().join("-"))
      const matchesDateFrom = dateFrom === "" || reportDate >= new Date(dateFrom)
      const matchesDateTo = dateTo === "" || reportDate <= new Date(dateTo)

      return matchesSearch && matchesAuthor && matchesDateFrom && matchesDateTo
    })
  }, [searchText, selectedAuthor, dateFrom, dateTo])

  const totalPages = Math.ceil(filteredReports.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedReports = filteredReports.slice(startIndex, endIndex)

  useMemo(() => {
    setCurrentPage(1)
  }, [searchText, selectedAuthor, dateFrom, dateTo])

  const clearFilters = () => {
    setSearchText("")
    setDateFrom("")
    setDateTo("")
    setSelectedAuthor("all")
  }

  const hasActiveFilters = searchText !== "" || dateFrom !== "" || dateTo !== "" || selectedAuthor !== "all"

  const toggleSelectAll = () => {
    if (selectedReports.length === paginatedReports.length) {
      setSelectedReports([])
    } else {
      setSelectedReports(paginatedReports.map((r) => r.id))
    }
  }

  const toggleSelectReport = (id: number) => {
    setSelectedReports((prev) => (prev.includes(id) ? prev.filter((reportId) => reportId !== id) : [...prev, id]))
  }

  const handleBulkDownload = () => {
    console.log("[v0] Скачивание отчетов:", selectedReports)
  }

  const handleBulkDelete = () => {
    console.log("[v0] Удаление отчетов:", selectedReports)
    setSelectedReports([])
  }

  const allSelected = selectedReports.length === paginatedReports.length && paginatedReports.length > 0
  const someSelected = selectedReports.length > 0 && selectedReports.length < paginatedReports.length

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Archive className="h-8 w-8 text-muted-foreground" />
            <h1 className="text-3xl font-bold text-foreground">Архив отчетов</h1>
          </div>
          <p className="text-muted-foreground">Просмотр и управление сохраненными аналитическими отчетами</p>
        </div>

        <div className="mb-6 p-4 bg-card rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">Фильтры</h2>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto">
                <X className="h-4 w-4 mr-2" />
                Сбросить
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search" className="text-sm font-medium">
                Поиск по названию
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Введите название..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateFrom" className="text-sm font-medium">
                Дата от
              </Label>
              <Input id="dateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateTo" className="text-sm font-medium">
                Дата до
              </Label>
              <Input id="dateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="author" className="text-sm font-medium">
                Автор
              </Label>
              <Select value={selectedAuthor} onValueChange={setSelectedAuthor}>
                <SelectTrigger id="author">
                  <SelectValue placeholder="Все авторы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все авторы</SelectItem>
                  {uniqueAuthors.map((author) => (
                    <SelectItem key={author} value={author}>
                      {author}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 text-sm text-muted-foreground">
            Найдено отчетов: {filteredReports.length} из {reports.length}
          </div>
        </div>

        {selectedReports.length > 0 && (
          <div className="mb-4 p-4 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              <span className="font-medium text-foreground">Выбрано отчетов: {selectedReports.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={handleBulkDownload}>
                      <Download className="h-4 w-4 mr-2" />
                      Скачать
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Скачать выбранные отчеты в PDF</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Удалить
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Удалить выбранные отчеты</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}

        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Выбрать все"
                      className={someSelected ? "data-[state=checked]:bg-primary/50" : ""}
                    />
                  </TableHead>
                  <TableHead>Название отчета</TableHead>
                  <TableHead>Дата создания</TableHead>
                  <TableHead>Автор</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedReports.length > 0 ? (
                  paginatedReports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedReports.includes(report.id)}
                          onCheckedChange={() => toggleSelectReport(report.id)}
                          aria-label={`Выбрать ${report.name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{report.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          {report.date}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${report.author}`} />
                            <AvatarFallback>{getAuthorInitials(report.author)}</AvatarFallback>
                          </Avatar>
                          <span className="text-muted-foreground">{report.author}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Просмотреть</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon">
                                {report.archived ? <ArchiveX className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {report.archived ? "Удалить из архива" : "Сохранить в архив"}
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Download className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Скачать PDF</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Link2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Скопировать публичную ссылку</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Отчеты не найдены. Попробуйте изменить параметры фильтрации.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TooltipProvider>
        </div>

        {filteredReports.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Показано {startIndex + 1}-{Math.min(endIndex, filteredReports.length)} из {filteredReports.length}
              </span>
              <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Назад
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  // Показываем только несколько страниц вокруг текущей
                  if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                    return (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                        className="w-10"
                      >
                        {page}
                      </Button>
                    )
                  } else if (page === currentPage - 2 || page === currentPage + 2) {
                    return (
                      <span key={page} className="px-2 text-muted-foreground">
                        ...
                      </span>
                    )
                  }
                  return null
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Вперед
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
