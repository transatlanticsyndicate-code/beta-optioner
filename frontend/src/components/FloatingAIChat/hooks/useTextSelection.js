/**
 * Хук для работы с выделением текста
 * ЗАЧЕМ: Цитирование выделенного текста в чате
 */

import { useState, useEffect } from 'react';

export function useTextSelection() {
  const [selectedText, setSelectedText] = useState('');
  const [selectionPosition, setSelectionPosition] = useState({ x: 0, y: 0 });
  const [showQuoteButton, setShowQuoteButton] = useState(false);

  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      
      if (text && text.length > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        setSelectedText(text);
        setSelectionPosition({ x: rect.left + rect.width / 2, y: rect.top - 10 });
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

  const clearSelection = () => {
    setShowQuoteButton(false);
    window.getSelection()?.removeAllRanges();
  };

  return { selectedText, selectionPosition, showQuoteButton, clearSelection };
}
