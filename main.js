import * as THREE from 'three';
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
            icon: type === 'SCENE' ? '🚪' : 'ℹ️',
            color: type === 'SCENE' ? 0x44aaff : 0xffaa44
        };

        scene.hotspots.push(hotspot);
        this.saveScenes();
        return hotspot;
    }

    // عند التبديل بين المشاهد - إعادة بناء النقاط
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

        // إعادة بناء النقاط (باستخدام الدالة الجديدة)
        if (sceneData.hotspots) {
            rebuildHotspots(sceneData.hotspots);
        } else {
            // إزالة أي نقاط قديمة إذا لم يكن هناك نقاط
            document.querySelectorAll('.scene-hotspot-marker, .info-hotspot-marker').forEach(el => el.remove());
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="style.css">
    <script src="https://unpkg.com/three@0.128.0/build/three.min.js"></script>
    <script src="https://unpkg.com/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
    <style>
        #autoRotateBtn {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 24px;
            background: rgba(0,0,0,0.7);
            color: white;
            border: 2px solid #4a6c8f;
            border-radius: 30px;
            cursor: pointer;
            z-index: 100;
            font-size: 16px;
            backdrop-filter: blur(5px);
        }
        
        .paths-control-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(20, 30, 40, 0.85);
            backdrop-filter: blur(10px);
            border: 2px solid #4a6c8f;
            border-radius: 15px;
            color: white;
            z-index: 200;
            padding: 15px;
            min-width: 200px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            direction: rtl;
        }
        
        .paths-control-panel h3 {
            margin: 0 0 10px 0;
            color: #88aaff;
            font-size: 16px;
            text-align: center;
            border-bottom: 1px solid #4a6c8f;
            padding-bottom: 8px;
        }
        
        .path-toggle-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 6px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        
        .path-toggle-item:last-child {
            border-bottom: none;
        }
        
        .path-toggle-item input[type="checkbox"] {
            width: 18px;
            height: 18px;
            cursor: pointer;
            accent-color: #4a6c8f;
        }
        
        .path-toggle-item label {
            flex: 1;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .path-color-dot {
            width: 16px;
            height: 16px;
            border-radius: 4px;
            display: inline-block;
        }
        
        .hotspot {
            position: absolute;
            transform: translate(-50%, -50%);
            cursor: pointer;
            z-index: 10;
            filter: drop-shadow(0 0 10px currentColor);
            transition: transform 0.3s ease;
        }
        .hotspot:hover { transform: translate(-50%, -50%) scale(1.2); }
        .hotspot-tooltip {
            position: absolute;
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 10px 15px;
            border-radius: 8px;
            font-size: 14px;
            min-width: 200px;
            display: none;
            left: 50%;
            transform: translateX(-50%);
            bottom: 100%;
            margin-bottom: 10px;
            border: 2px solid currentColor;
        }
        .hotspot:hover .hotspot-tooltip { display: block; }
        .hotspot-icon { font-size: 30px; }
        
        .hotspot-icon-wrapper {
            position: relative;
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .hotspot-icon-image {
            width: 36px;
            height: 36px;
            object-fit: contain;
            z-index: 2;
            filter: drop-shadow(0 0 10px currentColor);
            transition: all 0.3s ease;
        }
        
        .hotspot-glow {
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            background: currentColor;
            opacity: 0.3;
            animation: pulse 2s infinite;
            z-index: 1;
        }
        
        @keyframes pulse {
            0% { transform: scale(1); opacity: 0.3; }
            50% { transform: scale(1.2); opacity: 0.5; }
            100% { transform: scale(1); opacity: 0.3; }
        }
        
        .tooltip-arrow {
            position: absolute;
            bottom: -8px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-top: 8px solid currentColor;
        }
        
        .tooltip-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            padding-bottom: 6px;
            border-bottom: 1px solid rgba(255,255,255,0.2);
        }
        
        .tooltip-icon {
            font-size: 16px;
        }
        
        .tooltip-body {
            line-height: 1.5;
        }
        
        /* القائمة الجانبية للمشاهد */
        .scene-list-panel {
            position: fixed;
            bottom: 100px;
            left: 20px;
            background: rgba(20, 30, 40, 0.85);
            backdrop-filter: blur(10px);
            border: 2px solid #4a6c8f;
            border-radius: 15px;
            color: white;
            z-index: 200;
            padding: 15px;
            min-width: 220px;
            max-width: 280px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            direction: rtl;
        }
        
        .scene-list-panel h3 {
            margin: 0 0 10px 0;
            color: #88aaff;
            font-size: 16px;
            text-align: center;
            border-bottom: 1px solid #4a6c8f;
            padding-bottom: 8px;
        }
        
        .scene-list-panel ul {
            list-style: none;
            padding: 0;
            margin: 0;
            max-height: 300px;
            overflow-y: auto;
        }
        
        .scene-list-panel li {
            padding: 8px 12px;
            margin: 4px 0;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .scene-list-panel li:hover {
            background: rgba(74, 108, 143, 0.3);
        }
        
        .scene-list-panel li.active {
            background: rgba(74, 108, 143, 0.6);
            border-right: 3px solid #88aaff;
        }
        
        .scene-list-panel li span {
            flex: 1;
        }
        
        .scene-list-panel .scene-icon {
            font-size: 16px;
        }
        
        .scene-list-panel .scene-hotspot-count {
            font-size: 11px;
            background: rgba(255,255,255,0.1);
            padding: 2px 6px;
            border-radius: 12px;
            color: #88aaff;
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
    
    <!-- القائمة الجانبية للمشاهد -->
    <div class="scene-list-panel">
        <h3>🏠 قائمة المشاهد</h3>
        <ul id="scene-list-sidebar"></ul>
    </div>
    
    <script>
        let autoRotate = true;
        let currentSceneIndex = 0;
        let scenes = [];
        let scene3D, camera, renderer, controls, sphereMesh;
        let allPaths = [];
        
        const pathColors = {
            EL: '#ffcc00',
            AC: '#00ccff',
            WP: '#0066cc',
            WA: '#ff3300',
            GS: '#33cc33'
        };
        
        function togglePathsByType(type, visible) {
            if (!allPaths) return;
            allPaths.forEach(path => {
                if (path.userData && path.userData.type === type) {
                    path.visible = visible;
                }
            });
        }
        
        function createPathsTogglePanel() {
            const toggleList = document.getElementById('paths-toggle-list');
            if (!toggleList) return;
            
            toggleList.innerHTML = '';
            
            const types = ['EL', 'AC', 'WP', 'WA', 'GS'];
            
            types.forEach(type => {
                const div = document.createElement('div');
                div.className = 'path-toggle-item';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = 'toggle-' + type;
                checkbox.checked = true;
                checkbox.setAttribute('data-type', type);
                
                checkbox.addEventListener('change', function(e) {
                    togglePathsByType(type, e.target.checked);
                });
                
                const label = document.createElement('label');
                label.htmlFor = 'toggle-' + type;
                
                const colorDot = document.createElement('span');
                colorDot.className = 'path-color-dot';
                colorDot.style.backgroundColor = pathColors[type] || '#ffffff';
                
                label.appendChild(colorDot);
                label.appendChild(document.createTextNode(' ' + type));
                
                div.appendChild(checkbox);
                div.appendChild(label);
                toggleList.appendChild(div);
            });
        }
        
        fetch('tour-data.json')
            .then(res => res.json())
            .then(data => {
                scenes = data;
                
                scene3D = new THREE.Scene();
                scene3D.background = new THREE.Color(0x000000);
                
                camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
                camera.position.set(0, 0, 0.1);
                
                renderer = new THREE.WebGLRenderer({ antialias: true });
                renderer.setSize(window.innerWidth, window.innerHeight);
                document.getElementById('container').appendChild(renderer.domElement);
                
                const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
                scene3D.add(ambientLight);
                
                controls = new THREE.OrbitControls(camera, renderer.domElement);
                controls.enableZoom = true;
                controls.enablePan = false;
                controls.enableDamping = true;
                controls.autoRotate = autoRotate;
                controls.autoRotateSpeed = 0.5;
                controls.target.set(0, 0, 0);
                
                document.getElementById('autoRotateBtn').onclick = () => {
                    autoRotate = !autoRotate;
                    controls.autoRotate = autoRotate;
                    document.getElementById('autoRotateBtn').textContent = 
                        autoRotate ? '⏸️ إيقاف الدوران' : '▶️ تشغيل الدوران';
                };
                
                function loadScene(index) {
                    const sceneData = scenes[index];
                    if (!sceneData) return;
                    
                    currentSceneIndex = index;
                    
                    if (sphereMesh) scene3D.remove(sphereMesh);
                    document.querySelectorAll('.hotspot').forEach(el => el.remove());
                    
                    allPaths.forEach(p => scene3D.remove(p));
                    allPaths = [];
                    
                    new THREE.TextureLoader().load(sceneData.image, texture => {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        texture.repeat.x = -1;
                        
                        const geometry = new THREE.SphereGeometry(500, 128, 128);
                        const material = new THREE.MeshBasicMaterial({
                            map: texture,
                            side: THREE.BackSide
                        });
                        
                        sphereMesh = new THREE.Mesh(geometry, material);
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
                                    
                                    const quaternion = new THREE.Quaternion();
                                    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
                                    cylinder.applyQuaternion(quaternion);
                                    
                                    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
                                    cylinder.position.copy(center);
                                    
                                    cylinder.userData = { type: pathData.type };
                                    scene3D.add(cylinder);
                                    allPaths.push(cylinder);
                                }
                            });
                            
                            document.querySelectorAll('#paths-toggle-list input').forEach(cb => {
                                togglePathsByType(cb.dataset.type, cb.checked);
                            });
                        }
                        
                        if (sceneData.hotspots && sceneData.hotspots.length > 0) {
                            setTimeout(() => {
                                sceneData.hotspots.forEach(hotspot => {
                                    const vector = new THREE.Vector3(hotspot.position.x, hotspot.position.y, hotspot.position.z).project(camera);
                                    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
                                    const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
                                    
                                    if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) return;
                                    
                                    const div = document.createElement('div');
                                    div.className = 'hotspot';
                                    div.style.left = x + 'px';
                                    div.style.top = y + 'px';
                                    
                                    const iconUrl = hotspot.type === 'SCENE' ? 'icon/hotspot.png' : 'icon/info.png';
                                    
                                    if (hotspot.type === 'INFO') {
                                        div.style.color = '#ffaa44';
                                        
                                        const title = hotspot.data?.title || 'معلومات';
                                        const content = hotspot.data?.content || '';
                                        
                                        div.innerHTML = \`
                                            <div class="hotspot-icon-wrapper">
                                                <img src="\${iconUrl}" class="hotspot-icon-image" alt="info">
                                                <span class="hotspot-glow"></span>
                                            </div>
                                            <div class="hotspot-tooltip">
                                                <div class="tooltip-arrow"></div>
                                                <div class="tooltip-header">
                                                    <span class="tooltip-icon">📌</span>
                                                    <strong>\${title}</strong>
                                                </div>
                                                <div class="tooltip-body">
                                                    <p>\${content}</p>
                                                </div>
                                            </div>
                                        \`;
                                        
                                        div.onclick = function(e) {
                                            e.stopPropagation();
                                            alert(\`\${title}\n\n\${content}\`);
                                        };
                                        
                                    } else {
                                        div.style.color = '#44aaff';
                                        
                                        const targetName = hotspot.data?.targetSceneName || 'مشهد آخر';
                                        const description = hotspot.data?.description || '';
                                        const targetId = hotspot.data?.targetSceneId;
                                        
                                        div.innerHTML = \`
                                            <div class="hotspot-icon-wrapper">
                                                <img src="\${iconUrl}" class="hotspot-icon-image" alt="scene">
                                                <span class="hotspot-glow"></span>
                                            </div>
                                            <div class="hotspot-tooltip">
                                                <div class="tooltip-arrow"></div>
                                                <div class="tooltip-header">
                                                    <span class="tooltip-icon">🚶</span>
                                                    <strong>انتقال إلى: \${targetName}</strong>
                                                </div>
                                                <div class="tooltip-body">
                                                    <p>\${description || 'اضغط للانتقال'}</p>
                                                </div>
                                            </div>
                                        \`;
                                        
                                        div.onclick = function(e) {
                                            e.stopPropagation();
                                            if (targetId) {
                                                const targetIndex = scenes.findIndex(s => s.id === targetId);
                                                if (targetIndex !== -1) {
                                                    div.style.transform = 'scale(1.5)';
                                                    div.style.transition = 'all 0.3s ease';
                                                    setTimeout(() => {
                                                        loadScene(targetIndex);
                                                    }, 300);
                                                } else {
                                                    alert('المشهد المطلوب غير موجود');
                                                }
                                            }
                                        };
                                    }

                                    document.body.appendChild(div);
                                });
                            }, 200);
                        }
                        
                        // تحديث القائمة الجانبية
                        updateSceneSidebar();
                    });
                }
                
                // تحديث القائمة الجانبية
                function updateSceneSidebar() {
                    const list = document.getElementById('scene-list-sidebar');
                    if (!list) return;
                    
                    list.innerHTML = '';
                    scenes.forEach((scene, index) => {
                        const li = document.createElement('li');
                        li.className = index === currentSceneIndex ? 'active' : '';
                        li.onclick = () => loadScene(index);
                        
                        const hotspotCount = scene.hotspots ? scene.hotspots.length : 0;
                        
                        li.innerHTML = \`
                            <span class="scene-icon">\${index === 0 ? '🏠' : '🏢'}</span>
                            <span>\${scene.displayName || scene.name}</span>
                            <span class="scene-hotspot-count">\${hotspotCount} نقطة</span>
                        \`;
                        list.appendChild(li);
                    });
                }
                
                createPathsTogglePanel();
                loadScene(0);
                
                window.addEventListener('resize', () => {
                    camera.aspect = window.innerWidth / window.innerHeight;
                    camera.updateProjectionMatrix();
                    renderer.setSize(window.innerWidth, window.innerHeight);
                });
                
                function animate() {
                    requestAnimationFrame(animate);
                    controls.update();
                    renderer.render(scene3D, camera);
                }
                animate();
            });
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
let hotspotIcons = {}; // تخزين مراجع أيقونات HTML

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

// =======================================
// دوال الرسم الأساسية (تابع)
// =======================================
function onClick(e) {
    if (!sphereMesh || e.target !== renderer.domElement) return;
    
    mouse.x = (e.clientX / renderer.domElement.clientWidth) * 2 - 1;
    mouse.y = -(e.clientY / renderer.domElement.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    
    // التحقق من النقر على Hotspot أولاً
    const hotspotHits = raycaster.intersectObjects(
        scene.children.filter(c => c.userData && c.userData.type === 'hotspot')
    );

    if (hotspotHits.length > 0) {
        const hotspotObj = hotspotHits[0].object;
        const hotspotData = hotspotObj.userData;

        // إذا كان Ctrl مضغوطاً، احذف
        if (e.ctrlKey) {
            deleteHotspotById(hotspotData.hotspotId);
            return;
        }

        // وإلا، اعرض نافذة التحرير
        editHotspot(hotspotData.hotspotId);
        return;
    }

    // إذا لم يكن هناك Hotspot، تحقق من النقر على الكرة
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
// ٦. دوال Hotspots - أيقونات ثابتة تماماً (نسخة مصححة)
// =======================================

// إعادة بناء Hotspots - أيقونات ثابتة
function rebuildHotspots(hotspots) {
    if (!scene || !camera) return;

    // إزالة الأيقونات القديمة من DOM
    document.querySelectorAll('.scene-hotspot-marker, .info-hotspot-marker').forEach(el => el.remove());

    if (!hotspots || hotspots.length === 0) return;

    // حساب مصفوفة الإسقاط للكاميرا الحالية
    const width = window.innerWidth;
    const height = window.innerHeight;

    hotspots.forEach(h => {
        // تحويل إحداثيات 3D إلى 2D
        const pos = new THREE.Vector3(h.position.x, h.position.y, h.position.z);
        
        // استخدام matrixWorld للحصول على الإسقاط الصحيح
        pos.project(camera);
        
        // تحويل إلى إحداثيات الشاشة
        const x = (pos.x * 0.5 + 0.5) * width;
        const y = (-pos.y * 0.5 + 0.5) * height;

        // التأكد من أن الإحداثيات ضمن الشاشة
        if (x < 0 || x > width || y < 0 || y > height) return;

        // إنشاء عنصر HTML للأيقونة في موقع ثابت
        const iconElement = createHotspotElement(x, y, h.type, h.data, h.id);
        document.body.appendChild(iconElement);
    });

    console.log(`✅ تم إعادة بناء ${hotspots.length} نقطة في مواقع ثابتة`);
}

// دالة مساعدة لإنشاء عنصر hotspot - نفس الكود السابق
function createHotspotElement(x, y, type, data, hotspotId) {
    const div = document.createElement('div');
    div.className = type === 'SCENE' ? 'scene-hotspot-marker' : 'info-hotspot-marker';
    div.style.position = 'absolute';
    div.style.left = x + 'px';
    div.style.top = y + 'px';
    div.style.transform = 'translate(-50%, -50%)';
    div.style.pointerEvents = 'auto';
    div.style.zIndex = '1000';
    div.setAttribute('data-id', hotspotId);
    div.setAttribute('data-type', type);
    
    const iconUrl = type === 'SCENE' ? 'icon/hotspot.png' : 'icon/info.png';
    const displayText = type === 'SCENE' ? 
        (data.targetSceneName || 'انتقال') : 
        (data.title || 'معلومات');
    
    div.innerHTML = `
        <img src="${iconUrl}" alt="${type}" style="width: 40px; height: 40px; filter: drop-shadow(0 0 10px ${type === 'SCENE' ? '#44aaff' : '#ffaa44'}); pointer-events: none;">
        <div class="hotspot-label">${displayText}</div>
        <div class="hotspot-controls" style="pointer-events: auto;">
            <button class="edit-btn" onclick="window.editHotspotFromUI('${hotspotId}')" title="تعديل">✏️</button>
            <button class="delete-btn" onclick="window.deleteHotspotFromUI('${hotspotId}')" title="حذف">🗑️</button>
        </div>
    `;
    
    return div;
}


// دالة إضافة Hotspot جديدة - مع إحداثيات ثابتة
function addHotspot(position) {
    if (!sceneManager || !sceneManager.currentScene) {
        alert('❌ لا يوجد مشهد نشط');
        return;
    }

    if (hotspotMode === 'INFO') {
        const title = prompt('أدخل عنوان المعلومات:');
        if (!title) return;
        const content = prompt('أدخل نص المعلومات:');
        if (!content) return;

        const data = { title, content, type: 'INFO' };

        const hotspot = sceneManager.addHotspot(
            sceneManager.currentScene.id,
            'INFO',
            position,
            data
        );

        if (hotspot) {
            // إعادة بناء جميع النقاط (لأنها ستؤثر على الإحداثيات)
            rebuildHotspots(sceneManager.currentScene.hotspots);
            alert(`✅ تم إضافة نقطة معلومات: "${title}"`);
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
        const description = prompt(`أدخل وصفاً لهذه النقطة:`) || `انتقال إلى ${targetScene.name}`;

        const data = {
            targetSceneId: targetScene.id,
            targetSceneName: targetScene.name,
            description,
            type: 'SCENE'
        };

        const hotspot = sceneManager.addHotspot(
            sceneManager.currentScene.id,
            'SCENE',
            position,
            data
        );

        if (hotspot) {
            // إعادة بناء جميع النقاط
            rebuildHotspots(sceneManager.currentScene.hotspots);
            alert(`✅ تم إضافة نقطة انتقال إلى: "${targetScene.name}"`);
            if (typeof updateScenePanel === 'function') updateScenePanel();
        }
    }

    hotspotMode = null;
    document.body.style.cursor = 'default';
}

// دوال للتحكم من UI
window.editHotspotFromUI = function(hotspotId) {
    editHotspot(hotspotId);
};

window.deleteHotspotFromUI = function(hotspotId) {
    if (confirm('هل أنت متأكد من حذف هذه النقطة؟')) {
        deleteHotspotById(hotspotId);
        // إزالة الأيقونة
        const icon = document.querySelector(`[data-id="${hotspotId}"]`);
        if (icon) icon.remove();
        delete hotspotIcons[hotspotId];
    }
};

// دالة حذف Hotspot بالـ ID
function deleteHotspotById(hotspotId) {
    if (!sceneManager || !sceneManager.currentScene) return;

    // حذف من البيانات
    sceneManager.currentScene.hotspots = sceneManager.currentScene.hotspots.filter(
        h => h.id !== hotspotId
    );

    // حذف من المشهد ثلاثي الأبعاد
    scene.children.forEach(child => {
        if (child.userData && child.userData.hotspotId === hotspotId) {
            scene.remove(child);
        }
    });

    sceneManager.saveScenes();
    updateScenePanel();
    console.log('🗑️ تم حذف النقطة');
}

// دالة تحرير Hotspot
function editHotspot(hotspotId) {
    if (!sceneManager || !sceneManager.currentScene) return;

    const hotspot = sceneManager.currentScene.hotspots.find(h => h.id === hotspotId);
    if (!hotspot) return;

    if (hotspot.type === 'INFO') {
        const newTitle = prompt('تعديل عنوان المعلومات:', hotspot.data.title || '');
        if (newTitle === null) return;
        const newContent = prompt('تعديل نص المعلومات:', hotspot.data.content || '');
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

        const newDesc = prompt('تعديل الوصف:', hotspot.data.description || '');
        if (newDesc !== null) {
            hotspot.data.description = newDesc;
        }
    }

    sceneManager.saveScenes();
    rebuildHotspots(sceneManager.currentScene.hotspots);
    alert('✅ تم تحديث النقطة');
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
            item.style.background = 'rgba(74, 108, 143, 0.7)';
            item.style.border = '2px solid #88aaff';
        }
        
        const infoCount = scene.hotspots?.filter(h => h.type === 'INFO').length || 0;
        const sceneCount = scene.hotspots?.filter(h => h.type === 'SCENE').length || 0;
        const totalPoints = infoCount + sceneCount;
        
        item.innerHTML = `
            <span class='scene-icon'>🌄</span>
            <span class='scene-name'>${scene.name}</span>
            <span class='scene-hotspots' title='معلومات: ${infoCount} | انتقال: ${sceneCount}'>
                ${totalPoints} نقطة
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
// ١٤. أحداث لوحة المفاتيح وتغيير الحجم
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

// ✅ دالة onResize الموحدة
function onResize() {
    if (!camera || !renderer) return;
    
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // إعادة بناء النقاط مع الإحداثيات الجديدة للشاشة
    if (sceneManager && sceneManager.currentScene && sceneManager.currentScene.hotspots) {
        if (typeof rebuildHotspots === 'function') {
            rebuildHotspots(sceneManager.currentScene.hotspots);
        }
    }
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
    
    // تحديث مواقع الأيقونات باستمرار
    updateHotspotPositions();
}

// دالة تحديث مواقع الأيقونات
function updateHotspotPositions() {
    if (!sceneManager || !sceneManager.currentScene || !sceneManager.currentScene.hotspots) return;
    
    sceneManager.currentScene.hotspots.forEach(h => {
        const marker = scene.children.find(c => 
            c.userData && c.userData.hotspotId === h.id
        );
        
        if (marker) {
            const vector = marker.position.clone().project(camera);
            const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
            
            const icon = document.querySelector(`[data-id="${h.id}"]`);
            if (icon) {
                icon.style.left = x + 'px';
                icon.style.top = y + 'px';
                
                // إخفاء الأيقونة إذا كانت خارج الشاشة
                if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) {
                    icon.style.display = 'none';
                } else {
                    icon.style.display = 'block';
                }
            }
        }
    });
}

// =======================================
// ١٧. بدء التشغيل
// =======================================
init(); 
