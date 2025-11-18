"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import Image from "next/image"
import { ThemeToggle } from "@/components/theme-toggle"
import { ArrowLeft } from "lucide-react"

export default function ForgotPasswordPage() {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Password reset logic will go here
    console.log("[v0] Password reset form submitted")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/images/design-mode/logoOp.png"
              alt="OPTIONER"
              width={40}
              height={40}
              className="flex-shrink-0"
            />
            <span className="text-2xl font-bold text-foreground">OPTIONER</span>
          </Link>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">Восстановление пароля</CardTitle>
            <CardDescription className="text-center">
              Введите ваш email и мы отправим инструкции по восстановлению пароля
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="name@example.com" required />
              </div>
              <Button type="submit" className="w-full">
                Отправить инструкции
              </Button>
            </form>

            <div className="text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Вернуться к входу
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
