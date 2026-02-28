زimport * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// =======================================
// ١. إدارة المشاريع
// =======================================
class ProjectManager {
    constructor() {
        this.projects = [];
        this.currentProject = null;
        this.loadProjects();
    }

    loadProjects() {
        const saved = localStorage.getItem('virtual-tour-projects');
        if (saved) this.projects = JSON.parse(saved);
    }

    saveProjects() {
        localStorage.setItem('virtual-tour-projects', JSON.stringify(this.projects));
    }

    newProject(name) {
        const project = {
            id: Date.now(),
            name: name || `مشروع-${new Date().toLocaleDateString()}`,
            created: new Date().toISOString(),
            paths: [],
            imageData: null
        };
        this.projects.push(project);
        this.currentProject = project;
        this.saveProjects();
        return project;
    }

    saveCurrentProject(paths, imageData) {
        if (this.currentProject) {
            this.currentProject.paths = paths.map(path => ({
                type: path.userData.type,
                color: '#' + pathColors[path.userData.type].toString(16).padStart(6, '0'),
                points: path.userData.points.map(p => ({ x: p.x, y: p.y, z: p.z }))
            }));
            this.currentProject.imageData = imageData;
            this.currentProject.lastModified = new Date().toISOString();
            this.saveProjects();
        }
    }
}

// =======================================
// ٢. إدارة المشاهد المتعددة
// =======================================
class SceneManager {
    constructor() {
        this.scenes = [];
        this.currentScene = null;
        this.currentSceneIndex = 0;
        this.db = null;
        this.initDB();
    }

    initDB() {
        const request = indexedDB.open('VirtualTourDB', 1);
        
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('scenes')) {
                db.createObjectStore('scenes', { keyPath: 'id' });
            }
        };

        request.onsuccess = (e) => {
            this.db = e.target.result;
            this.loadScenes();
            console.log('✅ IndexedDB initialized');
        };
    }

    loadScenes() {
        if (!this.db) return;
        const tx = this.db.transaction('scenes', 'readonly');
        const store = tx.objectStore('scenes');
        const request = store.getAll();

        request.onsuccess = () => {
            this.scenes = request.result || [];
            console.log(`✅ تم تحميل ${this.scenes.length} مشهد`);
            if (typeof updateScenePanel === 'function') updateScenePanel();
        };
    }

    saveScenes() {
        if (!this.db) return;
        const tx = this.db.transaction('scenes', 'readwrite');
        const store = tx.objectStore('scenes');
        store.clear();
        this.scenes.forEach(scene => store.add(scene));
        console.log('✅ تم حفظ المشاهد');
        if (typeof updateScenePanel === 'function') updateScenePanel();
    }

    async addScene(name, imageFile) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const scene = {
                        id: `scene-${Date.now()}-${Math.random()}`,
                        name: name,
                        originalImage: e.target.result,
                        paths: [],
                        hotspots: [],
                        created: new Date().toISOString()
                    };
                    this.scenes.push(scene);
                    this.saveScenes();
                    resolve(scene);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(imageFile);
        });
    }

    addHotspot(sceneId, type, position, data) {
        const scene = this.scenes.find(s => s.id === sceneId);
        if (!scene) return null;

        const hotspot = {
            id: `hotspot-${Date.now()}-${Math.random()}`,
            type: type,
            position: { x: position.x, y: position.y, z: position.z },
            data: data,
            created: new Date().toISOString()
        };

        if (!scene.hotspots) scene.hotspots = [];
        scene.hotspots.push(hotspot);
        
        this.saveScenes();
        return hotspot;
    }

    switchToScene(sceneId) {
        const sceneData = this.scenes.find(s => s.id === sceneId);
        if (!sceneData) return false;

        if (this.currentScene && paths.length > 0) {
            this.currentScene.paths = paths.map(p => ({
                type: p.userData.type,
                color: '#' + pathColors[p.userData.type].toString(16).padStart(6, '0'),
                points: p.userData.points.map(pt => ({ x: pt.x, y: pt.y, z: pt.z }))
            }));
        }

        this.currentScene = sceneData;

        paths.forEach(p => scene.remove(p));
        paths = [];
        clearCurrentDrawing();

        if (sphereMesh && sphereMesh.material) {
            loadSceneImage(sceneData.originalImage);
        }

        if (sceneData.paths) {
            sceneData.paths.forEach(pathData => {
                const points = pathData.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
                const oldType = currentPathType;
                currentPathType = pathData.type;
                createStraightPath(points);
                currentPathType = oldType;
            });
        }

        // إعادة بناء الهوتسبوت عند تغيير المشهد
        if (sceneData.hotspots) {
            rebuildHotspots(sceneData.hotspots);
        } else {
            Object.values(hotspotMarkers).forEach(marker => {
                if (marker && marker.parentNode) {
                    marker.parentNode.removeChild(marker);
                }
            });
            hotspotMarkers = {};
        }
        
        if (typeof updateScenePanel === 'function') updateScenePanel();
        this.saveScenes();
        return true;
    }

    deleteScene(sceneId) {
        const index = this.scenes.findIndex(s => s.id === sceneId);
        if (index !== -1) {
            this.scenes.splice(index, 1);
            if (this.currentScene && this.currentScene.id === sceneId) {
                if (this.scenes.length > 0) {
                    this.switchToScene(this.scenes[0].id);
                } else {
                    this.currentScene = null;
                    if (typeof loadPanorama === 'function') loadPanorama();
                }
            }
            this.saveScenes();
            if (typeof updateScenePanel === 'function') updateScenePanel();
        }
    }
}

// =======================================
// ٣. تصدير الجولات
// =======================================
class TourExporter {
    constructor() {
        this.zip = new JSZip();
    }

    async exportTour(projectName, scenes) {
        const folder = this.zip.folder(projectName);
        
        scenes.forEach((scene, index) => {
            const imageData = scene.image.split(',')[1];
            folder.file(`scene-${index}.jpg`, imageData, { base64: true });
        });
        
        const scenesData = scenes.map((scene, index) => ({
            id: scene.id,
            name: scene.name,
            image: `scene-${index}.jpg`,
            paths: scene.paths || [],
            hotspots: (scene.hotspots || []).map(h => ({
                id: h.id,
                type: h.type,
                position: h.position,
                data: h.data || {}
            }))
        }));
        
        folder.file('tour-data.json', JSON.stringify(scenesData, null, 2));
        folder.file('index.html', this.generatePlayerHTML(projectName));
        folder.file('style.css', this.generatePlayerCSS());
        folder.file('README.md', this.generateReadme(projectName));
        
        const content = await this.zip.generateAsync({ type: 'blob' });
        saveAs(content, `${projectName}.zip`);
    }

