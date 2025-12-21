/**
 * Компонент отображения AI анализа
 * ЗАЧЕМ: Рендеринг markdown контента с кастомными стилями
 * Затрагивает: отображение AI анализа
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { Card } from '../../../components/ui/card';
import { MARKDOWN_STYLES, PROSE_CONFIG } from '../constants';

export function AnalysisContent({ analysis }) {
  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold mb-4">🧠 AI Анализ</h2>
      <div className="prose prose-lg max-w-none" style={PROSE_CONFIG}>
        <style>{MARKDOWN_STYLES}</style>
        <ReactMarkdown rehypePlugins={[rehypeRaw]}>
          {analysis.ai_analysis}
        </ReactMarkdown>
      </div>
    </Card>
  );
}
