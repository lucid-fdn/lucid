'use client';

import { Button } from '@/components/ui/button';
import { ArrowUp, Square, Paperclip, X, Image as ImageIcon, FileText, Upload } from 'lucide-react';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
} from '@/ui/components/prompt-input';
import {
  FileUpload,
  FileUploadContent,
  FileUploadTrigger,
} from '@/ui/components/file-upload';
import type { FileUIPart } from '@/lib/ai/attachments';
import { isImageType, isPDFType } from '@/lib/ai/attachments';
import { useEffect, useRef, useState } from 'react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value?: string) => void;
  onStop?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** File attachments for multi-modal support */
  files?: FileUIPart[];
  onFilesChange?: (files: FileUIPart[]) => void;
  /** Accept string for file input (model-dependent) */
  accept?: string;
  flat?: boolean;
  hideShortcutHint?: boolean;
  containerClassName?: string;
  promptClassName?: string;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isLoading,
  disabled,
  placeholder = 'Type a message...',
  files = [],
  onFilesChange,
  accept,
  flat = false,
  hideShortcutHint = false,
  containerClassName,
  promptClassName,
}: ChatInputProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const updateValue = (nextValue: string) => {
    setDraftValue(nextValue);
    onChange(nextValue);
  };

  const submitValue = (nextValue?: string) => {
    const latestValue = nextValue ?? rootRef.current?.querySelector('textarea')?.value ?? draftValue;
    const trimmed = latestValue.trim();
    if (!trimmed) return;
    onSubmit(latestValue);
  };

  const handleDroppedFiles = async (droppedFiles: File[]) => {
    if (!onFilesChange) return;
    const { convertFilesToDataURLs } = await import('@/lib/ai/attachments');
    const fileList = Object.assign(droppedFiles, {
      item: (i: number) => droppedFiles[i],
    }) as unknown as FileList;
    const newParts = await convertFilesToDataURLs(fileList);
    onFilesChange([...files, ...newParts]);
  };

  const removeFile = (index: number) => {
    if (!onFilesChange) return;
    onFilesChange(files.filter((_, i) => i !== index));
  };

  return (
    <FileUpload
      onFilesAdded={handleDroppedFiles}
      accept={accept}
      disabled={disabled || !onFilesChange}
    >
      {/* Drag-and-drop overlay */}
      <FileUploadContent>
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/40 bg-background p-8">
          <Upload className="h-10 w-10 text-primary/60" />
          <p className="text-lg font-medium">Drop files here</p>
          <p className="text-sm text-muted-foreground">
            {accept === 'image/png,image/jpeg,image/gif,image/webp'
              ? 'PNG, JPEG, GIF, and WebP images'
              : 'Images, PDFs, and documents'}
          </p>
        </div>
      </FileUploadContent>

      <div ref={rootRef} className={flat ? `p-4 ${containerClassName ?? ''}`.trim() : `border-t bg-background/60 backdrop-blur-sm p-4 ${containerClassName ?? ''}`.trim()}>
        <div className={flat ? 'mx-0 max-w-none' : 'max-w-3xl mx-auto'}>
          {/* File previews */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {files.map((file, idx) => (
                <div
                  key={`${file.filename}-${idx}`}
                  className="relative group flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-xs"
                >
                  {isImageType(file.mediaType) ? (
                    <ImageIcon className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                  ) : isPDFType(file.mediaType) ? (
                    <FileText className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="max-w-[120px] truncate">{file.filename || 'file'}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <PromptInput
            value={draftValue}
            onValueChange={updateValue}
            onSubmit={(nextValue) => {
              submitValue(nextValue);
            }}
            isLoading={isLoading}
            maxHeight={200}
            className={`${flat ? '!bg-sidebar/60 backdrop-blur-sm' : '!bg-sidebar/60 backdrop-blur-sm'} ${promptClassName ?? ''}`.trim()}
          >
            <PromptInputTextarea
              className="!bg-transparent"
              placeholder={placeholder}
              disabled={disabled}
            />

            <PromptInputActions className="justify-between">
              <div className="flex items-center gap-1">
                {/* File upload via button - hidden when uploads not supported */}
                {onFilesChange && (
                  <PromptInputAction tooltip="Attach file">
                    <FileUploadTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={disabled || isLoading}
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                    </FileUploadTrigger>
                  </PromptInputAction>
                )}
              </div>

              {isLoading ? (
                <PromptInputAction tooltip="Stop generation">
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={onStop}
                    aria-label="Stop generation"
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                </PromptInputAction>
              ) : (
                <PromptInputAction tooltip="Send message">
                  <Button
                    size="icon"
                    variant="default"
                    className="h-8 w-8 rounded-full"
                    aria-label="Send message"
                    onClick={(e) => {
                      e.stopPropagation();
                      submitValue();
                    }}
                    disabled={disabled}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                </PromptInputAction>
              )}
            </PromptInputActions>
          </PromptInput>

          {!hideShortcutHint ? (
            <div className="text-center mt-2 text-xs text-muted-foreground">
              Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Enter</kbd> to send,{' '}
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Shift + Enter</kbd> for new line
            </div>
          ) : null}
        </div>
      </div>
    </FileUpload>
  );
}
