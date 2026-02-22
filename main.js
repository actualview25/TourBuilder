import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// =======================================
// إدارة المشاريع
// =======================================
class ProjectManager {
    constructor() {
        this.projects = [];
        this.currentProject = null;
        this.loadProjects();
    }

    loadProjects() {
        const saved = localStorage.getItem('virtual-tour-projects');
        if (saved) {
            this.projects = JSON.parse(saved);
        }
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
                points: path.userData.points.map(p => ({
                    x: p.x, y: p.y, z: p.z
                }))
            }));
            this.currentProject.imageData = imageData;
            this.currentProject.lastModified = new Date().toISOString();
            this.saveProjects();
        }
    }
}

// =======================================
// إدارة المشاهد المتعددة
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

        request.onerror = (e) => {
            console.error('❌ IndexedDB error:', e);
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
        
        this.scenes.forEach(scene => {
            store.add(scene);
        });

        console.log('✅ تم حفظ المشاهد');
        updateScenePanel();
    }

    async addScene(name, imageFile) {
        if (!(imageFile instanceof Blob)) {
            console.error('❌ الملف ليس من نوع Blob:', imageFile);
            return null;
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const imageData = e.target.result;
                
                const img = new Image();
                img.onload = () => {
                    const scene = {
                        id: `scene-${Date.now()}-${Math.random()}`,
                        name: name,
                        originalImage: imageData,
                        thumbnail: imageData,
                        paths: [],
                        hotspots: [],
                        created: new Date().toISOString()
                    };
                    
                    this.scenes.push(scene);
                    this.saveScenes();
                    
                    console.log(`✅ تم إضافة مشهد: ${name}`);
                    resolve(scene);
                };
                
                img.onerror = (err) => {
                    console.error('❌ خطأ في تحميل الصورة:', err);
                    reject(err);
                };
                
                img.src = imageData;
            };
            
            reader.onerror = (err) => {
                console.error('❌ خطأ في قراءة الملف:', err);
                reject(err);
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

    updateScenePaths(sceneId, paths) {
        const scene = this.scenes.find(s => s.id === sceneId);
        if (scene) {
            scene.paths = paths.map(path => ({
                type: path.userData.type,
                color: '#' + pathColors[path.userData.type].toString(16).padStart(6, '0'),
                points: path.userData.points.map(p => ({
                    x: p.x, y: p.y, z: p.z
                }))
            }));
            this.saveScenes();
        }
    }

    getOriginalImage(sceneId) {
        const scene = this.scenes.find(s => s.id === sceneId);
        return scene ? scene.originalImage : null;
    }

    switchToScene(sceneId) {
        const sceneData = this.scenes.find(s => s.id === sceneId);
        if (!sceneData) {
            console.log('❌ مشهد غير موجود');
            return false;
        }

        if (this.currentScene && paths.length > 0) {
            this.updateScenePaths(this.currentScene.id, paths);
        }

        this.currentScene = sceneData;
        this.currentSceneIndex = this.scenes.indexOf(sceneData);

        paths.forEach(p => scene.remove(p));
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
                const oldType = currentPathType;
                currentPathType = pathData.type;
                createStraightPath(points);
                currentPathType = oldType;
            });
        }

        if (sceneData.hotspots) {
            rebuildHotspots(sceneData.hotspots);
        }

        console.log(`✅ تم التبديل إلى: ${sceneData.name}`);
        updateScenePanel();
        return true;
    }
}