   generatePlayerHTML(projectName) {
    return `<!DOCTYPE html>
<html lang="ar">
<head>
    <meta charset="UTF-8">
    <title>${projectName} - جولة افتراضية</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { margin: 0; overflow: hidden; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; }
        #container { width: 100vw; height: 100vh; background: #000; }
        
        /* معلومات المشروع */
        .info {
            position: absolute; top: 20px; left: 20px;
            background: rgba(0, 0, 0, 0.7); color: white;
            padding: 10px 20px; border-radius: 30px;
            border: 2px solid #4a6c8f; z-index: 100;
            font-weight: bold; backdrop-filter: blur(5px); font-size: 14px;
        }
        
        /* زر التدوير */
        #autoRotateBtn {
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            padding: 12px 24px; background: rgba(0, 0, 0, 0.7); color: white;
            border: 2px solid #4a6c8f; border-radius: 30px; cursor: pointer;
            z-index: 100; font-size: 16px; backdrop-filter: blur(5px);
            transition: all 0.3s ease;
        }
        #autoRotateBtn:hover { background: rgba(74, 108, 143, 0.8); transform: translateX(-50%) scale(1.05); }
        
        /* قائمة المشاهد الجانبية */
        .scene-list-panel {
            position: fixed; top: 50%; left: 20px; transform: translateY(-50%);
            width: 260px; max-height: 70vh;
            background: rgba(20, 30, 40, 0.75); backdrop-filter: blur(12px);
            border: 2px solid #4a6c8f; border-radius: 16px; color: white;
            z-index: 200; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            direction: rtl; overflow: hidden; display: flex; flex-direction: column;
            transition: all 0.3s ease;
        }
        .scene-list-panel.collapsed { width: 50px; overflow: hidden; }
        .scene-list-panel.collapsed .panel-header h3 span:last-child,
        .scene-list-panel.collapsed .scene-list-container { display: none; }
        
        .panel-header {
            padding: 15px; background: rgba(30, 40, 50, 0.95);
            border-bottom: 1px solid #4a6c8f; display: flex;
            justify-content: space-between; align-items: center; cursor: pointer;
        }
        .panel-header h3 { margin: 0; color: #88aaff; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
        .panel-toggle {
            background: none; border: none; color: white; font-size: 18px; cursor: pointer;
            width: 30px; height: 30px; border-radius: 50%; display: flex;
            align-items: center; justify-content: center; transition: all 0.2s;
        }
        .panel-toggle:hover { background: rgba(255,255,255,0.1); color: #88aaff; }
        
        .scene-list-container {
            max-height: calc(70vh - 60px); overflow-y: auto; padding: 10px;
        }
        .scene-list-container::-webkit-scrollbar { width: 4px; }
        .scene-list-container::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); }
        .scene-list-container::-webkit-scrollbar-thumb { background: rgba(74, 108, 143, 0.5); border-radius: 4px; }
        
        .scene-item {
            padding: 10px 12px; margin: 4px 0; background: rgba(255,255,255,0.03);
            border-radius: 8px; cursor: pointer; display: flex; align-items: center;
            gap: 10px; transition: all 0.2s ease; border: 1px solid transparent; font-size: 13px;
        }
        .scene-item:hover { background: rgba(74, 108, 143, 0.2); border-color: rgba(74, 108, 143, 0.3); }
        .scene-item.active { background: rgba(74, 108, 143, 0.6); border-right: 3px solid #88aaff; }
        .scene-icon { font-size: 18px; }
        .scene-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .scene-hotspot-count { font-size: 11px; background: rgba(74, 108, 143, 0.4); padding: 2px 6px; border-radius: 12px; color: #88aaff; }
        
        /* لوحة التحكم بالمسارات */
        .paths-control-panel {
            position: fixed; top: 20px; right: 20px;
            background: rgba(20, 30, 40, 0.85); backdrop-filter: blur(10px);
            border: 2px solid #4a6c8f; border-radius: 15px; color: white;
            z-index: 200; padding: 15px; min-width: 200px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); direction: rtl;
        }
        .paths-control-panel h3 { margin: 0 0 10px 0; color: #88aaff; font-size: 16px; text-align: center; border-bottom: 1px solid #4a6c8f; padding-bottom: 8px; }
        .path-toggle-item { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .path-toggle-item:last-child { border-bottom: none; }
        .path-toggle-item input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; accent-color: #4a6c8f; }
        .path-toggle-item label { flex: 1; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 8px; }
        .path-color-dot { width: 16px; height: 16px; border-radius: 4px; display: inline-block; }
        
        /* نظام Hotspots - مطابق للأداة */
        .hotspot-marker {
            position: absolute; transform: translate(-50%, -50%);
            cursor: pointer; z-index: 100; transition: all 0.2s ease;
            pointer-events: all;
        }
        .hotspot-marker img {
            width: 40px; height: 40px; filter: drop-shadow(0 0 10px currentColor);
            pointer-events: none; transition: all 0.2s ease;
            border-radius: 50%; background: rgba(0,0,0,0.3);
        }
        .hotspot-marker:hover img { transform: scale(1.15); filter: drop-shadow(0 0 15px gold); }
        
        .hotspot-label {
            position: absolute; top: -40px; left: 50%; transform: translateX(-50%);
            background: rgba(20, 30, 40, 0.95); backdrop-filter: blur(5px);
            color: white; padding: 6px 12px; border-radius: 20px;
            font-size: 12px; white-space: nowrap; border: 2px solid;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5); opacity: 0;
            transition: opacity 0.2s ease; pointer-events: none; z-index: 101;
            font-weight: 500;
        }
        .hotspot-marker:hover .hotspot-label { opacity: 1; }
        
        /* نافذة المعلومات */
        .custom-info-window {
            position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
            background: rgba(20, 30, 40, 0.95); backdrop-filter: blur(10px);
            border: 2px solid #ffaa44; border-radius: 20px; padding: 20px 30px;
            color: white; z-index: 1000; box-shadow: 0 20px 40px rgba(0,0,0,0.5);
            max-width: 400px; width: 90%; animation: slideUp 0.3s ease; direction: rtl;
        }
        .custom-info-window .window-header {
            display: flex; align-items: center; gap: 10px; margin-bottom: 15px;
            padding-bottom: 10px; border-bottom: 2px solid #ffaa44;
        }
        .custom-info-window .window-header img { width: 30px; height: 30px; }
        .custom-info-window .window-header h3 { margin: 0; color: #ffaa44; font-size: 18px; font-weight: bold; }
        .custom-info-window .window-content { margin-bottom: 20px; line-height: 1.6; font-size: 14px; }
        .custom-info-window .window-close {
            background: rgba(255,255,255,0.1); border: 2px solid #ffaa44; color: white;
            padding: 8px 20px; border-radius: 30px; cursor: pointer; font-weight: bold;
            transition: all 0.2s; width: 100%;
        }
        .custom-info-window .window-close:hover { background: #ffaa44; color: black; }
        
        @keyframes slideUp {
            from { transform: translate(-50%, 100%); opacity: 0; }
            to { transform: translate(-50%, 0); opacity: 1; }
        }
        
        /* تحسينات للموبايل */
        @media (max-width: 768px) {
            .scene-list-panel { width: 200px; left: 10px; }
            .scene-list-panel.collapsed { width: 40px; }
            .paths-control-panel { top: 10px; right: 10px; padding: 10px; min-width: 150px; }
            .paths-control-panel h3 { font-size: 14px; }
            .path-toggle-item label { font-size: 12px; }
            .custom-info-window { width: 90%; padding: 15px 20px; bottom: 20px; }
            .hotspot-marker img { width: 35px; height: 35px; }
            #autoRotateBtn { font-size: 14px; padding: 10px 20px; }
        }
    </style>
</head>
<body>
    <div class="info">🏗️ ${projectName}</div>
    <div id="container"></div>
    <button id="autoRotateBtn">⏸️ إيقاف الدوران</button>
    
    <div class="paths-control-panel">
        <h3>🔘 التحكم بالمسارات</h3>
        <div id="paths-toggle-list"></div>
    </div>
    
    <div class="scene-list-panel" id="sceneListPanel">
        <div class="panel-header" id="panelHeader">
            <h3><span>📋</span><span>قائمة المشاهد</span></h3>
            <button class="panel-toggle" id="togglePanelBtn">◀</button>
        </div>
        <div class="scene-list-container" id="sceneListContainer"></div>
    </div>

    <script>
    // أيقونات base64
    const ICONS = {
        hotspot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAIzSURBVFiF7ZbNaxNBGMZ/djdpk0hS9KIoigp68RRyUw8iKHgRLyIoePCi4F8g3nrwU0Tx4lEQvSh4EcF78NqLIAp68SNoFZE2TdMk3R2f2SSbdNPd2Z0NIvpAXjLMvM/8ZucjMwsHqIEa+J+hlJpOkrS0Z0mS1NM0nSu7l+M4h5VSy1rrn1rrb6W4LmBZ1hWl1LKUsl3L+t+01rdLcUMApdRVpdTC3r6iKOqMx+O+UsoPw/CFlHK1lFoJMAzjiVJqRQgR+b5/37Ks4+Fw+DaKovvtdvux4ziLUkq/LEcIYVvW3SRJ+lLKL5qmZ9I0HUopDc/zTmZZtpZlWZJl2YYoG4MQYgSAYRgIIW5IKZ1iPGmaXgPA8zySJOlKKdM0TdM0rZfRB8iyrC2lTNI0nSmKIl3X69M0PTRN0+WyHMa11pckSRohhC2l/JYkyXBRPrdt25RSr5Zl3zFN88F4PP4mpdwJguBpFEX3m83mGRhzLwjDMHzJmP0wDMMXWZZ93G63H5fN78sopdA5N0opP0mSl/P5vN5sNh/zAymE+LqcT2uN1jqRUn6Joqg9nU4fFNM2DMMo2l95GGP/SylvR1H0oEifMzsIgoNSyjaMpZRfl8vlvTAMP0dRdG/btvu+7z9jzG4X6Wc3j8OYe7Lf75+M47hXdXyUUh8BgDF7yhj7yZhbzOfz22maHjPGTjPGxJ+WnzE2Wq/Xh5RSl1ar1Yk8zzvL5fJ4GIa9JEk6URT1lFL9NE17cRwfybLsp9Z6tVqtDsI4fAtjX6rGgRrY4/wCJ8zvggPQ/IEAAAAASUVORK5CYII=',
        info: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAI5SURBVFiF7ZbPaxNBFMfnt5vdJBIp1l6kFQU9eCk9tQcVBC+iIAgK4kXw7l/w4EEQ70178aAHQfBPRBCvXrwIgqBQ6FURtPUDLVIrSdP9MW+TTbrZzWazWwX7hQWZZeZ95v2Y994bGAVK0P8ZY2yP1rohpXzDOS9JKfcaY56Ypvk4DMMyY+xrFEWJ53nblFKPm812qVR6qJRa55w/aF3GGJ9zHiqlZqIoOgIAtm2f6nQ6FxhjZZZlH6IoOtsfhzF2l2VZXSlV55y/CYLgJgCkaToex/G0lHIGAAqFgimESBhjUwCglNqqlPoqhIgBQEq5GEXRac55RUr5xXGcQQBQSq2GYfgGAJRS61LKz4yxm2EYjhbzL5VKawBgrgM3DONBEARHlFKbAIBS6nOl1B6l1DwA6Hq9frRQKNSiKNohl6vVal+hUNjfbDaPAkCxWHzKGNtXKBSqk8nksWEYZ5Ikqbquu1Yul2d938+63e5UoVA4I6W8CgC2bT9JkuQeAGRZ5gOAaZqjUkpTSrmZZdl9pVQtSZJ7xWKxBAA6jmOO42wIIa4BQLlcDjjn3w3DqAkhVgGAc34tjuM5pdS8EOJXmUwmE0KIvQDAOT8KACzLspc8z3vLGJuJomg6TVPP87zJLMu8TqfzI89zLwiCvZxzkWVZP5/P5wFgLMs2pJTVKIp6nPOs2Wx+Y4z9FkKcBICRUmkpy7K6lPJGHMfHS6XSEs65ZVnWbD6f38rzfMxxnM+B759I0/Qp5/w4Y6wQJMl2IcRcGIaHhRDbgyB4JKU8yRirCiE+D7z/H6AE9Y1+As0ZxH2vO/WTAAAAAElFTkSuQmCC'
    };

    let autoRotate = true;
    let currentSceneIndex = 0;
    let scenes = [];
    let scene3D, camera, renderer, controls, sphereMesh;
    let allPaths = [];
    let hotspotMarkers = {};
    
    const pathColors = { EL: '#ffcc00', AC: '#00ccff', WP: '#0066cc', WA: '#ff3300', GS: '#33cc33' };
    
    function initScenePanel() {
        const panel = document.getElementById('sceneListPanel');
        const toggleBtn = document.getElementById('togglePanelBtn');
        if (!panel || !toggleBtn) return;
        toggleBtn.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            toggleBtn.textContent = panel.classList.contains('collapsed') ? '▶' : '◀';
        });
    }
    
    function updateSceneList() {
        const container = document.getElementById('sceneListContainer');
        if (!container) return;
        container.innerHTML = '';
        scenes.forEach((scene, index) => {
            const item = document.createElement('div');
            item.className = 'scene-item' + (index === currentSceneIndex ? ' active' : '');
            const hotspotCount = scene.hotspots ? scene.hotspots.length : 0;
            item.innerHTML = \`
                <span class="scene-icon">\${index === 0 ? '🏠' : '🏢'}</span>
                <span class="scene-name">\${scene.name}</span>
                <span class="scene-hotspot-count">\${hotspotCount}</span>
            \`;
            item.addEventListener('click', () => loadScene(index));
            container.appendChild(item);
        });
    }
    
    function createHotspotElement(x, y, type, data) {
        const div = document.createElement('div');
        div.className = 'hotspot-marker';
        div.style.left = x + 'px';
        div.style.top = y + 'px';
        
        const iconUrl = type === 'SCENE' ? ICONS.hotspot : ICONS.info;
        const borderColor = type === 'SCENE' ? '#44aaff' : '#ffaa44';
        const displayText = type === 'SCENE' 
            ? (data.targetSceneName || 'انتقال') 
            : (data.title || 'معلومات');
        
        div.innerHTML = \`
            <img src="\${iconUrl}" alt="\${type}" style="border: 2px solid \${borderColor};">
            <div class="hotspot-label" style="border-color: \${borderColor};">\${displayText}</div>
        \`;
        
        if (type === 'INFO') {
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                showInfoWindow(data.title, data.content);
            });
        } else {
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetIndex = scenes.findIndex(s => s.id === data.targetSceneId);
                if (targetIndex !== -1) {
                    loadScene(targetIndex);
                }
            });
        }
        
        return div;
    }
    
    function showInfoWindow(title, content) {
        document.querySelectorAll('.custom-info-window').forEach(el => el.remove());
        
        const win = document.createElement('div');
        win.className = 'custom-info-window';
        win.innerHTML = \`
            <div class="window-header">
                <img src="\${ICONS.info}">
                <h3>\${title || 'معلومات'}</h3>
            </div>
            <div class="window-content">\${content || ''}</div>
            <button class="window-close">حسناً</button>
        \`;
        
        win.querySelector('.window-close').onclick = () => win.remove();
        document.body.appendChild(win);
        
        setTimeout(() => win.remove(), 5000);
    }
    
  function rebuildHotspots() {
    document.querySelectorAll('.hotspot-marker').forEach(el => el.remove());
    hotspotMarkers = {};
    
    const currentScene = scenes[currentSceneIndex];
    if (!currentScene?.hotspots?.length) return;
    
    const width = window.innerWidth, height = window.innerHeight;
    
    currentScene.hotspots.forEach(h => {
        const pos = new THREE.Vector3(h.position.x, h.position.y, h.position.z);
        pos.project(camera);
        
        // ✅ منع ظهور النقاط خلف الكاميرا
        if (pos.z > 1) return;
        
        const x = (pos.x * 0.5 + 0.5) * width;
        const y = (-pos.y * 0.5 + 0.5) * height;
        
        if (x < -100 || x > width + 100 || y < -100 || y > height + 100) return;
        
        const iconElement = createHotspotElement(x, y, h.type, h.data);
        iconElement._worldPosition = new THREE.Vector3(h.position.x, h.position.y, h.position.z);
        iconElement.dataset.id = h.id;
        document.body.appendChild(iconElement);
        hotspotMarkers[h.id] = iconElement;
    });
}
    
    function togglePathsByType(type, visible) {
        allPaths.forEach(p => { if (p.userData?.type === type) p.visible = visible; });
    }
    
    function createPathsTogglePanel() {
        const toggleList = document.getElementById('paths-toggle-list');
        if (!toggleList) return;
        toggleList.innerHTML = '';
        ['EL', 'AC', 'WP', 'WA', 'GS'].forEach(type => {
            const div = document.createElement('div');
            div.className = 'path-toggle-item';
            div.innerHTML = \`
                <input type="checkbox" id="toggle-\${type}" checked data-type="\${type}">
                <label for="toggle-\${type}"><span class="path-color-dot" style="background:\${pathColors[type]}"></span> \${type}</label>
            \`;
            div.querySelector('input').addEventListener('change', e => togglePathsByType(type, e.target.checked));
            toggleList.appendChild(div);
        });
    }
    
    function loadScene(index) {
        const sceneData = scenes[index];
        if (!sceneData) return;
        
        currentSceneIndex = index;
        
        if (sphereMesh) scene3D.remove(sphereMesh);
        document.querySelectorAll('.hotspot-marker').forEach(el => el.remove());
        allPaths.forEach(p => scene3D.remove(p));
        allPaths = [];
        
        new THREE.TextureLoader().load(sceneData.image, texture => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.x = -1;
            
            sphereMesh = new THREE.Mesh(
                new THREE.SphereGeometry(500, 128, 128),
                new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide })
            );
            scene3D.add(sphereMesh);
            
            if (sceneData.paths) {
                sceneData.paths.forEach(pathData => {
                    const points = pathData.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
                    for (let i = 0; i < points.length - 1; i++) {
                        const start = points[i];
                        const end = points[i + 1];
                        const direction = new THREE.Vector3().subVectors(end, start);
                        const distance = direction.length();
                        if (distance < 5) continue;
                        
                        const cylinder = new THREE.Mesh(
                            new THREE.CylinderGeometry(3.5, 3.5, distance, 12),
                            new THREE.MeshStandardMaterial({ 
                                color: pathData.color, 
                                emissive: pathData.color, 
                                emissiveIntensity: 0.3 
                            })
                        );
                        
                        const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
                        cylinder.position.copy(midpoint);
                        
                        cylinder.lookAt(end);
                        cylinder.rotateX(Math.PI / 2);
                        
                        cylinder.userData = { type: pathData.type };
                        scene3D.add(cylinder);
                        allPaths.push(cylinder);
                    }
                });
                
                document.querySelectorAll('#paths-toggle-list input').forEach(cb => {
                    togglePathsByType(cb.dataset.type, cb.checked);
                });
            }
            
            setTimeout(rebuildHotspots, 200);
            updateSceneList();
        });
    }
    
    fetch('tour-data.json')
        .then(res => res.json())
        .then(data => {
            scenes = data;
            
            scene3D = new THREE.Scene();
            scene3D.background = new THREE.Color(0x000000);
            
            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(0, 0, 0.1);
            
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            document.getElementById('container').appendChild(renderer.domElement);
            
            scene3D.add(new THREE.AmbientLight(0xffffff, 1.5));
            
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableZoom = true;
            controls.enablePan = false;
            controls.enableDamping = true;
            controls.autoRotate = autoRotate;
            controls.autoRotateSpeed = 0.5;
            
            document.getElementById('autoRotateBtn').onclick = () => {
                autoRotate = !autoRotate;
                controls.autoRotate = autoRotate;
                document.getElementById('autoRotateBtn').textContent = 
                    autoRotate ? '⏸️ إيقاف الدوران' : '▶️ تشغيل الدوران';
            };
            
            createPathsTogglePanel();
            initScenePanel();
            loadScene(0);
            
            window.addEventListener('resize', () => {
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
                rebuildHotspots();
            });
            
            function animate() {
                requestAnimationFrame(animate);
                controls.update();
                renderer.render(scene3D, camera);
                rebuildHotspots(); // تحديث مستمر
            }
            animate();
        })
        .catch(err => console.error('خطأ في تحميل البيانات:', err));
</script>
</body>
</html>`;
}
    generatePlayerCSS() {
        return `body { margin: 0; overflow: hidden; font-family: Arial, sans-serif; }
#container { width: 100vw; height: 100vh; background: #000; }
.info {
    position: absolute;
    top: 20px;
    left: 20px;
    background: rgba(0,0,0,0.7);
    color: white;
    padding: 10px 20px;
    border-radius: 30px;
    border: 2px solid #4a6c8f;
    z-index: 100;
    font-weight: bold;
    backdrop-filter: blur(5px);
}`;
    }

