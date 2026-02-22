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
            updateScenePanel();
        };
    }

    saveScenes() {
        if (!this.db) return;
        const tx = this.db.transaction('scenes', 'readwrite');
        const store = tx.objectStore('scenes');
        store.clear();
        this.scenes.forEach(scene => store.add(scene));
        console.log('✅ تم حفظ المشاهد');
        updateScenePanel();
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

        paths.forEach(p => scene3D.remove(p));  // ✅ استخدم scene3D بدلاً من scene
paths = [];
clearCurrentDrawing();

        if (sphereMesh && sphereMesh.material) {
            const img = new Image();
            img.onload = () => {
                const texture = new THREE.CanvasTexture(img);
                sphereMesh.material.map = texture;
                sphereMesh.material.needsUpdate = true;
            };
            img.src = sceneData.originalImage;
        }

        if (sceneData.paths) {
            sceneData.paths.forEach(pathData => {
                const points = pathData.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
                currentPathType = pathData.type;
                createStraightPath(points);
            });
        }

        if (sceneData.hotspots) rebuildHotspots(sceneData.hotspots);
        updateScenePanel();
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
                    loadPanorama();
                }
            }
            this.saveScenes();
            updateScenePanel();
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
            hotspots: scene.hotspots || []
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
    </style>
</head>
<body>

<div class="info">🏗️ ${projectName}</div>
    <div id="container"></div>
    <button id="autoRotateBtn">⏸️ إيقاف الدوران</button>

    <script>
        let autoRotate = true;
        let currentSceneIndex = 0;
        let scenes = [];
        let scene3D, camera, renderer, controls, sphereMesh;
        
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
                        
                        // إضافة المسارات
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
                                        new THREE.MeshStandardMaterial({ color: pathData.color, emissive: pathData.color, emissiveIntensity: 0.3 })
                                    );
                                    
                                    const quaternion = new THREE.Quaternion();
                                    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
                                    cylinder.applyQuaternion(quaternion);
                                    
                                    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
                                    cylinder.position.copy(center);
                                    scene3D.add(cylinder);
                                }
                            });
                        }
                        
                        // إضافة الـ hotspots
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
                                    
                                    if (hotspot.type === 'INFO') {
                                        div.style.color = '#ffaa44';
                                        div.innerHTML = \`
                                            <span class='hotspot-icon'>ℹ️</span>
                                            <div class='hotspot-tooltip'>
                                                <strong>\${hotspot.data.title || 'معلومات'}</strong>
                                                <p>\${hotspot.data.content || ''}</p>
                                            </div>
                                        \`;
                                        div.onclick = () => alert(\`\${hotspot.data.title}\n\n\${hotspot.data.content}\`);
                                    } else {
                                        div.style.color = '#44aaff';
                                        div.innerHTML = \`
                                            <span class='hotspot-icon'>🚪</span>
                                            <div class='hotspot-tooltip'>
                                                <strong>انتقال إلى: \${hotspot.data.targetSceneName || 'مشهد آخر'}</strong>
                                                <p>\${hotspot.data.description || ''}</p>
                                            </div>
                                        \`;
                                        div.onclick = () => {
                                            const targetIndex = scenes.findIndex(s => s.id === hotspot.data.targetSceneId);
                                            if (targetIndex !== -1) loadScene(targetIndex);
                                        };
                                    }
                                    document.body.appendChild(div);
                                });
                            }, 200);
                        }
                    });
                }
                
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

---تم إنشاؤها باستخدام Virtual Tour Studio © 2026`;
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
const tourExporter = new TourExporter(); // ✅ الآن يعمل بشكل صحيح

// =======================================
// ٥. دوال الرسم
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
        } else if (drawMode) addPoint(point);
    }
}

// =======================================
// ٦. بدء التشغيل
// =======================================
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 2000);
    camera.position.set(0, 0, 0.1);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('container').appendChild(renderer.domElement);
    
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.autoRotate = autorotate;
    
    sceneManager = new SceneManager();
    loadPanorama();
    setupEvents();
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// =======================================
// بدء التشغيل
// =======================================
init();