// =======================================
// تحديث لوحة المشاهد
// =======================================
// =======================================
// تحديث لوحة المشاهد (مع زر حذف)
// =======================================
function updateScenePanel() {
    const list = document.getElementById('sceneList');
    if (!list) return;

    list.innerHTML = '';
    
    if (!sceneManager || !sceneManager.scenes) return;
    
    sceneManager.scenes.forEach((scene, sceneIndex) => {
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
            <span class="scene-icon">🌄</span>
            <span class="scene-name">${scene.name}</span>
            <span class="scene-hotspots" title="معلومات: ${infoCount} | انتقال: ${sceneCount}">
                ${totalPoints} نقطة
            </span>
            <button class="delete-scene-btn" data-id="${scene.id}" title="حذف المشهد">🗑️</button>
        `;

        // النقر على المشهد (وليس زر الحذف)
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-scene-btn')) {
                if (sceneManager) {
                    sceneManager.switchToScene(scene.id);
                    updateScenePanel();
                }
            }
        });
        
        // زر حذف المشهد
        const deleteBtn = item.querySelector('.delete-scene-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteScene(scene.id);
        });
        
        list.appendChild(item);
    });
}
// =======================================
// مصدر الجولات
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
        }
        .hotspot:hover {
            transform: translate(-50%, -50%) scale(1.2);
        }
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
            box-shadow: 0 5px 20px rgba(0,0,0,0.5);
        }
        .hotspot:hover .hotspot-tooltip {
            display: block;
        }
        .hotspot-icon {
            font-size: 30px;
        }
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
                
                // تهيئة المشهد
                scene3D = new THREE.Scene();
                scene3D.background = new THREE.Color(0x000000);
                
                // الكاميرا
                camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
                camera.position.set(0, 0, 0.1);
                
                // المعالج
                renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
                renderer.setSize(window.innerWidth, window.innerHeight);
                renderer.setPixelRatio(window.devicePixelRatio);
                document.getElementById('container').appendChild(renderer.domElement);
                
                // الإضاءة
                const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
                scene3D.add(ambientLight);
                
                const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
                dirLight1.position.set(1, 1, 1);
                scene3D.add(dirLight1);
                
                const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
                dirLight2.position.set(-1, -1, -0.5);
                scene3D.add(dirLight2);
                
                // التحكم
                controls = new THREE.OrbitControls(camera, renderer.domElement);
                controls.enableZoom = true;
                controls.enablePan = false;
                controls.enableDamping = true;
                controls.autoRotate = autoRotate;
                controls.autoRotateSpeed = 0.5;
                controls.target.set(0, 0, 0);
                
                // زر التحكم بالدوران
                document.getElementById('autoRotateBtn').onclick = () => {
                    autoRotate = !autoRotate;
                    controls.autoRotate = autoRotate;
                    document.getElementById('autoRotateBtn').textContent = 
                        autoRotate ? '⏸️ إيقاف الدوران' : '▶️ تشغيل الدوران';
                };
                
                // دالة تحميل المشهد
                function loadScene(index) {
                    const sceneData = scenes[index];
                    if (!sceneData) return;
                    
                    currentSceneIndex = index;
                    
                    // إزالة الكرة القديمة
                    if (sphereMesh) scene3D.remove(sphereMesh);
                    
                    // إزالة الـ hotspots القديمة
                    document.querySelectorAll('.hotspot').forEach(el => el.remove());
                    
                    // تحميل الصورة الجديدة
                    new THREE.TextureLoader().load(sceneData.image, 
                        (texture) => {
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
                            if (sceneData.paths && sceneData.paths.length > 0) {
                                sceneData.paths.forEach(pathData => {
                                    const points = pathData.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
                                    
                                    for (let i = 0; i < points.length - 1; i++) {
                                        const start = points[i];
                                        const end = points[i + 1];
                                        
                                        const direction = new THREE.Vector3().subVectors(end, start);
                                        const distance = direction.length();
                                        
                                        if (distance < 5) continue;
                                        
                                        const cylinderGeo = new THREE.CylinderGeometry(3.5, 3.5, distance, 12);
                                        const cylinderMat = new THREE.MeshStandardMaterial({
                                            color: pathData.color,
                                            emissive: pathData.color,
                                            emissiveIntensity: 0.3
                                        });
                                        
                                        const cylinder = new THREE.Mesh(cylinderGeo, cylinderMat);
                                        
                                        const quaternion = new THREE.Quaternion();
                                        quaternion.setFromUnitVectors(
                                            new THREE.Vector3(0, 1, 0),
                                            direction.clone().normalize()
                                        );
                                        
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
                                        try {
                                            const vector = new THREE.Vector3(
                                                hotspot.position.x,
                                                hotspot.position.y,
                                                hotspot.position.z
                                            ).project(camera);
                                            
                                            const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
                                            const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
                                            
                                            if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) return;
                                            
                                            const div = document.createElement('div');
                                            div.className = 'hotspot';
                                            div.style.left = x + 'px';
                                            div.style.top = y + 'px';
                                            
                                            if (hotspot.type === 'INFO') {
                                                div.style.color = '#ffaa44';
                                                
                                                const title = hotspot.data?.title || 'معلومات';
                                                const content = hotspot.data?.content || '';
                                                
                                                div.innerHTML = `
                                                    <div class='hotspot-icon-wrapper'>
                                                        <span class='hotspot-icon info-icon'>ℹ️</span>
                                                        <span class='hotspot-glow'></span>
                                                    </div>
                                                    <div class='hotspot-tooltip'>
                                                        <div class='tooltip-arrow'></div>
                                                        <div class='tooltip-header'>
                                                            <span class='tooltip-icon'>📌</span>
                                                            <strong>${title}</strong>
                                                        </div>
                                                        <div class='tooltip-body'>
                                                            <p>${content}</p>
                                                        </div>
                                                    </div>
                                                `;
                                                
                                                div.onclick = (e) => {
                                                    e.stopPropagation();
                                                    alert(`📌 ${title}\n\n${content}`);
                                                };
                                                
                                            } else if (hotspot.type === 'SCENE') {
                                                div.style.color = '#44aaff';
                                                
                                                const targetName = hotspot.data?.targetSceneName || 'مشهد آخر';
                                                const description = hotspot.data?.description || '';
                                                const targetId = hotspot.data?.targetSceneId;
                                                
                                                div.innerHTML = `
                                                    <div class='hotspot-icon-wrapper'>
                                                        <span class='hotspot-icon scene-icon'>🚪</span>
                                                        <span class='hotspot-glow'></span>
                                                    </div>
                                                `;
                                                    <div class='hotspot-tooltip'>
                                                        <div class='tooltip-arrow'></div>
                                                        <div class='tooltip-header'>
                                                            <span class='tooltip-icon'>🚶</span>
                                                            <strong>انتقال إلى: ${targetName}</strong>
                                                        </div>
                                                        <div class='tooltip-body'>
                                                            <p>${description || 'اضغط للانتقال'}</p>
                                                        </div>
                                                    </div>
                                                `;
                                                
                                                div.onclick = (e) => {
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
                                            
                                        } catch (error) {
                                            console.error('خطأ في إضافة hotspot:', error);
                                        }
                                    });
                                }, 200);
                            }
                        },
                        undefined,
                        (error) => {
                            console.error('❌ فشل تحميل الصورة:', error);
                        }
                    );
                }
                
                // تحميل المشهد الأول
                if (scenes.length > 0) {
                    loadScene(0);
                }
                
                // تغيير الحجم
                window.addEventListener('resize', () => {
                    camera.aspect = window.innerWidth / window.innerHeight;
                    camera.updateProjectionMatrix();
                    renderer.setSize(window.innerWidth, window.innerHeight);
                });
                
                // حلقة الرسم
                function animate() {
                    requestAnimationFrame(animate);
                    controls.update();
                    renderer.render(scene3D, camera);
                }
                animate();
            })
            .catch(error => {
                console.error('❌ خطأ في تحميل البيانات:', error);
                document.body.innerHTML = `
                    <div style="color: white; background: red; padding: 20px; margin: 20px; border-radius: 10px;">
                        ❌ خطأ في تحميل الجولة: ${error.message}
                    </div>
                `;
            });
    </script>