    generateReadme(projectName) {
        return `# ${projectName}

## جولة افتراضية ثلاثية الأبعاد

### كيفية الاستخدام:
1. افتح ملف \`index.html\` في المتصفح
2. استخدم الفأرة للتحرك داخل الجولة
3. اضغط على hotspots للتنقل

### الأنظمة:
- 🟡 EL: كهرباء
- 🔵 AC: تكييف
- 🔵 WP: مياه
- 🔴 WA: صرف صحي
- 🟢 GS: غاز

### النشر على GitHub Pages:
1. ارفع المحتويات إلى GitHub
2. فعل GitHub Pages
3. الجولة متاحة على: \`https://[اسمك].github.io/[المشروع]\`

---
تم إنشاؤها باستخدام Virtual Tour Studio © 2026`;
    }
}

// =======================================
// ٤. المتغيرات الأساسية
// =======================================
let scene, camera, renderer, controls;
let autorotate = true;
let drawMode = false;
let sphereMesh = null;
let selectedPoints = [];
let paths = [];
let tempLine = null;
let pointMarkers = [];
let markerPreview = null;
let exportCanvas, exportContext;
let sceneManager;
let hotspotMode = null;
let hotspotMarkers = {};

const pathColors = { EL: 0xffcc00, AC: 0x00ccff, WP: 0x0066cc, WA: 0xff3300, GS: 0x33cc33 };
let currentPathType = 'EL';

