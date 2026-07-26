import React, { useRef, useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, addDoc, onSnapshot, query, where, orderBy, deleteDoc, getDocs } from 'firebase/firestore';
import { 
  Pencil, 
  Eraser, 
  Square, 
  Circle, 
  Minus, 
  Trash2, 
  Download, 
  X, 
  Sparkles, 
  Palette, 
  Users,
  Undo2,
  Type
} from 'lucide-react';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  id?: string;
  boardId: string;
  senderId: string;
  tool: 'pen' | 'eraser' | 'line' | 'rectangle' | 'circle' | 'text';
  color: string;
  width: number;
  points: Point[];
  text?: string;
  created_at: string;
  action?: 'clear';
}

interface Props {
  boardId: string;
  currentUserId: string;
  currentUserName: string;
  onClose: () => void;
}

const COLOR_PALETTE = [
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#ffffff', // White
  '#94a3b8', // Slate
];

const STROKE_WIDTHS = [2, 4, 8, 14, 22];

export const CollaborativeWhiteboard: React.FC<Props> = ({
  boardId,
  currentUserId,
  currentUserName,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<'pen' | 'eraser' | 'line' | 'rectangle' | 'circle' | 'text'>('pen');
  const [color, setColor] = useState<string>('#10b981');
  const [width, setWidth] = useState<number>(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [textInput, setTextInput] = useState('');
  const [textPos, setTextPos] = useState<Point | null>(null);

  // 1. Subscribe to Firestore Realtime Whiteboard Strokes
  useEffect(() => {
    if (!boardId) return;

    const strokesCol = collection(db, 'whiteboard_strokes');
    const q = query(
      strokesCol,
      where('boardId', '==', boardId),
      orderBy('created_at', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const remoteStrokes: Stroke[] = [];
        let clearFound = false;

        snapshot.docs.forEach((doc) => {
          const data = doc.data() as Stroke;
          if (data.action === 'clear') {
            clearFound = true;
            remoteStrokes.length = 0; // Reset
          } else {
            remoteStrokes.push({ ...data, id: doc.id });
          }
        });

        setStrokes(remoteStrokes);
      },
      (err) => console.error('Whiteboard sync error:', err)
    );

    return () => unsub();
  }, [boardId]);

  // 2. Redraw Canvas whenever strokes change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid background guide lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    const gridSize = 24;
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Render all synced strokes
    strokes.forEach((stroke) => drawStrokeOnCanvas(ctx, stroke));

    // Render current active local stroke preview
    if (currentPoints.length > 0) {
      drawStrokeOnCanvas(ctx, {
        boardId,
        senderId: currentUserId,
        tool,
        color: tool === 'eraser' ? '#0f172a' : color,
        width,
        points: currentPoints,
        created_at: new Date().toISOString(),
      });
    }
  }, [strokes, currentPoints, tool, color, width, boardId, currentUserId]);

  // Canvas drawing helper
  const drawStrokeOnCanvas = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    const { points, tool, color, width, text } = stroke;
    if (!points || points.length === 0) return;

    ctx.save();
    ctx.strokeStyle = tool === 'eraser' ? '#0f172a' : color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'pen' || tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
    } else if (tool === 'line' && points.length >= 2) {
      const start = points[0];
      const end = points[points.length - 1];
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    } else if (tool === 'rectangle' && points.length >= 2) {
      const start = points[0];
      const end = points[points.length - 1];
      const w = end.x - start.x;
      const h = end.y - start.y;
      ctx.beginPath();
      ctx.strokeRect(start.x, start.y, w, h);
    } else if (tool === 'circle' && points.length >= 2) {
      const start = points[0];
      const end = points[points.length - 1];
      const radius = Math.hypot(end.x - start.x, end.y - start.y);
      ctx.beginPath();
      ctx.arc(start.x, start.y, radius, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (tool === 'text' && points.length > 0 && text) {
      ctx.font = `${Math.max(14, width * 3)}px sans-serif`;
      ctx.fillText(text, points[0].x, points[0].y);
    }

    ctx.restore();
  };

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoords(e);
    if (tool === 'text') {
      setTextPos(pt);
      return;
    }
    setIsDrawing(true);
    setCurrentPoints([pt]);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const pt = getCanvasCoords(e);
    setCurrentPoints((prev) => [...prev, pt]);
  };

  const handleMouseUp = async () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentPoints.length > 0) {
      const newStroke: Stroke = {
        boardId,
        senderId: currentUserId,
        tool,
        color: tool === 'eraser' ? '#0f172a' : color,
        width,
        points: currentPoints,
        created_at: new Date().toISOString(),
      };

      try {
        await addDoc(collection(db, 'whiteboard_strokes'), newStroke);
      } catch (err) {
        console.error('Error saving stroke:', err);
      }
    }

    setCurrentPoints([]);
  };

  const handleAddText = async () => {
    if (!textInput.trim() || !textPos) return;
    const textStroke: Stroke = {
      boardId,
      senderId: currentUserId,
      tool: 'text',
      color,
      width,
      points: [textPos],
      text: textInput.trim(),
      created_at: new Date().toISOString(),
    };

    try {
      await addDoc(collection(db, 'whiteboard_strokes'), textStroke);
    } catch (err) {
      console.error('Error adding text to whiteboard:', err);
    }

    setTextInput('');
    setTextPos(null);
  };

  const handleClearBoard = async () => {
    try {
      await addDoc(collection(db, 'whiteboard_strokes'), {
        boardId,
        senderId: currentUserId,
        action: 'clear',
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error clearing whiteboard:', err);
    }
  };

  const handleDownloadPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `whiteboard-${boardId}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 md:p-6 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl text-white relative">
        {/* Header Bar */}
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-100 flex items-center gap-2">
                Real-Time Collaborative Whiteboard
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
                  LIVE Firestore Sync
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Shared interactive canvas for private calls & diagrams
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPNG}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition border border-slate-700"
              title="Download PNG image"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" /> Save PNG
            </button>
            <button
              onClick={handleClearBoard}
              className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
              title="Clear Canvas for everyone"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear Canvas
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar & Canvas Workspace */}
        <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden bg-slate-950">
          {/* Tools Palette Bar */}
          <div className="p-3 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 flex md:flex-col items-center justify-between gap-3 shrink-0">
            {/* Tool selectors */}
            <div className="flex md:flex-col gap-1.5">
              <button
                onClick={() => setTool('pen')}
                className={`p-2.5 rounded-xl transition flex items-center gap-2 text-xs font-bold ${
                  tool === 'pen' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Pen / Brush"
              >
                <Pencil className="w-4 h-4" />
                <span className="hidden md:inline">Pen</span>
              </button>
              <button
                onClick={() => setTool('line')}
                className={`p-2.5 rounded-xl transition flex items-center gap-2 text-xs font-bold ${
                  tool === 'line' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Straight Line"
              >
                <Minus className="w-4 h-4" />
                <span className="hidden md:inline">Line</span>
              </button>
              <button
                onClick={() => setTool('rectangle')}
                className={`p-2.5 rounded-xl transition flex items-center gap-2 text-xs font-bold ${
                  tool === 'rectangle' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Rectangle"
              >
                <Square className="w-4 h-4" />
                <span className="hidden md:inline">Box</span>
              </button>
              <button
                onClick={() => setTool('circle')}
                className={`p-2.5 rounded-xl transition flex items-center gap-2 text-xs font-bold ${
                  tool === 'circle' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Circle"
              >
                <Circle className="w-4 h-4" />
                <span className="hidden md:inline">Circle</span>
              </button>
              <button
                onClick={() => setTool('text')}
                className={`p-2.5 rounded-xl transition flex items-center gap-2 text-xs font-bold ${
                  tool === 'text' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Text Annotation"
              >
                <Type className="w-4 h-4" />
                <span className="hidden md:inline">Text</span>
              </button>
              <button
                onClick={() => setTool('eraser')}
                className={`p-2.5 rounded-xl transition flex items-center gap-2 text-xs font-bold ${
                  tool === 'eraser' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Eraser"
              >
                <Eraser className="w-4 h-4" />
                <span className="hidden md:inline">Eraser</span>
              </button>
            </div>

            {/* Color Palette */}
            <div className="flex md:flex-col gap-1.5 border-t border-slate-800 pt-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition transform active:scale-90 ${
                    color === c ? 'ring-2 ring-emerald-400 scale-110' : 'opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>

            {/* Width Picker */}
            <div className="flex md:flex-col gap-1 border-t border-slate-800 pt-2">
              {STROKE_WIDTHS.map((w) => (
                <button
                  key={w}
                  onClick={() => setWidth(w)}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition ${
                    width === w ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          {/* Canvas Interactive Surface */}
          <div className="flex-1 relative bg-slate-950 overflow-hidden cursor-crosshair">
            <canvas
              ref={canvasRef}
              width={1000}
              height={700}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onTouchStart={handleMouseDown}
              onTouchMove={handleMouseMove}
              onTouchEnd={handleMouseUp}
              className="w-full h-full block touch-none"
            />

            {/* Text Input Floating Overlay */}
            {textPos && (
              <div
                className="absolute z-20 bg-slate-900 border border-emerald-500 rounded-2xl p-2.5 shadow-2xl flex items-center gap-2"
                style={{ top: Math.min(textPos.y, 500), left: Math.min(textPos.x, 700) }}
              >
                <input
                  type="text"
                  autoFocus
                  placeholder="Type note or text..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddText()}
                  className="bg-slate-950 border border-slate-800 text-white text-xs px-3 py-1.5 rounded-xl focus:outline-none focus:border-emerald-500 font-medium"
                />
                <button
                  onClick={handleAddText}
                  className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-500 transition"
                >
                  Add
                </button>
                <button
                  onClick={() => setTextPos(null)}
                  className="p-1.5 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