</body>
</html>
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
3. اضغط على hotspots للتنقل بين المشاهد أو عرض المعلومات

### الأنظمة:
- 🟡 EL: كهرباء
- 🔵 AC: تكييف
- 🔵 WP: مياه
- 🔴 WA: صرف صحي
- 🟢 GS: غاز

### النشر على GitHub Pages:
1. ارفع محتويات هذا المجلد إلى مستودع GitHub
2. فعل GitHub Pages من الإعدادات
3. الجولة متاحة على: \`https://[اسمك].github.io/[المشروع]\`

---
تم إنشاؤها باستخدام Virtual Tour Studio © 2026
`;
    }
}

// =======================================
// المتغيرات الأساسية
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

const pathColors = {
    EL: 0xffcc00,
    AC: 0x00ccff,
    WP: 0x0066cc,
    WA: 0xff3300,
    GS: 0x33cc33
};

let currentPathType = 'EL';
window.setCurrentPathType = (t) => {
    currentPathType = t;
    console.log('🎨 تغيير النوع إلى:', t);
    if (markerPreview) {
        markerPreview.material.color.setHex(pathColors[currentPathType]);
        markerPreview.material.emissive.setHex(pathColors[currentPathType]);
    }
};

const projectManager = new ProjectManager();
const tourExporter = new TourExporter();