window.setCurrentPathType = (t) => {
    currentPathType = t;
    if (markerPreview) {
        markerPreview.material.color.setHex(pathColors[currentPathType]);
        markerPreview.material.emissive.setHex(pathColors[currentPathType]);
    }
};

const projectManager = new ProjectManager();
const tourExporter = new TourExporter();

// =======================================
// ٥. دوال الرسم الأساسية
// =======================================
function setupMarkerPreview() {
    const geometry = new THREE.SphereGeometry(8, 16, 16);
    const material = new THREE.MeshStandardMaterial({
        color: pathColors[currentPathType],
        emissive: pathColors[currentPathType],
        emissiveIntensity: 0.8
    });
    markerPreview = new THREE.Mesh(geometry, material);
    scene.add(markerPreview);
    markerPreview.visible = false;
}

const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

function onClick(e) {
    if (!sphereMesh || e.target !== renderer.domElement) return;
    
    mouse.x = (e.clientX / renderer.domElement.clientWidth) * 2 - 1;
    mouse.y = -(e.clientY / renderer.domElement.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    
    const hits = raycaster.intersectObject(sphereMesh);

    if (hits.length) {
        const point = hits[0].point.clone();
        
        if (hotspotMode) {
            addHotspot(point);
            hotspotMode = null;
            document.body.style.cursor = 'default';
        } else if (drawMode) {
            addPoint(point);
        }
    }
}

function onMouseMove(e) {
    if (!drawMode || !sphereMesh || !markerPreview) {
        if (markerPreview) markerPreview.visible = false;
        return;
    }
    
    if (e.target !== renderer.domElement) {
        markerPreview.visible = false;
        return;
    }

    mouse.x = (e.clientX / renderer.domElement.clientWidth) * 2 - 1;
    mouse.y = -(e.clientY / renderer.domElement.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(sphereMesh);

    if (hits.length) {
        markerPreview.position.copy(hits[0].point);
        markerPreview.visible = true;
    } else {
        markerPreview.visible = false;
    }
}

function addPoint(pos) {
    selectedPoints.push(pos.clone());
    console.log(`📍 نقطة ${selectedPoints.length} مضافة`);
    addPointMarker(pos);
    updateTempLine();
}

function addPointMarker(position) {
    const geometry = new THREE.SphereGeometry(6, 16, 16);
    const material = new THREE.MeshStandardMaterial({
        color: pathColors[currentPathType],
        emissive: pathColors[currentPathType],
        emissiveIntensity: 0.6
    });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(position);
    scene.add(marker);
    pointMarkers.push(marker);
}

function updateTempLine() {
    if (tempLine) {
        scene.remove(tempLine);
        tempLine.geometry.dispose();
        tempLine = null;
    }
    if (selectedPoints.length >= 2) {
        const geometry = new THREE.BufferGeometry().setFromPoints(selectedPoints);
        const material = new THREE.LineBasicMaterial({ color: pathColors[currentPathType] });
        tempLine = new THREE.Line(geometry, material);
        scene.add(tempLine);
    }
}

function clearCurrentDrawing() {
    selectedPoints = [];
    pointMarkers.forEach(m => scene.remove(m));
    pointMarkers = [];
    if (tempLine) {
        scene.remove(tempLine);
        tempLine.geometry.dispose();
        tempLine = null;
    }
}

function saveCurrentPath() {
    if (selectedPoints.length < 2) {
        alert('⚠️ أضف نقطتين على الأقل');
        return;
    }
    if (tempLine) scene.remove(tempLine);
    createStraightPath(selectedPoints);
    clearCurrentDrawing();
    
    if (sceneManager && sceneManager.currentScene) {
        sceneManager.currentScene.paths = paths.map(p => ({
            type: p.userData.type,
            color: '#' + pathColors[p.userData.type].toString(16).padStart(6, '0'),
            points: p.userData.points.map(pt => ({ x: pt.x, y: pt.y, z: pt.z }))
        }));
        sceneManager.saveScenes();
    }
    console.log('✅ تم حفظ المسار');
}

function createStraightPath(points) {
    if (points.length < 2) return;
    
    const color = pathColors[currentPathType];
    const pathId = `path-${Date.now()}-${Math.random()}`;
    
    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        
        const direction = new THREE.Vector3().subVectors(end, start);
        const distance = direction.length();
        if (distance < 5) continue;
        
        const cylinderGeo = new THREE.CylinderGeometry(3.5, 3.5, distance, 12);
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
        
        const cylinder = new THREE.Mesh(cylinderGeo, new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.4
        }));
        cylinder.applyQuaternion(quaternion);
        
        const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        cylinder.position.copy(center);
        
        cylinder.userData = { type: currentPathType, pathId: pathId, points: [start.clone(), end.clone()] };
        scene.add(cylinder);
        paths.push(cylinder);
    }
}

