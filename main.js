import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// =======================================
// إدارة المشاريع (نفسها)
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
// إدارة المشاهد المتعددة (جديد)
// =======================================
class SceneManager {
    constructor() {
        this.scenes = [];
        this.currentScene = null;
        this.currentSceneIndex = 0;
        this.loadScenes();
    }

    loadScenes() {
        const saved = localStorage.getItem('virtual-tour-scenes');
        if (saved) {
            try {
                this.scenes = JSON.parse(saved);
            } catch(e) {
                this.scenes = [];
            }
        }
    }

    saveScenes() {
        localStorage.setItem('virtual-tour-scenes', JSON.stringify(this.scenes));
    }

    addScene(name, imageData) {
        const scene = {
            id: `scene-${Date.now()}-${this.scenes.length}`,
            name: name,
            image: imageData,
            paths: [],
            hotspots: [],
            created: new Date().toISOString()
        };
        this.scenes.push(scene);
        this.saveScenes();
        return scene;
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
}

// =======================================
// مصدر الجولات (مطور)
// =======================================
class TourExporter {
    constructor() {
        this.zip = new JSZip();
    }

    async exportTour(projectName, scenes) {
        const folder = this.zip.folder(projectName);
        
        // إضافة كل المشاهد
        scenes.forEach((scene, index) => {
            const imageData = scene.image.split(',')[1];
            folder.file(`scene-${index}.jpg`, imageData, { base64: true });
        });
        
        // تجهيز بيانات المشاهد للـ JSON
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
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 5px 10px;
            border-radius: 5px;
            font-size: 14px;
            white-space: nowrap;
            display: none;
            left: 50%;
            transform: translateX(-50%);
            bottom: 100%;
            margin-bottom: 5px;
        }
        .hotspot:hover .hotspot-tooltip {
            display: block;
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
                
                scene3D = new THREE.Scene();
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
                
                document.getElementById('autoRotateBtn').onclick = () => {
                    autoRotate = !autoRotate;
                    controls.autoRotate = autoRotate;
                    document.getElementById('autoRotateBtn').textContent = 
                        autoRotate ? '⏸️ إيقاف الدوران' : '▶️ تشغيل الدوران';
                };
                
                loadScene(0);
                
                function loadScene(index) {
                    if (currentSceneIndex === index && sphereMesh) return;
                    
                    const sceneData = scenes[index];
                    if (!sceneData) return;
                    
                    currentSceneIndex = index;
                    
                    // إزالة الكرة القديمة
                    if (sphereMesh) scene3D.remove(sphereMesh);
                    
                    // إزالة hotspots القديمة
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
                                        new THREE.MeshStandardMaterial({ 
                                            color: pathData.color,
                                            emissive: pathData.color,
                                            emissiveIntensity: 0.3
                                        })
                                    );
                                    
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
                        
                        // إضافة hotspots
                        if (sceneData.hotspots) {
                            sceneData.hotspots.forEach(hotspot => {
                                const vector = new THREE.Vector3(
                                    hotspot.position.x, 
                                    hotspot.position.y, 
                                    hotspot.position.z
                                ).project(camera);
                                
                                const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
                                const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
                                
                                const div = document.createElement('div');
                                div.className = 'hotspot';
                                div.style.left = x + 'px';
                                div.style.top = y + 'px';
                                div.style.color = hotspot.type === 'SCENE' ? '#44aaff' : '#ffaa44';
                                div.innerHTML = \`
                                    <span style="font-size:30px;">\${hotspot.icon}</span>
                                    <div class="hotspot-tooltip">\${hotspot.data.text}</div>
                                \`;
                                
                                div.onclick = () => {
                                    if (hotspot.type === 'SCENE') {
                                        const targetIndex = scenes.findIndex(s => s.name === hotspot.data.targetScene);
                                        if (targetIndex !== -1) loadScene(targetIndex);
                                    } else {
                                        alert(hotspot.data.text);
                                    }
                                };
                                
                                document.body.appendChild(div);
                            });
                        }
                    });
                }
                
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

// متغيرات جديدة للمشاهد والـ hotspots
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
// دوال الرسم (نفسها)
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

// تعديل onClick لدعم hotspots
function onClick(e) {
    if (!sphereMesh) return;
    if (e.target !== renderer.domElement) return;

    mouse.x = (e.clientX / renderer.domElement.clientWidth) * 2 - 1;
    mouse.y = -(e.clientY / renderer.domElement.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(sphereMesh);

    if (hits.length) {
        const point = hits[0].point.clone();
        
        if (hotspotMode) {
            // إضافة hotspot
            addHotspot(hits[0].point.clone());
            hotspotMode = null;
            document.body.style.cursor = 'default';
        } else if (drawMode) {
            // إضافة نقطة مسار
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
        
        // حفظ المسارات في المشهد الحالي
        if (sceneManager && sceneManager.currentScene) {
            sceneManager.updateScenePaths(sceneManager.currentScene.id, paths.filter(p => p.userData.type === currentPathType));
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
        const defaultDir = new THREE.Vector3(0, 1, 0);
        const targetDir = direction.clone().normalize();
        
        quaternion.setFromUnitVectors(defaultDir, targetDir);
        
        const material = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.4,
            roughness: 0.2,
            metalness: 0.3
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
// دوال Hotspots الجديدة
// =======================================

function addHotspot(position) {
    if (!sceneManager || !sceneManager.currentScene) {
        alert('❌ لا يوجد مشهد نشط');
        return;
    }

    let data = {};
    
    if (hotspotMode === 'SCENE') {
        // قائمة المشاهد المتاحة
        const sceneNames = sceneManager.scenes
            .filter(s => s.id !== sceneManager.currentScene.id)
            .map(s => s.name)
            .join('\n');
        
        if (sceneNames.length === 0) {
            alert('❌ لا يوجد مشاهد أخرى للانتقال إليها');
            return;
        }
        
        const targetScene = prompt(`أدخل اسم المشهد المستهدف:\nالمشاهد المتاحة:\n${sceneNames}`);
        if (!targetScene) return;
        
        data = { text: `انتقال إلى ${targetScene}`, targetScene: targetScene };
    } else {
        const text = prompt('أدخل نص المعلومات:');
        if (!text) return;
        data = { text: text };
    }

    const hotspot = sceneManager.addHotspot(
        sceneManager.currentScene.id,
        hotspotMode,
        position,
        data
    );

    if (hotspot) {
        // إنشاء كرة ملونة تمثل hotspot
        const geometry = new THREE.SphereGeometry(12, 24, 24);
        const material = new THREE.MeshStandardMaterial({
            color: hotspot.color,
            emissive: hotspot.color,
            emissiveIntensity: 0.5
        });

        const marker = new THREE.Mesh(geometry, material);
        marker.position.copy(position);
        marker.userData = { type: 'hotspot', hotspotId: hotspot.id };
        scene.add(marker);

        console.log(`✅ تم إضافة ${hotspotMode === 'SCENE' ? 'نقطة انتقال' : 'نقطة معلومات'}`);
    }
}

// =======================================
// دوال إدارة المشاهد
// =======================================

function addNewScene() {
    const name = prompt('أدخل اسم المشهد:');
    if (!name) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            // حفظ المشهد الحالي إذا وجد
            if (sceneManager.currentScene && paths.length > 0) {
                sceneManager.updateScenePaths(sceneManager.currentScene.id, paths);
            }

            // إضافة المشهد الجديد
            const scene = sceneManager.addScene(name, event.target.result);
            
            // إضافة للوحة
            addSceneToPanel(scene);
            
            // التبديل للمشهد الجديد
            switchToScene(scene.id);
        };
        reader.readAsDataURL(file);
    };

    input.click();
}

function switchToScene(sceneId) {
    const sceneData = sceneManager.scenes.find(s => s.id === sceneId);
    if (!sceneData) return;

    // حفظ المسارات الحالية
    if (sceneManager.currentScene && paths.length > 0) {
        sceneManager.updateScenePaths(sceneManager.currentScene.id, paths);
    }

    sceneManager.currentScene = sceneData;
    sceneManager.currentSceneIndex = sceneManager.scenes.indexOf(sceneData);

    // مسح المشهد الحالي
    paths.forEach(p => scene.remove(p));
    paths = [];
    clearCurrentDrawing();

    // تحميل الصورة الجديدة
    loadSceneImage(sceneData.image);

    // إعادة بناء المسارات
    if (sceneData.paths) {
        sceneData.paths.forEach(pathData => {
            const points = pathData.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
            // نحتاج لاستعادة نوع المسار
            const oldType = currentPathType;
            currentPathType = pathData.type;
            createStraightPath(points);
            currentPathType = oldType;
        });
    }

    // إعادة بناء hotspots
    rebuildHotspots(sceneData.hotspots || []);

    console.log(`✅ تم التبديل إلى: ${sceneData.name}`);
}

function loadSceneImage(imageData) {
    if (!sphereMesh || !sphereMesh.material) return;

    const img = new Image();
    img.onload = () => {
        const texture = new THREE.CanvasTexture(img);
        sphereMesh.material.map = texture;
        sphereMesh.material.needsUpdate = true;
    };
    img.src = imageData;
}

function rebuildHotspots(hotspots) {
    // مسح الـ hotspots القديمة
    scene.children.forEach(child => {
        if (child.userData && child.userData.type === 'hotspot') {
            scene.remove(child);
        }
    });

    // إضافة الـ hotspots الجديدة
    hotspots.forEach(hotspot => {
        const geometry = new THREE.SphereGeometry(12, 24, 24);
        const material = new THREE.MeshStandardMaterial({
            color: hotspot.color,
            emissive: hotspot.color,
            emissiveIntensity: 0.5
        });

        const marker = new THREE.Mesh(geometry, material);
        marker.position.set(hotspot.position.x, hotspot.position.y, hotspot.position.z);
        marker.userData = { type: 'hotspot', hotspotId: hotspot.id };
        scene.add(marker);
    });
}

function addSceneToPanel(sceneData) {
    const list = document.getElementById('sceneList');
    if (!list) return;

    const item = document.createElement('div');
    item.className = 'scene-item';
    item.innerHTML = `
        <span class="scene-icon">🌄</span>
        <span class="scene-name">${sceneData.name}</span>
        <span class="scene-hotspots">${sceneData.hotspots?.length || 0} نقطة</span>
    `;

    item.onclick = () => switchToScene(sceneData.id);
    list.appendChild(item);
}

// =======================================
// دوال التصدير (مطورة)
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
        const projectName = projectManager.currentProject?.name || `tour-${Date.now()}`;
        await tourExporter.exportTour(projectName, sceneManager.scenes);

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
    loader.style.display = 'flex';
    loader.textContent = message || '⏳ جاري التحميل...';
}

function hideLoader() {
    document.getElementById('loader').style.display = 'none';
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

    document.getElementById('clearAll').onclick = () => {
        if (confirm('هل أنت متأكد من مسح جميع المسارات؟')) {
            paths.forEach(path => scene.remove(path));
            paths = [];
            clearCurrentDrawing();
        }
    };

    // أزرار Hotspots
    document.getElementById('hotspotScene').onclick = () => {
        hotspotMode = 'SCENE';
        document.body.style.cursor = 'cell';
    };

    document.getElementById('hotspotInfo').onclick = () => {
        hotspotMode = 'INFO';
        document.body.style.cursor = 'cell';
    };

    // زر إضافة مشهد
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

    document.getElementById('saveProject').onclick = () => {
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
    };

    document.getElementById('exportTour').onclick = exportCompleteTour;
}

// تحميل مشروع
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

    // تهيئة مدير المشاهد
    sceneManager = new SceneManager();

    loadPanorama();
    setupEvents();
    setupExportCanvas();
    animate();
}

// =======================================
// تحميل البانوراما الافتراضية
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

// =======================================
// الرسوم المتحركة
// =======================================
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// =======================================
// بدء التشغيل
// =======================================
init();