// =======================================
// دوال الرسم
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

// تعديل دالة onClick لدعم حذف hotspots
function onClick(e) {
    if (!sphereMesh) return;
    if (e.target !== renderer.domElement) return;

    // التحقق من النقر على hotspot
    raycaster.setFromCamera(mouse, camera);
    const hotspotHits = raycaster.intersectObjects(scene.children.filter(c => c.userData?.type === 'hotspot'));
    
    if (hotspotHits.length > 0) {
        const hotspot = hotspotHits[0].object;
        
        // إذا كان Ctrl مضغوطاً، احذف
        if (e.ctrlKey) {
            if (confirm('حذف هذه النقطة؟')) {
                deleteHotspot(hotspot.userData.hotspotId);
                scene.remove(hotspot);
            }
            return;
        }
        
        // وإلا، نفذ الإجراء العادي
        if (hotspot.userData.hotspotType === 'INFO') {
            const data = hotspot.userData.hotspotData;
            alert(`${data.title}\n\n${data.content}`);
        } else if (hotspot.userData.hotspotType === 'SCENE') {
            const data = hotspot.userData.hotspotData;
            const targetIndex = sceneManager.scenes.findIndex(s => s.id === data.targetSceneId);
            if (targetIndex !== -1) {
                sceneManager.switchToScene(data.targetSceneId);
            }
        }
        return;
    }

    // باقي الكود للنقر على الكرة
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
        const material = new THREE.LineBasicMaterial({ 
            color: pathColors[currentPathType]
        });
        tempLine = new THREE.Line(geometry, material);
        scene.add(tempLine);
    }
}

function clearCurrentDrawing() {
    selectedPoints = [];
    
    pointMarkers.forEach(marker => scene.remove(marker));
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

    try {
        if (tempLine) {
            scene.remove(tempLine);
            tempLine.geometry.dispose();
            tempLine = null;
        }
        
        createStraightPath(selectedPoints);
        clearCurrentDrawing();
        
        if (sceneManager && sceneManager.currentScene) {
            sceneManager.updateScenePaths(sceneManager.currentScene.id, paths);
        }
        
        console.log('✅ تم حفظ المسار');
        
    } catch (error) {
        console.error('❌ خطأ في حفظ المسار:', error);
    }
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
        
        const cylinderRadius = 3.5;
        const cylinderHeight = distance;
        const cylinderGeo = new THREE.CylinderGeometry(cylinderRadius, cylinderRadius, cylinderHeight, 12);
        
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
        
        const material = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.4
        });
        
        const cylinder = new THREE.Mesh(cylinderGeo, material);
        cylinder.applyQuaternion(quaternion);
        
        const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        cylinder.position.copy(center);
        
        cylinder.userData = {
            type: currentPathType,
            pathId: pathId,
            points: [start.clone(), end.clone()]
        };
        
        scene.add(cylinder);
        paths.push(cylinder);
    }
    
    if (points.length > 0) {
        const sphereGeo = new THREE.SphereGeometry(6, 24, 24);
        const sphereMat = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.5
        });
        
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.copy(points[0]);
        
        sphere.userData = {
            type: currentPathType,
            pathId: pathId,
            points: [points[0].clone()]
        };
        
        scene.add(sphere);
        paths.push(sphere);
    }
    
    console.log(`✅ تم إنشاء مسار بـ ${points.length-1} أجزاء`);
}

