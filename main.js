// =======================================
// main.js - الجزء ١: المتغيرات والتهيئة
// =======================================

let scene, camera, renderer, controls;
let sphereMesh = null;
let drawMode = false;
let autorotate = true;
let currentPathType = 'EL';
let selectedPoints = [];
let pointMarkers = [];
let tempLine = null;
let paths = [];
let hotspotMarkers = {};
let hotspotMode = null;
let sceneManager = null;

// الماوس وRaycaster للرسم
const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

// ألوان المسارات
const pathColors = {
    EL: 0xff0000,
    AC: 0x00ff00,
    WP: 0x0000ff,
    WA: 0xffff00,
    GS: 0xff00ff
};

// =======================================
// تهيئة Marker Preview
// =======================================
let markerPreview = null;
function setupMarkerPreview() {
    if (!sphereMesh) return;
    const geometry = new THREE.SphereGeometry(5, 12, 12);
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0.7
    });
    markerPreview = new THREE.Mesh(geometry, material);
    markerPreview.visible = false;
    scene.add(markerPreview);
}

// =======================================
// الجزء ٢: دوال الرسم والمسارات
// =======================================

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
// الجزء ٣: دوال Hotspots الكاملة
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
        if (marker && marker.parentNode) marker.parentNode.removeChild(marker);
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

function updateHotspotPositions() {
    if (!sceneManager || !sceneManager.currentScene || !sceneManager.currentScene.hotspots) return;
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    sceneManager.currentScene.hotspots.forEach(h => {
        const marker = hotspotMarkers[h.id];
        if (!marker) return;
        
        const pos = new THREE.Vector3(h.position.x, h.position.y, h.position.z);
        pos.project(camera);
        
        const x = (pos.x * 0.5 + 0.5) * width;
        const y = (-pos.y * 0.5 + 0.5) * height;
        
        marker.style.left = x + 'px';
        marker.style.top = y + 'px';
        
        marker.style.display = (x < 0 || x > width || y < 0 || y > height) ? 'none' : 'block';
    });
}

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
            marker.userData = { type: 'hotspot-background', hotspotId: hotspot.id };
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
        otherScenes.forEach((s, index) => { sceneList += `${index + 1}. ${s.name}\n`; });

        const choice = prompt(`اختر المشهد للانتقال إليه:\n\n${sceneList}\nأدخل رقم المشهد:`);
        if (!choice) return;

        const selectedIndex = parseInt(choice) - 1;
        if (selectedIndex < 0 || selectedIndex >= otherScenes.length) {
            alert('❌ اختيار غير صالح');
            return;
        }

        const targetScene = otherScenes[selectedIndex];
        const description = prompt(`📝 أدخل وصفاً لهذه النقطة:`) || `انتقال إلى ${targetScene.name}`;

        const data = { targetSceneId: targetScene.id, targetSceneName: targetScene.name, description };

        const hotspot = sceneManager.addHotspot(sceneManager.currentScene.id, 'SCENE', position, data);

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
            marker.userData = { type: 'hotspot-background', hotspotId: hotspot.id };
            scene.add(marker);

            rebuildHotspots(sceneManager.currentScene.hotspots);
            showCustomInfoWindow('✅ تمت الإضافة', `تم إضافة نقطة انتقال إلى: "${targetScene.name}"`, 'scene');
            if (typeof updateScenePanel === 'function') updateScenePanel();
        }
    }

    hotspotMode = null;
    document.body.style.cursor = 'default';
}

// ربط واجهة المستخدم
window.editHotspotFromUI = function(hotspotId) { editHotspot(hotspotId); };
window.deleteHotspotFromUI = function(hotspotId) { 
    if (confirm('🗑️ هل أنت متأكد من حذف هذه النقطة؟')) {
        deleteHotspotById(hotspotId);
        const icon = document.querySelector(`[data-id="${hotspotId}"]`);
        if (icon) icon.remove();
        
        scene?.children.forEach(child => {
            if (child.userData?.hotspotId === hotspotId) scene.remove(child);
        });
    }
};

function deleteHotspotById(hotspotId) {
    if (!sceneManager?.currentScene) return;
    sceneManager.currentScene.hotspots = sceneManager.currentScene.hotspots.filter(h => h.id !== hotspotId);

    scene.children.forEach(child => {
        if (child.userData?.hotspotId === hotspotId) scene.remove(child);
    });

    sceneManager.saveScenes();
    updateScenePanel();
    showCustomInfoWindow('✅ تم الحذف', 'تم حذف النقطة بنجاح', 'info');
}

