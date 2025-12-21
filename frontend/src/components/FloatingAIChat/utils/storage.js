/**
 * Утилиты работы с localStorage для чата
 * ЗАЧЕМ: Сохранение и загрузка состояния чата
 */

export const loadMessages = () => {
  const saved = localStorage.getItem('floatingAIChatMessages');
  return saved ? JSON.parse(saved) : [{
    role: 'assistant',
    content: '👋 Привет! Я AI-ассистент Gemini. Могу помочь с анализом опционов, объяснить стратегии и риски. Задавай вопросы!',
    timestamp: new Date().toISOString()
  }];
};

export const saveMessages = (messages) => {
  localStorage.setItem('floatingAIChatMessages', JSON.stringify(messages));
};

export const loadChatState = () => {
  const saved = localStorage.getItem('floatingAIChatOpen');
  return saved ? JSON.parse(saved) : false;
};

export const saveChatState = (isOpen) => {
  localStorage.setItem('floatingAIChatOpen', JSON.stringify(isOpen));
};

export const loadPosition = () => {
  const saved = localStorage.getItem('floatingAIChatPosition');
  return saved ? JSON.parse(saved) : { x: window.innerWidth - 420, y: window.innerHeight - 620 };
};

export const savePosition = (position) => {
  localStorage.setItem('floatingAIChatPosition', JSON.stringify(position));
};

export const loadSize = () => {
  const saved = localStorage.getItem('floatingAIChatSize');
  return saved ? JSON.parse(saved) : { width: 400, height: 600 };
};

export const saveSize = (size) => {
  localStorage.setItem('floatingAIChatSize', JSON.stringify(size));
};