// =======================================
// دوال Hotspots
// =======================================
function addHotspot(position) {
    if (!sceneManager || !sceneManager.currentScene) {
        alert('❌ لا يوجد مشهد نشط. أضف مشهداً أولاً');
        return;
    }

    console.log('🔴 وضع Hotspot:', hotspotMode);

    if (hotspotMode === 'INFO') {
        const title = prompt('أدخل عنوان المعلومات:');
        if (!title) return;

        const content = prompt('أدخل نص المعلومات:');
        if (!content) return;

        const data = { title, content };

        const hotspot = sceneManager.addHotspot(
            sceneManager.currentScene.id,
            'INFO',
            position,
            data
        );

        if (hotspot) {
            const geometry = new THREE.SphereGeometry(14, 32, 32);
            const material = new THREE.MeshStandardMaterial({
                color: 0xffaa44,
                emissive: 0xffaa44,
                emissiveIntensity: 0.5
            });

            const marker = new THREE.Mesh(geometry, material);
            marker.position.copy(position);
            marker.userData = { type: 'hotspot', hotspotId: hotspot.id, hotspotType: 'INFO' };
            scene.add(marker);

            alert(`✅ تم إضافة نقطة معلومات`);
            updateScenePanel();
        }

    } else if (hotspotMode === 'SCENE') {
        const otherScenes = sceneManager.scenes.filter(s => s.id !== sceneManager.currentScene.id);
        
        if (otherScenes.length === 0) {
            alert('❌ لا يوجد مشاهد أخرى');
            return;
        }

        let sceneList = '';
        otherScenes.forEach((s, index) => {
            sceneList += `${index + 1}. ${s.name}\n`;
        });

        const choice = prompt(`اختر المشهد:\n\n${sceneList}\nأدخل الرقم:`);
        if (!choice) return;

        const selectedIndex = parseInt(choice) - 1;
        if (selectedIndex < 0 || selectedIndex >= otherScenes.length) {
            alert('❌ اختيار غير صالح');
            return;
        }

        const targetScene = otherScenes[selectedIndex];
        const description = prompt(`وصف النقطة (اختياري):`) || `انتقال إلى ${targetScene.name}`;
        
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
            const geometry = new THREE.SphereGeometry(14, 32, 32);
            const material = new THREE.MeshStandardMaterial({
                color: 0x44aaff,
                emissive: 0x44aaff,
                emissiveIntensity: 0.5
            });

            const marker = new THREE.Mesh(geometry, material);
            marker.position.copy(position);
            marker.userData = { type: 'hotspot', hotspotId: hotspot.id, hotspotType: 'SCENE' };
            scene.add(marker);

            alert(`✅ تم إضافة نقطة انتقال`);
            updateScenePanel();
        }
    }

    hotspotMode = null;
    document.body.style.cursor = 'default';
}

// =======================================
// إعادة بناء Hotspots في المشهد (مع إمكانية الحذف)
// =======================================
function rebuildHotspots(hotspots) {
    if (!scene) return;
    
    // مسح الـ hotspots القديمة
    scene.children.forEach(child => {
        if (child.userData && child.userData.type === 'hotspot') {
            scene.remove(child);
        }
    });

    if (!hotspots || hotspots.length === 0) return;

    hotspots.forEach(hotspot => {
        const color = hotspot.type === 'SCENE' ? 0x44aaff : 0xffaa44;
        
        const geometry = new THREE.SphereGeometry(14, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.5
        });

        const marker = new THREE.Mesh(geometry, material);
        marker.position.set(hotspot.position.x, hotspot.position.y, hotspot.position.z);
        
        marker.userData = { 
            type: 'hotspot', 
            hotspotId: hotspot.id,
            hotspotType: hotspot.type,
            hotspotData: hotspot.data
        };
        
        // إضافة حدث النقر للحذف (مع Ctrl)
        marker.userData.handleClick = (ctrlKey) => {
            if (ctrlKey) {
                if (confirm('حذف هذه النقطة؟')) {
                    deleteHotspot(hotspot.id);
                    scene.remove(marker);
                }
            }
        };
        
        scene.add(marker);
    });
}

