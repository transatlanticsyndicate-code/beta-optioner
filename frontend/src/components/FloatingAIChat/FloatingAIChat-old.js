import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Trash2, Loader, X, Minimize2, Maximize2, GripVertical, Quote } from 'lucide-react';
import axios from 'axios';
import { Rnd } from 'react-rnd';
import ReactMarkdown from 'react-markdown';

/**
 * FloatingAIChat - Плавающий AI-ассистент, доступный на всех страницах
 */
function FloatingAIChat() {
  // State для чата
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('floatingAIChatMessages');
    return saved ? JSON.parse(saved) : [
      {
        role: 'assistant',
        content: '👋 Привет! Я AI-ассистент Gemini. Могу помочь с анализом опционов, объяснить стратегии и риски. Задавай вопросы!',
        timestamp: new Date().toISOString()
      }
    ];
  });
  
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('floatingAIChatOpen');
    return saved ? JSON.parse(saved) : false;
  });
  const [isMinimized, setIsMinimized] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // State для выделенного текста
  const [selectedText, setSelectedText] = useState('');
  const [selectionPosition, setSelectionPosition] = useState({ x: 0, y: 0 });
  const [showQuoteButton, setShowQuoteButton] = useState(false);
  
  // State для позиции и размера
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('floatingAIChatPosition');
    return saved ? JSON.parse(saved) : { x: window.innerWidth - 420, y: window.innerHeight - 620 };
  });
  
  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem('floatingAIChatSize');
    return saved ? JSON.parse(saved) : { width: 400, height: 600 };
  });
  
  const messagesEndRef = useRef(null);

  // Сохранение сообщений в localStorage
  useEffect(() => {
    localStorage.setItem('floatingAIChatMessages', JSON.stringify(messages));
  }, [messages]);

  // Сохранение состояния открытия
  useEffect(() => {
    localStorage.setItem('floatingAIChatOpen', JSON.stringify(isOpen));
  }, [isOpen]);

  // Сохранение позиции
  useEffect(() => {
    localStorage.setItem('floatingAIChatPosition', JSON.stringify(position));
  }, [position]);

  // Сохранение размера
  useEffect(() => {
    localStorage.setItem('floatingAIChatSize', JSON.stringify(size));
  }, [size]);

  // Автоскролл к последнему сообщению
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Сброс счетчика непрочитанных при открытии
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
    }
  }, [isOpen]);

  // Получить контекст текущей страницы
  const getPageContext = () => {
    const path = window.location.pathname;
    const contexts = {
      '/tools/options-calculator': 'Пользователь находится на странице калькулятора опционов',
      '/tools/options-analyzer': 'Пользователь находится на странице анализатора опционов',
      '/': 'Пользователь находится на главной странице'
    };
    return contexts[path] || `Пользователь находится на странице: ${path}`;
  };

  // Отправка сообщения
  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await axios.post('/api/ai/chat', {
        message: input,
        context: getPageContext(),
        history: messages.slice(-10) // Последние 10 сообщений для контекста
      });

      const aiMessage = {
        role: 'assistant',
        content: response.data.message,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, aiMessage]);
      
      // Увеличить счетчик непрочитанных, если чат закрыт
      if (!isOpen) {
        setUnreadCount(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      
      const errorMessage = {
        role: 'assistant',
        content: '❌ Ошибка при обработке запроса. Проверьте настройки Gemini API.',
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // Обработка Enter (Shift+Enter для новой строки, Enter для отправки)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Очистить историю
  const clearHistory = () => {
    if (window.confirm('Очистить историю чата?')) {
      setMessages([
        {
          role: 'assistant',
          content: '👋 История очищена. Чем могу помочь?',
          timestamp: new Date().toISOString()
        }
      ]);
    }
  };

  // Обработчик выделения текста
  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      
      if (text && text.length > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        setSelectedText(text);
        setSelectionPosition({
          x: rect.left + rect.width / 2,
          y: rect.top - 10
        });
        setShowQuoteButton(true);
      } else {
        setShowQuoteButton(false);
      }
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('keyup', handleSelection);
    
    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('keyup', handleSelection);
    };
  }, []);

  // Функция цитирования текста
  const handleQuoteText = () => {
    if (selectedText) {
      setInput(`"${selectedText}"\n\n`);
      setIsOpen(true);
      setShowQuoteButton(false);
      window.getSelection()?.removeAllRanges();
    }
  };

  // Горячие клавиши
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd+K или Ctrl+K для открытия/закрытия
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Плавающая кнопка
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group z-50"
        style={{ background: 'linear-gradient(to bottom right, rgb(27, 186, 207), rgb(147, 236, 248))' }}
        title="Открыть AI-ассистент (Cmd+K)"
      >
        <Bot className="w-7 h-7 text-white group-hover:scale-110 transition-transform" />
        {unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-destructive rounded-full flex items-center justify-center text-xs font-bold text-white">
            {unreadCount}
          </div>
        )}
        <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ backgroundColor: 'rgb(27, 186, 207)' }}></div>
      </button>
    );
  }

  // Минимизированное состояние
  if (isMinimized) {
    return (
      <div
        className="fixed bottom-6 right-6 bg-card rounded-lg shadow-xl border border-border p-3 flex items-center gap-3 cursor-pointer hover:bg-accent transition-all z-50"
        onClick={() => setIsMinimized(false)}
      >
        <Bot className="w-5 h-5 text-primary" />
        <span className="text-sm font-semibold text-foreground">AI Assistant</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
            setIsMinimized(false);
          }}
          className="ml-2 p-1 hover:bg-accent rounded transition-all"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  // Полное окно чата
  return (
    <Rnd
      size={{ width: size.width, height: size.height }}
      position={{ x: position.x, y: position.y }}
      onDragStop={(e, d) => {
        setPosition({ x: d.x, y: d.y });
      }}
      onResizeStop={(e, direction, ref, delta, position) => {
        setSize({
          width: parseInt(ref.style.width),
          height: parseInt(ref.style.height)
        });
        setPosition(position);
      }}
      minWidth={320}
      minHeight={400}
      maxWidth={800}
      maxHeight={window.innerHeight - 100}
      bounds="window"
      dragHandleClassName="drag-handle"
      className="z-50"
      style={{ zIndex: 9999 }}
    >
      <div className="bg-card rounded-lg border border-border shadow-2xl flex flex-col h-full">
        {/* Header */}
        <div className="drag-handle p-3 border-b border-border cursor-move bg-card rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GripVertical className="w-4 h-4 text-muted-foreground" />
              <Bot className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">AI Assistant (Gemini)</h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearHistory}
                className="p-1.5 hover:bg-accent rounded transition-all"
                title="Очистить историю"
              >
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => setIsMinimized(true)}
                className="p-1.5 hover:bg-accent rounded transition-all"
                title="Минимизировать"
              >
                <Minimize2 className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-accent rounded transition-all"
                title="Закрыть (Cmd+K)"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(to bottom right, rgb(27, 186, 207), rgb(147, 236, 248))' }}>
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}
              
              <div
                className={`max-w-[75%] rounded-lg p-3 ${
                  msg.role === 'user'
                    ? 'text-primary-foreground'
                    : 'bg-muted border border-border'
                }`}
                style={msg.role === 'user' ? { backgroundColor: 'rgb(27, 186, 207)' } : {}}
              >
                <div className="text-sm leading-relaxed">
                  {msg.role === 'assistant' ? (
                    <div className="markdown-content text-foreground">
                      <ReactMarkdown
                        components={{
                          p: ({node, ...props}) => <p className="mb-3 last:mb-0 text-foreground" {...props} />,
                          ul: ({node, ...props}) => <ul className="list-disc ml-6 mb-3 space-y-1.5 text-foreground" {...props} />,
                          ol: ({node, ...props}) => <ol className="list-decimal ml-6 mb-3 space-y-1.5 text-foreground" {...props} />,
                          li: ({node, ...props}) => <li className="text-foreground leading-relaxed" {...props} />,
                          strong: ({node, ...props}) => <strong className="font-bold text-foreground" {...props} />,
                          em: ({node, ...props}) => <em className="italic text-muted-foreground" {...props} />,
                          code: ({node, inline, ...props}) => 
                            inline ? (
                              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono" style={{ color: 'rgb(27, 186, 207)' }} {...props} />
                            ) : (
                              <code className="block bg-muted p-3 rounded text-xs my-2 font-mono overflow-x-auto" style={{ color: 'rgb(90, 215, 231)' }} {...props} />
                            ),
                          pre: ({node, ...props}) => <pre className="bg-muted p-3 rounded my-2 overflow-x-auto" {...props} />,
                          h1: ({node, ...props}) => <h1 className="text-lg font-bold mb-3 text-foreground" {...props} />,
                          h2: ({node, ...props}) => <h2 className="text-base font-bold mb-2 text-foreground" {...props} />,
                          h3: ({node, ...props}) => <h3 className="text-sm font-semibold mb-2 text-foreground" {...props} />,
                          blockquote: ({node, ...props}) => <blockquote className="border-l-4 pl-4 italic text-muted-foreground my-2" style={{ borderColor: 'rgb(27, 186, 207)' }} {...props} />,
                          a: ({node, ...props}) => <a className="hover:underline" style={{ color: 'rgb(27, 186, 207)' }} target="_blank" rel="noopener noreferrer" {...props} />,
                          hr: ({node, ...props}) => <hr className="border-border my-3" {...props} />,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap text-primary-foreground">{msg.content}</span>
                  )}
                </div>
                <div className="text-xs opacity-50 mt-1">
                  {new Date(msg.timestamp).toLocaleTimeString('ru-RU', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </div>
              </div>

              {msg.role === 'user' && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                  <User className="w-4 h-4 text-foreground" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-2 justify-start">
              <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(to bottom right, rgb(27, 186, 207), rgb(147, 236, 248))' }}>
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-muted border border-border rounded-lg p-3">
                <Loader className="w-4 h-4 animate-spin" style={{ color: 'rgb(27, 186, 207)' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-border bg-card rounded-b-lg">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Спроси меня о чём угодно... (Shift+Enter для новой строки)"
              className="flex-1 px-3 py-2 bg-background border border-border rounded text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none min-h-[40px] max-h-[120px]"
              disabled={loading}
              rows={1}
              style={{
                height: 'auto',
                overflowY: input.split('\n').length > 3 ? 'auto' : 'hidden'
              }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="px-3 py-2 rounded transition-all disabled:opacity-50 flex-shrink-0"
              style={{ backgroundColor: 'rgb(27, 186, 207)', color: 'white' }}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          
          {/* Quick questions */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              'Объясни мои риски',
              'Что такое Delta?',
              'Как улучшить портфель?'
            ].map((question, index) => (
              <button
                key={index}
                onClick={() => setInput(question)}
                className="px-2 py-1 bg-muted hover:bg-accent rounded text-xs text-foreground transition-all border border-border"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Кнопка цитирования при выделении текста */}
      {showQuoteButton && (
        <button
          onClick={handleQuoteText}
          className="fixed z-[10000] px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 transition-all hover:scale-105"
          style={{
            left: `${selectionPosition.x}px`,
            top: `${selectionPosition.y}px`,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'rgb(27, 186, 207)',
            color: 'white'
          }}
          title="Процитировать в чат"
        >
          <Quote className="w-4 h-4" />
          <span className="text-sm font-medium">Спросить AI</span>
        </button>
      )}
    </Rnd>
  );
}

export default FloatingAIChat;
