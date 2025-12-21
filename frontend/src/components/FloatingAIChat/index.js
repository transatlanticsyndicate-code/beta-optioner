/**
 * FloatingAIChat - Плавающий AI-ассистент, доступный на всех страницах
 * ЗАЧЕМ: Помощь пользователям с анализом опционов и стратегий
 * Затрагивает: все страницы приложения
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Trash2, Loader, X, Minimize2, GripVertical } from 'lucide-react';
import axios from 'axios';
import { Rnd } from 'react-rnd';
import ReactMarkdown from 'react-markdown';
import { loadMessages, saveMessages, loadChatState, saveChatState, loadPosition, savePosition, loadSize, saveSize } from './utils/storage';
import { getPageContext } from './utils/context';
import { useTextSelection } from './hooks/useTextSelection';
import { ChatButton } from './components';

function FloatingAIChat() {
  const [messages, setMessages] = useState(loadMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(loadChatState);
  const [isMinimized, setIsMinimized] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [position, setPosition] = useState(loadPosition);
  const [size, setSize] = useState(loadSize);
  const messagesEndRef = useRef(null);
  const { selectedText, showQuoteButton, clearSelection } = useTextSelection();

  useEffect(() => { saveMessages(messages); }, [messages]);
  useEffect(() => { saveChatState(isOpen); }, [isOpen]);
  useEffect(() => { savePosition(position); }, [position]);
  useEffect(() => { saveSize(size); }, [size]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (isOpen) setUnreadCount(0); }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { role: 'user', content: input, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await axios.post('/api/ai/chat', {
        message: input,
        context: getPageContext(),
        history: messages.slice(-10)
      });

      const aiMessage = { role: 'assistant', content: response.data.message, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, aiMessage]);
      if (!isOpen) setUnreadCount(prev => prev + 1);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = { role: 'assistant', content: '❌ Ошибка при обработке запроса. Проверьте настройки Gemini API.', timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearHistory = () => {
    if (window.confirm('Очистить историю чата?')) {
      setMessages([{ role: 'assistant', content: '👋 История очищена. Чем могу помочь?', timestamp: new Date().toISOString() }]);
    }
  };

  const handleQuoteText = () => {
    if (selectedText) {
      setInput(`"${selectedText}"\n\n`);
      setIsOpen(true);
      clearSelection();
    }
  };

  if (!isOpen) return <ChatButton onClick={() => setIsOpen(true)} unreadCount={unreadCount} />;

  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 bg-card rounded-lg shadow-xl border border-border p-3 flex items-center gap-3 cursor-pointer hover:bg-accent transition-all z-50" onClick={() => setIsMinimized(false)}>
        <Bot className="w-5 h-5 text-primary" />
        <span className="text-sm font-semibold text-foreground">AI Assistant</span>
        <button onClick={(e) => { e.stopPropagation(); setIsOpen(false); setIsMinimized(false); }} className="ml-2 p-1 hover:bg-accent rounded transition-all">
          <X className="w-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <Rnd
      size={{ width: size.width, height: size.height }}
      position={{ x: position.x, y: position.y }}
      onDragStop={(e, d) => setPosition({ x: d.x, y: d.y })}
      onResizeStop={(e, direction, ref, delta, pos) => {
        setSize({ width: parseInt(ref.style.width), height: parseInt(ref.style.height) });
        setPosition(pos);
      }}
      minWidth={320} minHeight={400} maxWidth={800} maxHeight={window.innerHeight - 100}
      bounds="window" dragHandleClassName="drag-handle" className="z-50" style={{ zIndex: 9999 }}
    >
      <div className="bg-card rounded-lg border border-border shadow-2xl flex flex-col h-full">
        <div className="drag-handle p-3 border-b border-border cursor-move bg-card rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GripVertical className="w-4 h-4 text-muted-foreground" />
              <Bot className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">AI Assistant (Gemini)</h3>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={clearHistory} className="p-1.5 hover:bg-accent rounded transition-all" title="Очистить историю">
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </button>
              <button onClick={() => setIsMinimized(true)} className="p-1.5 hover:bg-accent rounded transition-all" title="Свернуть">
                <Minimize2 className="w-4 h-4 text-muted-foreground" />
              </button>
              <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-accent rounded transition-all" title="Закрыть (Cmd+K)">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><Bot className="w-4 h-4 text-primary" /></div>}
              <div className={`max-w-[80%] rounded-lg p-3 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                {msg.role === 'assistant' ? <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">{msg.content}</ReactMarkdown> : <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
              </div>
              {msg.role === 'user' && <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0"><User className="w-4 h-4 text-primary-foreground" /></div>}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><Bot className="w-4 h-4 text-primary" /></div>
              <div className="bg-muted rounded-lg p-3"><Loader className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Задайте вопрос... (Enter для отправки)"
              className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              rows={2}
            />
            <button onClick={handleSend} disabled={!input.trim() || loading} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </Rnd>
  );
}

export default FloatingAIChat;