// =======================================
// دوال Hotspots المحسنة
// =======================================

function createHotspotElement(x, y, type, data, hotspotId) {
    const div = document.createElement('div');
    div.className = 'hotspot-marker';
    div.style.left = x + 'px';
    div.style.top = y + 'px';
    div.setAttribute('data-id', hotspotId);
    div.setAttribute('data-type', type);
    
    const iconUrl = type === 'SCENE' ? 'icon/hotspot.png' : 'icon/info.png';
    const borderColor = type === 'SCENE' ? '#44aaff' : '#ffaa44';
    const displayText = type === 'SCENE' 
        ? (data.targetSceneName || 'انتقال') 
        : (data.title || 'معلومات');
    
    div.innerHTML = `
        <img src="${iconUrl}" alt="${type}" style="border: 2px solid ${borderColor}; border-radius: 50%; background: rgba(0,0,0,0.3);">
        <div class="hotspot-label" style="border-color: ${borderColor};">${displayText}</div>
        <div class="hotspot-controls">
            <button class="edit-btn" onclick="window.editHotspotFromUI('${hotspotId}')" title="تعديل">✏️</button>
            <button class="delete-btn" onclick="window.deleteHotspotFromUI('${hotspotId}')" title="حذف">🗑️</button>
        </div>
    `;
    
    return div;
}