function editHotspot(hotspotId) {
    if (!sceneManager?.currentScene) return;

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
            otherScenes.forEach((s, index) => { sceneList += `${index + 1}. ${s.name}\n`; });
            const choice = prompt(`تعديل المشهد المستهدف:\n${sceneList}\nأدخل الرقم الجديد (أو اتركه فارغاً للإبقاء):`);
            if (choice) {
                const idx = parseInt(choice) - 1;
                if (idx >= 0 && idx < otherScenes.length) {
                    hotspot.data.targetSceneId = otherScenes[idx].id;
                    hotspot.data.targetSceneName = otherScenes[idx].name;
                }
            }
        }

        const newDesc = prompt('✏️ تعديل الوصف:', hotspot.data.description || '');
        if (newDesc !== null) hotspot.data.description = newDesc;
    }

    sceneManager.saveScenes();
    rebuildHotspots(sceneManager.currentScene.hotspots);
    showCustomInfoWindow('✅ تم التحديث', 'تم تحديث بيانات النقطة بنجاح', 'info');
}

function showCustomInfoWindow(title, content, type = 'info') {
    const oldWindow = document.querySelector('.custom-info-window');
    if (oldWindow) oldWindow.remove();
    
    const colors = { info: '#ffaa44', scene: '#44aaff', success: '#44ff44', error: '#ff4444' };
    const icons = { info: 'icon/info.png', scene: 'icon/hotspot.png', success: '✅', error: '❌' };
    
    const window = document.createElement('div');
    window.className = 'custom-info-window';
    window.style.borderColor = colors[type] || colors.info;
    
    window.innerHTML = `
        <div class="window-header" style="border-bottom-color: ${colors[type]};">
            ${typeof icons[type] === 'string' && icons[type].includes('.png') 
                ? `<img src="${icons[type]}" style="width: 30px; height: 30px;">` 
                : `<span style="font-size: 24px;">${icons[type]}</span>`}
            <h3 style="color: ${colors[type]};">${title}</h3>
        </div>
        <div class="window-content">${content}</div>
        <button class="window-close" style="border-color: ${colors[type]};" onclick="this.parentElement.remove()">حسناً</button>
    `;
    
    document.body.appendChild(window);
    setTimeout(() => { if (window.parentElement) window.remove(); }, 3000);
}

// =======================================
// الجزء ٤: إدارة المشاهد والجولة
// =======================================

function updateScenePanel() {
    const list = document.getElementById('sceneList');
    if (!list) return;
    list.innerHTML = '';
    
    if (!sceneManager?.scenes) return;
    
    sceneManager.scenes.forEach(scene => {
        const item = document.createElement('div');
        item.className = 'scene-item';
        if (sceneManager.currentScene?.id === scene.id) item.classList.add('active');

        const infoCount = scene.hotspots?.filter(h => h.type === 'INFO').length || 0;
        const sceneCount = scene.hotspots?.filter(h => h.type === 'SCENE').length || 0;
        const totalPoints = infoCount + sceneCount;
        
        const icon = scene.id.includes('start') ? '🏠' : (sceneCount > 0 ? '🚪' : '🌄');
        
        item.innerHTML = `
            <span class='scene-icon'>${icon}</span>
            <span class='scene-name' title='${scene.name}'>${scene.name}</span>
            <span class='scene-hotspots' title='معلومات: ${infoCount} | انتقال: ${sceneCount}'>${totalPoints}</span>
            <button class='delete-scene-btn' data-id='${scene.id}' title='حذف المشهد'>🗑️</button>
        `;

        item.addEventListener('click', e => {
            if (!e.target.classList.contains('delete-scene-btn')) {
                sceneManager.switchToScene(scene.id);
                updateScenePanel();
            }
        });

        const deleteBtn = item.querySelector('.delete-scene-btn');
        deleteBtn.addEventListener('click', e => {
            e.stopPropagation();
            if (sceneManager) sceneManager.deleteScene(scene.id);
        });
        
        list.appendChild(item);
    });
}

