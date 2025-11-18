"use client"

import Layout from "@/components/kokonutui/layout"
import { HelpCircle, Info, Mail, MessageCircle, Book, FileText } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function HelpPage() {
  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <HelpCircle className="h-8 w-8 text-muted-foreground" />
            <h1 className="text-3xl font-bold text-foreground">Помощь и поддержка</h1>
          </div>
          <p className="text-muted-foreground">Найдите ответы и получите поддержку</p>
        </div>

        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertTitle>Поддержка 24/7</AlertTitle>
          <AlertDescription>
            Наша команда поддержки готова помочь вам в любое время. Свяжитесь с нами удобным способом.
          </AlertDescription>
        </Alert>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Book className="h-5 w-5 text-primary" />
                <CardTitle>База знаний</CardTitle>
              </div>
              <CardDescription>Изучите руководства и документацию</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Найдите ответы на часто задаваемые вопросы и подробные инструкции по использованию платформы.
              </p>
              <Button variant="outline" className="w-full bg-transparent">
                Открыть базу знаний
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                <CardTitle>Онлайн чат</CardTitle>
              </div>
              <CardDescription>Получите мгновенную помощь</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Свяжитесь с нашей службой поддержки через онлайн чат для быстрого решения вопросов.
              </p>
              <Button variant="outline" className="w-full bg-transparent">
                Начать чат
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                <CardTitle>Email поддержка</CardTitle>
              </div>
              <CardDescription>Напишите нам письмо</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Отправьте подробное описание вашего вопроса на support@optioner.com
              </p>
              <Button variant="outline" className="w-full bg-transparent">
                Написать письмо
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle>Документация API</CardTitle>
              </div>
              <CardDescription>Для разработчиков</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Изучите техническую документацию и примеры интеграции API.
              </p>
              <Button variant="outline" className="w-full bg-transparent">
                Открыть документацию
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Часто задаваемые вопросы</CardTitle>
            <CardDescription>Ответы на популярные вопросы</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold text-foreground mb-2">Как создать новый отчет?</h3>
              <p className="text-sm text-muted-foreground">
                Перейдите в раздел "Аналитика" → "Новый отчет" и следуйте инструкциям мастера создания отчетов.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2">Как использовать калькуляторы?</h3>
              <p className="text-sm text-muted-foreground">
                В разделе "Калькуляторы" выберите нужный инструмент и введите параметры для расчета позиций и стратегий.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2">Как экспортировать данные?</h3>
              <p className="text-sm text-muted-foreground">
                Используйте кнопку "Ска��ать PDF" в таблице отчетов для экспорта данных в формате PDF.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