function rebuildHotspots(hotspots) {
    if (!scene || !camera) return;

    Object.values(hotspotMarkers).forEach(marker => {
        if (marker && marker.parentNode) {
            marker.parentNode.removeChild(marker);
        }
    });
    hotspotMarkers = {};

    if (!hotspots || hotspots.length === 0) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    hotspots.forEach(h => {
        const pos = new THREE.Vector3(h.position.x, h.position.y, h.position.z);
        pos.project(camera);
        
        const x = (pos.x * 0.5 + 0.5) * width;
        const y = (-pos.y * 0.5 + 0.5) * height;

        if (x < 0 || x > width || y < 0 || y > height) return;

        const iconElement = createHotspotElement(x, y, h.type, h.data, h.id);
        iconElement._position = pos.clone();
        document.body.appendChild(iconElement);
        hotspotMarkers[h.id] = iconElement;
    });

    console.log(`✅ تم إنشاء ${hotspots.length} نقطة`);
}

// تحديث مواقع الأيقونات - مع منع التكرار (Double Image)
updatePositions: function() {
    if (!camera) return;
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    Object.values(this.markers).forEach(icon => {
        if (!icon._worldPosition) return;
        
        const pos = icon._worldPosition.clone().project(camera);
        
        // ✅ الحل السحري: التحقق من أن النقطة أمام الكاميرا فقط
        // إذا كانت z > 1، فهذا يعني أن النقطة خلف الكاميرا
        if (pos.z > 1) {
            icon.style.display = 'none';
            return;
        }
        
        // ✅ معادلة تحويل الإحداثيات الصحيحة
        const x = (pos.x * 0.5 + 0.5) * width;
        const y = (-pos.y * 0.5 + 0.5) * height;
        
        icon.style.left = x + 'px';
        icon.style.top = y + 'px';
        
        // إخفاء إذا كانت خارج الشاشة
        icon.style.display = (x < -100 || x > width + 100 || y < -100 || y > height + 100) ? 'none' : 'block';
    });
},

function addHotspot(position) {
    if (!sceneManager || !sceneManager.currentScene) {
        alert('❌ لا يوجد مشهد نشط');
        return;
    }

    if (hotspotMode === 'INFO') {
        const title = prompt('📝 أدخل عنوان المعلومات:');
        if (!title) return;
        const content = prompt('📄 أدخل نص المعلومات:');
        if (!content) return;

        const data = { title, content };

        const hotspot = sceneManager.addHotspot(
            sceneManager.currentScene.id,
            'INFO',
            position,
            data
        );

        if (hotspot) {
            const geometry = new THREE.SphereGeometry(15, 32, 32);
            const material = new THREE.MeshStandardMaterial({
                color: 0xffaa44,
                emissive: 0xffaa44,
                emissiveIntensity: 0.3,
                transparent: true,
                opacity: 0.2
            });

            const marker = new THREE.Mesh(geometry, material);
            marker.position.copy(position);
            marker.userData = {
                type: 'hotspot-background',
                hotspotId: hotspot.id
            };
            scene.add(marker);
            
            rebuildHotspots(sceneManager.currentScene.hotspots);
            
            showCustomInfoWindow('✅ تمت الإضافة', `تم إضافة نقطة معلومات: "${title}"`, 'info');
            
            if (typeof updateScenePanel === 'function') updateScenePanel();
        }

    } else if (hotspotMode === 'SCENE') {
        const otherScenes = sceneManager.scenes.filter(s => s.id !== sceneManager.currentScene.id);

        if (otherScenes.length === 0) {
            alert('❌ لا يوجد مشاهد أخرى للانتقال إليها');
            return;
        }

        let sceneList = '';
        otherScenes.forEach((s, index) => {
            sceneList += `${index + 1}. ${s.name}\n`;
        });

        const choice = prompt(
            `اختر المشهد للانتقال إليه:\n\n${sceneList}\nأدخل رقم المشهد:`
        );

        if (!choice) return;

        const selectedIndex = parseInt(choice) - 1;
        if (selectedIndex < 0 || selectedIndex >= otherScenes.length) {
            alert('❌ اختيار غير صالح');
            return;
        }

        const targetScene = otherScenes[selectedIndex];
        const description = prompt(`📝 أدخل وصفاً لهذه النقطة:`) || `انتقال إلى ${targetScene.name}`;

        const data = {
            targetSceneId: targetScene.id,
            targetSceneName: targetScene.name,
            description
        };

        const hotspot = sceneManager.addHotspot(
            sceneManager.currentScene.id,
            'SCENE',
            position,
            data
        );

        if (hotspot) {
            const geometry = new THREE.SphereGeometry(15, 32, 32);
            const material = new THREE.MeshStandardMaterial({
                color: 0x44aaff,
                emissive: 0x44aaff,
                emissiveIntensity: 0.3,
                transparent: true,
                opacity: 0.2
            });

            const marker = new THREE.Mesh(geometry, material);
            marker.position.copy(position);
            marker.userData = {
                type: 'hotspot-background',
                hotspotId: hotspot.id
            };
            scene.add(marker);
            
            rebuildHotspots(sceneManager.currentScene.hotspots);
            
            showCustomInfoWindow('✅ تمت الإضافة', `تم إضافة نقطة انتقال إلى: "${targetScene.name}"`, 'scene');
            
            if (typeof updateScenePanel === 'function') updateScenePanel();
        }
    }

    hotspotMode = null;
    document.body.style.cursor = 'default';
}

window.editHotspotFromUI = function(hotspotId) {
    editHotspot(hotspotId);
};

window.deleteHotspotFromUI = function(hotspotId) {
    if (confirm('🗑️ هل أنت متأكد من حذف هذه النقطة؟')) {
        deleteHotspotById(hotspotId);
        const icon = document.querySelector(`[data-id="${hotspotId}"]`);
        if (icon) icon.remove();
        
        if (scene) {
            scene.children.forEach(child => {
                if (child.userData && child.userData.hotspotId === hotspotId) {
                    scene.remove(child);
                }
            });
        }
    }
};