function addNewScene() {
    const name = prompt('📝 أدخل اسم المشهد:');
    if (!name?.trim()) { alert('❌ الرجاء إدخال اسم صحيح'); return; }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = async function(e) {
        const file = e.target.files[0];
        if (!file) { document.body.removeChild(input); return; }

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

function showLoader(message) {
    const loader = document.getElementById('loader');
    if (loader) { loader.style.display = 'flex'; loader.textContent = message || '⏳ جاري التحميل...'; }
}

function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
}

async function exportCompleteTour() {
    if (!sceneManager || sceneManager.scenes.length === 0) {
        alert('❌ لا توجد مشاهد للتصدير'); return;
    }

    showLoader('جاري تحضير الجولة...');

    try {
        const exportScenes = sceneManager.scenes.map(s => ({
            id: s.id,
            name: s.name,
            image: s.originalImage,
            paths: s.paths || [],
            hotspots: (s.hotspots || []).map(h => ({ id: h.id, type: h.type, position: h.position, data: h.data || {} }))
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

function loadPanorama() {
    console.log('🔄 جاري تحميل البانوراما...');
    
    const loader = new THREE.TextureLoader();
    loader.load(
        './textures/StartPoint.jpg',
        texture => {
            console.log('✅ تم تحميل الصورة');
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.repeat.x = -1;

            const geometry = new THREE.SphereGeometry(500, 64, 64);
            const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });

            sphereMesh = new THREE.Mesh(geometry, material);
            scene.add(sphereMesh);
            
            document.getElementById('loader')?.style.display = 'none';
            setupMarkerPreview();
        },
        progress => { console.log(`⏳ التحميل: ${Math.round((progress.loaded / progress.total) * 100)}%`); },
        error => { console.error('❌ فشل تحميل الصورة:', error); }
    );
}

function loadSceneImage(imageData) {
    if (!sphereMesh?.material) return;

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
// الجزء ٥: الوضعيات، الأحداث، والتهيئة
// =======================================

// نظام الوضعيات
let currentMode = 'draw';

function setMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    
    const activeBtn = document.getElementById('mode' + mode.charAt(0).toUpperCase() + mode.slice(1));
    if (activeBtn) activeBtn.classList.add('active');
    
    document.body.classList.remove('mode-draw', 'mode-view');
    document.body.classList.add('mode-' + mode);
    
    console.log('🔄 تم التبديل إلى وضع: ' + mode);
}

// تهيئة أزرار الوضعيات
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

// إعداد الأحداث
function setupEvents() {
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);

    const toggleRotate = document.getElementById('toggleRotate');
    if (toggleRotate) toggleRotate.onclick = () => {
        autorotate = !autorotate;
        controls.autoRotate = autorotate;
        toggleRotate.textContent = autorotate ? '⏸️ إيقاف التدوير' : '▶️ تشغيل التدوير';
    };

    const toggleDraw = document.getElementById('toggleDraw');
    if (toggleDraw) toggleDraw.onclick = () => {
        drawMode = !drawMode;
        toggleDraw.textContent = drawMode ? '⛔ إيقاف الرسم' : '✏️ تفعيل الرسم';
        toggleDraw.style.background = drawMode ? '#aa3333' : '#8f6c4a';
        document.body.style.cursor = drawMode ? 'crosshair' : 'default';
        if (markerPreview) markerPreview.visible = drawMode;
        controls.autoRotate = drawMode ? false : autorotate;
        if (!drawMode) clearCurrentDrawing();
    };

    document.getElementById('finalizePath')?.addEventListener('click', saveCurrentPath);
    document.getElementById('clearAll')?.addEventListener('click', clearAllPaths);

    document.getElementById('hotspotScene')?.addEventListener('click', () => { hotspotMode = 'SCENE'; document.body.style.cursor = 'cell'; });
    document.getElementById('hotspotInfo')?.addEventListener('click', () => { hotspotMode = 'INFO'; document.body.style.cursor = 'cell'; });

    document.getElementById('addSceneBtn')?.addEventListener('click', addNewScene);
    document.getElementById('exportTour')?.addEventListener('click', exportCompleteTour);
}

// أحداث لوحة المفاتيح
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

// حلقة الرسوميات
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    updateHotspotPositions();
}

// التهيئة العامة
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
    dirLight1.position.set(1, 1, 1); scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight2.position.set(-1, -1, -0.5); scene.add(dirLight2);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true; controls.enablePan = false; controls.enableDamping = true;
    controls.autoRotate = autorotate; controls.autoRotateSpeed = 0.5; controls.target.set(0,0,0); controls.update();

    sceneManager = new SceneManager();
    loadPanorama();
    setupEvents();
    animate();
}

init();
