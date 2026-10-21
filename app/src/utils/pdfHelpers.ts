/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import * as pdfjsLib from 'pdfjs-dist';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
// Explicitly import the worker as a URL so Vite handles it correctly
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface PdfMetaData {
  thumbnail: string
  pageCount: number
  isLocked: boolean
}

// cMap（多言語文字の対応表）の置き場所。
// 元は公開サイト用に '/PaperKnife/cmaps/' 固定だったため、exe では見つからず
// 日本語PDFの文字が化けた。アプリ自身からの相対パスに直す。
export const getCMapUrl = () => './cmaps/';

/**
 * 保存。Windows の「名前を付けて保存」画面を出し、選ばれた場所に書き出す。
 * 取り消されたら false を返す（呼び出し側はエラー扱いしないこと）。
 */
export const downloadFile = async (
  data: Uint8Array | string,
  fileName: string,
  _mimeType: string
): Promise<boolean> => {
  const dotIndex = fileName.lastIndexOf('.')
  const extension = dotIndex >= 0 ? fileName.substring(dotIndex + 1) : 'pdf'

  const savePath = await save({
    defaultPath: fileName,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  })

  // ユーザーが「キャンセル」を押した
  if (!savePath) return false

  let bytes: Uint8Array
  if (typeof data === 'string') {
    if (data.startsWith('data:')) {
      const base64 = data.substring(data.indexOf(',') + 1)
      const binary = atob(base64)
      bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    } else {
      bytes = new TextEncoder().encode(data)
    }
  } else {
    bytes = data
  }

  await writeFile(savePath, bytes)
  return true
}

/**
 * Windows には「共有」に当たる操作が無いため、保存と同じ動きにする。
 * 呼び出し側の形を変えないために関数名は残す。
 */
export const shareFile = async (
  data: Uint8Array | string,
  fileName: string,
  mimeType: string
): Promise<boolean> => {
  return downloadFile(data, fileName, mimeType)
}

// Optimized: Load the PDF Document once
export const loadPdfDocument = async (file: File) => {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: getCMapUrl(),
      cMapPacked: true,
    });
    return await loadingTask.promise;
  } catch (error: any) {
    if (error.name === 'PasswordException') {
      throw error;
    }
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: getCMapUrl(),
      cMapPacked: true,
      stopAtErrors: false,
    });
    return await loadingTask.promise;
  }
};

/**
 * データ（File ではなく Uint8Array）から pdfjs の読み込み結果を作る。
 *
 * 重要1: pdfjs は渡されたデータを引き取ってしまい、渡した側では空になる。
 * ビューアーは同じデータを編集にも使い続けるため、必ず複製を渡す。
 *
 * 重要2: 少し壊れたPDFのための再試行は、上の loadPdfDocument と同じにする。
 * これを省くと「旧画面では開けたのに新しい画面では開けない」PDFが出る。
 */
export const loadPdfFromBytes = async (bytes: Uint8Array, password?: string) => {
  const base = {
    password: password || undefined,
    cMapUrl: getCMapUrl(),
    cMapPacked: true,
  };
  try {
    // slice() = 複製。これを外すと編集が壊れる
    return await pdfjsLib.getDocument({ data: bytes.slice(), ...base }).promise;
  } catch (error: any) {
    if (error.name === 'PasswordException') throw error; // パスワードは呼び出し側で扱う
    return await pdfjsLib.getDocument({
      data: bytes.slice(),
      ...base,
      stopAtErrors: false,
    }).promise;
  }
};

// Optimized: Render a specific page from an already loaded PDF Document
export const renderPageThumbnail = async (pdf: any, pageNum: number, scale = 1.0): Promise<string> => {
  try {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: scale });
    
    // High-quality preview (1200px)
    const maxDimension = 1200; 
    const thumbnailScale = Math.min(maxDimension / viewport.width, maxDimension / viewport.height);
    const dpr = window.devicePixelRatio || 1;
    const renderScale = scale * thumbnailScale * Math.min(dpr, 2);
    const thumbViewport = page.getViewport({ scale: renderScale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('Canvas context not available');
    
    canvas.height = thumbViewport.height;
    canvas.width = thumbViewport.width;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    await page.render({ canvasContext: context, viewport: thumbViewport, intent: 'print' }).promise;
    const dataUrl = canvas.toDataURL('image/webp', 0.8) || canvas.toDataURL('image/jpeg', 0.9);
    
    // Memory cleanup
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  } catch (error) {
    console.error(`Error rendering page ${pageNum}:`, error);
    return '';
  }
};

/**
 * ULTRA-FAST: Render a small thumbnail for grids/lists
 * Uses lower dimension and higher compression to save RAM on 100+ page docs
 */
export const renderGridThumbnail = async (pdf: any, pageNum: number): Promise<string> => {
  try {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 0.5 }); // Lower initial scale
    
    // 4列表示の実寸より少し大きい256pxに抑える。
    // 400pxでは末尾へ大きく移動した直後の描画がWindows本体で0.5秒を超えた。
    const maxDimension = 256;
    const thumbnailScale = Math.min(maxDimension / viewport.width, maxDimension / viewport.height);
    const thumbViewport = page.getViewport({ scale: thumbnailScale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context) return '';
    
    canvas.height = thumbViewport.height;
    canvas.width = thumbViewport.width;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    await page.render({ canvasContext: context, viewport: thumbViewport, intent: 'display' }).promise;
    
    // Higher compression for grid thumbnails
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
    
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  } catch (error) {
    return '';
  }
};

// Wrapper for backward compatibility
export const generateThumbnail = async (file: File, pageNum: number = 1): Promise<string> => {
  try {
    const pdf = await loadPdfDocument(file);
    return await renderPageThumbnail(pdf, pageNum, 0.8);
  } catch (error) {
    console.error('Thumbnail error:', error);
    return '';
  }
};

export const getPdfMetaData = async (file: File): Promise<PdfMetaData> => {
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: await file.arrayBuffer(),
      cMapUrl: getCMapUrl(),
      cMapPacked: true,
    });
    
    loadingTask.onPassword = () => { throw new Error('PASSWORD_REQUIRED'); };
    
    const pdf = await loadingTask.promise;
    const firstPageThumb = await renderPageThumbnail(pdf, 1);
    
    return {
      thumbnail: firstPageThumb,
      pageCount: pdf.numPages,
      isLocked: false
    };
  } catch (error: any) {
    if (error.message === 'PASSWORD_REQUIRED' || error.name === 'PasswordException') {
      return { thumbnail: '', pageCount: 0, isLocked: true };
    }
    return { thumbnail: '', pageCount: 0, isLocked: false };
  }
};

export const unlockPdf = async (file: File, password: string): Promise<PdfMetaData & { success: boolean, pdfDoc?: any }> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      password: password,
      cMapUrl: getCMapUrl(),
      cMapPacked: true,
    });

    const pdf = await loadingTask.promise;
    const firstPageThumb = await renderPageThumbnail(pdf, 1);

    return {
      thumbnail: firstPageThumb,
      pageCount: pdf.numPages,
      isLocked: false,
      success: true,
      pdfDoc: pdf
    };
  } catch (error: any) {
    return {
      thumbnail: '',
      pageCount: 0,
      isLocked: true,
      success: false
    };
  }
};