function deleteHotspotById(hotspotId) {
    if (!sceneManager || !sceneManager.currentScene) return;

    sceneManager.currentScene.hotspots = sceneManager.currentScene.hotspots.filter(
        h => h.id !== hotspotId
    );

    scene.children.forEach(child => {
        if (child.userData && child.userData.hotspotId === hotspotId) {
            scene.remove(child);
        }
    });

    sceneManager.saveScenes();
    updateScenePanel();
    showCustomInfoWindow('✅ تم الحذف', 'تم حذف النقطة بنجاح', 'info');
}

function editHotspot(hotspotId) {
    if (!sceneManager || !sceneManager.currentScene) return;

    const hotspot = sceneManager.currentScene.hotspots.find(h => h.id === hotspotId);
    if (!hotspot) return;

    if (hotspot.type === 'INFO') {
        const newTitle = prompt('✏️ تعديل عنوان المعلومات:', hotspot.data.title || '');
        if (newTitle === null) return;
        const newContent = prompt('✏️ تعديل نص المعلومات:', hotspot.data.content || '');
        if (newContent === null) return;

        hotspot.data.title = newTitle;
        hotspot.data.content = newContent;
    } else {
        const otherScenes = sceneManager.scenes.filter(s => s.id !== sceneManager.currentScene.id);
        if (otherScenes.length > 0) {
            let sceneList = '';
            otherScenes.forEach((s, index) => {
                sceneList += `${index + 1}. ${s.name}\n`;
            });
            const choice = prompt(
                `تعديل المشهد المستهدف:\n${sceneList}\nأدخل الرقم الجديد (أو اتركه فارغاً للإبقاء):`
            );
            if (choice) {
                const idx = parseInt(choice) - 1;
                if (idx >= 0 && idx < otherScenes.length) {
                    hotspot.data.targetSceneId = otherScenes[idx].id;
                    hotspot.data.targetSceneName = otherScenes[idx].name;
                }
            }
        }

        const newDesc = prompt('✏️ تعديل الوصف:', hotspot.data.description || '');
        if (newDesc !== null) {
            hotspot.data.description = newDesc;
        }
    }

    sceneManager.saveScenes();
    rebuildHotspots(sceneManager.currentScene.hotspots);
    showCustomInfoWindow('✅ تم التحديث', 'تم تحديث بيانات النقطة بنجاح', 'info');
}

function showCustomInfoWindow(title, content, type = 'info') {
    const oldWindow = document.querySelector('.custom-info-window');
    if (oldWindow) oldWindow.remove();
    
    const colors = {
        info: '#ffaa44',
        scene: '#44aaff',
        success: '#44ff44',
        error: '#ff4444'
    };
    
    const icons = {
        info: 'icon/info.png',
        scene: 'icon/hotspot.png',
        success: '✅',
        error: '❌'
    };
    
    const window = document.createElement('div');
    window.className = 'custom-info-window';
    window.style.borderColor = colors[type] || colors.info;
    
    window.innerHTML = `
        <div class="window-header" style="border-bottom-color: ${colors[type]};">
            ${typeof icons[type] === 'string' && icons[type].includes('.png') 
                ? `<img src="${icons[type]}" style="width: 30px; height: 30px;">` 
                : `<span style="font-size: 24px;">${icons[type]}</span>`
            }
            <h3 style="color: ${colors[type]};">${title}</h3>
        </div>
        <div class="window-content">
            ${content}
        </div>
        <button class="window-close" style="border-color: ${colors[type]};" onclick="this.parentElement.remove()">حسناً</button>
    `;
    
    document.body.appendChild(window);
    
    setTimeout(() => {
        if (window.parentElement) window.remove();
    }, 3000);
}

// =======================================
// ٧. تحديث لوحة المشاهد
// =======================================
function updateScenePanel() {
    const list = document.getElementById('sceneList');
    if (!list) return;

    list.innerHTML = '';
    
    if (!sceneManager || !sceneManager.scenes) return;
    
    sceneManager.scenes.forEach(scene => {
        const item = document.createElement('div');
        item.className = 'scene-item';
        
        if (sceneManager.currentScene && sceneManager.currentScene.id === scene.id) {
            item.classList.add('active');
        }
        
        const infoCount = scene.hotspots?.filter(h => h.type === 'INFO').length || 0;
        const sceneCount = scene.hotspots?.filter(h => h.type === 'SCENE').length || 0;
        const totalPoints = infoCount + sceneCount;
        
        const icon = scene.id.includes('start') ? '🏠' : (sceneCount > 0 ? '🚪' : '🌄');
        
        item.innerHTML = `
            <span class='scene-icon'>${icon}</span>
            <span class='scene-name' title='${scene.name}'>${scene.name}</span>
            <span class='scene-hotspots' title='معلومات: ${infoCount} | انتقال: ${sceneCount}'>
                ${totalPoints}
            </span>
            <button class='delete-scene-btn' data-id='${scene.id}' title='حذف المشهد'>🗑️</button>
        `;

        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-scene-btn')) {
                if (sceneManager) {
                    sceneManager.switchToScene(scene.id);
                    updateScenePanel();
                }
            }
        });

        const deleteBtn = item.querySelector('.delete-scene-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (sceneManager) sceneManager.deleteScene(scene.id);
        });
        
        list.appendChild(item);
    });
}

// =======================================
// ٨. إضافة مشهد جديد
// =======================================
function addNewScene() {
    const name = prompt('📝 أدخل اسم المشهد:');
    if (!name || name.trim() === '') {
        alert('❌ الرجاء إدخال اسم صحيح');
        return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = async function(e) {
        const file = e.target.files[0];
        if (!file) {
            document.body.removeChild(input);
            return;
        }

        showLoader('جاري إضافة المشهد...');

        try {
            const scene = await sceneManager.addScene(name.trim(), file);
            if (scene) {
                sceneManager.switchToScene(scene.id);
                updateScenePanel();
                hideLoader();
                alert(`✅ تم إضافة المشهد: "${name.trim()}"`);
            }
        } catch (error) {
            console.error('❌ خطأ:', error);
            alert('فشل إضافة المشهد');
            hideLoader();
        }

        document.body.removeChild(input);
    };

    input.click();
}

// =======================================
// ٩. دوال التحميل والتصدير
// =======================================
function showLoader(message) {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.display = 'flex';
        loader.textContent = message || '⏳ جاري التحميل...';
    }
}

function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.display = 'none';
    }
}

