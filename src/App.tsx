import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  UploadCloud, 
  Trash2, 
  Download, 

  LayoutGrid, 
  RefreshCw, 
  Image as ImageIcon,
  
  Maximize,
  X,
  Palette,
  Edit2,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  RefreshCcw,
  ArrowRightLeft,
  Move,
  ImagePlus
} from 'lucide-react';

// --- Types ---
type UploadedImage = {
  id: string;
  url: string;
  file: File;
  htmlImg?: HTMLImageElement;
};

type MainImageSettings = {
  x: number;
  y: number;
  scale: number;
};

type CanvasSettings = {
  width: number;
  height: number;
  unit: 'px' | 'in';
  dpi: number;
  bgColor: string;
  fitMode: 'fit' | 'cover';
  bottomGradient?: boolean;
  gradientSize?: number;
};

type GridSettings = {
  spacing: number;
  spacingColor: string;
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  cellAspectRatio: string;
  cellPadding: number;
  cellScale: number;
};

type LayoutSettings = {
  gridMode: 'auto' | 'manual';
  columns: number;
  rows: number;
  duplicateHandling: 'once' | 'repeat';
  order: 'upload' | 'random';
};

type ExportSettings = {
  format: 'image/png' | 'image/jpeg' | 'image/webp';
  quality: number;
};

type ImageEditState = {
  brightness: number; 
  contrast: number; 
  saturation: number; 
  scale: number; 
  rotation: number; 
  offsetX: number; 
  offsetY: number; 
  colSpan?: number; 
  rowSpan?: number; 
  customPadding?: number;
  flipX?: boolean;
  flipY?: boolean;
};

type GridOverlay = {
  instanceId: string;
  imageId: string;
  left: string;
  top: string;
  width: string;
  height: string;
  imgUrl: string;
  innerLeft: string;
  innerTop: string;
  innerW: string;
  innerH: string;
  innerW_px: number;
  innerH_px: number;
  drawW: number;
  drawH: number;
  hiddenW: number;
  hiddenH: number;
  edits: ImageEditState;
};

const DEFAULT_EDITS: ImageEditState = {
  brightness: 100, contrast: 100, saturation: 100, scale: 1, rotation: 0, offsetX: 0, offsetY: 0, colSpan: 1, rowSpan: 1, flipX: false, flipY: false
};

// --- UI Components ---
const SidebarSection = ({ title, icon: Icon, children }: { title: string, icon: any, children: React.ReactNode }) => (
  <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
    <div className="flex items-center gap-2 mb-4 text-gray-800 font-semibold border-b border-gray-50 pb-2">
      <Icon size={18} className="text-blue-600" />
      {title}
    </div>
    <div className="space-y-4">
      {children}
    </div>
  </div>
);

