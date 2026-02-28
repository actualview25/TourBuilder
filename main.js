const THREE = window.THREE;
const OrbitControls = THREE.OrbitControls;

console.log('✅ THREE loaded:', !!THREE);
console.log('✅ OrbitControls loaded:', !!OrbitControls);

// تعريف pathColors قبل استخدامه
const pathColors = { EL: 0xffcc00, AC: 0x00ccff, WP: 0x0066cc, WA: 0xff3300, GS: 0x33cc33 };
let currentPathType = 'EL';

// =======================================
// ١. نظام Hotspots الموحد - يجب تعريفه أولاً
// =======================================
const HotspotSystem = {
    markers: {},
    backgroundSpheres: {},
    
    create: function(position, type, data, id) {
        const bgSphere = this.createBackgroundSphere(position, type, id);
        const icon = this.createIcon(position, type, data, id);
        return { bgSphere, icon };
    },
    
    createBackgroundSphere: function(position, type, id) {
        const color = type === 'SCENE' ? 0x44aaff : 0xffaa44;
        const geometry = new THREE.SphereGeometry(12, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.2,
            transparent: true,
            opacity: 0.15
        });
        
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.copy(position);
        sphere.userData = { type: 'hotspot-background', hotspotId: id, hotspotType: type };
        
        if (typeof scene !== 'undefined' && scene) {
            scene.add(sphere);
        }
        this.backgroundSpheres[id] = sphere;
        
        return sphere;
    },
    
    createIcon: function(position, type, data, id) {
        const div = document.createElement('div');
        div.className = 'hotspot-marker';
        div.setAttribute('data-id', id);
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
                <button class="edit-btn" onclick="window.editHotspotFromUI('${id}')" title="تعديل">✏️</button>
                <button class="delete-btn" onclick="window.deleteHotspotFromUI('${id}')" title="حذف">🗑️</button>
            </div>
        `;
        
        div._worldPosition = position.clone();
        
        if (type === 'INFO') {
            div.addEventListener('click', (e) => {
                if (!e.target.classList.contains('edit-btn') && !e.target.classList.contains('delete-btn')) {
                    showCustomInfoWindow(data.title, data.content, 'info');
                }
            });
        } else {
            div.addEventListener('click', (e) => {
                if (!e.target.classList.contains('edit-btn') && !e.target.classList.contains('delete-btn')) {
                    if (window.sceneManager && data.targetSceneId) {
                        window.sceneManager.switchToScene(data.targetSceneId);
                    }
                }
            });
        }

    document.body.appendChild(div);
        this.markers[id] = div;
        
        return div;
    },
    
    rebuild: function(hotspots) {
        this.clear();
        
        if (!hotspots || hotspots.length === 0) return;
        
        hotspots.forEach(h => {
            const pos = new THREE.Vector3(h.position.x, h.position.y, h.position.z);
            this.create(pos, h.type, h.data, h.id);
        });
        
        this.updatePositions();
        console.log(`✅ تم إنشاء ${hotspots.length} نقطة`);
    },
    
    updatePositions: function() {
        if (typeof camera === 'undefined' || !camera) return;
        
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        Object.values(this.markers).forEach(icon => {
            if (!icon._worldPosition) return;
            
            const pos = icon._worldPosition.clone().project(camera);
            
            if (pos.z > 1) {
                icon.style.display = 'none';
                return;
            }
            
            const x = (pos.x * 0.5 + 0.5) * width;
            const y = (-pos.y * 0.5 + 0.5) * height;
            
            icon.style.left = x + 'px';
            icon.style.top = y + 'px';
            
            icon.style.display = (x < -100 || x > width + 100 || y < -100 || y > height + 100) ? 'none' : 'block';
        });
    },
    
    clear: function() {
        Object.values(this.markers).forEach(icon => {
            if (icon && icon.parentNode) {
                icon.parentNode.removeChild(icon);
            }
        });
        this.markers = {};
        
        Object.values(this.backgroundSpheres).forEach(sphere => {
            if (sphere && typeof scene !== 'undefined' && scene) {
                scene.remove(sphere);
            }
        });
        this.backgroundSpheres = {};
    },
    
    remove: function(id) {
        if (this.markers[id]) {
            this.markers[id].remove();
            delete this.markers[id];
        }
        if (this.backgroundSpheres[id] && typeof scene !== 'undefined' && scene) {
            scene.remove(this.backgroundSpheres[id]);
            delete this.backgroundSpheres[id];
        }
    }
};

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

        /// إعادة بناء الهوتسبوت عند تغيير المشهد
        if (sceneData.hotspots) {
            HotspotSystem.rebuild(sceneData.hotspots);
        } else {
            HotspotSystem.clear();
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
    // ... الكود الطويل كما هو ...
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
// ٦. دوال Hotspots
// =======================================
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
            HotspotSystem.create(position, 'INFO', data, hotspot.id);
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
            HotspotSystem.create(position, 'SCENE', data, hotspot.id);
            showCustomInfoWindow('✅ تمت الإضافة', `تم إضافة نقطة انتقال إلى: "${targetScene.name}"`, 'scene');
            if (typeof updateScenePanel === 'function') updateScenePanel();
        }
    }

    hotspotMode = null;
    document.body.style.cursor = 'default';
}

// دوال التحكم من UI
window.editHotspotFromUI = function(hotspotId) {
    editHotspot(hotspotId);
};

window.deleteHotspotFromUI = function(hotspotId) {
    if (confirm('🗑️ هل أنت متأكد من حذف هذه النقطة؟')) {
        deleteHotspotById(hotspotId);
        HotspotSystem.remove(hotspotId);
    }
};

function deleteHotspotById(hotspotId) {
    if (!sceneManager || !sceneManager.currentScene) return;

    sceneManager.currentScene.hotspots = sceneManager.currentScene.hotspots.filter(
        h => h.id !== hotspotId
    );

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
    HotspotSystem.remove(hotspotId);
    const pos = new THREE.Vector3(hotspot.position.x, hotspot.position.y, hotspot.position.z);
    HotspotSystem.create(pos, hotspot.type, hotspot.data, hotspotId);
    
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
    
    if (HotspotSystem) {
        HotspotSystem.updatePositions();
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
    window.sceneManager = sceneManager; // للوصول العام
    
    loadPanorama();
    setupEvents();
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    
    // تحديث مواقع الأيقونات فقط - بدون إعادة بناء
    if (HotspotSystem) {
        HotspotSystem.updatePositions();
    }
}

// بدء التشغيل
init();