async function exportCompleteTour() {
    if (!sceneManager || sceneManager.scenes.length === 0) {
        alert('❌ لا توجد مشاهد للتصدير');
        return;
    }

    showLoader('جاري تحضير الجولة...');

    try {
        const exportScenes = sceneManager.scenes.map(s => ({
            id: s.id,
            name: s.name,
            image: s.originalImage,
            paths: s.paths || [],
            hotspots: (s.hotspots || []).map(h => ({
                id: h.id,
                type: h.type,
                position: h.position,
                data: h.data || {}
            }))
        }));

        const projectName = projectManager.currentProject?.name || `tour-${Date.now()}`;
        await tourExporter.exportTour(projectName, exportScenes);

        hideLoader();
        alert(`✅ تم تصدير الجولة بنجاح!\n📁 الملف: ${projectName}.zip`);

    } catch (error) {
        console.error('❌ خطأ في التصدير:', error);
        alert('حدث خطأ في التصدير');
        hideLoader();
    }
}

function clearAllPaths() {
    if (confirm('هل أنت متأكد من مسح جميع المسارات؟')) {
        paths.forEach(p => scene.remove(p));
        paths = [];
        clearCurrentDrawing();
    }
}

// =======================================
// ١٠. تحميل البانوراما
// =======================================
function loadPanorama() {
    console.log('🔄 جاري تحميل البانوراما...');
    
    const loader = new THREE.TextureLoader();
    loader.load(
        './textures/StartPoint.jpg',
        (texture) => {
            console.log('✅ تم تحميل الصورة');
            
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.repeat.x = -1;

            const geometry = new THREE.SphereGeometry(500, 64, 64);
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.BackSide
            });

            sphereMesh = new THREE.Mesh(geometry, material);
            scene.add(sphereMesh);
            
            const loaderEl = document.getElementById('loader');
            if (loaderEl) loaderEl.style.display = 'none';
            
            setupMarkerPreview();
        },
        (progress) => {
            console.log(`⏳ التحميل: ${Math.round((progress.loaded / progress.total) * 100)}%`);
        },
        (error) => {
            console.error('❌ فشل تحميل الصورة:', error);
        }
    );
}

// =======================================
// ١١. دالة موحدة لتحميل المشاهد
// =======================================
function loadSceneImage(imageData) {
    if (!sphereMesh || !sphereMesh.material) return;

    const img = new Image();
    img.onload = () => {
        const texture = new THREE.CanvasTexture(img);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.repeat.x = -1;
        
        sphereMesh.material.map = texture;
        sphereMesh.material.needsUpdate = true;
        
        console.log('✅ تم تحميل المشهد الجديد');
    };
    img.src = imageData;
}

// =======================================
// ١٢. نظام الوضعيات
// =======================================
let currentMode = 'draw';

function setMode(mode) {
    currentMode = mode;
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = document.getElementById('mode' + mode.charAt(0).toUpperCase() + mode.slice(1));
    if (activeBtn) activeBtn.classList.add('active');
    
    document.body.classList.remove('mode-draw', 'mode-view');
    document.body.classList.add('mode-' + mode);
    
    console.log('🔄 تم التبديل إلى وضع: ' + mode);
}

// =======================================
// ١٣. إعداد الأحداث
// =======================================
function setupEvents() {
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    
    const toggleRotate = document.getElementById('toggleRotate');
    if (toggleRotate) {
        toggleRotate.onclick = () => {
            autorotate = !autorotate;
            controls.autoRotate = autorotate;
            toggleRotate.textContent = autorotate ? '⏸️ إيقاف التدوير' : '▶️ تشغيل التدوير';
        };
    }

    const toggleDraw = document.getElementById('toggleDraw');
    if (toggleDraw) {
        toggleDraw.onclick = () => {
            drawMode = !drawMode;
            toggleDraw.textContent = drawMode ? '⛔ إيقاف الرسم' : '✏️ تفعيل الرسم';
            toggleDraw.style.background = drawMode ? '#aa3333' : '#8f6c4a';
            document.body.style.cursor = drawMode ? 'crosshair' : 'default';
            if (markerPreview) markerPreview.visible = drawMode;
            controls.autoRotate = drawMode ? false : autorotate;
            if (!drawMode) clearCurrentDrawing();
        };
    }

    const finalizePath = document.getElementById('finalizePath');
    if (finalizePath) finalizePath.onclick = saveCurrentPath;

    const clearAll = document.getElementById('clearAll');
    if (clearAll) clearAll.onclick = clearAllPaths;

    const hotspotScene = document.getElementById('hotspotScene');
    if (hotspotScene) {
        hotspotScene.onclick = () => {
            hotspotMode = 'SCENE';
            document.body.style.cursor = 'cell';
        };
    }

    const hotspotInfo = document.getElementById('hotspotInfo');
    if (hotspotInfo) {
        hotspotInfo.onclick = () => {
            hotspotMode = 'INFO';
            document.body.style.cursor = 'cell';
        };
    }

    const addSceneBtn = document.getElementById('addSceneBtn');
    if (addSceneBtn) addSceneBtn.onclick = addNewScene;

    const exportTour = document.getElementById('exportTour');
    if (exportTour) exportTour.onclick = exportCompleteTour;
}

// =======================================
// ١٤. أحداث لوحة المفاتيح
// =======================================
function onKeyDown(e) {
    if (!drawMode) return;
    switch(e.key) {
        case 'Enter': e.preventDefault(); saveCurrentPath(); break;
        case 'Backspace': e.preventDefault(); undoLastPoint(); break;
        case 'Escape': e.preventDefault(); clearCurrentDrawing(); break;
        case 'n': case 'N': e.preventDefault(); clearCurrentDrawing(); break;
        case '1': currentPathType = 'EL'; window.setCurrentPathType('EL'); break;
        case '2': currentPathType = 'AC'; window.setCurrentPathType('AC'); break;
        case '3': currentPathType = 'WP'; window.setCurrentPathType('WP'); break;
        case '4': currentPathType = 'WA'; window.setCurrentPathType('WA'); break;
        case '5': currentPathType = 'GS'; window.setCurrentPathType('GS'); break;
    }
}

function undoLastPoint() {
    if (selectedPoints.length > 0) {
        selectedPoints.pop();
        const last = pointMarkers.pop();
        if (last) scene.remove(last);
        updateTempLine();
    }
}

function onResize() {
    if (!camera || !renderer) return;
    
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    updateHotspotPositions();
}

// =======================================
// ١٥. تهيئة أزرار الوضعيات
// =======================================
function initModeButtons() {
    const modeDraw = document.getElementById('modeDraw');
    const modeView = document.getElementById('modeView');
    
    if (modeDraw) modeDraw.onclick = () => setMode('draw');
    if (modeView) modeView.onclick = () => setMode('view');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModeButtons);
} else {
    initModeButtons();
}

// =======================================
// ١٦. التهيئة والتشغيل
// =======================================
function init() {
    console.log('🚀 بدء التهيئة...');
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 0, 0.1);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('container').appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(1, 1, 1);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight2.position.set(-1, -1, -0.5);
    scene.add(dirLight2);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.autoRotate = autorotate;
    controls.autoRotateSpeed = 0.5;
    controls.target.set(0, 0, 0);
    controls.update();

    sceneManager = new SceneManager();
    loadPanorama();
    setupEvents();
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    updateHotspotPositions();
}

init();
