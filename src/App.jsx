import React, { useState, useEffect, useRef } from 'react';
import { FileText, Menu, ChevronLeft, ChevronRight, Loader2, Trash2, Sparkles, X, Send, Link as LinkIcon, Plus, ZoomIn, ZoomOut, MousePointer2, PenTool, Highlighter, Eraser, Save, LogIn, Upload } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, query, updateDoc, deleteDoc, doc } from 'firebase/firestore';

// --- BƯỚC 1: CẤU HÌNH FIREBASE CỦA BẠN ---
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

// --- BƯỚC 2: CẤU HÌNH CLOUDINARY ---
const CLOUDINARY_CLOUD_NAME = "de2sbkxic"; 
const CLOUDINARY_UPLOAD_PRESET = "ml_default"; 

export default function App() {
    const [username, setUsername] = useState(localStorage.getItem('my_username') || '');
    const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('my_username'));

    const [files, setFiles] = useState([]);
    const [currentFile, setCurrentFile] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    
    // State Modal & Upload
    const [showAddModal, setShowAddModal] = useState(false);
    const [newFileName, setNewFileName] = useState('');
    const [newFile, setNewFile] = useState(null); 
    const [isAddingDoc, setIsAddingDoc] = useState(false);
    
    // State PDF Viewer & Zoom
    const [pdfJsLoaded, setPdfJsLoaded] = useState(false);
    const [pdfDoc, setPdfDoc] = useState(null);
    const [pageNum, setPageNum] = useState(1);
    const [scale, setScale] = useState(1.5);
    const [isRendering, setIsRendering] = useState(false);
    const canvasRef = useRef(null);
    
    // State Vẽ & Tùy chỉnh (ĐÃ THÊM MÀU VÀ KÍCH THƯỚC)
    const drawCanvasRef = useRef(null);
    const [drawMode, setDrawMode] = useState('pan'); 
    const [strokesByPage, setStrokesByPage] = useState({});
    const [currentStroke, setCurrentStroke] = useState(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [saveStatus, setSaveStatus] = useState('saved');

    // State Tùy chỉnh Bút vẽ
    const [penColor, setPenColor] = useState('#ef4444'); // Mặc định màu đỏ
    const [penSize, setPenSize] = useState(2); // Kích thước mặc định
    const [highlighterColor, setHighlighterColor] = useState('#ffeb3b'); // Mặc định dạ quang vàng
    const [highlighterSize, setHighlighterSize] = useState(16); // Dạ quang mặc định to
    const [showSettings, setShowSettings] = useState(false);
    const [settingType, setSettingType] = useState('pen');

    // State AI
    const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
    const [extractedText, setExtractedText] = useState("");
    const [aiPrompt, setAiPrompt] = useState("");
    const [aiChatHistory, setAiChatHistory] = useState([
        { role: 'ai', text: 'Chào bạn! Mình là Gia sư AI. Mình đã đọc chữ trên trang này, hãy hỏi mình bất cứ điều gì nhé!' }
    ]);
    const [aiLoading, setAiLoading] = useState(false);

    const handleLogin = (e) => {
        e.preventDefault();
        const cleanName = username.trim().toLowerCase();
        if (cleanName) {
            localStorage.setItem('my_username', cleanName);
            setUsername(cleanName);
            setIsLoggedIn(true);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('my_username');
        setIsLoggedIn(false); setFiles([]); setCurrentFile(null);
    };

    const handleToolDoubleClick = (mode) => {
        setDrawMode(mode);
        setSettingType(mode);
        setShowSettings(true);
    };

    // Ngăn chặn cuộn trang khi đang vẽ
    useEffect(() => {
        const canvas = drawCanvasRef.current;
        if (!canvas) return;
        const preventScroll = (e) => { if (drawMode !== 'pan') e.preventDefault(); };
        canvas.addEventListener('touchstart', preventScroll, { passive: false });
        canvas.addEventListener('touchmove', preventScroll, { passive: false });
        return () => {
            canvas.removeEventListener('touchstart', preventScroll);
            canvas.removeEventListener('touchmove', preventScroll);
        };
    }, [drawMode, pageNum, scale]);

    useEffect(() => {
        if (!isLoggedIn || !username) return;
        const filesRef = collection(db, 'artifacts', appId, 'users', username, 'pdfs');
        const unsubscribe = onSnapshot(query(filesRef), (snapshot) => {
            const fileList = [];
            snapshot.forEach((doc) => fileList.push({ id: doc.id, ...doc.data() }));
            fileList.sort((a, b) => b.createdAt - a.createdAt);
            setFiles(fileList);
        });
        return () => unsubscribe();
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
                setFiles(prev => prev.map(f => f.id === currentFile.id ? { ...f, annotations: annotationsString } : f));
                setSaveStatus('saved');
            } catch (error) { setSaveStatus('error'); }
        }, 1500);
        return () => clearTimeout(timer);
    }, [strokesByPage, currentFile?.id, username]);

    // KIỂM TRA VÀ TẢI THƯ VIỆN PDF.JS
    useEffect(() => {
        if (window.pdfjsLib) {
            setPdfJsLoaded(true);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
        script.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
            setPdfJsLoaded(true);
        };
        document.body.appendChild(script);
    }, []);

    // HỆ THỐNG ĐỌC PDF
    useEffect(() => {
        if (!currentFile || !pdfJsLoaded) return;
        
        const loadPDF = async () => {
            setIsRendering(true);
            setPdfDoc(null); 
            try {
                let urlToLoad = currentFile.url; 
                if (!urlToLoad) throw new Error("URL file bị trống.");
                
                if (urlToLoad.includes('github.com') && urlToLoad.includes('/blob/')) {
                    urlToLoad = urlToLoad.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
                }
                
                let formattedUrl = urlToLoad.replace('http://', 'https://').replace(/ /g, '%20');
                
                let pdf = null;
                let lastErr = null;
                
                const fetchAndCheckBinary = async (url) => {
                    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
                    if (!res.ok) {
                        if (res.status === 403) throw new Error("Mã lỗi HTTP: 403");
                        throw new Error("Mã lỗi HTTP: " + res.status);
                    }
                    const data = await res.arrayBuffer();
                    if (data.byteLength < 100) {
                        throw new Error("File PDF rỗng (0 byte) hoặc bị máy chủ làm hỏng nội dung.");
                    }
                    return window.pdfjsLib.getDocument({ data }).promise;
                };

                const strategies = [
                    () => window.pdfjsLib.getDocument(formattedUrl).promise,
                    () => fetchAndCheckBinary(formattedUrl),
                    () => fetchAndCheckBinary(`https://corsproxy.io/?${encodeURIComponent(formattedUrl)}`)
                ];

                for (let i = 0; i < strategies.length; i++) {
                    try {
                        pdf = await strategies[i]();
                        break; 
                    } catch (err) {
                        lastErr = err;
                        if (err.message.includes("403")) break; 
                    }
                }

                if (!pdf) {
                    throw lastErr || new Error("Không thể tải file bằng bất kỳ phương thức nào.");
                }

                setPdfDoc(pdf);
                setPageNum(1);
            } catch (error) {
                console.error("LỖI HOÀN TOÀN:", error);
                const errMsg = error.message.toLowerCase();
                
                if (errMsg.includes("403")) {
                    alert("CẢNH BÁO BẢO MẬT TỪ CLOUDINARY (Lỗi 403):\n\nMáy chủ Cloudinary đang khóa chức năng xem file PDF.\n\nCách khắc phục:\n1. Mở trang web Cloudinary.com -> Chọn Settings (Bánh răng ở góc trái dưới) -> Chọn mục Security.\n2. Cuộn xuống tìm dòng 'Restricted media types'.\n3. TẮT dấu tick (bỏ chọn) ở ô 'Restrict delivery of PDF and ZIP files'.\n4. Cuộn xuống dưới cùng ấn nút 'Save' để lưu lại.\n\nSau khi làm xong, quay lại đây XÓA đề thi hiện tại, F5 tải lại trang và Tải Lên lại file PDF nhé!");
                } else if (errMsg.includes("0 byte") || errMsg.includes("zero bytes") || errMsg.includes("rỗng")) {
                    alert(`Không thể hiển thị tài liệu này.\nNguyên nhân: File tải lên bị rỗng (0 byte) hoặc đường dẫn bị lỗi (File không tồn tại). Vui lòng xóa file này và tải lại!`);
                } else {
                    alert(`Không thể tải được file PDF này.\nĐảm bảo URL hợp lệ và kết nối mạng ổn định.\nChi tiết: ${error.message}`);
                }
                
                setPdfDoc(null);
            } finally {
                setIsRendering(false);
            }
        };
        
        loadPDF();
    }, [currentFile?.url, pdfJsLoaded]);

    // VẼ TRANG PDF LÊN MÀN HÌNH
    useEffect(() => {
        if (!pdfDoc || !canvasRef.current || !drawCanvasRef.current) return;
        
        const renderPage = async (num) => {
            setIsRendering(true); 
            setExtractedText(""); 
            try {
                const page = await pdfDoc.getPage(num);
                const viewport = page.getViewport({ scale: scale });
                
                canvasRef.current.height = viewport.height; 
                canvasRef.current.width = viewport.width;
                drawCanvasRef.current.height = viewport.height; 
                drawCanvasRef.current.width = viewport.width;
                
                await page.render({ canvasContext: canvasRef.current.getContext('2d'), viewport: viewport }).promise;
                
                try {
                    const textContent = await page.getTextContent();
                    setExtractedText(textContent.items.map(item => item.str).join(' '));
                } catch (textErr) { console.warn("Trang này là ảnh, không có chữ để AI đọc."); }
            } catch (error) { 
                console.error("Lỗi vẽ PDF lên màn hình:", error); 
            }
            setIsRendering(false);
        };
        renderPage(pageNum);
    }, [pdfDoc, pageNum, scale]);

    const getCoordinates = (e) => {
        const rect = drawCanvasRef.current.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
    };

    const eraseAt = (coords) => {
        setStrokesByPage(prev => {
            const pageStrokes = prev[pageNum] || [];
            const eraserRadius = 15 / scale;
            const newStrokes = pageStrokes.filter(stroke => !stroke.points.some(p => Math.hypot(p.x - coords.x, p.y - coords.y) < eraserRadius));
            return { ...prev, [pageNum]: newStrokes };
        });
    };

    const handleDrawStart = (e) => {
        if (drawMode === 'pan') return;
        setIsDrawing(true);
        const coords = getCoordinates(e);
        if (drawMode === 'eraser') { eraseAt(coords); return; }
        setCurrentStroke({
            type: drawMode, 
            points: [coords],
            color: drawMode === 'highlighter' ? highlighterColor : penColor, 
            width: drawMode === 'highlighter' ? highlighterSize : penSize
        });
    };

    const handleDrawMove = (e) => {
        if (!isDrawing) return;
        const coords = getCoordinates(e);
        if (drawMode === 'eraser') { eraseAt(coords); return; }
        setCurrentStroke(prev => ({ ...prev, points: [...prev.points, coords] }));
    };

    const handleDrawEnd = () => {
        if (!isDrawing) return;
        setIsDrawing(false);
        if (currentStroke && currentStroke.points.length > 0) {
            setStrokesByPage(prev => ({ ...prev, [pageNum]: [...(prev[pageNum] || []), currentStroke] }));
        }
        setCurrentStroke(null);
    };

    // VẼ LẠI CÁC NÉT BÚT TƯƠNG TÁC
    useEffect(() => {
        const canvas = drawCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height); 
        
        const strokesToDraw = currentStroke ? [...(strokesByPage[pageNum] || []), currentStroke] : (strokesByPage[pageNum] || []);
        strokesToDraw.forEach(stroke => {
            ctx.beginPath(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            if (stroke.type === 'highlighter') { ctx.globalAlpha = 0.4; ctx.globalCompositeOperation = 'multiply'; } 
            else { ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; }
            
            ctx.strokeStyle = stroke.color; 
            ctx.lineWidth = stroke.width * scale; 
            
            stroke.points.forEach((p, i) => {
                const scaledX = p.x * scale; const scaledY = p.y * scale;
                if (i === 0) ctx.moveTo(scaledX, scaledY); else ctx.lineTo(scaledX, scaledY);
            });
            ctx.stroke();
        });
        ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over';
    }, [strokesByPage, currentStroke, pageNum, scale, isRendering]);

    // --- UPLOAD TRỰC TIẾP LÊN CLOUDINARY ---
    const handleAddDocument = async (e) => {
        e.preventDefault();
        if (!isLoggedIn || !newFileName.trim() || !newFile) return;
        setIsAddingDoc(true);
        try {
            const formData = new FormData();
            formData.append('file', newFile);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

            const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
                method: 'POST',
                body: formData
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error?.message || "Lỗi Cloudinary");

            const finalUrl = data.secure_url; 

            const filesRef = collection(db, 'artifacts', appId, 'users', username, 'pdfs');
            await addDoc(filesRef, { name: newFileName, url: finalUrl, createdAt: Date.now() });
            
            setShowAddModal(false); setNewFileName(''); setNewFile(null);
        } catch (error) { 
            console.error(error);
            alert(`Lỗi tải lên: ${error.message}`); 
        } finally { setIsAddingDoc(false); }
    };

    const handleDeleteFile = async (fileToDelete, e) => {
        e.stopPropagation();
        if (!isLoggedIn || !window.confirm("Bạn có chắc muốn xóa đề thi này?")) return;
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'users', username, 'pdfs', fileToDelete.id));
            if (currentFile?.id === fileToDelete.id) {
                setCurrentFile(null); setPdfDoc(null); setStrokesByPage({}); localStorage.removeItem('lastViewedFileId');
            }
        } catch (error) { console.error("Lỗi xóa file:", error); }
    };

    const handleAiSubmit = async (e, customPrompt = null) => {
        if (e) e.preventDefault();
        const queryText = customPrompt || aiPrompt;
        if (!queryText.trim()) return;
        setAiChatHistory(prev => [...prev, { role: 'user', text: queryText }]);
        setAiPrompt(''); setAiLoading(true);
        try {
            const apiKey = ""; 
            const contextPrompt = `Nội dung từ tài liệu:\n"""\n${extractedText || '(Trống)'}\n"""\n\nCâu hỏi: ${queryText}`;
            let attempt = 0, response = null;
            while (attempt < 5) {
                try {
                    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents: [{ parts: [{ text: contextPrompt }] }] })
                    });
                    if (response.ok) break; throw new Error(response.status);
                } catch (err) {
                    attempt++; if (attempt >= 5) throw err;
                    await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt - 1)));
                }
            }
            const data = await response.json();
            const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Lỗi phản hồi.";
            setAiChatHistory(prev => [...prev, { role: 'ai', text: aiText }]);
        } catch (error) { setAiChatHistory(prev => [...prev, { role: 'ai', text: `Lỗi kết nối.` }]); } 
        finally { setAiLoading(false); }
    };

    if (!isLoggedIn) {
        return (
            <div className="flex h-screen bg-gray-100 items-center justify-center p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center border border-gray-100">
                    <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FileText className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Học Tập Pro</h2>
                    <p className="text-gray-500 mb-6 text-sm">Để tự động lưu nét vẽ và đồng bộ, hãy tạo một mã đăng nhập cá nhân.</p>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <input type="text" required value={username} onChange={e => setUsername(e.target.value)} placeholder="VD: thanhloc2026" className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-center font-medium" />
                        <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2"><LogIn className="w-5 h-5" /> Bắt đầu Học</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
            {/* Modal Tải File */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="font-semibold text-gray-800">Tải Tài Liệu Lên</h3>
                            <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleAddDocument} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tên Đề thi</label>
                                <input type="text" required value={newFileName} onChange={e => setNewFileName(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="VD: Đề Toán HK1..." />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Chọn file PDF</label>
                                <input 
                                    type="file" 
                                    accept="application/pdf" 
                                    required 
                                    onChange={e => setNewFile(e.target.files[0])} 
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" 
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2 bg-gray-100 rounded-lg">Hủy</button>
                                <button type="submit" disabled={isAddingDoc} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg flex items-center justify-center gap-2">
                                    {isAddingDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {isAddingDoc ? 'Đang tải...' : 'Tải lên'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Tùy chỉnh Bút/Dạ quang */}
            {showSettings && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-72 overflow-hidden">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="font-semibold text-gray-800">
                                Tùy chỉnh {settingType === 'pen' ? 'Bút vẽ' : 'Dạ quang'}
                            </h3>
                            <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Màu sắc</label>
                                <input
                                    type="color"
                                    value={settingType === 'pen' ? penColor : highlighterColor}
                                    onChange={(e) => settingType === 'pen' ? setPenColor(e.target.value) : setHighlighterColor(e.target.value)}
                                    className="w-full h-12 cursor-pointer rounded-lg border-2 border-gray-200"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Kích thước nét: {settingType === 'pen' ? penSize : highlighterSize}px
                                </label>
                                <input
                                    type="range"
                                    min="1"
                                    max="50"
                                    value={settingType === 'pen' ? penSize : highlighterSize}
                                    onChange={(e) => settingType === 'pen' ? setPenSize(Number(e.target.value)) : setHighlighterSize(Number(e.target.value))}
                                    className="w-full accent-indigo-600"
                                />
                            </div>
                            <button onClick={() => setShowSettings(false)} className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium transition-colors">
                                Hoàn tất
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sidebar Trái */}
            <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} bg-white border-r flex flex-col transition-all duration-300 z-10 shrink-0 overflow-hidden`}>
                <div className={`p-4 border-b flex items-center justify-between w-64 transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="text-indigo-600 font-bold text-xl flex items-center gap-2"><FileText className="shrink-0" /> Học Tập</div>
                    <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-red-500 underline whitespace-nowrap">Thoát</button>
                </div>
                <div className={`p-3 bg-indigo-50 text-indigo-800 text-sm font-medium flex items-center gap-2 border-b w-64 transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="w-2 h-2 rounded-full bg-green-500 shrink-0"></div> <span className="truncate">User: {username}</span>
                </div>
                <div className={`p-4 w-64 transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                    <button onClick={() => setShowAddModal(true)} className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white rounded-lg flex items-center justify-center gap-2 whitespace-nowrap"><Upload className="w-5 h-5 shrink-0" /> Tải File Lên</button>
                </div>
                <div className={`flex-1 overflow-y-auto px-2 w-64 transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                    {files.map(file => (
                        <div key={file.id} onClick={() => setCurrentFile(file)} className={`group flex items-center justify-between p-2 rounded-md cursor-pointer mb-1 ${currentFile?.id === file.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'hover:bg-gray-50'}`}>
                            <span className="truncate pr-2 flex items-center gap-2 text-sm"><FileText className="w-4 h-4 shrink-0 text-gray-400" /> {file.name}</span>
                            <button onClick={(e) => handleDeleteFile(file, e)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 p-1 shrink-0"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col bg-[#525659] relative overflow-hidden">
                {/* Thanh công cụ 1 */}
                <div className="h-14 bg-white shadow-sm flex items-center justify-between px-4 shrink-0 flex-wrap z-20">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 hover:bg-gray-100 rounded-md"><Menu className="w-5 h-5" /></button>
                        <h2 className="font-medium text-gray-800 truncate max-w-[150px] md:max-w-xs hidden sm:block">{currentFile ? currentFile.name : 'Chưa chọn'}</h2>
                        
                        {pdfDoc && (
                            <div className="flex items-center gap-1 border-l pl-3 ml-2">
                                <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="p-1.5 hover:bg-gray-100 rounded text-gray-600"><ZoomOut className="w-4 h-4" /></button>
                                <span className="text-sm font-medium w-12 text-center">{Math.round(scale * 100)}%</span>
                                <button onClick={() => setScale(s => Math.min(3, s + 0.25))} className="p-1.5 hover:bg-gray-100 rounded text-gray-600"><ZoomIn className="w-4 h-4" /></button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4">
                        {pdfDoc && (
                            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                                <button onClick={() => setPageNum(p => Math.max(1, p - 1))} disabled={pageNum <= 1} className="p-1.5 bg-white shadow-sm rounded disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
                                <span className="text-sm font-medium px-2">{pageNum} / {pdfDoc.numPages}</span>
                                <button onClick={() => setPageNum(p => Math.min(pdfDoc.numPages, p + 1))} disabled={pageNum >= pdfDoc.numPages} className="p-1.5 bg-white shadow-sm rounded disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
                            </div>
                        )}
                        <button onClick={() => setIsAiSidebarOpen(!isAiSidebarOpen)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium">
                            <Sparkles className="w-4 h-4" /> <span className="hidden sm:inline">AI</span>
                        </button>
                    </div>
                </div>

                {/* Thanh công cụ 2: Bút vẽ */}
                {pdfDoc && (
                    <div className="bg-gray-800 text-white h-12 flex items-center justify-between px-4 shadow-inner shrink-0 overflow-x-auto z-20">
                        <div className="flex items-center gap-2 sm:gap-4">
                            <button onClick={() => setDrawMode('pan')} className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors ${drawMode === 'pan' ? 'bg-indigo-500' : 'hover:bg-gray-700 text-gray-300'}`}>
                                <MousePointer2 className="w-4 h-4" /> <span className="text-sm hidden sm:inline">Di chuyển</span>
                            </button>
                            <div className="w-px h-6 bg-gray-600 mx-1"></div>
                            <button 
                                onClick={() => setDrawMode('pen')} 
                                onDoubleClick={() => handleToolDoubleClick('pen')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors ${drawMode === 'pen' ? 'bg-red-500' : 'hover:bg-gray-700 text-gray-300'}`}
                                title="Nhấn đúp để chỉnh màu/kích thước"
                            >
                                <PenTool className="w-4 h-4" /> <span className="text-sm hidden sm:inline">Bút vẽ</span>
                            </button>
                            <button 
                                onClick={() => setDrawMode('highlighter')} 
                                onDoubleClick={() => handleToolDoubleClick('highlighter')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors ${drawMode === 'highlighter' ? 'bg-yellow-500 text-black' : 'hover:bg-gray-700 text-gray-300'}`}
                                title="Nhấn đúp để chỉnh màu/kích thước"
                            >
                                <Highlighter className="w-4 h-4" /> <span className="text-sm hidden md:inline">Dạ quang</span>
                            </button>
                            <button onClick={() => setDrawMode('eraser')} className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors ${drawMode === 'eraser' ? 'bg-gray-300 text-black' : 'hover:bg-gray-700 text-gray-300'}`}>
                                <Eraser className="w-4 h-4" /> <span className="text-sm hidden sm:inline">Tẩy</span>
                            </button>
                        </div>
                        
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-900 border border-gray-700 shrink-0">
                            {saveStatus === 'saving' && <><Loader2 className="w-3 h-3 animate-spin text-yellow-400" /><span className="text-xs text-yellow-400">Đang lưu...</span></>}
                            {saveStatus === 'saved' && <><Save className="w-3 h-3 text-emerald-400" /><span className="text-xs text-emerald-400">Đã lưu mây</span></>}
                            {saveStatus === 'error' && <span className="text-xs text-red-400">Lỗi lưu</span>}
                        </div>
                    </div>
                )}

                {/* Khu vực Viewer */}
                <div className="flex-1 flex overflow-hidden relative">
                    <div className={`flex-1 overflow-auto p-4 md:p-8 flex justify-center items-start ${drawMode !== 'pan' ? 'cursor-crosshair' : 'cursor-grab'}`}>
                        {!currentFile ? (
                            <div className="mt-20 text-center text-gray-300"><FileText className="w-16 h-16 mx-auto opacity-50" /><p>Tải tài liệu lên để bắt đầu</p></div>
                        ) : (
                            <div className="relative shadow-2xl bg-white shrink-0 mx-auto transition-transform origin-top" style={{ minHeight: '500px', minWidth: '400px' }}>
                                {isRendering && <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>}
                                
                                <canvas ref={canvasRef} className="block" />
                                <canvas 
                                    ref={drawCanvasRef}
                                    onMouseDown={handleDrawStart} onMouseMove={handleDrawMove} onMouseUp={handleDrawEnd} onMouseLeave={handleDrawEnd}
                                    onTouchStart={handleDrawStart} onTouchMove={handleDrawMove} onTouchEnd={handleDrawEnd}
                                    className="absolute top-0 left-0 block z-10 touch-none"
                                    style={{ pointerEvents: drawMode === 'pan' ? 'none' : 'auto' }}
                                />
                            </div>
                        )}
                    </div>

                    {/* Sidebar AI */}
                    <div className={`${isAiSidebarOpen ? 'w-80 border-l' : 'w-0'} bg-white flex flex-col transition-all duration-300 z-30 shrink-0 overflow-hidden`}>
                        {isAiSidebarOpen && (
                            <>
                                <div className="p-4 border-b flex justify-between bg-indigo-50 shrink-0 w-80">
                                    <div className="font-semibold text-indigo-800 flex items-center gap-2"><Sparkles className="w-5 h-5" /> AI</div>
                                    <button onClick={() => setIsAiSidebarOpen(false)}><X className="w-5 h-5 text-gray-500" /></button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 text-sm bg-gray-50/50 flex flex-col gap-4 w-80">
                                    {aiChatHistory.map((msg, i) => (
                                        <div key={i} className={`p-3 rounded-2xl max-w-[90%] ${msg.role === 'user' ? 'self-end bg-indigo-600 text-white rounded-br-sm' : 'self-start bg-white border text-gray-800 rounded-bl-sm'}`}>
                                            {msg.text}
                                        </div>
                                    ))}
                                    {aiLoading && <div className="self-start text-indigo-600"><Loader2 className="w-4 h-4 animate-spin" /></div>}
                                </div>
                                <div className="p-3 border-t bg-white shrink-0 w-80">
                                    <form onSubmit={handleAiSubmit} className="flex gap-2">
                                        <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} disabled={aiLoading} className="flex-1 p-2 border rounded-xl" placeholder="Hỏi AI..." />
                                        <button type="submit" disabled={aiLoading || !aiPrompt} className="p-2 bg-indigo-600 text-white rounded-lg"><Send className="w-4 h-4" /></button>
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