// =======================================
// Virtual Tour Studio - main.js
// =======================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene3D, camera, renderer, controls, sphereMesh;
let autoRotate = true;
let currentPathType = 'EL';
let drawingEnabled = false;
let currentSceneIndex = 0;
let paths = [];
let sceneManager;

// =======================================
// Scene Manager Class
// =======================================
class SceneManager {
    constructor() {
        this.scenes = [];
        this.currentScene = null;
        this.currentSceneIndex = 0;
    }

    saveScenes() {
        localStorage.setItem('tour-scenes', JSON.stringify(this.scenes));
        console.log('💾 تم حفظ المشاهد');
    }

    loadScenes() {
        const saved = localStorage.getItem('tour-scenes');
        if (saved) {
            this.scenes = JSON.parse(saved);
            if (this.scenes.length > 0) this.switchToScene(this.scenes[0].id);
        }
    }

    addScene(sceneData) {
        this.scenes.push(sceneData);
        this.saveScenes();
        updateScenePanel();
    }

    deleteScene(sceneId) {
        const index = this.scenes.findIndex(s => s.id === sceneId);
        if (index !== -1) {
            this.scenes.splice(index, 1);
            if (this.currentScene && this.currentScene.id === sceneId) {
                if (this.scenes.length > 0) this.switchToScene(this.scenes[0].id);
                else this.currentScene = null;
            }
            this.saveScenes();
            updateScenePanel();
        }
    }

    switchToScene(sceneId) {
        const sceneData = this.scenes.find(s => s.id === sceneId);
        if (!sceneData) return false;

        // إزالة المسارات القديمة
        paths.forEach(p => scene3D.remove(p));
        paths = [];

        this.currentScene = sceneData;
        this.currentSceneIndex = this.scenes.indexOf(sceneData);

        // تحميل البانوراما
        if (sphereMesh && sphereMesh.material) {
            const img = new Image();
            img.onload = () => {
                const texture = new THREE.CanvasTexture(img);
                sphereMesh.material.map = texture;
                sphereMesh.material.needsUpdate = true;
            };
            img.src = sceneData.originalImage;
        }

        // إعادة إنشاء المسارات
        if (sceneData.paths) {
            sceneData.paths.forEach(pathData => {
                const points = pathData.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
                const oldType = currentPathType;
                currentPathType = pathData.type;
                createStraightPath(points);
                currentPathType = oldType;
            });
        }

        // إعادة بناء الـ Hotspots
        if (sceneData.hotspots) rebuildHotspots(sceneData.hotspots);

        updateScenePanel();
        console.log(`✅ تم التبديل إلى: ${sceneData.name}`);
        return true;
    }

    addHotspot(hotspot) {
        if (!this.currentScene.hotspots) this.currentScene.hotspots = [];
        this.currentScene.hotspots.push(hotspot);
        this.saveScenes();
    }

    deleteHotspot(hotspotId) {
        if (!this.currentScene || !this.currentScene.hotspots) return;
        this.currentScene.hotspots = this.currentScene.hotspots.filter(h => h.id !== hotspotId);
        // إزالة من المشهد
        scene3D.children.forEach(c => {
            if (c.userData && c.userData.hotspotId === hotspotId) scene3D.remove(c);
        });
        this.saveScenes();
        updateScenePanel();
    }
}

// =======================================
// Initialize Scene
// =======================================
function init() {
    scene3D = new THREE.Scene();
    scene3D.background = new THREE.Color(0x000000);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 0.1);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('container').appendChild(renderer.domElement);

    // إضاءة
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene3D.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(1, 1, 1);
    scene3D.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight2.position.set(-1, -1, -0.5);
    scene3D.add(dirLight2);

    // التحكم
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.5;

    // الكرة البانورامية
    const sphereGeo = new THREE.SphereGeometry(500, 60, 40);
    sphereGeo.scale(-1, 1, 1);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
    sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    scene3D.add(sphereMesh);

    // Scene Manager
    sceneManager = new SceneManager();
    sceneManager.loadScenes();

    animate();
}

// =======================================
// Animate Loop
// =======================================
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene3D, camera);
}

// =======================================
// Path Drawing
// =======================================
function createStraightPath(points) {
    if (points.length < 2) return;

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xffaa00 });
    const line = new THREE.Line(geometry, material);
    line.userData = { type: currentPathType, points: points.map(p => p.clone()) };
    scene3D.add(line);
    paths.push(line);
}

// =======================================
// Hotspots
// =======================================
function rebuildHotspots(hotspots) {
    // إزالة القديمة
    document.querySelectorAll('.hotspot').forEach(h => h.remove());

    hotspots.forEach(hotspot => {
        const vector = new THREE.Vector3(hotspot.position.x, hotspot.position.y, hotspot.position.z)
            .project(camera);

        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;

        if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) return;

        const div = document.createElement('div');
        div.className = `hotspot ${hotspot.type.toLowerCase()}`;
        div.style.left = `${x}px`;
        div.style.top = `${y}px`;
        div.innerHTML = `
            <div class='hotspot-icon-wrapper'>
                <span class='hotspot-icon ${hotspot.type.toLowerCase()}-icon'>${hotspot.type === 'INFO' ? 'ℹ️' : '🚪'}</span>
                <span class='hotspot-glow'></span>
            </div>
            <div class='hotspot-tooltip'>
                <div class='tooltip-arrow'></div>
                <div class='tooltip-header'>
                    <span class='tooltip-icon'>📌</span>
                    <strong>${hotspot.data?.title || ''}</strong>
                </div>
                <div class='tooltip-body'>
                    <p>${hotspot.data?.content || ''}</p>
                </div>
            </div>
        `;
        div.onclick = () => {
            if (hotspot.type === 'SCENE') sceneManager.switchToScene(hotspot.data.sceneId);
        };

        document.body.appendChild(div);
    });
}

// =======================================
// UI Buttons
// =======================================
document.getElementById('toggleRotate').onclick = () => {
    autoRotate = !autoRotate;
    controls.autoRotate = autoRotate;
    document.getElementById('toggleRotate').textContent = autoRotate ? '⏸️ إيقاف التدوير' : '▶️ تشغيل الدوران';
};

window.setCurrentPathType = function(type) {
    currentPathType = type;
};

// =======================================
// Window Resize
// =======================================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// =======================================
// Start
// =======================================
init();