// --- Main App Component ---
export default function App() {
  // State
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [loadedImages, setLoadedImages] = useState<UploadedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderedSize, setRenderedSize] = useState({ w: 2048, h: 2048 });
  const [randomSeed, setRandomSeed] = useState(Math.random());

  // Interaction Mode State
  const [interactionMode, setInteractionMode] = useState<'swap' | 'pan'>('swap');

  // Settings State
  const [canvasSettings, setCanvasSettings] = useState<CanvasSettings>({ width: 2048, height: 2048, unit: 'px', dpi: 300, bgColor: '#ffffff', fitMode: 'cover', bottomGradient: true, gradientSize: 40 });
  const [gridSettings, setGridSettings] = useState<GridSettings>({ spacing: 0, spacingColor: '#ffffff', borderWidth: 0, borderColor: '#000000', borderRadius: 0, cellAspectRatio: 'auto', cellPadding: 0, cellScale: 100 });
  const [layoutSettings, setLayoutSettings] = useState<LayoutSettings>({ gridMode: 'auto', columns: 3, rows: 3, duplicateHandling: 'repeat', order: 'upload' });
  const [exportSettings, setExportSettings] = useState<ExportSettings>({ format: 'image/jpeg', quality: 0.9 });
  
  // Image Edit State
  const [editingImage, setEditingImage] = useState<UploadedImage | null>(null);
  const [imageEdits, setImageEdits] = useState<Record<string, ImageEditState>>({});
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  
  // Main Overlay Image State
  const [mainImage, setMainImage] = useState<UploadedImage | null>(null);
  const [mainImageSettings, setMainImageSettings] = useState<MainImageSettings>({ x: 50, y: 50, scale: 1 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Outer Modal Container Size Tracker (Fixes iOS Safari collapsed aspect-ratio bugs)
  const [previewBoxSize, setPreviewBoxSize] = useState({ w: 300, h: 300 });
  const [highlightedThumbId, setHighlightedThumbId] = useState<string | null>(null);

  // Canvas Interactive Overlay State
  const [gridOverlay, setGridOverlay] = useState<GridOverlay[]>([]);
  const [dragOverInstanceId, setDragOverInstanceId] = useState<string | null>(null);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainFileInputRef = useRef<HTMLInputElement>(null);
  const renderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);npm run dev 
  
  // Cache to prevent massive lag when rendering
  const imageCache = useRef<Record<string, HTMLImageElement>>({});

  // Interactive Preview Refs
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const previewDragRef = useRef({ isDragging: false, startX: 0, startY: 0, initOffsetX: 0, initOffsetY: 0, pinchDist: 0, initScale: 1 });
  const mainPanDragRef = useRef({ isPanning: false, imageId: '', instanceId: '', startX: 0, startY: 0, initOffsetX: 0, initOffsetY: 0, currentOffsetX: 0, currentOffsetY: 0, cellW: 1, cellH: 1, pinchDist: 0, initScale: 1 });
  const mainImgDragRef = useRef({ isDragging: false, startX: 0, startY: 0, initX: 0, initY: 0, currentX: 0, currentY: 0, canvasW: 1, canvasH: 1, pinchDist: 0, initScale: 1 });
  const mainImgRef = useRef<HTMLImageElement>(null);

  // --- Calculations ---
  
  // Determine exact cell aspect ratio for the edit crop mask
  const activeCellRatio = useMemo(() => {
      if (gridSettings.cellAspectRatio !== 'auto') {
          const [rW, rH] = gridSettings.cellAspectRatio.split(':').map(Number);
          if (rW && rH) return rW / rH;
      }

      const { width, height, unit, dpi } = canvasSettings;
      const { spacing, cellScale } = gridSettings;
      const { gridMode, columns: manualCols, rows: manualRows } = layoutSettings;

      const requestedWidth = unit === 'in' ? Math.round(width * dpi) : width;
      const requestedHeight = unit === 'in' ? Math.round(height * dpi) : height;

      let totalArea = Math.max(1, loadedImages.length);
      let baseCols = manualCols;
      let baseRows = manualRows;

      if (gridMode === 'auto') {
          const usableCanvasW = Math.max(1, requestedWidth - spacing * 2);
          const usableCanvasH = Math.max(1, requestedHeight - spacing * 2);
          const canvasRatio = usableCanvasW / usableCanvasH;
          baseCols = Math.max(1, Math.round(Math.sqrt(totalArea * canvasRatio)));
          baseRows = Math.max(1, Math.ceil(totalArea / baseCols));
      }

      const scaleFactor = (cellScale || 100) / 100;
      const finalCols = Math.max(1, Math.round(baseCols / scaleFactor));
      const finalRows = Math.max(1, Math.round(baseRows / scaleFactor));

      const usableWidth = requestedWidth - spacing * 2;
      const usableHeight = requestedHeight - spacing * 2;
      const cellW = (usableWidth - (finalCols - 1) * spacing) / finalCols;
      const cellH = (usableHeight - (finalRows - 1) * spacing) / finalRows;

      return cellW / cellH;
  }, [canvasSettings, gridSettings.cellAspectRatio, gridSettings.cellScale, gridSettings.spacing, layoutSettings, loadedImages.length]);


  // Track live DOM size of the OUTER preview container so we can mathematically inject pure px widths
  useEffect(() => {
    if (editingImage && previewBoxRef.current) {
        const obs = new ResizeObserver(entries => {
            for (let entry of entries) {
                setPreviewBoxSize({ w: entry.contentRect.width, h: entry.contentRect.height });
            }
        });
        obs.observe(previewBoxRef.current);
        return () => obs.disconnect();
    }
  }, [editingImage]);


  // --- Image Handling ---
  const handleFileUpload = (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    const newImages = validFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      url: URL.createObjectURL(file),
      file
    }));
    setImages(prev => [...prev, ...newImages]);
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const filtered = prev.filter(img => img.id !== id);
      const removed = prev.find(img => img.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return filtered;
    });
  };

  const handleCanvasClick = useCallback((id: string) => {
    const el = document.getElementById(`thumb-${id}`);
    if (el && el.parentElement) {
      const container = el.parentElement;
      // el.offsetLeft is perfectly relative to the container due to the 'relative' CSS class
      const targetScrollLeft = el.offsetLeft - (container.clientWidth / 2) + (el.clientWidth / 2);
      
      container.scrollTo({ left: Math.max(0, targetScrollLeft), behavior: 'smooth' });
      
      setHighlightedThumbId(id);
      setTimeout(() => setHighlightedThumbId(null), 1200); 
    }
  }, []);

  const clearAll = () => {
    images.forEach(img => URL.revokeObjectURL(img.url));
    setImages([]);
    setLoadedImages([]);
    imageCache.current = {}; 
  };

  const handleMainImageUpload = (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (validFiles.length > 0) {
      const file = validFiles[0];
      if (mainImage) URL.revokeObjectURL(mainImage.url);
      setMainImage({
        id: Math.random().toString(36).substr(2, 9),
        url: URL.createObjectURL(file),
        file
      });
      if (mainFileInputRef.current) mainFileInputRef.current.value = '';
    }
  };

  const removeMainImage = () => {
    if (mainImage) URL.revokeObjectURL(mainImage.url);
    setMainImage(null);
  };

  // Pre-load HTMLImageElement for Main Overlay Image
  useEffect(() => {
    let isCancelled = false;
    if (mainImage && !mainImage.htmlImg) {
      const img = new Image();
      img.onload = () => {
        if (!isCancelled) {
          setMainImage(prev => prev ? { ...prev, htmlImg: img } : null);
          const { width, unit, dpi } = canvasSettings;
          const reqW = unit === 'in' ? width * dpi : width;
          // Set initial scale so the image fits reasonably within the canvas (e.g., 40% of width)
          const initScale = (reqW * 0.4) / img.width;
          setMainImageSettings(prev => ({ ...prev, scale: initScale }));
        }
      };
      img.src = mainImage.url;
    }
    return () => { isCancelled = true; };
  }, [mainImage, canvasSettings.width, canvasSettings.unit, canvasSettings.dpi]);

  // Pre-load HTMLImageElements for Canvas rendering with Smart Caching
  useEffect(() => {
    let isCancelled = false;
    
    const loadImages = async () => {
      const loaded: UploadedImage[] = [];
      for (const img of images) {
        if (imageCache.current[img.id]) {
          loaded.push({ ...img, htmlImg: imageCache.current[img.id] });
        } else {
          try {
            const htmlImg = await new Promise<HTMLImageElement>((resolve, reject) => {
              const image = new Image();
              image.onload = () => resolve(image);
              image.onerror = reject;
              image.src = img.url;
            });
            imageCache.current[img.id] = htmlImg;
            loaded.push({ ...img, htmlImg });
          } catch (e) {
            console.error('Failed to load image', img.file.name);
          }
        }
      }
      if (!isCancelled) {
        setLoadedImages(loaded);
      }
    };

    if (images.length > 0) {
      loadImages();
    } else {
      setLoadedImages([]);
    }

    return () => {
      isCancelled = true;
    };
  }, [images]);

  // --- Core Rendering Logic (Used for both Preview and Export) ---
  const renderCollage = useCallback(async (targetCanvas: HTMLCanvasElement, isPreview: boolean) => {
    const ctx = targetCanvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const { width, height, unit, dpi, bgColor, fitMode } = canvasSettings;
    const { spacing, borderWidth, borderColor, borderRadius, spacingColor, cellAspectRatio } = gridSettings;
    const { duplicateHandling, order, gridMode, columns: manualCols, rows: manualRows } = layoutSettings;

    const requestedWidth = unit === 'in' ? Math.round(width * dpi) : width;
    const requestedHeight = unit === 'in' ? Math.round(height * dpi) : height;

    const MAX_PREVIEW_SIZE = 1600; 
    let renderScale = 1;
    if (isPreview && (requestedWidth > MAX_PREVIEW_SIZE || requestedHeight > MAX_PREVIEW_SIZE)) {
        renderScale = Math.min(MAX_PREVIEW_SIZE / requestedWidth, MAX_PREVIEW_SIZE / requestedHeight);
    }

    targetCanvas.width = requestedWidth * renderScale;
    targetCanvas.height = requestedHeight * renderScale;

    ctx.save();
    ctx.scale(renderScale, renderScale);

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, requestedWidth, requestedHeight);

    if (loadedImages.length === 0) {
        ctx.restore();
        return;
    }

    let displayImages = [...loadedImages];
    if (order === 'random') {
      const seedRandom = (seed: number) => {
        let x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
      };
      let seed = randomSeed;
      displayImages.sort(() => seedRandom(seed++) - 0.5);
    }

    let maxColSpan = 1;
    let totalArea = 0;
    
    displayImages.forEach(img => {
       const edits = imageEdits[img.id] || DEFAULT_EDITS;
       const cs = edits.colSpan || 1;
       const rs = edits.rowSpan || 1;
       totalArea += cs * rs;
       if (cs > maxColSpan) maxColSpan = cs;
    });

    let baseCols = manualCols;
    let baseRows = manualRows;

    if (gridMode === 'auto') {
        let targetCellRatio = 1; 
        if (cellAspectRatio !== 'auto') {
            const [rW, rH] = cellAspectRatio.split(':').map(Number);
            targetCellRatio = rW / rH;
        }
        
        const usableCanvasW = Math.max(1, requestedWidth - spacing * 2);
        const usableCanvasH = Math.max(1, requestedHeight - spacing * 2);
        const canvasRatio = usableCanvasW / usableCanvasH;
        const ratioFactor = canvasRatio / targetCellRatio;
        
        baseCols = Math.max(1, Math.round(Math.sqrt(totalArea * ratioFactor)));
        baseCols = Math.max(maxColSpan, baseCols); 
        baseRows = Math.max(1, Math.ceil(totalArea / baseCols));
    }

    const scaleFactor = (gridSettings.cellScale || 100) / 100;
    const finalCols = Math.max(1, Math.round(baseCols / scaleFactor));
    const finalRows = Math.max(1, Math.round(baseRows / scaleFactor));

    const placedItems: {img: UploadedImage, c: number, r: number, cs: number, rs: number, edits: ImageEditState}[] = [];
    const gridMap: boolean[][] = Array.from({length: finalRows}, () => Array(finalCols).fill(false));
    
    const forceFill = scaleFactor < 1 || duplicateHandling === 'repeat';
    let displayIdx = 0;

    for (let r = 0; r < finalRows; r++) {
        for (let c = 0; c < finalCols; c++) {
            if (gridMap[r][c]) continue; 

            if (!forceFill && displayIdx >= displayImages.length) {
                gridMap[r][c] = true;
                continue;
            }

            const img = displayImages[displayIdx % displayImages.length];
            const edits = { ...DEFAULT_EDITS, ...imageEdits[img.id] };
            
            let cs = Math.min(edits.colSpan || 1, finalCols - c);
            let rs = Math.min(edits.rowSpan || 1, finalRows - r);
            
            let spaceFree = true;
            for(let ir = 0; ir < rs; ir++) {
                for(let ic = 0; ic < cs; ic++) {
                    if (gridMap[r+ir][c+ic]) spaceFree = false;
                }
            }

            if (!spaceFree) {
                cs = 1; 
                rs = 1;
            }

            for(let ir = 0; ir < rs; ir++) {
                for(let ic = 0; ic < cs; ic++) {
                    gridMap[r+ir][c+ic] = true;
                }
            }
            
            placedItems.push({ img, c, r, cs, rs, edits });
            displayIdx++;
        }
    }

    const usableWidth = requestedWidth - spacing * 2;
    const usableHeight = requestedHeight - spacing * 2;
    let cellW = (usableWidth - (finalCols - 1) * spacing) / finalCols;
    let cellH = (usableHeight - (finalRows - 1) * spacing) / finalRows;

    if (cellAspectRatio !== 'auto') {
        const [rW, rH] = cellAspectRatio.split(':').map(Number);
        const targetRatio = rW / rH;
        
        if (fitMode === 'cover') {
            // Scale grid up so it fully covers the usable canvas area, removing white borders
            let testCellW = (usableWidth - (finalCols - 1) * spacing) / finalCols;
            let testCellH = testCellW / targetRatio;
            let testGridH = testCellH * finalRows + (finalRows - 1) * spacing;
            
            if (testGridH >= usableHeight) {
                cellW = testCellW;
                cellH = testCellH;
            } else {
                cellH = (usableHeight - (finalRows - 1) * spacing) / finalRows;
                cellW = cellH * targetRatio;
            }
        } else {
            // Fit mode leaves white space mathematically centered
            if (cellW / cellH > targetRatio) {
                cellW = cellH * targetRatio;
            } else {
                cellH = cellW / targetRatio;
            }
        }
    }

    const totalGridW = (cellW * finalCols) + (spacing * (finalCols - 1));
    const totalGridH = (cellH * finalRows) + (spacing * (finalRows - 1));

    // Anchor to the top if the grid overflows, so only bottom crops
    const startX = (requestedWidth - totalGridW) / 2;
    const startY = totalGridH > (requestedHeight - spacing * 2) 
                      ? spacing 
                      : (requestedHeight - totalGridH) / 2;

    const newGridOverlay: GridOverlay[] = [];

    // Execute Drawing Loop
    for (let i = 0; i < placedItems.length; i++) {
      const item = placedItems[i];
      if (!item.img.htmlImg) continue;

      const edits = item.edits;
      
      const dx = startX + item.c * (cellW + spacing);
      const dy = startY + item.r * (cellH + spacing);

      const itemCellW = (cellW * item.cs) + (spacing * (item.cs - 1));
      const itemCellH = (cellH * item.rs) + (spacing * (item.rs - 1));

      const customPadding = edits.customPadding !== undefined ? edits.customPadding : gridSettings.cellPadding;
      const innerX = dx + customPadding;
      const innerY = dy + customPadding;
      const innerW = Math.max(1, itemCellW - customPadding * 2);
      const innerH = Math.max(1, itemCellH - customPadding * 2);

      const rad = edits.rotation * Math.PI / 180;
      const absCos = Math.abs(Math.cos(rad));
      const absSin = Math.abs(Math.sin(rad));
      
      const reqW = innerW * absCos + innerH * absSin;
      const reqH = innerW * absSin + innerH * absCos;
      
      const baseScale = Math.max(reqW / item.img.htmlImg.width, reqH / item.img.htmlImg.height);
      const finalScale = baseScale * edits.scale;
      
      const drawW = item.img.htmlImg.width * finalScale;
      const drawH = item.img.htmlImg.height * finalScale;

      const hiddenW = drawW - innerW;
      const hiddenH = drawH - innerH;
      
      const maxPanX = hiddenW > 0 ? 100 : 0;
      const maxPanY = hiddenH > 0 ? 100 : 0;
      const clampedOffsetX = Math.max(-maxPanX, Math.min(maxPanX, edits.offsetX));
      const clampedOffsetY = Math.max(-maxPanY, Math.min(maxPanY, edits.offsetY));

      const panDx = (clampedOffsetX / 100) * (hiddenW / 2);
      const panDy = (clampedOffsetY / 100) * (hiddenH / 2);

      if (isPreview) {
        newGridOverlay.push({
          instanceId: `${item.img.id}-${i}`,
          imageId: item.img.id,
          left: `${(dx / requestedWidth) * 100}%`,
          top: `${(dy / requestedHeight) * 100}%`,
          width: `${(itemCellW / requestedWidth) * 100}%`,
          height: `${(itemCellH / requestedHeight) * 100}%`,
          imgUrl: item.img.url,
          innerLeft: `${(innerX / requestedWidth) * 100}%`,
          innerTop: `${(innerY / requestedHeight) * 100}%`,
          innerW: `${(innerW / requestedWidth) * 100}%`,
          innerH: `${(innerH / requestedHeight) * 100}%`,
          innerW_px: innerW,
          innerH_px: innerH,
          drawW: drawW,
          drawH: drawH,
          hiddenW: hiddenW,
          hiddenH: hiddenH,
          edits: { ...edits, offsetX: clampedOffsetX, offsetY: clampedOffsetY }
        });
      }

      ctx.save();
      
      if ((spacing > 0 || customPadding > 0) && spacingColor !== bgColor) {
          ctx.fillStyle = spacingColor;
          ctx.fillRect(dx - spacing/2, dy - spacing/2, itemCellW + spacing, itemCellH + spacing);
      }

      ctx.beginPath();
      ctx.roundRect(innerX, innerY, innerW, innerH, borderRadius);
      ctx.clip();
      
      // OPTIMIZATION: Only apply expensive canvas filters if the user actually changed them
      const hasFilters = edits.brightness !== 100 || edits.contrast !== 100 || edits.saturation !== 100;
      if (hasFilters) {
          ctx.filter = `brightness(${edits.brightness}%) contrast(${edits.contrast}%) saturate(${edits.saturation}%)`;
      } else {
          ctx.filter = 'none';
      }

      ctx.translate(innerX + innerW / 2 + panDx, innerY + innerH / 2 + panDy);
      ctx.rotate(rad);
      ctx.scale(edits.flipX ? -1 : 1, edits.flipY ? -1 : 1);
      
      ctx.drawImage(item.img.htmlImg, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      if (borderWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(innerX, innerY, innerW, innerH, borderRadius);
        ctx.lineWidth = borderWidth * 2; 
        ctx.strokeStyle = borderColor;
        ctx.stroke();
        ctx.restore();
      }

      // OPTIMIZATION: Removed yielding on previews. 
      // We only yield the thread during heavy exports to prevent the browser from freezing.
      // This forces the live preview canvas to paint instantly in a single atomic frame.
      if (!isPreview && i > 0 && i % 25 === 0) {
         await new Promise(res => setTimeout(res, 0)); 
      }
    }
    
    if (canvasSettings.bottomGradient) {
        ctx.save();
        // Dynamically map the gradient to the exact bounds of the generated grid, not the canvas
        const gradPct = (canvasSettings.gradientSize ?? 40) / 100;
        const gradTop = startY + totalGridH - (totalGridH * gradPct);
        const gradBottom = startY + totalGridH;
        
        const gradient = ctx.createLinearGradient(0, gradTop, 0, gradBottom);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(startX, startY, totalGridW, totalGridH);
        ctx.restore();
    }
    
    // Only bake the main image into the final export canvas to prevent preview lag and ghosting
    if (mainImage?.htmlImg && !isPreview) {
        ctx.save();
        const mw = mainImage.htmlImg.width * mainImageSettings.scale;
        const mh = mainImage.htmlImg.height * mainImageSettings.scale;
        const mx = (requestedWidth * (mainImageSettings.x / 100)) - (mw / 2);
        const my = (requestedHeight * (mainImageSettings.y / 100)) - (mh / 2);
        ctx.drawImage(mainImage.htmlImg, mx, my, mw, mh);
        ctx.restore();
    }

    ctx.restore();

    if (isPreview) {
        setRenderedSize({ w: requestedWidth, h: requestedHeight });
        setGridOverlay(newGridOverlay);
    }

  }, [loadedImages, canvasSettings, gridSettings, layoutSettings, randomSeed, imageEdits, mainImage, mainImageSettings]);

  // Fast Debounced Trigger for Live Preview (Decoupled from Main Image Drag)
  const gridDependencies = JSON.stringify({
      cs: canvasSettings,
      gs: gridSettings,
      ls: layoutSettings,
      rs: randomSeed,
      ie: imageEdits,
      // FIX: Track the exact order of Image IDs. This forces the canvas to redraw 
      // immediately when images are swapped using drag-and-drop!
      ids: loadedImages.map(img => img.id).join(',') 
  });

  useEffect(() => {
    if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
    
    renderTimeoutRef.current = setTimeout(() => {
      if (canvasRef.current && loadedImages.length > 0) {
         setIsRendering(true);
         setRenderProgress(0);
         renderCollage(canvasRef.current, true).then(() => {
             setIsRendering(false);
             setRenderProgress(100);
         });
      } else if (canvasRef.current && loadedImages.length === 0) {
         const ctx = canvasRef.current.getContext('2d');
         if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }, 60); 
    
    return () => clearTimeout(renderTimeoutRef.current!);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridDependencies]); 
  // We deliberately omit renderCollage/mainImage to prevent canvas redraws while dragging the overlay


  // --- Export ---
  const handleExport = async () => {
    if (loadedImages.length === 0) return;
    setIsExporting(true);
    const { format, quality } = exportSettings;
    
    try {
      await new Promise(res => setTimeout(res, 50));
      const exportCanvas = document.createElement('canvas');
      await renderCollage(exportCanvas, false); 

      exportCanvas.toBlob((blob) => {
        if (!blob) {
          setErrorMsg("Export failed. The canvas resolution might be too high for your browser's memory limits.");
          setIsExporting(false);
          return;
        }
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `collage-${Date.now()}.${format.split('/')[1]}`;
        link.href = url;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => URL.revokeObjectURL(url), 100);
        setIsExporting(false);
        
      }, format, quality);
    } catch (err) {
      console.error(err);
      setErrorMsg("An error occurred during export.");
      setIsExporting(false);
    }
  };

  const handleImageEdit = (id: string, key: keyof ImageEditState, value: any) => {
    setImageEdits(prev => {
      const current = prev[id] || { ...DEFAULT_EDITS };
      return {
        ...prev,
        [id]: {
          ...current,
          [key]: typeof value === 'function' ? value(current[key]) : value
        }
      };
    });
  };

  // --- Interactive Preview Mathematics & Handlers ---
  // Extracted to a clean useMemo instead of an inline IIFE to prevent React compiler crashes (WSOD)
  const previewMath = useMemo(() => {
    if (!editingImage) return null;
    
    const edits = imageEdits[editingImage.id] || DEFAULT_EDITS;
    
    const imgEl = loadedImages.find(i => i.id === editingImage.id)?.htmlImg || imageCache.current[editingImage.id];
    const imgW = imgEl?.naturalWidth || imgEl?.width || 1200;
    const imgH = imgEl?.naturalHeight || imgEl?.height || 900;

    const isRotated = edits.rotation % 180 !== 0;
    const visualImgW = isRotated ? imgH : imgW;
    const visualImgH = isRotated ? imgW : imgH;

    const cW = activeCellRatio;
    const cH = 1;

    const baseScale = Math.max(cW / visualImgW, cH / visualImgH);
    const finalScale = baseScale * edits.scale;
    const drawVisualW = visualImgW * finalScale;
    const drawVisualH = visualImgH * finalScale;

    const overlayWidthPct = (cW / drawVisualW) * 100;
    const overlayHeightPct = (cH / drawVisualH) * 100;

    const hiddenW = drawVisualW - cW;
    const hiddenH = drawVisualH - cH;
    
    const maxPanX = hiddenW > 0 ? 100 : 0;
    const maxPanY = hiddenH > 0 ? 100 : 0;
    const clampedOffsetX = Math.max(-maxPanX, Math.min(maxPanX, edits.offsetX));
    const clampedOffsetY = Math.max(-maxPanY, Math.min(maxPanY, edits.offsetY));

    const panDx = (clampedOffsetX / 100) * (hiddenW / 2);
    const panDy = (clampedOffsetY / 100) * (hiddenH / 2);

    const overlayLeftOffsetPct = (-panDx / drawVisualW) * 100;
    const overlayTopOffsetPct = (-panDy / drawVisualH) * 100;

    let innerBoxW = previewBoxSize.w;
    let innerBoxH = previewBoxSize.h;
    if (innerBoxW > 0 && innerBoxH > 0) {
        const imgRatio = visualImgW / visualImgH;
        const containerRatio = innerBoxW / innerBoxH;
        if (imgRatio > containerRatio) {
            innerBoxH = innerBoxW / imgRatio;
        } else {
            innerBoxW = innerBoxH * imgRatio;
        }
    }

    return {
        imgUrl: editingImage.url, edits: { ...edits, offsetX: clampedOffsetX, offsetY: clampedOffsetY }, isRotated, visualImgW, visualImgH,
        overlayWidthPct, overlayHeightPct,
        overlayLeftOffsetPct, overlayTopOffsetPct,
        innerBoxW, innerBoxH
    };
  }, [editingImage, loadedImages, imageEdits, activeCellRatio, previewBoxSize]);


  const handlePreviewPointerDown = (e: React.TouchEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    if (!editingImage) return;
    const edits = imageEdits[editingImage.id] || DEFAULT_EDITS;

    if ('touches' in e && e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      previewDragRef.current = { ...previewDragRef.current, pinchDist: dist, initScale: edits.scale };
      return;
    }

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    previewDragRef.current = {
      ...previewDragRef.current,
      isDragging: true,
      startX: clientX,
      startY: clientY,
      initOffsetX: edits.offsetX,
      initOffsetY: edits.offsetY
    };
  };

  const handlePreviewPointerMove = (e: React.TouchEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    if (!editingImage) return;
    
    if ('touches' in e && e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const scaleDiff = (dist - previewDragRef.current.pinchDist) * 0.005;
      const newScale = Math.min(Math.max(1, previewDragRef.current.initScale + scaleDiff), 3);
      handleImageEdit(editingImage.id, 'scale', newScale);
      return;
    }

    if (!previewDragRef.current.isDragging) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const dx = clientX - previewDragRef.current.startX;
    const dy = clientY - previewDragRef.current.startY;

    if (!previewMath || previewMath.innerBoxW <= 0 || previewMath.innerBoxH <= 0) return;

    const maxScreenMovementX = previewMath.innerBoxW * (1 - previewMath.overlayWidthPct / 100);
    const maxScreenMovementY = previewMath.innerBoxH * (1 - previewMath.overlayHeightPct / 100);

    if (maxScreenMovementX > 1) {
      const dxMultiplier = 200 / maxScreenMovementX;
      let newOffsetX = Math.max(-100, Math.min(100, previewDragRef.current.initOffsetX - (dx * dxMultiplier)));
      handleImageEdit(editingImage.id, 'offsetX', newOffsetX);
    }
    
    if (maxScreenMovementY > 1) {
      const dyMultiplier = 200 / maxScreenMovementY;
      let newOffsetY = Math.max(-100, Math.min(100, previewDragRef.current.initOffsetY - (dy * dyMultiplier)));
      handleImageEdit(editingImage.id, 'offsetY', newOffsetY);
    }
  };

  const handlePreviewPointerUp = () => {
    previewDragRef.current.isDragging = false;
  };

  const handlePreviewWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!editingImage) return;
    const currentScale = imageEdits[editingImage.id]?.scale || 1;
    const newScale = Math.min(Math.max(1, currentScale - (e.deltaY * 0.002)), 3);
    handleImageEdit(editingImage.id, 'scale', newScale);
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-gray-50 text-gray-900 font-sans overflow-hidden">
      
      {/* Left Panel: Upload & Basic Settings */}
      <div className="w-full md:w-80 h-full flex flex-col border-r border-gray-200 bg-gray-50/50 overflow-y-auto">
        <div className="p-4">
          <h1 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-800">
            <LayoutGrid className="text-blue-600" /> MosaicGrid
          </h1>

          <SidebarSection title="Upload Images" icon={UploadCloud}>
            <div 
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer
                ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-white'}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => e.target.files && handleFileUpload(e.target.files)} />
              <UploadCloud className="mx-auto text-gray-400 mb-2" size={32} />
              <p className="text-sm text-gray-600">Drag & drop or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP</p>
            </div>

            {images.length > 0 && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{images.length} Images</span>
                  <button onClick={clearAll} className="text-xs text-red-500 hover:text-red-700 transition-colors flex items-center gap-1">
                    <Trash2 size={12}/> Clear All
                  </button>
                </div>
                {/* CSS snap-x removed to un-break JavaScript scrolling on iPad */}
                <div className="relative flex flex-row gap-2 overflow-x-auto p-2 bg-white rounded-lg border border-gray-100 pb-3">
                  {images.map(img => (
                    <div 
                      key={img.id} 
                      id={`thumb-${img.id}`}
                      draggable
                      onDragStart={(e) => {
                        setDraggedImageId(img.id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', img.id);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const droppedId = e.dataTransfer.getData('text/plain');
                        if (droppedId && droppedId !== img.id) {
                          setImages(prev => {
                            const newArr = [...prev];

                            if (layoutSettings.order === 'random') {
                               const seedRandom = (seed: number) => {
                                 let x = Math.sin(seed++) * 10000;
                                 return x - Math.floor(x);
                               };
                               let seed = randomSeed;
                               newArr.sort(() => seedRandom(seed++) - 0.5);
                               setLayoutSettings(ls => ({...ls, order: 'upload'}));
                            }

                            const idx1 = newArr.findIndex(i => i.id === droppedId);
                            const idx2 = newArr.findIndex(i => i.id === img.id);
                            
                            if (idx1 !== -1 && idx2 !== -1) {
                              const temp = newArr[idx1];
                              newArr[idx1] = newArr[idx2];
                              newArr[idx2] = temp;
                            }
                            return newArr;
                          });
                        }
                        setDraggedImageId(null);
                      }}
                      onDragEnd={() => setDraggedImageId(null)}
                      className={`relative group w-20 h-20 flex-shrink-0 rounded-md overflow-hidden bg-gray-100 cursor-move border-2 transition-all duration-300 ${
                        draggedImageId === img.id ? 'opacity-50 border-blue-500 scale-95' : 
                        highlightedThumbId === img.id ? 'border-blue-500 ring-4 ring-blue-200 scale-105 z-10 shadow-lg' : 'border-transparent'
                      }`}
                    >
                      <img src={img.url} className="w-full h-full object-cover" loading="lazy" alt="thumb" />
                      <div className="absolute inset-0 bg-black/50 hidden group-hover:flex flex-col items-center justify-center gap-1 text-white transition-all">
                        <div className="flex gap-1">
                          <button onClick={() => setEditingImage(img)} className="p-1.5 hover:bg-white/20 rounded transition-colors" title="Crop & Edit Image">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => removeImage(img.id)} className="p-1.5 hover:bg-white/20 rounded transition-colors bg-red-500/80" title="Remove">
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SidebarSection>

          <SidebarSection title="Canvas Settings" icon={Maximize}>
            <div className="mb-3">
              <label className="text-xs text-gray-500 block mb-1">Unit</label>
              <div className="flex bg-gray-100 p-1 rounded-lg">
                <button 
                  onClick={() => setCanvasSettings({...canvasSettings, unit: 'px'})}
                  className={`flex-1 text-xs py-1.5 rounded-md transition-all ${canvasSettings.unit === 'px' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}
                >
                  Pixels (px)
                </button>
                <button 
                  onClick={() => setCanvasSettings({...canvasSettings, unit: 'in'})}
                  className={`flex-1 text-xs py-1.5 rounded-md transition-all ${canvasSettings.unit === 'in' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}
                >
                  Inches (in)
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">Width ({canvasSettings.unit})</label>
                <input 
                  type="number" 
                  step={canvasSettings.unit === 'in' ? "0.1" : "1"}
                  value={canvasSettings.width}
                  onChange={(e) => setCanvasSettings({...canvasSettings, width: Number(e.target.value)})}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">Height ({canvasSettings.unit})</label>
                <input 
                  type="number" 
                  step={canvasSettings.unit === 'in' ? "0.1" : "1"}
                  value={canvasSettings.height}
                  onChange={(e) => setCanvasSettings({...canvasSettings, height: Number(e.target.value)})}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {canvasSettings.unit === 'in' && (
              <div className="pt-2">
                <label className="text-xs text-gray-500 block mb-1">Print Resolution (DPI)</label>
                <input 
                  type="number" 
                  value={canvasSettings.dpi}
                  onChange={(e) => setCanvasSettings({...canvasSettings, dpi: Number(e.target.value)})}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
            
            <div className="pt-2">
              <label className="text-xs text-gray-500 block mb-1">Presets</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: '12x18 Print', w: 12, h: 18, u: 'in' },
                  { label: '18x24 Print', w: 18, h: 24, u: 'in' },
                  { label: '20x30 Print', w: 20, h: 30, u: 'in' },
                ].map(preset => (
                   <button 
                     key={preset.label}
                     onClick={() => setCanvasSettings({...canvasSettings, width: preset.w, height: preset.h, unit: preset.u as any})}
                     className="text-xs py-1.5 px-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors text-left truncate"
                   >
                     {preset.label}
                   </button>
                ))}
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-gray-100">
              <label className="text-xs text-gray-500 block mb-1">Background Color</label>
              <div className="flex gap-2">
                <input 
                  type="color" 
                  value={canvasSettings.bgColor}
                  onChange={(e) => setCanvasSettings({...canvasSettings, bgColor: e.target.value})}
                  className="h-8 w-8 rounded cursor-pointer border-0 p-0"
                />
                <input 
                  type="text" 
                  value={canvasSettings.bgColor}
                  onChange={(e) => setCanvasSettings({...canvasSettings, bgColor: e.target.value})}
                  className="flex-1 px-3 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-500 uppercase"
                />
              </div>
              
              <div className="mt-4">
                <label className="text-xs text-gray-500 block mb-1">Canvas Fill Mode</label>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button 
                    onClick={() => setCanvasSettings({...canvasSettings, fitMode: 'cover'})}
                    className={`flex-1 text-xs py-1.5 rounded-md transition-all ${canvasSettings.fitMode === 'cover' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}
                    title="Scale grid to fill canvas entirely (no white borders)"
                  >
                    Fill Canvas
                  </button>
                  <button 
                    onClick={() => setCanvasSettings({...canvasSettings, fitMode: 'fit'})}
                    className={`flex-1 text-xs py-1.5 rounded-md transition-all ${canvasSettings.fitMode === 'fit' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}
                    title="Fit grid strictly inside canvas (leaves borders)"
                  >
                    Fit Inside
                  </button>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-600 font-medium cursor-pointer select-none" htmlFor="bottom-gradient">
                    Bottom Dark Overlay Gradient
                  </label>
                  <input 
                    id="bottom-gradient"
                    type="checkbox"
                    checked={canvasSettings.bottomGradient || false}
                    onChange={(e) => setCanvasSettings({...canvasSettings, bottomGradient: e.target.checked})}
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                  />
                </div>
                {canvasSettings.bottomGradient && (
                  <div className="animate-in fade-in duration-200">
                    <label className="text-xs text-gray-500 flex justify-between mb-1">
                      <span>Gradient Height</span>
                      <span>{canvasSettings.gradientSize ?? 40}%</span>
                    </label>
                    <input 
                      type="range" 
                      min="10" max="100" 
                      value={canvasSettings.gradientSize ?? 40}
                      onChange={(e) => setCanvasSettings({...canvasSettings, gradientSize: Number(e.target.value)})}
                      className="w-full accent-blue-600"
                    />
                  </div>
                )}
              </div>
            </div>
          </SidebarSection>
        </div>
      </div>

      {/* Center Panel: Live Preview */}
      <div className="flex-1 h-full flex flex-col relative bg-gray-200 overflow-hidden">
        {/* Toolbar above canvas */}
        <div className="h-12 border-b border-gray-300 bg-white/80 backdrop-blur flex items-center justify-between px-4 z-10 absolute top-0 w-full">
          <div className="flex items-center gap-4">
            <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded shadow-sm border border-gray-200">
              Output: {canvasSettings.unit === 'in' ? 
                `${(renderedSize.w / canvasSettings.dpi).toFixed(1)} × ${(renderedSize.h / canvasSettings.dpi).toFixed(1)} in (${renderedSize.w} × ${renderedSize.h} px)` 
                : `${renderedSize.w} × ${renderedSize.h} px`}
            </span>
            {isRendering && (
              <span className="text-xs text-blue-600 font-medium animate-pulse flex items-center gap-1 bg-blue-50 px-2 py-1 rounded shadow-sm border border-blue-100">
                <RefreshCw size={12} className="animate-spin" /> Rendering {renderProgress}%
              </span>
            )}
          </div>

          {/* Interaction Mode Toggle */}
          {images.length > 0 && (
            <div className="flex flex-col items-end justify-center">
              <div className="flex bg-gray-100 p-1 rounded-md border border-gray-200 shadow-sm">
                <button 
                  onClick={() => setInteractionMode('swap')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${interactionMode === 'swap' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <ArrowRightLeft size={14}/> Swap Mode
                </button>
                <button 
                  onClick={() => setInteractionMode('pan')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${interactionMode === 'pan' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <Move size={14}/> Pan Mode
                </button>
              </div>
              <span className="text-[10px] text-gray-500 pr-1 mt-0.5">
                 {interactionMode === 'pan' ? 'Touch & drag to pan • Pinch to zoom' : 'Drag images to rearrange'}
              </span>
            </div>
          )}
        </div>

        {/* Canvas Container */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-8 pt-20">
          <div 
            ref={canvasContainerRef}
            className="relative shadow-2xl transition-all duration-300 bg-white checkboard-bg ring-1 ring-gray-900/5"
            style={{ 
              aspectRatio: `${canvasSettings.width} / ${canvasSettings.height}`,
              maxHeight: '100%',
              maxWidth: '100%',
              // The checkerboard pattern for transparent backgrounds
              backgroundImage: 'repeating-linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%, #e5e7eb), repeating-linear-gradient(45deg, #e5e7eb 25%, #ffffff 25%, #ffffff 75%, #e5e7eb 75%, #e5e7eb)',
              backgroundPosition: '0 0, 10px 10px',
              backgroundSize: '20px 20px'
            }}
          >
            {images.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                <ImageIcon size={48} className="mb-2 opacity-50" />
                <p>Upload images to see preview</p>
              </div>
            )}
            <canvas 
              ref={canvasRef} 
              className={`w-full h-full object-contain ${images.length === 0 ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
              style={{ display: 'block' }} // Prevents inline-block spacing issues
            />

            {/* LIVE 60FPS CSS PANNING OVERLAY */}
            <div id="live-pan-overlay" className="absolute pointer-events-none overflow-hidden z-30" style={{ display: 'none', boxShadow: '0 4px 25px rgba(0,0,0,0.5)' }}>
               <img id="live-pan-img" className="absolute max-w-none pointer-events-none" style={{ left: '50%', top: '50%' }} alt="" />
            </div>

            {/* Grid Interactive Overlay for Drag to Swap AND Touch Pan/Pinch */}
            {images.length > 0 && !isRendering && (
              <div className="absolute inset-0 z-20 overflow-hidden rounded-[inherit]">
                {gridOverlay.map(overlay => (
                  <div
                    key={overlay.instanceId}
                    draggable={interactionMode === 'swap'}
                    
                    // --- SWAP HANDLERS ---
                    onDragStart={(e) => {
                      if (interactionMode === 'pan') { e.preventDefault(); return; }
                      setDraggedImageId(overlay.imageId);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', overlay.imageId);
                    }}
                    onDragOver={(e) => {
                      if (interactionMode === 'pan') return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOverInstanceId(overlay.instanceId);
                    }}
                    onDragLeave={() => {
                      if (interactionMode === 'pan') return;
                      if (dragOverInstanceId === overlay.instanceId) {
                         setDragOverInstanceId(null);
                      }
                    }}
                    onDrop={(e) => {
                      if (interactionMode === 'pan') return;
                      e.preventDefault();
                      setDragOverInstanceId(null);
                      const droppedId = e.dataTransfer.getData('text/plain');

                      if (droppedId && droppedId !== overlay.imageId) {
                        setImages(prev => {
                          let newArr = [...prev];

                          if (layoutSettings.order === 'random') {
                             const seedRandom = (seed: number) => {
                               let x = Math.sin(seed++) * 10000;
                               return x - Math.floor(x);
                             };
                             let seed = randomSeed;
                             newArr.sort(() => seedRandom(seed++) - 0.5);
                             setLayoutSettings(ls => ({...ls, order: 'upload'}));
                          }

                          const idx1 = newArr.findIndex(i => i.id === droppedId);
                          const idx2 = newArr.findIndex(i => i.id === overlay.imageId);
                          
                          if (idx1 !== -1 && idx2 !== -1) {
                            const temp = newArr[idx1];
                            newArr[idx1] = newArr[idx2];
                            newArr[idx2] = temp;
                          }
                          return newArr;
                        });
                      }
                      setDraggedImageId(null);
                    }}
                    onDragEnd={() => {
                        if (interactionMode === 'pan') return;
                        setDraggedImageId(null);
                        setDragOverInstanceId(null);
                    }}

                    // --- TOUCH & MOUSE PAN & PINCH-TO-ZOOM HANDLERS (60 FPS CSS) ---
                    onPointerDown={(e) => {
                      // Instantly highlight and scroll the thumbnail into view
                      handleCanvasClick(overlay.imageId);
                      
                      // isPrimary guards against multi-finger pan collision
                      if (interactionMode !== 'pan' || e.isPrimary === false) return;
                      try { e.currentTarget.setPointerCapture(e.pointerId); } catch(err){}
                      
                      mainPanDragRef.current = {
                        isPanning: true,
                        imageId: overlay.imageId,
                        instanceId: overlay.instanceId,
                        startX: e.clientX,
                        startY: e.clientY,
                        initOffsetX: overlay.edits.offsetX,
                        initOffsetY: overlay.edits.offsetY,
                        currentOffsetX: overlay.edits.offsetX,
                        currentOffsetY: overlay.edits.offsetY,
                        cellW: e.currentTarget.getBoundingClientRect().width || 1,
                        cellH: e.currentTarget.getBoundingClientRect().height || 1,
                        pinchDist: 0,
                        initScale: overlay.edits.scale
                      };

                      const overlayEl = document.getElementById('live-pan-overlay');
                      const imgEl = document.getElementById('live-pan-img') as HTMLImageElement;
                      
                      if (overlayEl && imgEl) {
                         overlayEl.style.display = 'block';
                         overlayEl.style.left = overlay.innerLeft;
                         overlayEl.style.top = overlay.innerTop;
                         overlayEl.style.width = overlay.innerW;
                         overlayEl.style.height = overlay.innerH;
                         overlayEl.style.borderRadius = gridSettings.borderRadius > 0 ? `${(gridSettings.borderRadius / overlay.innerW_px) * 100}%` : '0';

                         imgEl.src = overlay.imgUrl;
                         imgEl.style.width = `${(overlay.drawW / overlay.innerW_px) * 100}%`;
                         imgEl.style.height = `${(overlay.drawH / overlay.innerH_px) * 100}%`;

                         const panDx = (overlay.edits.offsetX / 100) * (overlay.hiddenW / 2);
                         const panDy = (overlay.edits.offsetY / 100) * (overlay.hiddenH / 2);
                         const shiftXPct = (panDx / overlay.drawW) * 100;
                         const shiftYPct = (panDy / overlay.drawH) * 100;
                         
                         imgEl.style.transform = `translate(calc(-50% + ${shiftXPct}%), calc(-50% + ${shiftYPct}%)) rotate(${overlay.edits.rotation}deg) scale(${overlay.edits.flipX ? -1 : 1}, ${overlay.edits.flipY ? -1 : 1})`;
                         imgEl.style.filter = `brightness(${overlay.edits.brightness}%) contrast(${overlay.edits.contrast}%) saturate(${overlay.edits.saturation}%)`;
                      }
                    }}
                    onPointerMove={(e) => {
                      if (interactionMode !== 'pan' || !mainPanDragRef.current.isPanning || mainPanDragRef.current.instanceId !== overlay.instanceId || e.isPrimary === false) return;

                      const dx = e.clientX - mainPanDragRef.current.startX;
                      const dy = e.clientY - mainPanDragRef.current.startY;
                      
                      const rawOffsetX = mainPanDragRef.current.initOffsetX - (dx / mainPanDragRef.current.cellW * 200);
                      const rawOffsetY = mainPanDragRef.current.initOffsetY - (dy / mainPanDragRef.current.cellH * 200);
                      
                      const maxPanX = overlay.hiddenW > 0 ? 100 : 0;
                      const maxPanY = overlay.hiddenH > 0 ? 100 : 0;
                      
                      const clampedOffsetX = Math.max(-maxPanX, Math.min(maxPanX, rawOffsetX));
                      const clampedOffsetY = Math.max(-maxPanY, Math.min(maxPanY, rawOffsetY));
                      
                      mainPanDragRef.current.currentOffsetX = clampedOffsetX;
                      mainPanDragRef.current.currentOffsetY = clampedOffsetY;

                      const imgEl = document.getElementById('live-pan-img');
                      if (imgEl) {
                         const panDx = (clampedOffsetX / 100) * (overlay.hiddenW / 2);
                         const panDy = (clampedOffsetY / 100) * (overlay.hiddenH / 2);
                         const shiftXPct = (panDx / overlay.drawW) * 100;
                         const shiftYPct = (panDy / overlay.drawH) * 100;
                         imgEl.style.transform = `translate(calc(-50% + ${shiftXPct}%), calc(-50% + ${shiftYPct}%)) rotate(${overlay.edits.rotation}deg) scale(${overlay.edits.flipX ? -1 : 1}, ${overlay.edits.flipY ? -1 : 1})`;
                      }
                    }}
                    onPointerUp={(e) => {
                      if (interactionMode !== 'pan') return;
                      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch(err){}
                      
                      if (mainPanDragRef.current.isPanning) {
                         const { imageId, currentOffsetX, currentOffsetY } = mainPanDragRef.current;
                         if (currentOffsetX !== undefined && currentOffsetY !== undefined) {
                             handleImageEdit(imageId, 'offsetX', currentOffsetX);
                             handleImageEdit(imageId, 'offsetY', currentOffsetY);
                         }
                      }
                      
                      mainPanDragRef.current.isPanning = false;
                      const overlayEl = document.getElementById('live-pan-overlay');
                      if (overlayEl) overlayEl.style.display = 'none';
                    }}
                    onPointerCancel={(e) => {
                      if (interactionMode !== 'pan') return;
                      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch(err){}
                      mainPanDragRef.current.isPanning = false;
                      const overlayEl = document.getElementById('live-pan-overlay');
                      if (overlayEl) overlayEl.style.display = 'none';
                    }}
                    
                    // Touch Pinch Zoom & Wheel Zoom Support
                    onTouchStart={(e) => {
                      if (interactionMode !== 'pan') return;
                      if (e.touches.length === 2) {
                        e.stopPropagation();
                        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                        mainPanDragRef.current.pinchDist = dist;
                        mainPanDragRef.current.initScale = overlay.edits.scale;
                      }
                    }}
                    onTouchMove={(e) => {
                      if (interactionMode !== 'pan') return;
                      if (e.touches.length === 2) {
                        e.stopPropagation();
                        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                        const scaleDiff = (dist - mainPanDragRef.current.pinchDist) * 0.005;
                        const newScale = Math.min(Math.max(1, mainPanDragRef.current.initScale + scaleDiff), 3);
                        handleImageEdit(overlay.imageId, 'scale', newScale);
                      }
                    }}
                    onWheel={(e) => {
                      if (interactionMode !== 'pan') return;
                      const currentScale = overlay.edits.scale || 1;
                      const newScale = Math.min(Math.max(1, currentScale - (e.deltaY * 0.002)), 3);
                      handleImageEdit(overlay.imageId, 'scale', newScale);
                    }}

                    className={`absolute transition-all duration-150 rounded-sm ${
                      dragOverInstanceId === overlay.instanceId 
                        ? 'border-2 border-blue-500 bg-blue-500/20 shadow-inner' 
                        : draggedImageId === overlay.imageId
                          ? 'border-2 border-blue-400 bg-blue-400/10'
                          : interactionMode === 'pan'
                             ? 'border-2 border-blue-400/30 bg-transparent hover:border-blue-400/80 hover:bg-blue-400/10 cursor-grab active:cursor-grabbing touch-none'
                             : 'border-2 border-transparent bg-transparent hover:border-white/60 hover:bg-white/10 cursor-move'
                    }`}
                    style={{
                      left: overlay.left,
                      top: overlay.top,
                      width: overlay.width,
                      height: overlay.height,
                      touchAction: interactionMode === 'pan' ? 'none' : 'auto'
                    }}
                  />
                ))}
              </div>
            )}

            {/* Main Image Overlay */}
            {mainImage?.htmlImg && (
               <div className={`absolute inset-0 z-30 pointer-events-none overflow-hidden rounded-[inherit] transition-opacity duration-300 ${isRendering ? 'opacity-50' : 'opacity-100'}`}>
                 <img
                    ref={mainImgRef}
                    src={mainImage.url}
                    className="absolute pointer-events-auto"
                    draggable={false}
                    style={{
                       left: `${mainImageSettings.x}%`,
                       top: `${mainImageSettings.y}%`,
                       width: `${(mainImage.htmlImg.width * mainImageSettings.scale / (canvasSettings.unit === 'in' ? canvasSettings.width * canvasSettings.dpi : canvasSettings.width)) * 100}%`,
                       transform: 'translate(-50%, -50%)',
                       cursor: mainImgDragRef.current.isDragging ? 'grabbing' : 'grab',
                       willChange: 'left, top, width, transform'
                    }}
                    onPointerDown={(e) => {
                       try { e.currentTarget.setPointerCapture(e.pointerId); } catch(err){}
                       const rect = canvasContainerRef.current?.getBoundingClientRect();
                       mainImgDragRef.current = {
                           isDragging: true,
                           startX: e.clientX,
                           startY: e.clientY,
                           initX: mainImageSettings.x,
                           initY: mainImageSettings.y,
                           currentX: mainImageSettings.x,
                           currentY: mainImageSettings.y,
                           canvasW: rect?.width || 1,
                           canvasH: rect?.height || 1,
                           pinchDist: 0,
                           initScale: mainImageSettings.scale
                       };
                       if (mainImgRef.current) mainImgRef.current.style.cursor = 'grabbing';
                    }}
                    onPointerMove={(e) => {
                       if (!mainImgDragRef.current.isDragging) return;
                       
                       // Direct DOM manipulation for buttery smooth 120fps dragging
                       const dx = e.clientX - mainImgDragRef.current.startX;
                       const dy = e.clientY - mainImgDragRef.current.startY;
                       const dxPct = (dx / mainImgDragRef.current.canvasW) * 100;
                       const dyPct = (dy / mainImgDragRef.current.canvasH) * 100;
                       
                       const newX = mainImgDragRef.current.initX + dxPct;
                       const newY = mainImgDragRef.current.initY + dyPct;
                       
                       mainImgDragRef.current.currentX = newX;
                       mainImgDragRef.current.currentY = newY;

                       if (mainImgRef.current) {
                           mainImgRef.current.style.left = `${newX}%`;
                           mainImgRef.current.style.top = `${newY}%`;
                       }
                    }}
                    onPointerUp={(e) => {
                       try { e.currentTarget.releasePointerCapture(e.pointerId); } catch(err){}
                       if (mainImgDragRef.current.isDragging) {
                           setMainImageSettings(prev => ({
                               ...prev,
                               x: mainImgDragRef.current.currentX ?? prev.x,
                               y: mainImgDragRef.current.currentY ?? prev.y
                           }));
                       }
                       mainImgDragRef.current.isDragging = false;
                       if (mainImgRef.current) mainImgRef.current.style.cursor = 'grab';
                    }}
                    onPointerCancel={(e) => {
                       try { e.currentTarget.releasePointerCapture(e.pointerId); } catch(err){}
                       mainImgDragRef.current.isDragging = false;
                       if (mainImgRef.current) mainImgRef.current.style.cursor = 'grab';
                    }}
                    onTouchStart={(e) => {
                       if (e.touches.length === 2) {
                           e.stopPropagation();
                           const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                           mainImgDragRef.current.pinchDist = dist;
                           mainImgDragRef.current.initScale = mainImageSettings.scale;
                       }
                    }}
                    onTouchMove={(e) => {
                       if (e.touches.length === 2) {
                           e.stopPropagation();
                           const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                           const scaleDiff = (dist - mainImgDragRef.current.pinchDist) * 0.005;
                           const newScale = Math.max(0.01, mainImgDragRef.current.initScale + scaleDiff);
                           setMainImageSettings(prev => ({...prev, scale: newScale}));
                       }
                    }}
                    onWheel={(e) => {
                       e.stopPropagation();
                       const scaleDiff = -e.deltaY * 0.001;
                       setMainImageSettings(prev => ({...prev, scale: Math.max(0.01, prev.scale + scaleDiff)}));
                    }}
                 />
               </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel: Layout & Export */}
      <div className="w-full md:w-80 h-full flex flex-col border-l border-gray-200 bg-gray-50/50 overflow-y-auto">
        <div className="p-4">
          
          <SidebarSection title="Grid Layout" icon={LayoutGrid}>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Grid Sizing</label>
              <div className="flex bg-gray-100 p-1 rounded-lg mb-3">
                <button 
                  onClick={() => setLayoutSettings({...layoutSettings, gridMode: 'auto'})}
                  className={`flex-1 text-xs py-1.5 rounded-md transition-all ${layoutSettings.gridMode === 'auto' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}
                >
                  Auto Fill
                </button>
                <button 
                  onClick={() => setLayoutSettings({...layoutSettings, gridMode: 'manual'})}
                  className={`flex-1 text-xs py-1.5 rounded-md transition-all ${layoutSettings.gridMode === 'manual' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}
                >
                  Custom
                </button>
              </div>

              {layoutSettings.gridMode === 'manual' && (
                <div className="flex gap-2 mb-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">Columns</label>
                    <input 
                      type="number" min="1" max="100"
                      value={layoutSettings.columns}
                      onChange={(e) => setLayoutSettings({...layoutSettings, columns: Math.max(1, Number(e.target.value))})}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">Rows</label>
                    <input 
                      type="number" min="1" max="100"
                      value={layoutSettings.rows}
                      onChange={(e) => setLayoutSettings({...layoutSettings, rows: Math.max(1, Number(e.target.value))})}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Image Spacing: {gridSettings.spacing}px</label>
              <input 
                type="range" 
                min="0" max="100" 
                value={gridSettings.spacing}
                onChange={(e) => setGridSettings({...gridSettings, spacing: Number(e.target.value)})}
                className="w-full accent-blue-600"
              />
            </div>

            <div>
               <label className="text-xs text-gray-500 block mb-1">Duplicate Handling</label>
               <select 
                  value={layoutSettings.duplicateHandling}
                  onChange={(e) => setLayoutSettings({...layoutSettings, duplicateHandling: e.target.value as any})}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
               >
                 <option value="repeat">Repeat images to fill grid</option>
                 <option value="once">Use each image only once</option>
               </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Image Order</label>
              <div className="flex gap-2">
                <select 
                    value={layoutSettings.order}
                    onChange={(e) => setLayoutSettings({...layoutSettings, order: e.target.value as any})}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="upload">Upload Order</option>
                  <option value="random">Randomize</option>
                </select>
                {layoutSettings.order === 'random' && (
                  <button 
                    onClick={() => setRandomSeed(Math.random())}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors"
                    title="Reshuffle"
                  >
                    <RefreshCw size={16} />
                  </button>
                )}
              </div>
            </div>
          </SidebarSection>

          <SidebarSection title="Cell Styling" icon={Palette}>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Target Cell Shape (Auto Adjusts Grid)</label>
              <select 
                 value={gridSettings.cellAspectRatio}
                 onChange={(e) => setGridSettings({...gridSettings, cellAspectRatio: e.target.value})}
                 className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 mb-3"
              >
                <option value="auto">Auto (Stretch to fit)</option>
                <option value="1:1">Square (1:1)</option>
                <option value="4:3">Landscape (4:3)</option>
                <option value="3:2">Landscape (3:2)</option>
                <option value="16:9">Landscape (16:9)</option>
                <option value="3:4">Portrait (3:4)</option>
                <option value="2:3">Portrait (2:3)</option>
                <option value="9:16">Portrait (9:16)</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Cell Padding: {gridSettings.cellPadding}px</label>
              <input 
                type="range" 
                min="0" max="200" 
                value={gridSettings.cellPadding}
                onChange={(e) => setGridSettings({...gridSettings, cellPadding: Number(e.target.value)})}
                className="w-full accent-blue-600 mb-3"
              />
            </div>

             <div>
              <label className="text-xs text-gray-500 block mb-1">Corner Radius: {gridSettings.borderRadius}px</label>
              <input 
                type="range" 
                min="0" max="200" 
                value={gridSettings.borderRadius}
                onChange={(e) => setGridSettings({...gridSettings, borderRadius: Number(e.target.value)})}
                className="w-full accent-blue-600"
              />
            </div>
            
            <div>
              <label className="text-xs text-gray-500 block mb-1 mt-2">Border Width: {gridSettings.borderWidth}px</label>
              <input 
                type="range" 
                min="0" max="50" 
                value={gridSettings.borderWidth}
                onChange={(e) => setGridSettings({...gridSettings, borderWidth: Number(e.target.value)})}
                className="w-full accent-blue-600"
              />
            </div>

            {gridSettings.borderWidth > 0 && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Border Color</label>
                <div className="flex gap-2">
                  <input 
                    type="color" 
                    value={gridSettings.borderColor}
                    onChange={(e) => setGridSettings({...gridSettings, borderColor: e.target.value})}
                    className="h-8 w-8 rounded cursor-pointer border-0 p-0"
                  />
                  <input 
                    type="text" 
                    value={gridSettings.borderColor}
                    onChange={(e) => setGridSettings({...gridSettings, borderColor: e.target.value})}
                    className="flex-1 px-3 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-500 uppercase"
                  />
                </div>
              </div>
            )}
          </SidebarSection>

          <SidebarSection title="Main Overlay Image" icon={ImagePlus}>
            <div 
              className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors cursor-pointer hover:border-blue-400 bg-white mb-4`}
              onClick={() => mainFileInputRef.current?.click()}
            >
              <input type="file" accept="image/*" className="hidden" ref={mainFileInputRef} onChange={(e) => e.target.files && handleMainImageUpload(e.target.files)} />
              <UploadCloud className="mx-auto text-gray-400 mb-1" size={24} />
              <p className="text-xs text-gray-600">Upload Main Image</p>
            </div>

            {mainImage && (
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-4">
                <div className="flex items-center gap-3">
                   <div className="w-12 h-12 bg-white rounded border border-gray-200 overflow-hidden shrink-0">
                      <img src={mainImage.url} className="w-full h-full object-cover" alt="Main Overlay" />
                   </div>
                   <div className="flex-1">
                      <p className="text-xs font-semibold text-gray-700 truncate">{mainImage.file.name}</p>
                      <button onClick={removeMainImage} className="text-[10px] text-red-500 hover:text-red-700 flex items-center gap-1 mt-1">
                         <Trash2 size={10} /> Remove
                      </button>
                   </div>
                </div>

                <div>
                   <label className="text-xs text-gray-500 flex justify-between mb-1">
                      <span>Scale</span>
                      <span>{(mainImageSettings.scale * 100).toFixed(0)}%</span>
                   </label>
                   <input 
                     type="range" 
                     min="0.05" max="3" step="0.05" 
                     value={mainImageSettings.scale}
                     onChange={(e) => setMainImageSettings({...mainImageSettings, scale: Number(e.target.value)})}
                     className="w-full accent-blue-600"
                   />
                </div>
                
                <div className="text-[10px] text-gray-500 bg-blue-50/50 p-2 rounded text-center border border-blue-100">
                   Drag the image directly on the canvas to position it, or use mouse wheel / pinch to resize.
                </div>
              </div>
            )}
          </SidebarSection>

          <SidebarSection title="Export" icon={Download}>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Format</label>
              <select 
                value={exportSettings.format}
                onChange={(e) => setExportSettings({...exportSettings, format: e.target.value as any})}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 mb-4"
              >
                <option value="image/jpeg">JPEG (Smaller file)</option>
                <option value="image/png">PNG (Lossless, allows transparency)</option>
                <option value="image/webp">WEBP (Modern web format)</option>
              </select>
            </div>

            {exportSettings.format !== 'image/png' && (
              <div className="mb-4">
                <label className="text-xs text-gray-500 flex justify-between mb-1">
                  <span>Quality</span>
                  <span>{Math.round(exportSettings.quality * 100)}%</span>
                </label>
                <input 
                  type="range" 
                  min="0.1" max="1" step="0.1"
                  value={exportSettings.quality}
                  onChange={(e) => setExportSettings({...exportSettings, quality: Number(e.target.value)})}
                  className="w-full accent-blue-600"
                />
              </div>
            )}

            <button 
              onClick={handleExport}
              disabled={images.length === 0 || isExporting}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              {isExporting ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Download size={18} />
                  Download Full Resolution
                </>
              )}
            </button>
            <p className="text-center text-[10px] text-gray-400 mt-2">
              Export is rendered directly in your browser. No data is sent to a server.
            </p>
          </SidebarSection>

        </div>
      </div>

      {/* Image Edit Modal */}
      {editingImage && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
           <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                 <h3 className="font-bold text-gray-800 flex items-center gap-2"><Edit2 size={18}/> Crop & Edit Image</h3>
                 <button onClick={() => setEditingImage(null)} className="text-gray-400 hover:text-gray-700 transition-colors">
                    <X size={20} />
                 </button>
              </div>
              
              <div className="p-5 space-y-5">
                 
                 {/* Preview Container: Darkroom Crop Mask Interface */}
                 {/* Explicitly track outer container to prevent iOS Safari Flexbox aspect-ratio collapse */}
                 <div ref={previewBoxRef} className="w-full h-[40vh] flex items-center justify-center relative bg-gray-900 rounded-lg overflow-hidden select-none p-4">
                     {previewMath && (
                         <div 
                           className="relative touch-none cursor-move flex-shrink-0 mx-auto"
                           style={{
                              width: `${previewMath.innerBoxW}px`,
                              height: `${previewMath.innerBoxH}px`
                           }}
                           onMouseDown={handlePreviewPointerDown}
                           onMouseMove={handlePreviewPointerMove}
                           onMouseUp={handlePreviewPointerUp}
                           onMouseLeave={handlePreviewPointerUp}
                           onTouchStart={handlePreviewPointerDown}
                           onTouchMove={handlePreviewPointerMove}
                           onTouchEnd={handlePreviewPointerUp}
                           onWheel={handlePreviewWheel}
                         >
                            {/* Invisible spacer image to force flexbox sizing safely on iOS */}
                            <img 
                                src={previewMath.imgUrl} 
                                className="invisible pointer-events-none block"
                                alt=""
                                style={{ 
                                    width: previewMath.isRotated ? 'auto' : '100%', 
                                    height: previewMath.isRotated ? '100%' : 'auto', 
                                    maxHeight: '40vh', 
                                    maxWidth: '100%',
                                    aspectRatio: `${previewMath.visualImgW} / ${previewMath.visualImgH}`
                                }} 
                            />
                         
                            {/* The Static Original Image Base */}
                            <img
                              src={previewMath.imgUrl}
                              alt="Editing preview"
                              draggable={false}
                              style={{
                                 position: 'absolute',
                                 top: '50%',
                                 left: '50%',
                                 width: previewMath.isRotated ? `${(previewMath.visualImgH / previewMath.visualImgW) * 100}%` : '100%',
                                 height: previewMath.isRotated ? `${(previewMath.visualImgW / previewMath.visualImgH) * 100}%` : '100%',
                                 objectFit: 'contain',
                                 transform: `translate(-50%, -50%) rotate(${previewMath.edits.rotation}deg) scale(${previewMath.edits.flipX ? -1 : 1}, ${previewMath.edits.flipY ? -1 : 1})`,
                                 filter: `brightness(${previewMath.edits.brightness}%) contrast(${previewMath.edits.contrast}%) saturate(${previewMath.edits.saturation}%)`,
                                 pointerEvents: 'none'
                              }}
                            />
                            
                            {/* The Overlay Crop Mask (Box with Shadow) */}
                            <div className="absolute z-10 pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] border-2 border-white/90"
                                 style={{
                                    width: `${previewMath.overlayWidthPct}%`,
                                    height: `${previewMath.overlayHeightPct}%`,
                                    left: `calc(50% + ${previewMath.overlayLeftOffsetPct}%)`,
                                    top: `calc(50% + ${previewMath.overlayTopOffsetPct}%)`,
                                    transform: 'translate(-50%, -50%)'
                                 }}>
                               {/* Rule of Thirds Inner Grid */}
                               <div className="w-full h-full grid grid-cols-3 grid-rows-3 opacity-50">
                                  <div className="border-r border-b border-white" />
                                  <div className="border-r border-b border-white" />
                                  <div className="border-b border-white" />
                                  <div className="border-r border-b border-white" />
                                  <div className="border-r border-b border-white" />
                                  <div className="border-b border-white" />
                                  <div className="border-r border-white" />
                                  <div className="border-r border-white" />
                                  <div className="" />
                               </div>
                            </div>
                         </div>
                     )}
                 </div>

                 {/* Quick Action Toolbar */}
                 <div className="flex justify-center gap-2 border-b border-gray-100 pb-4">
                    <button onClick={() => handleImageEdit(editingImage.id, 'rotation', (r: number) => (r - 90) % 360)} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors" title="Rotate Left">
                       <RotateCcw size={18} />
                    </button>
                    <button onClick={() => handleImageEdit(editingImage.id, 'rotation', (r: number) => (r + 90) % 360)} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors" title="Rotate Right">
                       <RotateCw size={18} />
                    </button>
                    <button onClick={() => handleImageEdit(editingImage.id, 'flipX', (f: boolean) => !f)} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors ml-2" title="Flip Horizontal">
                       <FlipHorizontal size={18} />
                    </button>
                    <button onClick={() => handleImageEdit(editingImage.id, 'flipY', (f: boolean) => !f)} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors" title="Flip Vertical">
                       <FlipVertical size={18} />
                    </button>
                    <button onClick={() => setImageEdits(prev => ({...prev, [editingImage.id]: { ...DEFAULT_EDITS }}))} className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors ml-4 flex items-center gap-1 text-xs font-bold" title="Reset Edits">
                       <RefreshCcw size={14} /> Reset
                    </button>
                 </div>

                 {/* Controls */}
                 <div className="space-y-6 max-h-[40vh] overflow-y-auto pr-2 pb-2">
                    
                    <div>
                      <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-3">Crop Zoom</h4>
                      <div className="space-y-4">
                        {[
                          { id: 'scale', label: 'Zoom Level', min: 1, max: 3, step: 0.05, default: 1, unit: 'x' },
                        ].map(control => {
                          const val = imageEdits[editingImage.id]?.[control.id as keyof ImageEditState] ?? control.default;
                          return (
                            <div key={control.id}>
                              <div className="flex justify-between mb-1">
                                <label className="text-xs font-medium text-gray-600">{control.label}</label>
                                <span className="text-xs text-gray-400">{val}{control.unit}</span>
                              </div>
                              <input 
                                type="range" min={control.min} max={control.max} step={control.step} value={Number(val)}
                                onChange={(e) => handleImageEdit(editingImage.id, control.id as any, Number(e.target.value))}
                                className="w-full accent-blue-600"
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                      <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-3">Color Filters</h4>
                      <div className="space-y-4">
                        {[
                          { id: 'brightness', label: 'Brightness', min: 0, max: 200, step: 1, default: 100, unit: '%' },
                          { id: 'contrast', label: 'Contrast', min: 0, max: 200, step: 1, default: 100, unit: '%' },
                          { id: 'saturation', label: 'Saturation', min: 0, max: 200, step: 1, default: 100, unit: '%' },
                        ].map(control => {
                          const val = imageEdits[editingImage.id]?.[control.id as keyof ImageEditState] ?? control.default;
                          return (
                            <div key={control.id}>
                              <div className="flex justify-between mb-1">
                                <label className="text-xs font-medium text-gray-600">{control.label}</label>
                                <span className="text-xs text-gray-400">{val}{control.unit}</span>
                              </div>
                              <input 
                                type="range" min={control.min} max={control.max} step={control.step} value={Number(val)}
                                onChange={(e) => handleImageEdit(editingImage.id, control.id as any, Number(e.target.value))}
                                className="w-full accent-blue-600"
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>

                 </div>

                 <button 
                   onClick={() => setEditingImage(null)}
                   className="w-full py-3 mt-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium shadow-sm"
                 >
                   Done
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Error Toast */}
      {errorMsg && (
        <div className="fixed bottom-4 right-4 bg-red-600 text-white px-4 py-3 rounded-lg shadow-xl z-[100] flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4">
          <span className="text-sm font-medium">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="p-1 hover:bg-red-700 rounded-full transition-colors"><X size={16}/></button>
        </div>
      )}

    </div>
  );
}