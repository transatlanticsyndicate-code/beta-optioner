import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Loader } from 'lucide-react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

/**
 * AIChat - AI ассистент для анализа опционных стратегий
 */
function AIChat({ positions, currentPrice, greeks, metrics }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '👋 Привет! Я AI-ассистент по опционам. Могу помочь с анализом позиций, объяснить стратегии и риски. Задавай вопросы!',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const messagesEndRef = useRef(null);

  // Автоскролл к последнему сообщению
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Отправка сообщения
  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = {
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await axios.post('/api/ai/chat', {
        message: input,
        positions: positions.map(pos => ({
          ...pos,
          ticker: currentPrice?.symbol || pos.ticker
        })),
        currentPrice: currentPrice ? {
          symbol: currentPrice.symbol,
          price: currentPrice.price,
          change: currentPrice.change,
          change_percent: currentPrice.change_percent
        } : null,
        greeks: greeks || null,
        metrics: metrics || null
      });

      const aiMessage = {
        role: 'assistant',
        content: response.data.message,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      
      const errorMessage = {
        role: 'assistant',
        content: '❌ Ошибка при обработке запроса. Проверьте настройки Gemini API.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // Получить автоматические рекомендации
  const getSuggestions = async () => {
    if (loadingSuggestions || positions.length === 0) return;

    setLoadingSuggestions(true);

    try {
      const response = await axios.post('/api/ai/suggestions', {
        positions: positions.map(pos => ({
          ...pos,
          ticker: currentPrice?.symbol || pos.ticker
        })),
        currentPrice: currentPrice ? {
          symbol: currentPrice.symbol,
          price: currentPrice.price,
          change: currentPrice.change,
          change_percent: currentPrice.change_percent
        } : null,
        greeks: greeks || null,
        metrics: metrics || null
      });

      const suggestionsMessage = {
        role: 'assistant',
        content: `📊 **Анализ портфеля:**\n\n${response.data.suggestions}`,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, suggestionsMessage]);
    } catch (error) {
      console.error('Error getting suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Обработка Enter
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 flex flex-col h-[600px]">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold">AI Assistant</h3>
          </div>
          <button
            onClick={getSuggestions}
            disabled={loadingSuggestions || positions.length === 0}
            className="flex items-center gap-1 px-3 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:opacity-50 rounded text-xs font-semibold transition-all"
            title="Получить рекомендации"
          >
            {loadingSuggestions ? (
              <Loader className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            <span>Analyze</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#374151] border border-gray-600'
              }`}
            >
              <div className="text-sm leading-relaxed">
                {msg.role === 'assistant' ? (
                  <div className="markdown-content text-gray-200">
                    <ReactMarkdown
                      components={{
                        p: ({node, ...props}) => <p className="mb-3 last:mb-0 text-gray-200" {...props} />,
                        ul: ({node, ...props}) => <ul className="list-disc ml-6 mb-3 space-y-1.5 text-gray-200" {...props} />,
                        ol: ({node, ...props}) => <ol className="list-decimal ml-6 mb-3 space-y-1.5 text-gray-200" {...props} />,
                        li: ({node, ...props}) => <li className="text-gray-200 leading-relaxed" {...props} />,
                        strong: ({node, ...props}) => <strong className="font-bold text-white" {...props} />,
                        em: ({node, ...props}) => <em className="italic text-gray-300" {...props} />,
                        code: ({node, inline, ...props}) => 
                          inline ? (
                            <code className="bg-gray-700 px-1.5 py-0.5 rounded text-xs text-blue-300 font-mono" {...props} />
                          ) : (
                            <code className="block bg-gray-800 p-3 rounded text-xs my-2 text-green-300 font-mono overflow-x-auto" {...props} />
                          ),
                        pre: ({node, ...props}) => <pre className="bg-gray-800 p-3 rounded my-2 overflow-x-auto" {...props} />,
                        h1: ({node, ...props}) => <h1 className="text-lg font-bold mb-3 text-white" {...props} />,
                        h2: ({node, ...props}) => <h2 className="text-base font-bold mb-2 text-white" {...props} />,
                        h3: ({node, ...props}) => <h3 className="text-sm font-semibold mb-2 text-gray-100" {...props} />,
                        blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-300 my-2" {...props} />,
                        a: ({node, ...props}) => <a className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer" {...props} />,
                        hr: ({node, ...props}) => <hr className="border-gray-600 my-3" {...props} />,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap text-white">{msg.content}</span>
                )}
              </div>
              <div className="text-xs opacity-50 mt-1">
                {msg.timestamp.toLocaleTimeString('ru-RU', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </div>
            </div>

            {msg.role === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-gray-700 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Loader className="w-4 h-4 animate-spin text-blue-400" />
                <span className="text-sm text-gray-400">Думаю...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Спроси меня о стратегиях, рисках, греках..."
            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:opacity-50 rounded transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        
        {/* Quick questions */}
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            'Объясни мои риски',
            'Что такое Delta?',
            'Как улучшить портфель?'
          ].map((question, index) => (
            <button
              key={index}
              onClick={() => setInput(question)}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-300 transition-all"
            >
              {question}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AIChat;
