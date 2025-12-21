import React, { useState, useEffect } from 'react';
import {
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
  Check,
  X,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { Progress } from '../components/ui/progress';
import { Slider } from '../components/ui/slider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';

const ComponentsShowcase = () => {
  // Установка заголовка страницы
  useEffect(() => {
    document.title = 'Компоненты UI | SYNDICATE Platform';
    return () => {
      document.title = 'SYNDICATE Platform';
    };
  }, []);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [sliderValue, setSliderValue] = useState([50]);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-foreground">Компоненты Shadcn UI</h1>
          <p className="text-lg text-muted-foreground">
            Полная библиотека компонентов для разработки интерфейса
          </p>
        </div>

        {/* Buttons Section */}
        <Card>
          <CardHeader>
            <CardTitle>Кнопки</CardTitle>
            <CardDescription>Различные варианты и размеры кнопок</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Варианты</h4>
              <div className="flex flex-wrap gap-3">
                <Button>Default</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link">Link</Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Размеры</h4>
              <div className="flex flex-wrap gap-3 items-center">
                <Button size="sm">Small</Button>
                <Button>Default</Button>
                <Button size="lg">Large</Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Состояния</h4>
              <div className="flex flex-wrap gap-3">
                <Button disabled>Disabled</Button>
                <Button>
                  <Mail className="mr-2 h-4 w-4" />
                  С иконкой
                </Button>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Добавить
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cards Section */}
        <Card>
          <CardHeader>
            <CardTitle>Карточки</CardTitle>
            <CardDescription>Различные размеры и стили карточек</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-muted">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Маленькая карточка</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Компактный размер для списков
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Стандартная карточка</CardTitle>
                  <CardDescription>Описание</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">Обычный размер для основного контента</p>
                </CardContent>
              </Card>

              <Card className="border-2 border-primary">
                <CardHeader>
                  <CardTitle>Выделенная карточка</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">Карточка с акцентом</p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Input Fields Section */}
        <Card>
          <CardHeader>
            <CardTitle>Поля ввода</CardTitle>
            <CardDescription>Текстовые поля и формы</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="text-input">Текстовое поле</Label>
                <Input id="text-input" placeholder="Введите текст..." />
              </div>

              <div>
                <Label htmlFor="email-input">Email</Label>
                <Input id="email-input" type="email" placeholder="example@email.com" />
              </div>

              <div>
                <Label htmlFor="password-input">Пароль</Label>
                <Input id="password-input" type="password" placeholder="••••••••" />
              </div>

              <div>
                <Label htmlFor="search-input">Поиск</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="search-input" className="pl-10" placeholder="Поиск..." />
                </div>
              </div>

              <div>
                <Label htmlFor="textarea">Текстовая область</Label>
                <Textarea id="textarea" placeholder="Введите многострочный текст..." rows={4} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Form Controls Section */}
        <Card>
          <CardHeader>
            <CardTitle>Элементы управления</CardTitle>
            <CardDescription>Select, Switch, RadioGroup</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label>Select (выпадающий список)</Label>
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

              <div className="flex items-center space-x-3">
                <Switch id="toggle" />
                <Label htmlFor="toggle">Переключатель</Label>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Radio Group (переключатели)</Label>
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

        {/* Badges Section */}
        <Card>
          <CardHeader>
            <CardTitle>Значки (Badges)</CardTitle>
            <CardDescription>Метки статуса и категории</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-sm mb-3">Базовые варианты</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge>Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                  <Badge variant="outline">Outline</Badge>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold text-sm mb-3">Со статусами</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-green-600 hover:bg-green-700">Активен</Badge>
                  <Badge className="bg-yellow-600 hover:bg-yellow-700">Ожидание</Badge>
                  <Badge className="bg-blue-600 hover:bg-blue-700">В процессе</Badge>
                  <Badge className="bg-gray-600 hover:bg-gray-700">Неактивен</Badge>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold text-sm mb-3">С иконками</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge>
                    <Star className="mr-1 h-3 w-3" />
                    Избранное
                  </Badge>
                  <Badge variant="secondary">
                    <Heart className="mr-1 h-3 w-3" />
                    Нравится
                  </Badge>
                  <Badge variant="destructive">
                    <Trash2 className="mr-1 h-3 w-3" />
                    Удалить
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Progress and Slider Section */}
        <Card>
          <CardHeader>
            <CardTitle>Прогресс и слайдер</CardTitle>
            <CardDescription>Индикаторы и ползунки</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Progress Bar</Label>
                <div className="space-y-2">
                  <Progress value={33} />
                  <Progress value={66} />
                  <Progress value={100} />
                </div>
              </div>

              <Separator />

              <div>
                <Label className="mb-4 block">Slider ({sliderValue[0]}%)</Label>
                <Slider
                  value={sliderValue}
                  onValueChange={setSliderValue}
                  max={100}
                  step={1}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs Section */}
        <Card>
          <CardHeader>
            <CardTitle>Вкладки</CardTitle>
            <CardDescription>Навигация по вкладкам</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="tab1" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="tab1">Вкладка 1</TabsTrigger>
                <TabsTrigger value="tab2">Вкладка 2</TabsTrigger>
                <TabsTrigger value="tab3">Вкладка 3</TabsTrigger>
              </TabsList>

              <TabsContent value="tab1" className="space-y-4 mt-4">
                <h4 className="font-semibold">Содержание вкладки 1</h4>
                <p className="text-sm text-muted-foreground">
                  Это содержимое первой вкладки. Вы можете добавить сюда любой контент.
                </p>
              </TabsContent>

              <TabsContent value="tab2" className="space-y-4 mt-4">
                <h4 className="font-semibold">Содержание вкладки 2</h4>
                <p className="text-sm text-muted-foreground">
                  Это содержимое второй вкладки с другой информацией.
                </p>
              </TabsContent>

              <TabsContent value="tab3" className="space-y-4 mt-4">
                <h4 className="font-semibold">Содержание вкладки 3</h4>
                <p className="text-sm text-muted-foreground">
                  Это содержимое третьей вкладки.
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Accordion Section */}
        <Card>
          <CardHeader>
            <CardTitle>Аккордеон</CardTitle>
            <CardDescription>Раскрывающиеся секции</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger>Что такое Shadcn UI?</AccordionTrigger>
                <AccordionContent>
                  Shadcn UI - это коллекция переиспользуемых компонентов, построенных с использованием Radix UI и
                  Tailwind CSS. Компоненты полностью кастомизируемы и готовы к использованию.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2">
                <AccordionTrigger>Как установить компоненты?</AccordionTrigger>
                <AccordionContent>
                  Компоненты можно установить через CLI команду или скопировать код напрямую в ваш проект.
                  Каждый компонент полностью независим и может использоваться отдельно.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3">
                <AccordionTrigger>Можно ли кастомизировать стили?</AccordionTrigger>
                <AccordionContent>
                  Да, все компоненты полностью кастомизируемы через Tailwind CSS классы. Вы можете изменять
                  цвета, размеры, отступы и любые другие стили.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4">
                <AccordionTrigger>Какие компоненты доступны?</AccordionTrigger>
                <AccordionContent>
                  Доступны кнопки, карточки, поля ввода, выпадающие списки, модальные окна, вкладки,
                  аккордеоны, слайдеры, прогресс-бары, значки, разделители и многое другое.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* Dropdown Menu Section */}
        <Card>
          <CardHeader>
            <CardTitle>Выпадающее меню</CardTitle>
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

        {/* Dialog Section */}
        <Card>
          <CardHeader>
            <CardTitle>Диалоговое окно</CardTitle>
            <CardDescription>Модальные окна и подтверждения</CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Отмена
                  </Button>
                  <Button onClick={() => setDialogOpen(false)}>Подтвердить</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Separator Section */}
        <Card>
          <CardHeader>
            <CardTitle>Разделители</CardTitle>
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

        {/* Grid Layouts Section */}
        <Card>
          <CardHeader>
            <CardTitle>Сетки (Grid Layouts)</CardTitle>
            <CardDescription>Различные варианты раскладок</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div>
              <h4 className="font-semibold text-sm mb-3">2 колонки</h4>
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-muted">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Блок 1</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Блок 2</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="font-semibold text-sm mb-3">3 колонки</h4>
              <div className="grid grid-cols-3 gap-4">
                <Card className="bg-muted">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Блок 1</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Блок 2</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Блок 3</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="font-semibold text-sm mb-3">Адаптивная сетка (1 → 2 → 4 колонки)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i} className="bg-muted">
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground">Блок {i}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Typography Section */}
        <Card>
          <CardHeader>
            <CardTitle>Типография</CardTitle>
            <CardDescription>Заголовки и текстовые стили</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h1 className="text-4xl font-bold">Заголовок H1 (4xl)</h1>
              <p className="text-sm text-muted-foreground">Самый крупный заголовок</p>
            </div>

            <Separator />

            <div>
              <h2 className="text-3xl font-bold">Заголовок H2 (3xl)</h2>
              <p className="text-sm text-muted-foreground">Крупный заголовок</p>
            </div>

            <Separator />

            <div>
              <h3 className="text-2xl font-bold">Заголовок H3 (2xl)</h3>
              <p className="text-sm text-muted-foreground">Средний заголовок</p>
            </div>

            <Separator />

            <div>
              <h4 className="text-xl font-bold">Заголовок H4 (xl)</h4>
              <p className="text-sm text-muted-foreground">Маленький заголовок</p>
            </div>

            <Separator />

            <div>
              <p className="text-base">Обычный текст (base)</p>
              <p className="text-sm text-muted-foreground">Маленький текст (sm)</p>
              <p className="text-xs text-muted-foreground">Очень маленький текст (xs)</p>
            </div>

            <Separator />

            <div>
              <p className="font-bold">Жирный текст</p>
              <p className="font-semibold">Полужирный текст</p>
              <p className="italic">Курсивный текст</p>
              <p className="underline">Подчеркнутый текст</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ComponentsShowcase;
