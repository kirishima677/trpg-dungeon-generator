import { useEffect, useRef } from 'react';
import EasyMDE from 'easymde';
import 'easymde/dist/easymde.min.css';

interface MarkdownEasyMDEProps {
  value: string;
  onChange: (nextValue: string) => void;
}

export function MarkdownEasyMDE({ value, onChange }: MarkdownEasyMDEProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editorRef = useRef<EasyMDE | null>(null);
  const initialValueRef = useRef(value);

  useEffect(() => {
    if (!textareaRef.current) return;

    const editor = new EasyMDE({
      element: textareaRef.current,
      initialValue: initialValueRef.current,
      spellChecker: false,
      sideBySideFullscreen: false,
      status: false,
      toolbar: [
        'bold',
        'italic',
        'heading',
        '|',
        'quote',
        'unordered-list',
        'ordered-list',
        '|',
        'link',
        'table',
        'code',
        '|',
        'preview',
        'side-by-side',
      ],
    });
    editorRef.current = editor;

    const handleChange = () => {
      onChange(editor.value());
    };
    editor.codemirror.on('change', handleChange);

    return () => {
      editor.codemirror.off('change', handleChange);
      editor.toTextArea();
      editorRef.current = null;
    };
  }, [onChange]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.value() !== value) {
      editor.value(value);
    }
  }, [value]);

  return <textarea ref={textareaRef} />;
}
