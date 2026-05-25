import React, { useState, useEffect, useRef } from 'react';
import { FileText, Menu, ChevronLeft, ChevronRight, Loader2, Trash2, Sparkles, X, Send, ZoomIn, ZoomOut, MousePointer2, PenTool, Highlighter, Eraser, Save, LogIn, Upload, Square, Circle, Undo2, RefreshCcw } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, query, updateDoc, deleteDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDTPNngVd0_e46tSKiFQKbz4WlLHiunVBc",
    authDomain: "duanhoctap-thanhloc.firebaseapp.com",
    projectId: "duanhoctap-thanhloc",
    storageBucket: "duanhoctap-thanhloc.firebasestorage.app",
    messagingSenderId: "735424857047",
    appId: "1:735424857047:web:85c2f34bd6a863d5114192",
    measurementId: "G-7ENS6J27XM"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const appId = 'duanhoctap-thanhloc';

const CLOUDINARY_CLOUD_NAME = "de2sbkxic"; 
const CLOUDINARY_UPLOAD_PRESET = "ml_default"; 

export default function App() {
    const [username, setUsername] = useState(localStorage.getItem('my_username') || '');
    const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('my_username'));
    const [files, setFiles] = useState([]);
    const [currentFile, setCurrentFile] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newFileName, setNewFileName] = useState('');
    const [newFile, setNewFile] = useState(null); 
    const [isAddingDoc, setIsAddingDoc] = useState(false);
    
    // PDF State
    const [pdfJsLoaded, setPdfJsLoaded] = useState(false);
    const [pdfDoc, setPdfDoc] = useState(null);
    const [pageNum, setPageNum] = useState(1);
    const [scale, setScale] = useState(1.5);
    const [isRendering, setIsRendering] = useState(false);
    const canvasRef = useRef(null);
    const drawCanvasRef = useRef(null);
    
    // Draw State
    const [drawMode, setDrawMode] = useState('pan'); 
    const [strokesByPage, setStrokesByPage] = useState({});
    const [currentStroke, setCurrentStroke] = useState(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [saveStatus, setSaveStatus] = useState('saved');

    // Pen Settings (Mặc định bút 6px)
    const [penColor, setPenColor] = useState('#ef4444');
    const [penSize, setPenSize] = useState(6);
    const [penCap, setPenCap] = useState('round');
    const [highlighterColor, setHighlighterColor] = useState('#ffeb3b');
    const [highlighterSize, setHighlighterSize] = useState(20);
    const [highlighterCap, setHighlighterCap] = useState('round');
    const [showSettings, setShowSettings] = useState(false);
    const [settingType, setSettingType] = useState('pen');

    // AI State
    const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
    const [extractedText, setExtractedText] = useState("");
    const [aiPrompt, setAiPrompt] = useState("");
    const [aiChatHistory, setAiChatHistory] = useState([{ role: 'ai', text: 'Chào bạn! Mình là đệ của Thành Lộc. thắc mắc gì cứ hỏi mình nhé!' }]);
    const [aiLoading, setAiLoading] = useState(false);

    // Auth & Data
    const handleLogin = (e) => { e.preventDefault(); if (username.trim()) { localStorage.setItem('my_username', username.trim().toLowerCase()); setIsLoggedIn(true); } };
    const handleLogout = () => { localStorage.removeItem('my_username'); setIsLoggedIn(false); setFiles([]); setCurrentFile(null); };

    useEffect(() => {
        if (!isLoggedIn || !username) return;
        const filesRef = collection(db, 'artifacts', appId, 'users', username, 'pdfs');
        return onSnapshot(query(filesRef), (snapshot) => {
            const list = []; snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
            setFiles(list.sort((a, b) => b.createdAt - a.createdAt));
        });
    }, [isLoggedIn, username]);

    useEffect(() => {
        const savedFileId = localStorage.getItem('lastViewedFileId');
        if (savedFileId && files.length > 0 && !currentFile) {
            const savedFile = files.find(f => f.id === savedFileId);
            if (savedFile) setCurrentFile(savedFile);
        }
    }, [files]);

    useEffect(() => {
        if (currentFile) {
            localStorage.setItem('lastViewedFileId', currentFile.id);
            if (currentFile.annotations) {
                try { setStrokesByPage(JSON.parse(currentFile.annotations)); } catch(e) { setStrokesByPage({}); }
            } else { setStrokesByPage({}); }
        }
    }, [currentFile?.id]);

    useEffect(() => {
        if (!isLoggedIn || !currentFile || Object.keys(strokesByPage).length === 0) return;
        const annotationsString = JSON.stringify(strokesByPage);
        if (currentFile.annotations === annotationsString) return;

        setSaveStatus('saving');
        const timer = setTimeout(async () => {
            try {
                const fileRef = doc(db, 'artifacts', appId, 'users', username, 'pdfs', currentFile.id);
                await updateDoc(fileRef, { annotations: annotationsString });
                setCurrentFile(prev => ({ ...prev, annotations: annotationsString }));
                setSaveStatus('saved');
            } catch (error) { setSaveStatus('error'); }
        }, 1500);
        return () => clearTimeout(timer);
    }, [strokesByPage, currentFile?.id, username]);

    // PDF Load
    useEffect(() => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
        script.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js'; setPdfJsLoaded(true); };
        document.body.appendChild(script);
    }, []);

    useEffect(() => {
        if (!currentFile || !pdfJsLoaded) return;
        const loadPDF = async () => {
            setIsRendering(true); setPdfDoc(null);
            try {
                let formattedUrl = currentFile.url.replace('http://', 'https://').replace(/ /g, '%20');
                const fetchAndCheckBinary = async (url) => {
                    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
                    if (!res.ok) throw new Error("Mã lỗi HTTP: " + res.status);
                    const data = await res.arrayBuffer();
                    if (data.byteLength < 100) throw new Error("File PDF rỗng.");
                    return window.pdfjsLib.getDocument({ data }).promise;
                };

                const strategies = [
                    () => window.pdfjsLib.getDocument(formattedUrl).promise,
                    () => fetchAndCheckBinary(formattedUrl),
                    () => fetchAndCheckBinary(`https://corsproxy.io/?${encodeURIComponent(formattedUrl)}`)
                ];

                let pdf = null;
                for (let i = 0; i < strategies.length; i++) {
                    try { pdf = await strategies[i](); break; } catch (err) {}
                }
                if (!pdf) throw new Error("Không thể tải file.");
                setPdfDoc(pdf); setPageNum(1);
            } catch (error) { alert("Lỗi tải PDF: " + error.message); setPdfDoc(null); } 
            finally { setIsRendering(false); }
        };
        loadPDF();
    }, [currentFile?.url, pdfJsLoaded]);

    useEffect(() => {
        if (!pdfDoc || !canvasRef.current || !drawCanvasRef.current) return;
        const renderPage = async (num) => {
            setIsRendering(true); setExtractedText(""); 
            try {
                const page = await pdfDoc.getPage(num);
                const viewport = page.getViewport({ scale: scale });
                canvasRef.current.height = viewport.height; canvasRef.current.width = viewport.width;
                drawCanvasRef.current.height = viewport.height; drawCanvasRef.current.width = viewport.width;
                await page.render({ canvasContext: canvasRef.current.getContext('2d'), viewport: viewport }).promise;
                
                try {
                    const textContent = await page.getTextContent();
                    setExtractedText(textContent.items.map(item => item.str).join(' '));
                } catch (e) {}
            } catch (e) {}
            setIsRendering(false);
        };
        renderPage(pageNum);
    }, [pdfDoc, pageNum, scale]);

    // Draw Logic
    const getCoordinates = (e) => {
        const rect = drawCanvasRef.current.getBoundingClientRect();
        const clientX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
        const clientY = e.clientY || (e.touches ? e.touches[0].clientY : 0);
        return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
    };

    const handleDrawStart = (e) => {
        if (drawMode === 'pan') return;
        setIsDrawing(true);
        const coords = getCoordinates(e);
        if (drawMode === 'eraser') { eraseAt(coords); return; }
        
        setCurrentStroke({
            type: drawMode, 
            points: [coords, coords], 
            color: drawMode === 'highlighter' ? highlighterColor : penColor, 
            width: drawMode === 'highlighter' ? highlighterSize : penSize,
            cap: drawMode === 'highlighter' ? highlighterCap : penCap
        });
    };

    const handleDrawMove = (e) => {
        if (!isDrawing || !currentStroke) return;
        const coords = getCoordinates(e);
        setCurrentStroke(prev => ({ ...prev, points: [...prev.points, coords] }));
    };

    const handleDrawEnd = () => {
        if (!isDrawing) return;
        setIsDrawing(false);
        if (currentStroke) setStrokesByPage(prev => ({ ...prev, [pageNum]: [...(prev[pageNum] || []), currentStroke] }));
        setCurrentStroke(null);
    };

    const eraseAt = (coords) => {
        setStrokesByPage(prev => {
            const pageStrokes = prev[pageNum] || [];
            return { ...prev, [pageNum]: pageStrokes.filter(s => !s.points.some(p => Math.hypot(p.x - coords.x, p.y - coords.y) < 20/scale)) };
        });
    };

    const handleUndo = () => {
        setStrokesByPage(prev => {
            const pageStrokes = prev[pageNum] || [];
            if (pageStrokes.length === 0) return prev;
            return { ...prev, [pageNum]: pageStrokes.slice(0, -1) };
        });
    };

    const handleClearPage = () => {
        if (window.confirm("Bạn có chắc muốn xóa sạch các nét vẽ trên trang này?")) {
            setStrokesByPage(prev => ({ ...prev, [pageNum]: [] }));
        }
    };

    const handleToolDoubleClick = (mode) => {
        setDrawMode(mode); setSettingType(mode); setShowSettings(true);
    };

    useEffect(() => {
        const canvas = drawCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const allStrokes = [...(strokesByPage[pageNum] || []), ...(currentStroke ? [currentStroke] : [])];
        allStrokes.forEach(s => {
            if (s.type === 'highlighter') { ctx.globalAlpha = 0.4; ctx.globalCompositeOperation = 'multiply'; }
            else { ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; }

            const isDot = s.points.length <= 2 && (s.points.length === 1 || (s.points[0].x === s.points[s.points.length-1].x && s.points[0].y === s.points[s.points.length-1].y));

            if (isDot && s.points.length > 0) {
                ctx.fillStyle = s.color;
                const px = s.points[0].x * scale;
                const py = s.points[0].y * scale;
                const radius = (s.width * scale) / 2;
                
                if (s.cap === 'square') {
                    ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
                } else {
                    ctx.beginPath();
                    ctx.arc(px, py, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else {
                ctx.beginPath(); ctx.lineCap = s.cap || 'round'; ctx.lineJoin = 'round';
                ctx.strokeStyle = s.color; ctx.lineWidth = s.width * scale;
                s.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x * scale, p.y * scale) : ctx.lineTo(p.x * scale, p.y * scale));
                ctx.stroke(); 
            }
            ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over';
        });
    }, [strokesByPage, currentStroke, pageNum, scale]);

    const handleAddDocument = async (e) => {
        e.preventDefault(); if (!isLoggedIn || !newFileName.trim() || !newFile) return;
        setIsAddingDoc(true);
        try {
            const formData = new FormData(); formData.append('file', newFile); formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
            const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: 'POST', body: formData });
            const data = await res.json(); if (!res.ok) throw new Error(data.error?.message);
            await addDoc(collection(db, 'artifacts', appId, 'users', username, 'pdfs'), { name: newFileName, url: data.secure_url, createdAt: Date.now() });
            setShowAddModal(false); setNewFileName(''); setNewFile(null);
        } catch (error) { alert(`Lỗi: ${error.message}`); } finally { setIsAddingDoc(false); }
    };

    const handleDeleteFile = async (file, e) => {
        e.stopPropagation();
        if (window.confirm("Xóa đề thi này?")) {
            await deleteDoc(doc(db, 'artifacts', appId, 'users', username, 'pdfs', file.id));
            if (currentFile?.id === file.id) { setCurrentFile(null); setPdfDoc(null); setStrokesByPage({}); localStorage.removeItem('lastViewedFileId'); }
        }
    };

    const handleAiSubmit = async (e) => {
        e.preventDefault();
        const queryText = aiPrompt.trim();
        if (!queryText) return;
        
        setAiPrompt('');
        setAiChatHistory(prev => [...prev, { role: 'user', text: queryText }]);
        setAiLoading(true);

        try {
            const apiKey = ""; 
            let base64Image = null;

            if (canvasRef.current && drawCanvasRef.current) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvasRef.current.width;
                tempCanvas.height = canvasRef.current.height;
                const tCtx = tempCanvas.getContext('2d');
                
                tCtx.fillStyle = '#ffffff';
                tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                tCtx.drawImage(canvasRef.current, 0, 0);
                tCtx.drawImage(drawCanvasRef.current, 0, 0);
                
                const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.8);
                base64Image = dataUrl.split(',')[1];
            }

            const contextPrompt = `Tôi đang xem tài liệu và có đính kèm MỘT BỨC ẢNH CHỤP MÀN HÌNH CỦA TRANG HIỆN TẠI.
Lưu ý: Bức ảnh này bao gồm chữ in của tài liệu, và có thể bao gồm các nét vẽ mực đỏ, khoanh tròn, highlight dạ quang do chính tôi vừa vẽ vào.
Hãy đóng vai một gia sư, đàn em của Thành Lộc, nhìn vào hình ảnh và các dấu hiệu tôi khoanh tròn/chỉ định để trả lời câu hỏi sau: ${queryText}
YÊU CẦU QUAN TRỌNG: Hãy trả lời thật ngắn gọn, súc tích, đi thẳng vào trọng tâm, tuyệt đối không giải thích dài dòng.`;

            const parts = [{ text: contextPrompt }];
            
            if (base64Image) {
                parts.push({
                    inlineData: {
                        mimeType: "image/jpeg",
                        data: base64Image
                    }
                });
            }

            let attempt = 0, response = null;
            while (attempt < 5) {
                try {
                    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents: [{ parts: parts }] })
                    });
                    if (response.ok) break; throw new Error(`Lỗi ${response.status}`);
                } catch (err) {
                    attempt++; if (attempt >= 5) throw err;
                    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
                }
            }
            
            const data = await response.json();
            const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Xin lỗi, AI không thể tạo ra câu trả lời lúc này.";
            setAiChatHistory(prev => [...prev, { role: 'ai', text: aiText }]);
        } catch (error) { 
            setAiChatHistory(prev => [...prev, { role: 'ai', text: `Lỗi kết nối AI: ${error.message}` }]); 
        } finally { 
            setAiLoading(false); 
        }
    };

    if (!isLoggedIn) {
        return (
            <div className="flex h-screen bg-gray-100 items-center justify-center p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center border border-gray-100">
                    <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4"><FileText className="w-8 h-8" /></div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2"> siêu cấp vip pờ rồ</h2>
                    <p className="text-gray-500 mb-6 text-sm">hãy tạo hoặc nhập mã đăng nhập cá nhân.</p>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <input type="text" required value={username} onChange={e => setUsername(e.target.value)} placeholder="VD: thanhloc2026" className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-center font-medium" />
                        <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2"><LogIn className="w-5 h-5" /> zôooo</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-[#e5e7eb] font-sans overflow-hidden">
            {/* Modal Upload */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50"><h3 className="font-semibold text-gray-800">Tải Tài Liệu Lên</h3><button onClick={() => setShowAddModal(false)}><X className="w-5 h-5 text-gray-400" /></button></div>
                        <form onSubmit={handleAddDocument} className="p-6 space-y-4">
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">Tên Đề thi</label><input type="text" required value={newFileName} onChange={e => setNewFileName(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="VD: Đề Toán HK1..." /></div>
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">Chọn file </label><input type="file" accept="application/pdf" required onChange={e => setNewFile(e.target.files[0])} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
                            <button type="submit" disabled={isAddingDoc} className="w-full py-2 bg-indigo-600 text-white rounded-lg flex items-center justify-center gap-2">{isAddingDoc ? <Loader2 className="animate-spin" /> : <Upload />} Tải lên</button>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Cài đặt bút */}
            {showSettings && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-72 overflow-hidden">
                        <div className="p-4 border-b flex justify-between bg-gray-50"><h3 className="font-semibold text-gray-800">Tùy chỉnh {settingType === 'pen' ? 'Bút vẽ' : 'Dạ quang'}</h3><button onClick={() => setShowSettings(false)}><X className="w-5 h-5 text-gray-400" /></button></div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Màu sắc</label>
                                <input type="color" value={settingType === 'pen' ? penColor : highlighterColor} onChange={(e) => settingType === 'pen' ? setPenColor(e.target.value) : setHighlighterColor(e.target.value)} className="w-full h-12 cursor-pointer rounded-lg border-2 border-gray-200" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Kích thước nét: {settingType === 'pen' ? penSize : highlighterSize}px</label>
                                <input type="range" min="1" max="50" value={settingType === 'pen' ? penSize : highlighterSize} onChange={(e) => settingType === 'pen' ? setPenSize(Number(e.target.value)) : setHighlighterSize(Number(e.target.value))} className="w-full accent-indigo-600" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Kiểu đầu bút</label>
                                <div className="flex gap-2">
                                    <button onClick={() => settingType === 'pen' ? setPenCap('round') : setHighlighterCap('round')} className={`flex-1 p-2 border rounded-lg flex justify-center items-center gap-2 ${(settingType === 'pen' ? penCap : highlighterCap) === 'round' ? 'bg-indigo-100 border-indigo-500 text-indigo-700' : 'bg-white'}`}><Circle className="w-4 h-4"/> Tròn</button>
                                    <button onClick={() => settingType === 'pen' ? setPenCap('square') : setHighlighterCap('square')} className={`flex-1 p-2 border rounded-lg flex justify-center items-center gap-2 ${(settingType === 'pen' ? penCap : highlighterCap) === 'square' ? 'bg-indigo-100 border-indigo-500 text-indigo-700' : 'bg-white'}`}><Square className="w-4 h-4"/> Vuông</button>
                                </div>
                            </div>
                            <button onClick={() => setShowSettings(false)} className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium transition-colors">Hoàn tất</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sidebar Trái */}
            <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} bg-white border-r flex flex-col transition-all duration-300 z-10 shrink-0 overflow-hidden`}>
                <div className="p-4 border-b flex items-center justify-between w-64">
                    <div className="text-indigo-600 font-bold text-xl flex items-center gap-2"><FileText /> Heloooooo</div>
                    <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-red-500 underline">Thoát</button>
                </div>
                <div className="p-3 bg-indigo-50 text-indigo-800 text-sm font-medium flex items-center gap-2 border-b w-64"><div className="w-2 h-2 rounded-full bg-green-500"></div> <span className="truncate">User: {username}</span></div>
                <div className="p-4 w-64"><button onClick={() => setShowAddModal(true)} className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex justify-center gap-2"><Upload className="w-5 h-5" /> Tải File Lên</button></div>
                <div className="flex-1 overflow-y-auto px-2 w-64">
                    {files.map(f => (
                        <div key={f.id} onClick={() => setCurrentFile(f)} className={`group flex items-center justify-between p-2 rounded-md cursor-pointer mb-1 ${currentFile?.id === f.id ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50'}`}>
                            <span className="truncate pr-2 flex items-center gap-2 text-sm"><FileText className="w-4 h-4 text-gray-400" /> {f.name}</span>
                            <button onClick={(e) => handleDeleteFile(f, e)} className="opacity-0 group-hover:opacity-100 text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col relative overflow-hidden">
                
                {/* THANH MENU NHỎ GỌN TRÊN CÙNG (Giảm chiều cao, nút bấm nhỏ lại) */}
                <div className="h-12 bg-white shadow-sm flex items-center justify-between px-2 shrink-0 z-20 overflow-x-auto border-b border-gray-200">
                    
                    {/* GÓC TRÁI: Toggle Sidebar & Tên File */}
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 hover:bg-gray-100 rounded-md"><Menu className="w-4 h-4 text-gray-600" /></button>
                        <div className="flex items-center gap-2">
                            <h2 className="font-semibold text-gray-800 truncate max-w-[100px] sm:max-w-[200px] text-sm">{currentFile ? currentFile.name : 'Chưa chọn tài liệu'}</h2>
                            {currentFile && (
                                <div className="flex items-center">
                                    {saveStatus === 'saving' && <span className="text-[10px] text-yellow-600 flex items-center font-medium"><Loader2 className="w-3 h-3 animate-spin mr-1"/> Lưu...</span>}
                                    {saveStatus === 'saved' && <span className="text-[10px] text-emerald-600 flex items-center font-medium"><Save className="w-3 h-3 mr-1"/> Đã lưu</span>}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Ở GIỮA: Công cụ vẽ */}
                    {pdfDoc && (
                        <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-lg border border-gray-200 shrink-0 mx-2">
                            <button onClick={() => setDrawMode('pan')} className={`p-1.5 rounded-md transition-colors ${drawMode === 'pan' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:bg-gray-200'}`} title="Di chuyển trang"><MousePointer2 className="w-4 h-4" /></button>
                            <div className="w-px h-4 bg-gray-300 mx-0.5"></div>
                            
                            <button onClick={() => setDrawMode('pen')} onDoubleClick={() => handleToolDoubleClick('pen')} className={`p-1.5 rounded-md transition-colors ${drawMode === 'pen' ? 'bg-white shadow text-red-500' : 'text-gray-500 hover:bg-gray-200'}`} title="Bút vẽ (Click đúp)"><PenTool className="w-4 h-4" /></button>
                            <button onClick={() => setDrawMode('highlighter')} onDoubleClick={() => handleToolDoubleClick('highlighter')} className={`p-1.5 rounded-md transition-colors ${drawMode === 'highlighter' ? 'bg-white shadow text-yellow-500' : 'text-gray-500 hover:bg-gray-200'}`} title="Dạ quang (Click đúp)"><Highlighter className="w-4 h-4" /></button>
                            <button onClick={() => setDrawMode('eraser')} className={`p-1.5 rounded-md transition-colors ${drawMode === 'eraser' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:bg-gray-200'}`} title="Cục tẩy"><Eraser className="w-4 h-4" /></button>
                            
                            <div className="w-px h-4 bg-gray-300 mx-0.5"></div>
                            
                            <button onClick={handleUndo} className="p-1.5 rounded-md text-gray-500 hover:bg-gray-200" title="Hoàn tác"><Undo2 className="w-4 h-4" /></button>
                            <button onClick={handleClearPage} className="p-1.5 rounded-md text-red-400 hover:bg-red-50 hover:text-red-600" title="Xóa sạch"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    )}

                    {/* GÓC PHẢI: Zoom, Trang, AI */}
                    <div className="flex items-center gap-1 shrink-0">
                        {pdfDoc && (
                            <>
                                <div className="flex items-center gap-0.5 bg-gray-50 p-1 rounded-lg border border-gray-200">
                                    <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="p-1 rounded-md text-gray-500 hover:bg-gray-200"><ZoomOut className="w-4 h-4" /></button>
                                    <span className="text-xs font-medium w-10 text-center">{Math.round(scale * 100)}%</span>
                                    <button onClick={() => setScale(s => Math.min(3, s + 0.25))} className="p-1 rounded-md text-gray-500 hover:bg-gray-200"><ZoomIn className="w-4 h-4" /></button>
                                </div>
                                <div className="flex items-center gap-0.5 bg-gray-50 p-1 rounded-lg border border-gray-200">
                                    <button onClick={() => setPageNum(p => Math.max(1, p - 1))} disabled={pageNum <= 1} className="p-1 rounded-md text-gray-500 hover:bg-gray-200 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                                    <span className="text-xs font-medium w-12 text-center">Trang {pageNum}</span>
                                    <button onClick={() => setPageNum(p => Math.min(pdfDoc.numPages, p + 1))} disabled={pageNum >= pdfDoc.numPages} className="p-1 rounded-md text-gray-500 hover:bg-gray-200 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                                </div>
                            </>
                        )}
                        <button onClick={() => setIsAiSidebarOpen(!isAiSidebarOpen)} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-medium transition-all shadow-sm">
                            <Sparkles className="w-4 h-4" /> <span className="hidden sm:inline text-xs">đệ của Lộc</span>
                        </button>
                    </div>
                </div>

                {/* KHU VỰC ĐỌC PDF - TOÀN MÀN HÌNH KHÔNG BỊ KHUẤT KHI ZOOM */}
                <div className="flex-1 flex overflow-hidden relative bg-[#525659]">
                    <div className={`flex-1 overflow-auto p-2 sm:p-4 text-center ${drawMode !== 'pan' ? 'cursor-crosshair' : 'cursor-grab'}`}>
                        {!currentFile ? (
                            <div className="mt-20 text-center text-gray-400 inline-block"><FileText className="w-16 h-16 mx-auto opacity-50 mb-4" /><p className="text-lg font-medium">Chưa có tài liệu nào</p><p className="text-sm">Hãy chọn hoặc tải lên một đề thi để bắt đầu làm bài</p></div>
                        ) : (
                            <div className="relative shadow-2xl bg-white inline-block text-left align-top mx-auto mb-10">
                                {isRendering && <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>}
                                <canvas ref={canvasRef} className="block" />
                                <canvas 
                                    ref={drawCanvasRef} className="absolute top-0 left-0 block z-10 touch-none"
                                    style={{ pointerEvents: drawMode === 'pan' ? 'none' : 'auto' }}
                                    onMouseDown={handleDrawStart} onMouseMove={handleDrawMove} onMouseUp={handleDrawEnd} onMouseLeave={handleDrawEnd}
                                    onTouchStart={handleDrawStart} onTouchMove={handleDrawMove} onTouchEnd={handleDrawEnd}
                                />
                            </div>
                        )}
                    </div>

                    {/* KHU VỰC AI SIDEBAR */}
                    <div className={`${isAiSidebarOpen ? 'w-80 md:w-96 border-l border-gray-200 shadow-2xl' : 'w-0'} bg-white flex flex-col transition-all duration-300 z-30 shrink-0 overflow-hidden absolute right-0 top-0 bottom-0 sm:relative`}>
                        {isAiSidebarOpen && (
                            <>
                                <div className="p-4 border-b flex justify-between bg-gradient-to-r from-indigo-50 to-purple-50 shrink-0 w-full">
                                    <div className="font-semibold text-indigo-800 flex items-center gap-2"><Sparkles className="w-5 h-5 text-purple-500" /> Gia Sư AI</div>
                                    <button onClick={() => setIsAiSidebarOpen(false)} className="hover:bg-white p-1 rounded-md transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
                                </div>
                                
                                <div className="bg-blue-50 text-blue-700 text-xs px-4 py-2 border-b flex items-center justify-center gap-2 shrink-0">
                                    <FileText className="w-3 h-3" /> Chế độ Nhận diện Hình Ảnh (Trang {pageNum})
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 text-sm bg-gray-50/50 flex flex-col gap-4 w-full">
                                    {aiChatHistory.map((msg, i) => (
                                        <div key={i} className={`p-3 rounded-2xl max-w-[90%] shadow-sm ${msg.role === 'user' ? 'self-end bg-indigo-600 text-white rounded-br-sm' : 'self-start bg-white border border-gray-100 text-gray-800 rounded-bl-sm leading-relaxed'}`}>
                                            {msg.text}
                                        </div>
                                    ))}
                                    {aiLoading && <div className="self-start text-indigo-600 bg-white border border-gray-100 p-3 rounded-2xl rounded-bl-sm shadow-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> hmm. đang suy nghĩ...</div>}
                                </div>
                                <div className="p-3 border-t bg-white shrink-0 w-full shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                                    <form onSubmit={handleAiSubmit} className="flex gap-2">
                                        <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} disabled={aiLoading} className="flex-1 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow" placeholder="Hỏi AI về câu đã khoanh..." />
                                        <button type="submit" disabled={aiLoading || !aiPrompt} className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><Send className="w-5 h-5" /></button>
                                    </form>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
