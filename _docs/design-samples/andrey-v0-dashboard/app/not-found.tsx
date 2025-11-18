export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h2 className="text-2xl font-bold">404 - Страница не найдена</h2>
      <p className="mt-2 text-muted-foreground">
        Запрашиваемая страница не существует
      </p>
    </div>
  )
}
