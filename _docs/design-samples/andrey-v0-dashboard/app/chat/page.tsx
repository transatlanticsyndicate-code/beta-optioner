import Layout from "@/components/kokonutui/layout"
import {
  MessagesSquare,
  AlertCircle,
  Info,
  ChevronDown,
  Mail,
  User,
  Settings,
  LogOut,
  Plus,
  Trash2,
  Edit,
  Search,
  Share2,
  Heart,
  Star,
  Save,
  Download,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { Slider } from "@/components/ui/slider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { AppearanceSettings } from "@/components/appearance-settings"
import { ButtonGroupDemo } from "@/components/button-group-demo"
import { ButtonGroupInputGroup } from "@/components/button-group-input-group"
import { ButtonGroupNested } from "@/components/button-group-nested"
import { ButtonGroupPopover } from "@/components/button-group-popover"
import { EmptyAvatarGroup } from "@/components/empty-avatar-group"
import { FieldDemo } from "@/components/field-demo"
import { FieldSlider } from "@/components/field-slider"
import { InputGroupButtonExample } from "@/components/input-group-button"
import { InputGroupDemo } from "@/components/input-group-demo"
import { ItemDemo } from "@/components/item-demo"
import { NotionPromptForm } from "@/components/notion-prompt-form"
import { SpinnerBadge } from "@/components/spinner-badge"
import { SpinnerEmpty } from "@/components/spinner-empty"
import { Field, FieldLabel, FieldSeparator } from "@/components/ui/field"

export default function ChatPage() {
  return (
    <Layout>
      <div className="p-6 space-y-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <MessagesSquare className="h-8 w-8 text-muted-foreground" />
            <h1 className="text-3xl font-bold text-foreground">Компоненты</h1>
          </div>
          <p className="text-muted-foreground">
            Примеры всех доступных компонентов Shadcn UI с различными размерами и раскладками
          </p>
        </div>

        {/* GRID LAYOUTS - Примеры различных раскладок */}
        <Card>
          <CardHeader>
            <CardTitle>Grid Layouts (Сетки)</CardTitle>
            <CardDescription>
              Используйте grid-cols-1, grid-cols-2, grid-cols-3, grid-cols-4 для управления количеством колонок.
              Добавьте md:, lg:, xl: префиксы для адаптивности.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* 1 Column Layout */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-foreground">1 Колонка (grid-cols-1)</h3>
              <div className="grid grid-cols-1 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Полная ширина блока</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* 2 Columns Layout */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-foreground">2 Колонки (grid-cols-2)</h3>
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Блок 1</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Блок 2</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* 3 Columns Layout */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-foreground">3 Колонки (grid-cols-3)</h3>
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Блок 1</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Блок 2</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Блок 3</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* 4 Columns Layout */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-foreground">4 Колонки (grid-cols-4)</h3>
              <div className="grid grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">1</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">2</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">3</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">4</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Responsive Grid */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-foreground">
                Адаптивная сетка (grid-cols-1 md:grid-cols-2 lg:grid-cols-4)
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                На мобильных - 1 колонка, на планшетах - 2, на десктопе - 4
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i}>
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground">Блок {i}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Spanning Columns */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-foreground">Растягивание блоков (col-span-2, col-span-3)</h3>
              <div className="grid grid-cols-4 gap-4">
                <Card className="col-span-2">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Занимает 2 колонки (col-span-2)</p>
                  </CardContent>
                </Card>
                <Card className="col-span-2">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Занимает 2 колонки (col-span-2)</p>
                  </CardContent>
                </Card>
                <Card className="col-span-3">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Занимает 3 колонки (col-span-3)</p>
                  </CardContent>
                </Card>
                <Card className="col-span-1">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">1 колонка</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CARD SIZES - Различные размеры карточек */}
        <Card>
          <CardHeader>
            <CardTitle>Card Sizes (Размеры карточек)</CardTitle>
            <CardDescription>
              Управляйте размерами через классы: p-2 (маленький), p-4 (средний), p-6 (большой), p-8 (очень большой)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Small Card */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-foreground">Маленькая карточка (p-2)</h3>
              <Card className="max-w-sm">
                <CardHeader className="p-3">
                  <CardTitle className="text-sm">Компактный заголовок</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <p className="text-xs text-muted-foreground">Маленькая карточка с минимальными отступами</p>
                </CardContent>
              </Card>
            </div>

            {/* Medium Card */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-foreground">Средняя карточка (p-4, стандарт)</h3>
              <Card className="max-w-md">
                <CardHeader>
                  <CardTitle>Стандартный заголовок</CardTitle>
                  <CardDescription>Описание карточки</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Карточка со стандартными отступами</p>
                </CardContent>
              </Card>
            </div>

            {/* Large Card */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-foreground">Большая карточка (p-6)</h3>
              <Card className="max-w-2xl">
                <CardHeader className="p-6">
                  <CardTitle className="text-2xl">Большой заголовок</CardTitle>
                  <CardDescription>Подробное описание для большой карточки</CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                  <p className="text-sm text-muted-foreground mb-4">
                    Большая карточка с увеличенными отступами для важного контента
                  </p>
                  <Button>Действие</Button>
                </CardContent>
              </Card>
            </div>

            {/* Full Width Card */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-foreground">Карточка на всю ширину (w-full)</h3>
              <Card className="w-full">
                <CardHeader>
                  <CardTitle>Полная ширина</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Эта карточка занимает всю доступную ширину контейнера</p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Buttons Section */}
        <Card>
          <CardHeader>
            <CardTitle>Buttons (Кнопки)</CardTitle>
            <CardDescription>Различные варианты кнопок</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
            <Button>
              <Mail className="mr-2 h-4 w-4" />
              With Icon
            </Button>
          </CardContent>
        </Card>

        {/* Inputs Section */}
        <Card>
          <CardHeader>
            <CardTitle>Inputs (Поля ввода)</CardTitle>
            <CardDescription>Текстовые поля и элементы формы</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="example@email.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" placeholder="Введите сообщение..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="search">Search with Icon</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="search" className="pl-10" placeholder="Поиск..." />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Select, Switch, Checkbox, Radio */}
        <Card>
          <CardHeader>
            <CardTitle>Form Controls (Элементы управления)</CardTitle>
            <CardDescription>Выпадающие списки, переключатели и чекбоксы</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Select</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите опцию" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="option1">Опция 1</SelectItem>
                  <SelectItem value="option2">Опция 2</SelectItem>
                  <SelectItem value="option3">Опция 3</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Switch id="airplane-mode" />
              <Label htmlFor="airplane-mode">Airplane Mode</Label>
            </div>

            <div className="space-y-2">
              <Label>Checkboxes</Label>
              <div className="flex items-center space-x-2">
                <Checkbox id="terms" />
                <Label htmlFor="terms">Принять условия</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="marketing" />
                <Label htmlFor="marketing">Получать рассылку</Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Radio Group</Label>
              <RadioGroup defaultValue="option1">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="option1" id="r1" />
                  <Label htmlFor="r1">Опция 1</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="option2" id="r2" />
                  <Label htmlFor="r2">Опция 2</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="option3" id="r3" />
                  <Label htmlFor="r3">Опция 3</Label>
                </div>
              </RadioGroup>
            </div>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader>
            <CardTitle>Alerts (Уведомления)</CardTitle>
            <CardDescription>Различные типы уведомлений</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Info</AlertTitle>
              <AlertDescription>Это информационное сообщение для пользователя.</AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>Произошла ошибка при выполнении операции.</AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Badges and Avatars */}
        <Card>
          <CardHeader>
            <CardTitle>Badges & Avatars (Значки и аватары)</CardTitle>
            <CardDescription>Метки статуса и изображения профилей</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label className="mb-3 block">Базовые варианты</Label>
                <div className="flex flex-wrap gap-2">
                  <Badge>Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                  <Badge variant="outline">Outline</Badge>
                </div>
              </div>

              <div>
                <Label className="mb-3 block">Бэджи со статусами</Label>
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-green-600 hover:bg-green-700">Активен</Badge>
                  <Badge className="bg-yellow-600 hover:bg-yellow-700">Ожидание</Badge>
                  <Badge className="bg-blue-600 hover:bg-blue-700">В процессе</Badge>
                  <Badge className="bg-gray-600 hover:bg-gray-700">Неактивен</Badge>
                  <Badge variant="destructive">Отклонён</Badge>
                </div>
              </div>

              <div>
                <Label className="mb-3 block">Бэджи с иконками</Label>
                <div className="flex flex-wrap gap-2">
                  <Badge>
                    <Star className="mr-1 h-3 w-3" />
                    Избранное
                  </Badge>
                  <Badge variant="secondary">
                    <Heart className="mr-1 h-3 w-3" />
                    Нравится
                  </Badge>
                  <Badge variant="outline">
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Внимание
                  </Badge>
                  <Badge variant="destructive">
                    <Trash2 className="mr-1 h-3 w-3" />
                    Удалить
                  </Badge>
                </div>
              </div>

              <div>
                <Label className="mb-3 block">Бэджи с числами</Label>
                <div className="flex flex-wrap gap-2">
                  <Badge>Новые 5</Badge>
                  <Badge variant="secondary">Сообщения 12</Badge>
                  <Badge variant="outline">Уведомления 3</Badge>
                  <Badge className="bg-red-600 hover:bg-red-700">Ошибки 2</Badge>
                </div>
              </div>

              <div>
                <Label className="mb-3 block">Размеры бэджей (через className)</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="text-xs px-2 py-0">Маленький</Badge>
                  <Badge>Стандартный</Badge>
                  <Badge className="text-base px-3 py-1">Большой</Badge>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Avatars</Label>
              <div className="flex gap-3">
                <Avatar>
                  <AvatarImage src="/images/design-mode/shadcn.png" />
                  <AvatarFallback>CN</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarFallback>JD</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarFallback>AB</AvatarFallback>
                </Avatar>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Progress and Slider */}
        <Card>
          <CardHeader>
            <CardTitle>Progress & Slider (Прогресс и слайдер)</CardTitle>
            <CardDescription>Индикаторы прогресса и ползунки</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Progress Bar</Label>
              <Progress value={33} />
              <Progress value={66} />
              <Progress value={100} />
            </div>

            <div className="space-y-2">
              <Label>Slider</Label>
              <Slider defaultValue={[50]} max={100} step={1} />
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Card>
          <CardHeader>
            <CardTitle>Tabs (Вкладки)</CardTitle>
            <CardDescription>Навигация по вкладкам</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="account" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="account">Account</TabsTrigger>
                <TabsTrigger value="password">Password</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>
              <TabsContent value="account" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" defaultValue="John Doe" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input id="username" defaultValue="@johndoe" />
                </div>
              </TabsContent>
              <TabsContent value="password" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current">Current Password</Label>
                  <Input id="current" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new">New Password</Label>
                  <Input id="new" type="password" />
                </div>
              </TabsContent>
              <TabsContent value="settings" className="space-y-4">
                <p className="text-sm text-muted-foreground">Настройки приложения и предпочтения пользователя.</p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Accordion */}
        <Card>
          <CardHeader>
            <CardTitle>Accordion (Аккордеон)</CardTitle>
            <CardDescription>Раскрывающиеся секции</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger>Что такое Shadcn UI?</AccordionTrigger>
                <AccordionContent>
                  Shadcn UI - это коллекция переиспользуемых компонентов, построенных с использованием Radix UI и
                  Tailwind CSS.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger>Как установить компоненты?</AccordionTrigger>
                <AccordionContent>
                  Компоненты можно установить через CLI или скопировать код напрямую в ваш проект.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3">
                <AccordionTrigger>Можно ли кастомизировать стили?</AccordionTrigger>
                <AccordionContent>
                  Да, все компоненты полностью кастомизируемы через Tailwind CSS классы.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* Dropdown Menu */}
        <Card>
          <CardHeader>
            <CardTitle>Dropdown Menu (Выпадающее меню)</CardTitle>
            <CardDescription>Контекстные меню и действия</CardDescription>
          </CardHeader>
          <CardContent>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  Открыть меню
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Мой аккаунт</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  Профиль
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Настройки
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <LogOut className="mr-2 h-4 w-4" />
                  Выйти
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>

        {/* Dialog */}
        <Card>
          <CardHeader>
            <CardTitle>Dialog (Диалоговое окно)</CardTitle>
            <CardDescription>Модальные окна и диалоги</CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog>
              <DialogTrigger asChild>
                <Button>Открыть диалог</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Вы уверены?</DialogTitle>
                  <DialogDescription>
                    Это действие нельзя будет отменить. Вы действительно хотите продолжить?
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline">Отмена</Button>
                  <Button>Подтвердить</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Separator */}
        <Card>
          <CardHeader>
            <CardTitle>Separator (Разделитель)</CardTitle>
            <CardDescription>Визуальное разделение контента</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-foreground">Секция 1</p>
              <Separator className="my-4" />
              <p className="text-sm text-foreground">Секция 2</p>
              <Separator className="my-4" />
              <p className="text-sm text-foreground">Секция 3</p>
            </div>
          </CardContent>
        </Card>

        {/* Table Component - Basic */}
        <Card>
          <CardHeader>
            <CardTitle>Table - Базовая таблица</CardTitle>
            <CardDescription>Простая таблица с данными</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption>Список последних транзакций</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">INV001</TableCell>
                  <TableCell>
                    <Badge>Оплачено</Badge>
                  </TableCell>
                  <TableCell>user@example.com</TableCell>
                  <TableCell className="text-right">$250.00</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">INV002</TableCell>
                  <TableCell>
                    <Badge variant="secondary">Ожидание</Badge>
                  </TableCell>
                  <TableCell>client@example.com</TableCell>
                  <TableCell className="text-right">$150.00</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">INV003</TableCell>
                  <TableCell>
                    <Badge variant="destructive">Отклонено</Badge>
                  </TableCell>
                  <TableCell>admin@example.com</TableCell>
                  <TableCell className="text-right">$350.00</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Table - With Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Table - С действиями</CardTitle>
            <CardDescription>Таблица с кнопками действий в каждой строке</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Иван Петров</TableCell>
                  <TableCell>Администратор</TableCell>
                  <TableCell>ivan@example.com</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline">
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Мария Сидорова</TableCell>
                  <TableCell>Менеджер</TableCell>
                  <TableCell>maria@example.com</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline">
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Алексей Иванов</TableCell>
                  <TableCell>Пользователь</TableCell>
                  <TableCell>alexey@example.com</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline">
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Table - Striped */}
        <Card>
          <CardHeader>
            <CardTitle>Table - Полосатая таблица</CardTitle>
            <CardDescription>
              Таблица с чередующимся фоном строк (добавьте className="bg-muted/50" к TableRow)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Продукт</TableHead>
                  <TableHead>Категория</TableHead>
                  <TableHead>Цена</TableHead>
                  <TableHead>В наличии</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/50">
                  <TableCell className="font-medium">Ноутбук</TableCell>
                  <TableCell>Электроника</TableCell>
                  <TableCell>$999</TableCell>
                  <TableCell>
                    <Badge className="bg-green-600">Да</Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Мышь</TableCell>
                  <TableCell>Аксессуары</TableCell>
                  <TableCell>$29</TableCell>
                  <TableCell>
                    <Badge className="bg-green-600">Да</Badge>
                  </TableCell>
                </TableRow>
                <TableRow className="bg-muted/50">
                  <TableCell className="font-medium">Клавиатура</TableCell>
                  <TableCell>Аксессуары</TableCell>
                  <TableCell>$79</TableCell>
                  <TableCell>
                    <Badge variant="destructive">Нет</Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Монитор</TableCell>
                  <TableCell>Электроника</TableCell>
                  <TableCell>$299</TableCell>
                  <TableCell>
                    <Badge className="bg-green-600">Да</Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Table - Compact */}
        <Card>
          <CardHeader>
            <CardTitle>Table - Компактная таблица</CardTitle>
            <CardDescription>
              Таблица с уменьшенными отступами (используйте className="h-8" на TableCell)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8">Дата</TableHead>
                  <TableHead className="h-8">Событие</TableHead>
                  <TableHead className="h-8">Пользователь</TableHead>
                  <TableHead className="h-8">Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="h-8">2024-01-15</TableCell>
                  <TableCell className="h-8">Вход в систему</TableCell>
                  <TableCell className="h-8">admin</TableCell>
                  <TableCell className="h-8">
                    <Badge className="text-xs">Успешно</Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="h-8">2024-01-15</TableCell>
                  <TableCell className="h-8">Изменение настроек</TableCell>
                  <TableCell className="h-8">user1</TableCell>
                  <TableCell className="h-8">
                    <Badge className="text-xs">Успешно</Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="h-8">2024-01-14</TableCell>
                  <TableCell className="h-8">Попытка входа</TableCell>
                  <TableCell className="h-8">unknown</TableCell>
                  <TableCell className="h-8">
                    <Badge variant="destructive" className="text-xs">
                      Ошибка
                    </Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Table - With Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Table - С выбором строк</CardTitle>
            <CardDescription>Таблица с чекбоксами для выбора строк</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox />
                  </TableHead>
                  <TableHead>Задача</TableHead>
                  <TableHead>Приоритет</TableHead>
                  <TableHead>Исполнитель</TableHead>
                  <TableHead>Срок</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>
                    <Checkbox />
                  </TableCell>
                  <TableCell className="font-medium">Исправить баг в авторизации</TableCell>
                  <TableCell>
                    <Badge variant="destructive">Высокий</Badge>
                  </TableCell>
                  <TableCell>Иван П.</TableCell>
                  <TableCell>Сегодня</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>
                    <Checkbox />
                  </TableCell>
                  <TableCell className="font-medium">Обновить документацию</TableCell>
                  <TableCell>
                    <Badge variant="secondary">Средний</Badge>
                  </TableCell>
                  <TableCell>Мария С.</TableCell>
                  <TableCell>Завтра</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>
                    <Checkbox />
                  </TableCell>
                  <TableCell className="font-medium">Провести код-ревью</TableCell>
                  <TableCell>
                    <Badge variant="outline">Низкий</Badge>
                  </TableCell>
                  <TableCell>Алексей И.</TableCell>
                  <TableCell>Через неделю</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Table - Reports with action buttons */}
        <Card>
          <CardHeader>
            <CardTitle>Table - Отчёты с действиями</CardTitle>
            <CardDescription>
              Таблица отчётов с кнопками действий: сохранить, в избранное, поделиться, скачать PDF
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название отчёта</TableHead>
                  <TableHead>Дата создания</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Автор</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Финансовый отчёт Q1 2024</TableCell>
                  <TableCell>15.01.2024</TableCell>
                  <TableCell>
                    <Badge className="bg-green-600 hover:bg-green-700">Готов</Badge>
                  </TableCell>
                  <TableCell>Иван Петров</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Save className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Сохранить</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Star className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>В избранное</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Share2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Поделиться ссылкой</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="default">
                              <Download className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Скачать в PDF</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-medium">Отчёт по продажам за декабрь</TableCell>
                  <TableCell>28.12.2023</TableCell>
                  <TableCell>
                    <Badge className="bg-green-600 hover:bg-green-700">Готов</Badge>
                  </TableCell>
                  <TableCell>Мария Сидорова</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Save className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Сохранить</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Star className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>В избранное</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Share2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Поделиться ссылкой</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="default">
                              <Download className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Скачать в PDF</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-medium">Аналитика трафика сайта</TableCell>
                  <TableCell>10.01.2024</TableCell>
                  <TableCell>
                    <Badge className="bg-yellow-600 hover:bg-yellow-700">В обработке</Badge>
                  </TableCell>
                  <TableCell>Алексей Иванов</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Save className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Сохранить</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Star className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>В избранное</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" disabled>
                              <Share2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Недоступно для незавершённых отчётов</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="default" disabled>
                              <Download className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Недоступно для незавершённых отчётов</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-medium">Отчёт по расходам 2023</TableCell>
                  <TableCell>05.01.2024</TableCell>
                  <TableCell>
                    <Badge className="bg-green-600 hover:bg-green-700">Готов</Badge>
                  </TableCell>
                  <TableCell>Елена Смирнова</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Save className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Сохранить</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Star className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>В избранное</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Share2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Поделиться ссылкой</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="default">
                              <Download className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Скачать в PDF</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-medium">Квартальный отчёт Q4 2023</TableCell>
                  <TableCell>20.12.2023</TableCell>
                  <TableCell>
                    <Badge variant="destructive">Отклонён</Badge>
                  </TableCell>
                  <TableCell>Дмитрий Козлов</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Save className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Сохранить</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Star className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>В избранное</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" disabled>
                              <Share2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Недоступно для отклонённых отчётов</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="default" disabled>
                              <Download className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Недоступно для отклонённых отчётов</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Accordion - Enhanced */}
        <Card>
          <CardHeader>
            <CardTitle>Accordion - Расширенные примеры</CardTitle>
            <CardDescription>Различные варианты аккордеонов</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Single Open Accordion */}
            <div>
              <Label className="mb-3 block">Одиночное открытие (type="single")</Label>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>Что такое Shadcn UI?</AccordionTrigger>
                  <AccordionContent>
                    Shadcn UI - это коллекция переиспользуемых компонентов, построенных с использованием Radix UI и
                    Tailwind CSS. Комп��ненты полностью кастомизируемы и не требуют установки как npm пакет.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>Как установить компоненты?</AccordionTrigger>
                  <AccordionContent>
                    Компоненты можно установить через CLI командой npx shadcn@latest add [component] или скопировать код
                    напрямую в ваш проект из документации.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-3">
                  <AccordionTrigger>Можно ли кастомизировать стили?</AccordionTrigger>
                  <AccordionContent>
                    Да, все компоненты полностью кастомизируемы через Tailwind CSS классы. Вы владеете кодом и можете
                    изменять его как угодно.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            {/* Multiple Open Accordion */}
            <div>
              <Label className="mb-3 block">Множественное открытие (type="multiple")</Label>
              <Accordion type="multiple" className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      <span>Настройки аккаунта</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 pl-6">
                      <p className="text-sm">• Изменить email</p>
                      <p className="text-sm">• Изменить пароль</p>
                      <p className="text-sm">• Двухфакторная аутентификация</p>
                      <p className="text-sm">• Удалить аккаунт</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span>Профиль</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 pl-6">
                      <p className="text-sm">• Личная информация</p>
                      <p className="text-sm">• Фото профиля</p>
                      <p className="text-sm">• Биография</p>
                      <p className="text-sm">• Социальные сети</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-3">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      <span>Уведомления</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 pl-6">
                      <p className="text-sm">• Email уведомления</p>
                      <p className="text-sm">• Push уведомления</p>
                      <p className="text-sm">• SMS уведомления</p>
                      <p className="text-sm">• Частота рассылки</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            {/* Accordion with Badges */}
            <div>
              <Label className="mb-3 block">Аккордеон с бэджами</Label>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>
                    <div className="flex items-center justify-between w-full pr-4">
                      <span>Активные задачи</span>
                      <Badge>5</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <span className="text-sm">Задача 1</span>
                        <Badge variant="destructive">Срочно</Badge>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <span className="text-sm">Задача 2</span>
                        <Badge variant="secondary">Средний</Badge>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <span className="text-sm">Задача 3</span>
                        <Badge variant="outline">Низкий</Badge>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>
                    <div className="flex items-center justify-between w-full pr-4">
                      <span>Завершённые задачи</span>
                      <Badge variant="secondary">12</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-sm text-muted-foreground">Все задачи выполнены успешно.</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </CardContent>
        </Card>

        {/* Tooltip Component */}
        <Card>
          <CardHeader>
            <CardTitle>Tooltip (Подсказка)</CardTitle>
            <CardDescription>Всплывающие подсказки при наведении</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-4">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline">Наведите на меня</Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Это подсказка!</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button>
                    <Info className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Дополнительная информация</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardContent>
        </Card>

        {/* Popover Component */}
        <Card>
          <CardHeader>
            <CardTitle>Popover (Всплывающее окно)</CardTitle>
            <CardDescription>Контекстные всплывающие панели</CardDescription>
          </CardHeader>
          <CardContent>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">Открыть Popover</Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-2">
                  <h4 className="font-medium leading-none">Настройки</h4>
                  <p className="text-sm text-muted-foreground">Измените параметры отображения</p>
                  <div className="grid gap-2">
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="width">Ширина</Label>
                      <Input id="width" defaultValue="100%" className="col-span-2 h-8" />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="height">Высота</Label>
                      <Input id="height" defaultValue="25px" className="col-span-2 h-8" />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>

        {/* Skeleton Component */}
        <Card>
          <CardHeader>
            <CardTitle>Skeleton (Скелетон загрузки)</CardTitle>
            <CardDescription>Индикаторы загрузки контента</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
              </div>
            </div>
            <Skeleton className="h-[125px] w-full rounded-xl" />
          </CardContent>
        </Card>

        {/* Aspect Ratio Component */}

        {/* Scroll Area Component */}
        <Card>
          <CardHeader>
            <CardTitle>Scroll Area (Область прокрутки)</CardTitle>
            <CardDescription>Кастомная область прокрутки</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px] w-full rounded-md border p-4">
              <div className="space-y-4">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} className="text-sm">
                    Элемент списка {i + 1}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Toggle and Toggle Group */}
        <Card>
          <CardHeader>
            <CardTitle>Toggle (Переключатели)</CardTitle>
            <CardDescription>Кнопки-переключатели состояния</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Одиночный Toggle</Label>
              <Toggle aria-label="Toggle italic">
                <Star className="h-4 w-4" />
              </Toggle>
            </div>

            <div className="space-y-2">
              <Label>Toggle Group</Label>
              <ToggleGroup type="multiple">
                <ToggleGroupItem value="bold" aria-label="Toggle bold">
                  <Heart className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="italic" aria-label="Toggle italic">
                  <Star className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="underline" aria-label="Toggle underline">
                  <Share2 className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </CardContent>
        </Card>

        {/* Card Examples */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Card Title</CardTitle>
              <CardDescription>Card Description</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Это пример карточки с заголовком, описанием и контентом.</p>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline">Отмена</Button>
              <Button>Сохранить</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Статистика</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">$45,231.89</div>
              <p className="text-xs text-muted-foreground">+20.1% от прошлого месяца</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>��ействия</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full bg-transparent" variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Создать
              </Button>
              <Button className="w-full bg-transparent" variant="outline">
                <Edit className="mr-2 h-4 w-4" />
                Редактировать
              </Button>
              <Button className="w-full" variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Удалить
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="theme-container mx-auto grid max-w-[2200px] gap-8 p-6 md:p-8 lg:grid-cols-3 xl:grid-cols-4">
        <div className="flex flex-col gap-6 *:[div]:w-full *:[div]:max-w-full">
          <FieldDemo />
        </div>
        <div className="flex flex-col gap-6 *:[div]:w-full *:[div]:max-w-full">
          <div className="*:[div]:border">
            <EmptyAvatarGroup />
          </div>
          <ButtonGroupInputGroup />
          <FieldSlider />
          <InputGroupDemo />
        </div>
        <div className="flex flex-col gap-6 *:[div]:w-full *:[div]:max-w-full">
          <ItemDemo />
          <FieldSeparator>Appearance Settings</FieldSeparator>
          <AppearanceSettings />
        </div>
        <div className="order-first flex flex-col gap-6 min-[1400px]:order-last *:[div]:w-full *:[div]:max-w-full">
          <div className="flex gap-2">
            <SpinnerBadge />
          </div>
          <InputGroupButtonExample />
          <NotionPromptForm />
          <ButtonGroupDemo />
          <div className="flex gap-6">
            <FieldLabel htmlFor="checkbox-demo">
              <Field orientation="horizontal">
                <Checkbox id="checkbox-demo" defaultChecked />
                <FieldLabel htmlFor="checkbox-demo" className="line-clamp-1">
                  I agree to the terms and conditions
                </FieldLabel>
              </Field>
            </FieldLabel>
          </div>
          <div className="flex gap-4">
            <ButtonGroupNested />
            <ButtonGroupPopover />
          </div>
          <div className="*:[div]:border">
            <SpinnerEmpty />
          </div>
        </div>
      </div>
    </Layout>
  )
}
