"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import Image from "next/image"
import { ThemeToggle } from "@/components/theme-toggle"

export default function RegisterPage() {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Registration logic will go here
    console.log("[v0] Registration form submitted")
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
            <CardTitle className="text-2xl font-bold text-center">Создать аккаунт</CardTitle>
            <CardDescription className="text-center">Зарегистрируйтесь используя ваш email и пароль</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Имя</Label>
                <Input id="name" type="text" placeholder="Иван Иванов" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="name@example.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Пароль</Label>
                <Input id="password" type="password" placeholder="••••••••" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Подтвердите пароль</Label>
                <Input id="confirm-password" type="password" placeholder="••••••••" required />
              </div>
              <Button type="submit" className="w-full">
                Зарегистрироваться
              </Button>
            </form>

            <div className="text-center text-sm text-muted-foreground">
              Уже есть аккаунт?{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">
                Войти
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
