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
// مصدر الجولات
// =======================================
class TourExporter {
    constructor() {
        this.zip = new JSZip();
    }

    async exportTour(projectName, imageData, paths, imageWidth, imageHeight) {
        const folder = this.zip.folder(projectName);
        
        folder.file('panorama.jpg', imageData.split(',')[1], { base64: true });
        
        const pathsData = paths.map(path => ({
            type: path.userData.type,
            color: '#' + pathColors[path.userData.type].toString(16).padStart(6, '0'),
            points: path.userData.points.map(p => ({
                x: p.x, y: p.y, z: p.z
            }))
        }));
        
        folder.file('paths.json', JSON.stringify(pathsData, null, 2));
        folder.file('index.html', this.generatePlayerHTML(projectName, imageWidth, imageHeight));
        folder.file('style.css', this.generatePlayerCSS());
        folder.file('README.md', this.generateReadme(projectName));
        
        const content = await this.zip.generateAsync({ type: 'blob' });
        saveAs(content, `${projectName}.zip`);
    }

    generatePlayerHTML(projectName, width, height) {
        return `<!DOCTYPE html>
<html lang="ar">
<head>
    <meta charset="UTF-8">
    <title>${projectName} - جولة افتراضية</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="style.css">
    <script src="https://unpkg.com/three@0.128.0/build/three.min.js"></script>
    <script src="https://unpkg.com/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
</head>
<body>
    <div class="info">🏗️ ${projectName}</div>
    <div id="container"></div>

    <script>
        fetch('paths.json')
            .then(res => res.json())
            .then(pathsData => {
                const scene = new THREE.Scene();
                const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
                camera.position.set(0, 0, 0.1);
                
                const renderer = new THREE.WebGLRenderer({ antialias: true });
                renderer.setSize(window.innerWidth, window.innerHeight);
                document.getElementById('container').appendChild(renderer.domElement);
                
                const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
                scene.add(ambientLight);
                
                new THREE.TextureLoader().load('panorama.jpg', texture => {
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    texture.repeat.x = -1;
                    
                    const geometry = new THREE.SphereGeometry(500, 128, 128);
                    const material = new THREE.MeshBasicMaterial({
                        map: texture,
                        side: THREE.BackSide
                    });
                    
                    const sphere = new THREE.Mesh(geometry, material);
                    scene.add(sphere);
                    
                    pathsData.forEach(pathData => {
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
                            
                            scene.add(cylinder);
                        }
                    });
                });
                
                const controls = new THREE.OrbitControls(camera, renderer.domElement);
                controls.enableZoom = true;
                controls.enablePan = false;
                controls.enableDamping = true;
                controls.autoRotate = true;
                controls.autoRotateSpeed = 0.5;
                
                function animate() {
                    requestAnimationFrame(animate);
                    controls.update();
                    renderer.render(scene, camera);
                }
                animate();
                
                window.addEventListener('resize', () => {
                    camera.aspect = window.innerWidth / window.innerHeight;
                    camera.updateProjectionMatrix();
                    renderer.setSize(window.innerWidth, window.innerHeight);
                });
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
// نظام إدارة الصور المتعددة (Multi-Scene)
// =======================================
class SceneManager {
    constructor() {
        this.scenes = [];
        this.currentSceneIndex = 0;
        this.maxScenes = 1000; // يمكنك زيادتها
    }

    // إضافة صورة جديدة
    async addScene(name, imageFile) {
        const reader = new FileReader();
        const imageData = await new Promise((resolve) => {
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(imageFile);
        });

        const scene = {
            id: `scene-${Date.now()}-${this.scenes.length}`,
            name: name,
            image: imageData,
            imageSize: imageFile.size,
            paths: [],
            hotspots: [],
            date: new Date().toISOString()
        };

        this.scenes.push(scene);
        this.saveToIndexedDB();
        return scene;
    }

    // حفظ في IndexedDB (سعة كبيرة)
    saveToIndexedDB() {
        const request = indexedDB.open('VirtualTourDB', 1);
        
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('scenes')) {
                db.createObjectStore('scenes', { keyPath: 'id' });
            }
        };

        request.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction('scenes', 'readwrite');
            const store = tx.objectStore('scenes');
            
            this.scenes.forEach(scene => {
                store.put(scene);
            });
        };
    }
}

// =======================================
// تصدير المشروع الكامل
// =======================================
async function exportFullProject() {
    const zip = new JSZip();
    
    // 1. إضافة كل الصور
    sceneManager.scenes.forEach((scene, index) => {
        const imageData = scene.image.split(',')[1];
        zip.file(`scenes/scene-${index}.jpg`, imageData, { base64: true });
    });
    
    // 2. إضافة ملف البيانات
    const projectData = {
        name: "مشروعي الكبير",
        scenes: sceneManager.scenes.map((s, i) => ({
            id: s.id,
            name: s.name,
            image: `scenes/scene-${i}.jpg`,
            paths: s.paths,
            hotspots: s.hotspots
        }))
    };
    
    zip.file('project.json', JSON.stringify(projectData, null, 2));
    
    // 3. إضافة مشغل الجولة
    zip.file('index.html', generatePlayerHTML());
    zip.file('style.css', generatePlayerCSS());
    
    // 4. تصدير
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `project-${Date.now()}.zip`);
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

// إعداد معاينة المؤشر
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
    if (!drawMode || !sphereMesh) return;
    if (e.target !== renderer.domElement) return;

    mouse.x = (e.clientX / renderer.domElement.clientWidth) * 2 - 1;
    mouse.y = -(e.clientY / renderer.domElement.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(sphereMesh);

    if (hits.length) {
        addPoint(hits[0].point.clone());
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
// دوال التصدير
// =======================================

function setupExportCanvas() {
    exportCanvas = document.createElement('canvas');
    exportCanvas.width = 4096;
    exportCanvas.height = 2048;
    exportContext = exportCanvas.getContext('2d');
}

async function exportCompleteTour() {
    if (!sphereMesh || !sphereMesh.material || !sphereMesh.material.map) {
        alert('❌ الصورة البانورامية غير متوفرة');
        return;
    }

    showLoader('جاري تحضير الجولة...');

    try {
        const texture = sphereMesh.material.map;
        const image = texture.image;
        const imageWidth = image.width;
        const imageHeight = image.height;

        exportCanvas.width = imageWidth;
        exportCanvas.height = imageHeight;
        exportContext.clearRect(0, 0, imageWidth, imageHeight);
        exportContext.drawImage(image, 0, 0, imageWidth, imageHeight);

        const imageData = exportCanvas.toDataURL('image/jpeg', 0.95);
        const projectName = projectManager.currentProject?.name || `tour-${Date.now()}`;

        await tourExporter.exportTour(projectName, imageData, paths, imageWidth, imageHeight);

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
// تحميل المشروع
// =======================================
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
// إعداد الأحداث (مرة واحدة فقط)
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

    loadPanorama();
    setupEvents();
    setupExportCanvas();
    animate();
}

// =======================================
// تحميل البانوراما
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