// =======================================
// دوال إضافة المشاهد
// =======================================
function addNewScene() {
    const name = prompt('أدخل اسم المشهد:');
    if (!name) return;

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
            const scene = await sceneManager.addScene(name, file);
            
            if (scene) {
                sceneManager.switchToScene(scene.id);
                updateScenePanel();
                hideLoader();
                alert(`✅ تم إضافة المشهد: ${name}`);
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
// دوال التصدير
// =======================================
function setupExportCanvas() {
    exportCanvas = document.createElement('canvas');
    exportCanvas.width = 4096;
    exportCanvas.height = 2048;
    exportContext = exportCanvas.getContext('2d');
}

async function exportCompleteTour() {
    if (!sceneManager || sceneManager.scenes.length === 0) {
        alert('❌ لا توجد مشاهد للتصدير');
        return;
    }

    showLoader('جاري تحضير الجولة...');

    try {
        const exportScenes = [];
        
        for (const scene of sceneManager.scenes) {
            exportScenes.push({
                id: scene.id,
                name: scene.name,
                image: scene.originalImage,
                paths: scene.paths || [],
                hotspots: scene.hotspots || []
            });
        }

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

// =======================================
// إعداد الأحداث
// =======================================
function setupEvents() {
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    
    document.getElementById('toggleRotate').onclick = () => {
        autorotate = !autorotate;
        controls.autoRotate = autorotate;
        document.getElementById('toggleRotate').textContent = 
            autorotate ? '⏸️ إيقاف التدوير' : '▶️ تشغيل التدوير';
    };

    document.getElementById('toggleDraw').onclick = () => {
        drawMode = !drawMode;
        const btn = document.getElementById('toggleDraw');
        
        if (drawMode) {
            btn.textContent = '⛔ إيقاف الرسم';
            btn.style.background = '#aa3333';
            document.body.style.cursor = 'crosshair';
            if (markerPreview) markerPreview.visible = true;
            controls.autoRotate = false;
        } else {
            btn.textContent = '✏️ تفعيل الرسم';
            btn.style.background = '#8f6c4a';
            document.body.style.cursor = 'default';
            if (markerPreview) markerPreview.visible = false;
            controls.autoRotate = autorotate;
            clearCurrentDrawing();
        }
    };

    document.getElementById('finalizePath').onclick = saveCurrentPath;
    document.getElementById('clearAll').onclick = clearAllPaths;
    
    document.getElementById('hotspotScene').onclick = () => {
        hotspotMode = 'SCENE';
        document.body.style.cursor = 'cell';
    };

    document.getElementById('hotspotInfo').onclick = () => {
        hotspotMode = 'INFO';
        document.body.style.cursor = 'cell';
    };

    document.getElementById('addSceneBtn').onclick = addNewScene;

    document.getElementById('newProject').onclick = () => {
        const name = prompt('أدخل اسم المشروع:');
        if (name) {
            projectManager.newProject(name);
            alert(`✅ مشروع جديد: ${name}`);
        }
    };

    document.getElementById('openProject').onclick = () => {
        const panel = document.getElementById('projectPanel');
        const list = document.getElementById('projectList');
        
        list.innerHTML = '';
        projectManager.projects.forEach(project => {
            const item = document.createElement('div');
            item.className = 'project-item';
            item.innerHTML = `
                <strong>${project.name}</strong><br>
                <small>${new Date(project.created).toLocaleDateString()}</small>
            `;
            item.onclick = () => loadProject(project);
            list.appendChild(item);
        });
        
        panel.style.display = 'block';
    };

    document.getElementById('saveProject').onclick = saveProject;
    document.getElementById('exportTour').onclick = exportCompleteTour;
}

function clearAllPaths() {
    if (confirm('هل أنت متأكد من مسح جميع المسارات؟')) {
        paths.forEach(path => scene.remove(path));
        paths = [];
        clearCurrentDrawing();
    }
}

function saveProject() {
    if (!projectManager.currentProject) {
        const name = prompt('أدخل اسم المشروع:');
        if (name) projectManager.newProject(name);
    }
    
    if (projectManager.currentProject && sphereMesh?.material?.map) {
        const image = sphereMesh.material.map.image;
        exportCanvas.width = image.width;
        exportCanvas.height = image.height;
        exportContext.drawImage(image, 0, 0, image.width, image.height);
        
        projectManager.saveCurrentProject(
            paths, 
            exportCanvas.toDataURL('image/jpeg', 0.95)
        );
        alert('✅ تم حفظ المشروع');
    }
}

function loadProject(project) {
    projectManager.currentProject = project;
    
    if (project.imageData) {
        const img = new Image();
        img.onload = () => {
            const texture = new THREE.CanvasTexture(img);
            sphereMesh.material.map = texture;
            sphereMesh.material.needsUpdate = true;
            
            paths.forEach(p => scene.remove(p));
            paths = [];
            
            project.paths.forEach(pathData => {
                const points = pathData.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
                currentPathType = pathData.type;
                createStraightPath(points);
            });
        };
        img.src = project.imageData;
    }
    
    document.getElementById('projectPanel').style.display = 'none';
    alert(`✅ تم تحميل المشروع: ${project.name}`);
}

// =======================================
// أحداث لوحة المفاتيح
// =======================================
function onKeyDown(e) {
    if (!drawMode) return;

    switch(e.key) {
        case 'Enter':
            e.preventDefault();
            saveCurrentPath();
            break;
        case 'Backspace':
            e.preventDefault();
            if (selectedPoints.length > 0) {
                selectedPoints.pop();
                const last = pointMarkers.pop();
                if (last) scene.remove(last);
                updateTempLine();
            }
            break;
        case 'Escape':
            e.preventDefault();
            clearCurrentDrawing();
            break;
        case 'n':
        case 'N':
            e.preventDefault();
            clearCurrentDrawing();
            break;
        case '1': currentPathType = 'EL'; window.setCurrentPathType('EL'); break;
        case '2': currentPathType = 'AC'; window.setCurrentPathType('AC'); break;
        case '3': currentPathType = 'WP'; window.setCurrentPathType('WP'); break;
        case '4': currentPathType = 'WA'; window.setCurrentPathType('WA'); break;
        case '5': currentPathType = 'GS'; window.setCurrentPathType('GS'); break;
    }
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// =======================================
// تهيئة المشهد
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
    setupExportCanvas();
    animate();
}

function loadPanorama() {
    console.log('🔄 جاري تحميل البانوراما...');
    
    const loader = new THREE.TextureLoader();
    
    loader.load(
        './textures/StartPoint.jpg',
        (texture) => {
            console.log('✅ تم تحميل الصورة');
            
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.x = -1;

            const geometry = new THREE.SphereGeometry(500, 128, 128);
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

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// =======================================
// بدء التشغيل
// =======================================
init();

// =======================================
// حذف Hotspot
// =======================================
function deleteHotspot(hotspotId) {
    if (!sceneManager || !sceneManager.currentScene) return;
    
    // البحث عن الـ hotspot في المشهد الحالي
    const scene = sceneManager.currentScene;
    const hotspotIndex = scene.hotspots.findIndex(h => h.id === hotspotId);
    
    if (hotspotIndex !== -1) {
        // إزالة من البيانات
        scene.hotspots.splice(hotspotIndex, 1);
        
        // إزالة من المشهد ثلاثي الأبعاد
        scene.children.forEach(child => {
            if (child.userData && child.userData.hotspotId === hotspotId) {
                scene.remove(child);
            }
        });
        
        // حفظ التغييرات
        sceneManager.saveScenes();
        updateScenePanel();
        
        console.log(`✅ تم حذف الـ hotspot`);
    }
}

// =======================================
// حذف مشهد
// =======================================
function deleteScene(sceneId) {
    if (!sceneManager) return;
    
    if (confirm('هل أنت متأكد من حذف هذا المشهد؟')) {
        // البحث عن المشهد
        const sceneIndex = sceneManager.scenes.findIndex(s => s.id === sceneId);
        
        if (sceneIndex !== -1) {
            // إزالة من البيانات
            sceneManager.scenes.splice(sceneIndex, 1);
            
            // إذا كان المشهد الحالي هو المحذوف، انتقل لمشهد آخر
            if (sceneManager.currentScene && sceneManager.currentScene.id === sceneId) {
                if (sceneManager.scenes.length > 0) {
                    sceneManager.switchToScene(sceneManager.scenes[0].id);
                } else {
                    // لا يوجد مشاهد - أعد تحميل الصورة الافتراضية
                    loadPanorama();
                    sceneManager.currentScene = null;
                }
            }
            
            // حفظ التغييرات
            sceneManager.saveScenes();
            updateScenePanel();
            
            console.log(`✅ تم حذف المشهد`);
        }
    }
}

