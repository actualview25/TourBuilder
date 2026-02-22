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
        if (saved) this.projects = JSON.parse(saved);
    }

    saveProjects() {
        localStorage.setItem('virtual-tour-projects', JSON.stringify(this.projects));
    }
}

// =======================================
// إدارة المشاهد
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
        updateScenePanel();
    }

    async addScene(name, imageFile) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
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
            data: data
        };

        scene.hotspots.push(hotspot);
        this.saveScenes();
        return hotspot;
    }

    switchToScene(sceneId) {
        const sceneData = this.scenes.find(s => s.id === sceneId);
        if (!sceneData) return;

        // حفظ المسارات الحالية
        if (this.currentScene && paths.length > 0) {
            this.currentScene.paths = paths.map(p => ({
                type: p.userData.type,
                color: '#' + pathColors[p.userData.type].toString(16).padStart(6, '0'),
                points: p.userData.points.map(pt => ({ x: pt.x, y: pt.y, z: pt.z }))
            }));
        }

        this.currentScene = sceneData;

        // مسح المشهد الحالي
        paths.forEach(p => scene.remove(p));
        paths = [];
        clearCurrentDrawing();

        // تحميل الصورة الجديدة
        if (sphereMesh && sphereMesh.material) {
            const img = new Image();
            img.onload = () => {
                const texture = new THREE.CanvasTexture(img);
                sphereMesh.material.map = texture;
                sphereMesh.material.needsUpdate = true;
            };
            img.src = sceneData.originalImage;
        }

        // إعادة بناء المسارات
        if (sceneData.paths) {
            sceneData.paths.forEach(pathData => {
                const points = pathData.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
                currentPathType = pathData.type;
                createStraightPath(points);
            });
        }

        // إعادة بناء hotspots
        if (sceneData.hotspots) rebuildHotspots(sceneData.hotspots);

        updateScenePanel();
        this.saveScenes();
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
    EL: 0xffcc00, AC: 0x00ccff, WP: 0x0066cc, WA: 0xff3300, GS: 0x33cc33
};

let currentPathType = 'EL';
window.setCurrentPathType = (t) => {
    currentPathType = t;
    if (markerPreview) {
        markerPreview.material.color.setHex(pathColors[currentPathType]);
        markerPreview.material.emissive.setHex(pathColors[currentPathType]);
    }
};

// =======================================
// دوال الرسم الأساسية
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
    if (!sphereMesh) return;
    if (e.target !== renderer.domElement) return;

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
            color: color, emissive: color, emissiveIntensity: 0.4
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
// تحميل البانوراما
// =======================================
function loadPanorama() {
    const loader = new THREE.TextureLoader();
    loader.load('./textures/StartPoint.jpg', (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.x = -1;

        const geometry = new THREE.SphereGeometry(500, 128, 128);
        const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
        sphereMesh = new THREE.Mesh(geometry, material);
        scene.add(sphereMesh);
        
        document.getElementById('loader').style.display = 'none';
        setupMarkerPreview();
    });
}

// =======================================
// التهيئة
// =======================================
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 2000);
    camera.position.set(0, 0, 0.1);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('container').appendChild(renderer.domElement);

    // الإضاءة
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(1, 1, 1);
    scene.add(dirLight1);

    // التحكم
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.autoRotate = autorotate;
    controls.autoRotateSpeed = 0.5;
    controls.target.set(0, 0, 0);

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
// الأحداث
// =======================================
function setupEvents() {
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onResize);
    
    document.getElementById('toggleRotate').onclick = () => {
        autorotate = !autorotate;
        controls.autoRotate = autorotate;
        document.getElementById('toggleRotate').textContent = autorotate ? '⏸️ إيقاف التدوير' : '▶️ تشغيل التدوير';
    };

    document.getElementById('toggleDraw').onclick = () => {
        drawMode = !drawMode;
        const btn = document.getElementById('toggleDraw');
        btn.textContent = drawMode ? '⛔ إيقاف الرسم' : '✏️ تفعيل الرسم';
        btn.style.background = drawMode ? '#aa3333' : '#8f6c4a';
        document.body.style.cursor = drawMode ? 'crosshair' : 'default';
        if (markerPreview) markerPreview.visible = drawMode;
        controls.autoRotate = drawMode ? false : autorotate;
        if (!drawMode) clearCurrentDrawing();
    };

    document.getElementById('finalizePath').onclick = saveCurrentPath;
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// =======================================
// بدء التشغيل
// =======================================
init();
