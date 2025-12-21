/**
 * Константы для страницы просмотра анализа
 * ЗАЧЕМ: Централизованное хранение CSS стилей и конфигурации
 * Затрагивает: стили markdown, настройки отображения
 */

// CSS стили для markdown контента
// ЗАЧЕМ: Красивое форматирование AI анализа с поддержкой всех элементов markdown
export const MARKDOWN_STYLES = `
  .prose h1, .prose h2, .prose h3, .prose h4 {
    font-weight: 700;
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
    color: #111827;
  }
  .prose h1 { font-size: 1.5rem; }
  .prose h2 { font-size: 1.25rem; }
  .prose h3 { font-size: 1.125rem; }
  .prose h4 { font-size: 1rem; }
  .prose p {
    margin-bottom: 1rem;
  }
  .prose ul, .prose ol {
    margin-left: 1.5rem;
    margin-bottom: 1rem;
  }
  .prose li {
    margin-bottom: 0.5rem;
  }
  .prose strong {
    font-weight: 600;
    color: #111827;
  }
  .prose code {
    background: #f3f4f6;
    padding: 0.2rem 0.4rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
  }
  .prose pre {
    background: #f8fafc;
    color: #1f2937;
    border: 1px solid #e2e8f0;
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }
  .prose pre code {
    background: transparent;
    padding: 0;
    color: inherit;
  }
  .prose details {
    margin: 1rem 0;
    padding: 1rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
  }
  .prose summary {
    cursor: pointer;
    font-weight: 600;
    color: #111827;
    user-select: none;
  }
  .prose summary:hover {
    color: #667eea;
  }
  .prose details[open] summary {
    margin-bottom: 0.75rem;
  }
  .prose hr {
    display: none;
  }
`;

// Настройки prose для markdown
// ЗАЧЕМ: Конфигурация размера шрифта и межстрочного интервала
export const PROSE_CONFIG = {
  fontSize: '1rem',
  lineHeight: '1.75',
  color: '#1f2937'
};
